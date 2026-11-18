import { cookies } from "next/headers";
import { getDb } from "@/db";
import { signAction, verifyAction } from "@/lib/session-token";
import { keyedHash } from "@/lib/verify/crypto";
import { viewerAccess } from "@/lib/viewer";
import { memberOf, officeById, type OfficeAccount } from "@/lib/office/store";
import { OFFICE_SESSION_MS, type OfficeMember } from "@/lib/office/rules";

/**
 * A legislator's office, signed in (owner, 18 Nov 2026, point 7). Separate from a reader's sign-in in every part: its
 * own cookie, its own signed purposes, its own table. An office session never gives a reader session, and a reader
 * session never opens the office dashboard. No new secret: links and the session are signed with the existing
 * EDITOR_ACCESS_KEY under their own purposes, as reader links are (lib/accounts.ts).
 *
 * The office pages stay behind the same gate as every reader page (`viewerAccess`): while public reading is off,
 * only the editor and trial readers can reach them.
 */
export const OFFICE_COOKIE = "or_office";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";
const OPT_OUT_MS = 400 * 24 * 3600 * 1000;
const key = () => process.env.EDITOR_ACCESS_KEY?.trim() || "";

export const officeSignInReady = () => !!key();
export const officeUrl = (path: string) => `${SITE_URL}${path}`;
/** Only a keyed hash of the address is used to find an office account. */
export const officeEmailHash = (email: string) => keyedHash("office-email", email);

/** The gate every office page and action passes first. */
export async function officeDoor() { return viewerAccess(); }

/* ───────────────────────────── The emailed link ───────────────────────────── */

/** The link carries the single-use number and the member the person chose, signed, for 30 minutes. */
export async function officeLinkUrl(send: { nonce: string; memberKey: string; expiresAt: number }) {
  const token = await signAction(key(), "office-link", JSON.stringify([send.nonce, send.memberKey]), send.expiresAt);
  return officeUrl(`/office/verify?t=${encodeURIComponent(token)}`);
}
/** What a link says, when its signature is good and its 30 minutes are not over. It is not used up by being read. */
export async function readOfficeLink(token: string | null | undefined): Promise<{ nonce: string; memberKey: string | null } | null> {
  const v = await verifyAction(key(), "office-link", token);
  if (!v) return null;
  try {
    const [nonce, memberKey] = JSON.parse(v.subject) as unknown[];
    return typeof nonce === "string" && nonce ? { nonce, memberKey: typeof memberKey === "string" && memberKey ? memberKey : null } : null;
  } catch { return null; }
}

/* ───────────────────────────── The session ───────────────────────────── */

export async function officeSessionToken(accountId: string, now = Date.now()) { return signAction(key(), "office", accountId, now + OFFICE_SESSION_MS); }
export const officeCookieOptions = (secure: boolean) => ({ httpOnly: true, secure, sameSite: "lax" as const, path: "/office", maxAge: Math.floor(OFFICE_SESSION_MS / 1000) });

export type OfficeSession = { account: OfficeAccount; member: OfficeMember | null };
/**
 * The office signed in on this request, or null. The account is read on every request, so an account the editor has
 * closed is out at once. "review": signed in, and shown nothing until the editor confirms the office.
 */
export async function currentOffice(): Promise<OfficeSession | null> {
  try {
    const v = await verifyAction(key(), "office", (await cookies()).get(OFFICE_COOKIE)?.value);
    if (!v) return null;
    const db = getDb(), account = await officeById(db, v.subject);
    if (!account || (account.status !== "active" && account.status !== "review")) return null;
    return { account, member: await memberOf(db, account.memberKey) };
  } catch { return null; }
}

/* ───────────────────────────── Stopping the weekly email ───────────────────────────── */

export async function officeOptOutUrl(accountId: string, now = Date.now()) {
  return officeUrl(`/office/email-off?t=${encodeURIComponent(await signAction(key(), "office-email-off", accountId, now + OPT_OUT_MS))}`);
}
export async function readOfficeOptOut(token: string | null | undefined): Promise<string | null> {
  return (await verifyAction(key(), "office-email-off", token))?.subject ?? null;
}
