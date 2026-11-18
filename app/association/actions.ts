"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ASSOC_COOKIE, assocCookieOptions, associationsEnabled, redeemAssociationLink, requestAssociationLink } from "@/lib/associations/session";
import { LINK_BAD_EMAIL } from "@/lib/associations/rules";

/** Ask for a sign-in link. The page says the same thing whether or not the address is on a list. */
export async function requestLink(formData: FormData) {
  if (!associationsEnabled()) redirect("/");
  const r = await requestAssociationLink(String(formData.get("email") ?? ""));
  redirect(`/association?m=${r.ok ? "sent" : r.message === LINK_BAD_EMAIL ? "email" : "limit"}`);
}

/** The button on the page the emailed link opens. The link is used here, on the tap, never by merely loading the page. */
export async function openLink(formData: FormData) {
  const session = await redeemAssociationLink(String(formData.get("t") ?? ""));
  if (!session) redirect("/association?m=expired");
  (await cookies()).set(ASSOC_COOKIE, session, assocCookieOptions());
  redirect("/association");
}

export async function signOutAssociation() {
  (await cookies()).set(ASSOC_COOKIE, "", { ...assocCookieOptions(), maxAge: 0 });
  redirect("/association?m=out");
}
