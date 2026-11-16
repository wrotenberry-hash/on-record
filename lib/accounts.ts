import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { magicLinks, readerAccounts } from "@/db/schema";
import { signAction, verifyAction } from "@/lib/session-token";
import { sendTo } from "@/lib/mailer";

/**
 * Reader sign-in by email magic link (owner decision 2026-11-13; built in Round 3).
 * No password and no new secret: links and the session cookie are signed with
 * the existing EDITOR_ACCESS_KEY under their own purposes. While public reading
 * is off, only a trial reader (or the editor) can create an account, and an
 * account opens the site only through its trial invite (lib/trial.ts).
 */
export const READER_COOKIE = "or_reader";
export const READER_SESSION_MS = 90 * 24 * 3600 * 1000;
const LINK_TTL_MS = 30 * 60 * 1000;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";
const key = () => process.env.EDITOR_ACCESS_KEY?.trim() || "";

export function normaliseEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(e) ? e : null;
}
export async function emailHash(email: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`on-record:email:${email}`));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join("");
}

/** Creates a single-use link and emails it. The caller passes the viewer's app user and invite (never from the browser). */
export async function requestMagicLink(rawEmail: string, viewer: { appUserId: string; inviteId: string | null }) {
  const email = normaliseEmail(rawEmail);
  if (!email) return { ok: false as const, message: "Enter a full email address." };
  if (!key()) return { ok: false as const, message: "Sign-in is not configured." };
  const nonce = crypto.randomUUID(), now = Date.now();
  await getDb().insert(magicLinks).values({ nonce, email, emailHash: await emailHash(email), appUserId: viewer.appUserId, inviteId: viewer.inviteId, createdAt: now, expiresAt: now + LINK_TTL_MS });
  const token = await signAction(key(), "magic-link", nonce, now + LINK_TTL_MS);
  const link = `${SITE_URL}/account/verify?t=${encodeURIComponent(token)}`;
  const sent = await sendTo(email, "Your On Record sign-in link", [`Tap to sign in to On Record on this device:`, "", link, "",
    "The link works once, for 30 minutes. If you did not ask for it, ignore this email; nothing changes.", "",
    "Signing in keeps your follows and your own Support/Oppose answers on every device. They are never shown to anyone else."].join("\n"));
  if (sent.ok) return { ok: true as const, message: `Sent. Check ${email} and tap the link within 30 minutes.` };
  return { ok: false as const, message: sent.domainNeeded
    ? "Email sign-in is not switched on yet (the site's sending address still needs to be verified). Your invite link keeps you signed in on this device in the meantime."
    : "The email could not be sent. Try again in a minute." };
}

/** Uses a link once: creates or finds the account and returns its id, or null. */
export async function redeemMagicLink(token: string | null | undefined): Promise<string | null> {
  const v = await verifyAction(key(), "magic-link", token);
  if (!v) return null;
  const db = getDb(), now = Date.now();
  const link = await db.select().from(magicLinks).where(eq(magicLinks.nonce, v.subject)).get();
  if (!link || link.usedAt || link.expiresAt < now || !link.appUserId) return null;
  await db.update(magicLinks).set({ usedAt: now }).where(eq(magicLinks.nonce, link.nonce));
  const existing = await db.select().from(readerAccounts).where(eq(readerAccounts.emailHash, link.emailHash)).get();
  if (existing) {
    await db.update(readerAccounts).set({ verifiedAt: existing.verifiedAt ?? now, inviteId: existing.inviteId ?? link.inviteId }).where(eq(readerAccounts.id, existing.id));
    return existing.id;
  }
  const taken = await db.select({ id: readerAccounts.id }).from(readerAccounts).where(eq(readerAccounts.appUserId, link.appUserId)).get();
  if (taken) { // this device's reader already has an account under another address: keep one account per reader
    await db.update(readerAccounts).set({ email: link.email, emailHash: link.emailHash, verifiedAt: now }).where(eq(readerAccounts.id, taken.id));
    return taken.id;
  }
  const id = crypto.randomUUID();
  await db.insert(readerAccounts).values({ id, appUserId: link.appUserId, inviteId: link.inviteId, emailHash: link.emailHash, email: link.email, createdAt: now, verifiedAt: now });
  return id;
}

export async function readerSessionToken(accountId: string) { return signAction(key(), "reader", accountId, Date.now() + READER_SESSION_MS); }

/** The signed-in reader account on this request, or null. */
export async function currentAccount() {
  try {
    const token = (await cookies()).get(READER_COOKIE)?.value;
    const v = await verifyAction(key(), "reader", token);
    if (!v) return null;
    return (await getDb().select().from(readerAccounts).where(eq(readerAccounts.id, v.subject)).get()) ?? null;
  } catch { return null; }
}

export async function accountForAppUser(appUserId: string) {
  return (await getDb().select().from(readerAccounts).where(eq(readerAccounts.appUserId, appUserId)).get()) ?? null;
}

export async function unsubscribeToken(accountId: string) { return signAction(key(), "unsubscribe", accountId, Date.now() + 400 * 24 * 3600 * 1000); }
export async function redeemUnsubscribe(token: string | null | undefined) {
  const v = await verifyAction(key(), "unsubscribe", token);
  if (!v) return false;
  await getDb().update(readerAccounts).set({ digestOptIn: 0 }).where(eq(readerAccounts.id, v.subject));
  return true;
}

export function maskEmail(email: string) { const [u, d] = email.split("@"); return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`; }
