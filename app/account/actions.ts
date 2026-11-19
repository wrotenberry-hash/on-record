"use server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { readerAccounts } from "@/db/schema";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { currentAccount, READER_COOKIE, requestMagicLink } from "@/lib/accounts";
import { countEvent } from "@/lib/events";

/** Email a sign-in link. Only a trial reader or the editor can ask while public reading is off. */
export async function requestLink(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed || (!access.invite && !access.editor)) redirect("/account?m=closed");
  const appUserId = await currentAppUserId(true);
  if (!appUserId) redirect("/account?m=closed");
  const { ensureDeviceCookie } = await import("@/lib/verify/store");
  await ensureDeviceCookie();
  const result = await requestMagicLink(String(formData.get("email") ?? ""), { appUserId, inviteId: access.invite?.id ?? null }, String(formData.get("cf-turnstile-response") ?? "") || null);
  await countEvent(result.ok ? "magic_link_sent" : "magic_link_failed", access.audience);
  redirect(`/account?m=${result.ok ? "sent" : "fail"}&t=${encodeURIComponent(result.message)}`);
}

export async function setDigest(formData: FormData) {
  const account = await currentAccount();
  if (!account) return;
  await getDb().update(readerAccounts).set({ digestOptIn: formData.get("on") === "1" ? 1 : 0 }).where(eq(readerAccounts.id, account.id));
  redirect("/account?m=saved");
}

/**
 * Alert choices: votes by the legislators the reader follows, and moves of bills they follow. Push is turned on per
 * device on the page. For a new reader the row already exists with vote alerts on (lib/follow-defaults.ts); this is
 * where they change it, and a choice made here is never overwritten by a default.
 */
export async function setAlerts(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed || (!access.invite && !access.editor)) redirect("/account");
  const userId = await currentAppUserId(true);
  if (!userId) redirect("/account");
  const { alertPrefs } = await import("@/db/schema");
  const v = { instantVotes: formData.get("instantVotes") === "1" ? 1 : 0, instantBills: formData.get("instantBills") === "1" ? 1 : 0, updatedAt: Date.now() };
  await getDb().insert(alertPrefs).values({ userId, ...v }).onConflictDoUpdate({ target: alertPrefs.userId, set: v });
  await countEvent(v.instantVotes ? "instant_alerts_on" : "instant_alerts_off", access.audience);
  redirect("/account?m=saved#alerts");
}

export async function signOut() {
  (await cookies()).delete(READER_COOKIE);
  redirect("/account?m=signedout");
}
