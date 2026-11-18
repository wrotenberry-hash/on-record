"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentAccount, accountForAppUser, READER_COOKIE } from "@/lib/accounts";
import { currentAppUserId } from "@/lib/viewer";
import { confirmPhone, setAddress, startPhone } from "@/lib/verify/flow";
import { deleteAccountAndPositions, ensureDeviceCookie } from "@/lib/verify/store";
import { countEvent } from "@/lib/events";
import { viewerAccess } from "@/lib/viewer";
import { askForPostcard, enterPostcardCode, type StepResult } from "@/lib/mail-verify/flow";
import { MAIL_NOTE_OK, MAIL_OFFER_COOKIE, MAIL_OFFER_MAX_AGE_S } from "@/lib/mail-verify/rules";

async function account() {
  const a = await currentAccount();
  if (a) return a;
  const u = await currentAppUserId();
  return u ? accountForAppUser(u) : null;
}
const back = (step: string, r: { ok: boolean; message: string }) => redirect(`/account?v=${step}&ok=${r.ok ? 1 : 0}&t=${encodeURIComponent(r.message)}#verify`);

export async function sendPhoneCode(formData: FormData) {
  const a = await account();
  if (!a) redirect("/account?m=closed");
  await ensureDeviceCookie();
  const r = await startPhone(a, { phone: String(formData.get("phone") ?? ""), consent: formData.get("consent") === "yes", turnstile: String(formData.get("cf-turnstile-response") ?? "") || null });
  await countEvent(r.ok ? "verify_sms_sent" : "verify_sms_refused", "trial");
  back(r.ok ? "code" : "phone", r);
}

export async function checkPhoneCode(formData: FormData) {
  const a = await account();
  if (!a) redirect("/account?m=closed");
  const r = await confirmPhone(a, String(formData.get("code") ?? ""));
  await countEvent(r.ok ? "verify_phone_ok" : "verify_phone_failed", "trial");
  back(r.ok ? "address" : "code", r);
}

export async function saveAddress(formData: FormData) {
  const a = await account();
  if (!a) redirect("/account?m=closed");
  const r = await setAddress(a, { street: String(formData.get("street") ?? ""), unit: String(formData.get("unit") ?? ""), city: String(formData.get("city") ?? ""), state: String(formData.get("state") ?? ""), zip: String(formData.get("zip") ?? "") });
  await countEvent(r.ok ? "verify_address_ok" : "verify_address_failed", "trial");
  back(r.ok ? "done" : "address", r);
}

/** Deletes the account and every answer it gave, then signs this device out. */
export async function deleteMyAccount(formData: FormData) {
  const a = await account();
  if (!a) redirect("/account");
  if (formData.get("confirm") !== "yes") redirect("/account?m=confirmdelete#delete");
  await deleteAccountAndPositions(a);
  (await cookies()).delete(READER_COOKIE);
  await countEvent("account_deleted", "trial");
  redirect("/account?m=deleted");
}

/* ───────── Mail-verified by postcard (lib/mail-verify). Off unless MAIL_VERIFICATION_ENABLED=1; a rehearsal is for the editor only. ───────── */

// The page maps the note name to its fixed line (lib/mail-verify/rules.ts, `mailNote`); no text travels in the address.
const mailBack = (r: StepResult) => redirect(`/account?mv=${r.note}${r.at ? `&d=${Math.round(r.at)}` : ""}${r.testCode ? `&mc=${r.testCode}` : ""}#mail-verify`);

/** "Mail me a postcard": for an account with a matched home address, within the limits. Nothing is mailed in a rehearsal. */
export async function mailMeAPostcard() {
  const access = await viewerAccess(), a = access.allowed ? await account() : null;
  if (!a) redirect("/account?m=closed");
  const r = await askForPostcard(a, !!access.editor);
  await countEvent(MAIL_NOTE_OK.includes(r.note) ? "postcard_requested" : "postcard_refused", access.audience);
  mailBack(r);
}

/** "Enter the code from your postcard." */
export async function confirmMailCode(formData: FormData) {
  const access = await viewerAccess(), a = access.allowed ? await account() : null;
  if (!a) redirect("/account?m=closed");
  const r = await enterPostcardCode(a, formData.get("code"), !!access.editor);
  await countEvent(MAIL_NOTE_OK.includes(r.note) ? "mail_code_ok" : "mail_code_refused", access.audience);
  mailBack(r);
}

/** "Not now" on the one-line postcard offer under the voting box: the offer stays away on this device. */
export async function dismissMailOffer(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed) return;
  (await cookies()).set(MAIL_OFFER_COOKIE, "no", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAIL_OFFER_MAX_AGE_S });
  await countEvent("postcard_offer_dismissed", access.audience);
  const back = String(formData.get("back") ?? "/");
  redirect(`${/^\/[\w/%.-]*$/.test(back) ? back : "/"}#your-view`);
}
