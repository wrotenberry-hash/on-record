"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { BRAND } from "@/lib/brand";
import { sendTo } from "@/lib/mailer";
import { NOT_SCIENTIFIC } from "@/lib/constituent/rules";
import { ensureDeviceCookie, requestContext, withinLimit } from "@/lib/verify/store";
import { domainOf, matchDomain, officeEmail } from "@/lib/office/domains";
import { purgeOfficeData, redeemOfficeLink, requestOfficeAccess, setWeeklyEmail, type MemberOption } from "@/lib/office/store";
import { currentOffice, OFFICE_COOKIE, officeCookieOptions, officeDoor, officeEmailHash, officeLinkUrl, officeSessionToken, officeSignInReady, readOfficeLink, readOfficeOptOut } from "@/lib/office/session";

/** What the sign-in form shows after each press. The address typed is kept in the form's own state, never in the page address. */
export type OfficeRequestState = { step: "ask" | "pick" | "sent"; message: string | null; error: boolean; email: string; options: MemberOption[]; n: number };

/** The same words whether or not the site has seen the address before, so the page never says which addresses have signed in. */
const SENT = "If that address can use this page, a link is on its way to it. The link works once, for 30 minutes. If nothing arrives in a few minutes, the site's email may not be switched on yet.";

/**
 * A work email asks for a link. Refused unless the address is on one of the listed government domains. Where the
 * address does not show which office the person works for, the form comes back once with the list of members.
 */
export async function requestOfficeLink(prev: OfficeRequestState, formData: FormData): Promise<OfficeRequestState> {
  const typed = String(formData.get("email") ?? "").trim().slice(0, 254), picked = String(formData.get("member") ?? "") || null;
  const fail = (message: string): OfficeRequestState => ({ step: "ask", message, error: true, email: typed, options: [], n: prev.n + 1 });
  if (!(await officeDoor()).allowed) return fail("This page is not open yet.");
  if (!officeSignInReady()) return fail("Sign-in is not set up on this site yet.");
  const email = officeEmail(typed);
  if (!email) return fail("Enter your full work email address.");
  if (!matchDomain(domainOf(email))) return fail("That address is not on a government email domain this page accepts. The domains it accepts are listed below.");
  await ensureDeviceCookie();
  const ctx = await requestContext();
  if (!(await withinLimit("office_link_ip_hour", ctx.ipRange)) || !(await withinLimit("office_link_device_hour", ctx.device))) return fail("Too many requests from here. Try again in an hour.");
  // Tidy first: an address that asked for a link more than a week ago and never used it is removed (the privacy page says so).
  await purgeOfficeData(getDb(), Date.now()).catch(() => null);
  const result = await requestOfficeAccess(getDb(), { email, emailHash: await officeEmailHash(email), pickedMemberKey: picked, now: Date.now(), allow: e => withinLimit("office_link_address_day", e) });
  if (!result.ok) {
    if (result.reason === "pick_member") return { step: "pick", error: false, email: typed, options: result.options, n: prev.n + 1,
      message: `Your address shows that you work for the ${result.rule.body}. It does not show which office. Choose the member you work for. The editor confirms it before the dashboard opens.` };
    return fail(result.reason === "rate_limited" ? "Too many links have been sent to that address today. Try again tomorrow." : "Enter your full work email address.");
  }
  if (result.send) {
    const link = await officeLinkUrl(result.send);
    const sent = await sendTo(result.send.to, `Your ${BRAND.name} office link`, [`Someone asked to open the office dashboard on ${BRAND.name} with this address.`, "",
      "Open this link, then press the button on the page:", "", link, "",
      "The link works once, for 30 minutes. If you did not ask for it, ignore this email; nothing changes.", "",
      `The dashboard shows totals for your member's own district only. It never shows a name, an individual answer or a reason. ${NOT_SCIENTIFIC}`].join("\n"));
    if (!sent.ok) console.error(`OFFICE_LINK not sent: ${sent.error}`); // the reason only, never the address
  }
  return { step: "sent", message: SENT, error: false, email: "", options: [], n: prev.n + 1 };
}

/** The button on the page the emailed link opens. Pressing it uses the link up and signs the office in on this device. */
export async function openOffice(formData: FormData) {
  if (!(await officeDoor()).allowed) redirect("/office");
  const ctx = await requestContext();
  if (!(await withinLimit("office_open_ip_hour", ctx.ipRange))) redirect("/office?m=slow");
  const link = await readOfficeLink(String(formData.get("t") ?? ""));
  const account = link ? await redeemOfficeLink(getDb(), { nonce: link.nonce, memberKey: link.memberKey, now: Date.now() }) : null;
  if (!account) redirect("/office?m=expired");
  (await cookies()).set(OFFICE_COOKIE, await officeSessionToken(account.id), officeCookieOptions(process.env.NODE_ENV === "production"));
  redirect("/office/dashboard");
}

export async function signOutOffice() {
  (await cookies()).set(OFFICE_COOKIE, "", { ...officeCookieOptions(process.env.NODE_ENV === "production"), maxAge: 0 });
  redirect("/office?m=signedout");
}

/** The switch on the dashboard: the weekly email, on or off, for this office account. */
export async function setOfficeWeekly(formData: FormData) {
  const office = await currentOffice();
  if (!office) redirect("/office");
  await setWeeklyEmail(getDb(), office.account.id, formData.get("on") === "1");
  redirect("/office/dashboard?m=saved");
}

/** The button on the page the "stop this email" link opens. No sign-in needed; nothing else changes. */
export async function stopOfficeEmail(formData: FormData) {
  const accountId = await readOfficeOptOut(String(formData.get("t") ?? ""));
  const ok = accountId ? await setWeeklyEmail(getDb(), accountId, false) : false;
  redirect(`/office/email-off?done=${ok ? "1" : "0"}`);
}
