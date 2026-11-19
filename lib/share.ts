import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { shareLinks } from "@/db/schema";
import { countEvent } from "@/lib/events";
import { requestContext, withinLimit } from "@/lib/verify/store";
import { captionWith, shareableTarget } from "@/lib/share-rules";
import { SHARED_PAGES_FLAG, sharedPagesEnabled } from "@/lib/public-access";
import { SHARE_START_EVENT, sharedBillAddress } from "@/lib/entry/rules";
import { shareGrant } from "@/lib/entry/store";
import { viewerAccess } from "@/lib/viewer";
export { captionWith, shareableTarget };

/**
 * Round G sharing: short links that land on the exact item, and aggregate share
 * counts (shares, share→visit, visit→signup). A short link records how many visits
 * and sign-ups it led to, never who visited. The "came from a share" cookie holds
 * only the link code and is cleared once onboarding finishes.
 */
export const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";
export const SHARE_COOKIE = "or_from_share";
export const SHARE_EVENTS = ["share_native", "share_download", "share_copy", "share_video", "share_carousel"] as const;
export type ShareEvent = (typeof SHARE_EVENTS)[number];
const ALPHA = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";


export async function shortLinkFor(target: string, kind: string) {
  if (!shareableTarget(target)) return null;
  const db = getDb(), found = await db.select({ code: shareLinks.code }).from(shareLinks).where(eq(shareLinks.target, target)).get();
  if (found) return `${SITE}/s/${found.code}`;
  const bytes = crypto.getRandomValues(new Uint8Array(7)), code = Array.from(bytes, b => ALPHA[b % ALPHA.length]).join("");
  await db.insert(shareLinks).values({ code, target, kind: kind.slice(0, 30), createdAt: Date.now() }).onConflictDoNothing();
  const row = await db.select({ code: shareLinks.code }).from(shareLinks).where(eq(shareLinks.target, target)).get();
  return row ? `${SITE}/s/${row.code}` : null;
}

/** A visit through a short link: counted in aggregate, then the reader lands on the item. */
export async function openShareLink(code: string) {
  if (!/^[A-Za-z0-9]{7}$/.test(code)) return null;
  const db = getDb(), row = await db.select().from(shareLinks).where(eq(shareLinks.code, code)).get();
  if (!row) return null;
  await db.update(shareLinks).set({ visits: sql`${shareLinks.visits} + 1` }).where(eq(shareLinks.code, code));
  await countEvent("share_visit", row.kind);
  (await cookies()).set(SHARE_COOKIE, code, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 24 * 3600 });
  return row.target;
}

/**
 * Where a short link sends its visitor. Today, and always for an invited reader or the editor: the exact card.
 * Only with SHARED_PAGES_PUBLIC on (lib/public-access.ts; off by default), a visitor with no invite is sent to the
 * page of the bill the card is about, with the link's code in the address; that code opens that one bill and nothing
 * else. A link about no bill, or with the switch off, lands where it always did (the private notice, for that visitor).
 */
export async function shareLanding(code: string): Promise<string> {
  const target = await openShareLink(code);
  if (!target) return "/";
  const card = `${target}${target.includes("?") ? "&" : "?"}from=share`;
  if (!sharedPagesEnabled(process.env[SHARED_PAGES_FLAG]) || (await viewerAccess()).allowed) return card;
  const grant = await shareGrant(getDb(), code).catch(() => null);
  return grant?.billKey && grant.level ? sharedBillAddress(grant.billKey, grant.level, code) : card;
}

/** One share started from a bill page's share menu (aggregate only; the dimension is "bill:<card kind>", never which bill). */
export async function countShareStart(kind: string) { await countEvent(SHARE_START_EVENT, `bill:${kind.replace(/[^a-z]/g, "").slice(0, 20)}`); }

/** Called when a reader finishes onboarding: counts visit→signup once, then forgets the code. */
export async function noteShareSignup() {
  try {
    const jar = await cookies(), code = jar.get(SHARE_COOKIE)?.value;
    if (!code || !/^[A-Za-z0-9]{7}$/.test(code)) return;
    const db = getDb(), row = await db.select({ kind: shareLinks.kind }).from(shareLinks).where(eq(shareLinks.code, code)).get();
    if (row) { await db.update(shareLinks).set({ signups: sql`${shareLinks.signups} + 1` }).where(eq(shareLinks.code, code)); await countEvent("share_signup", row.kind); }
    jar.delete(SHARE_COOKIE);
  } catch { /* best-effort */ }
}
export async function cameFromShare() { return !!(await cookies()).get(SHARE_COOKIE)?.value; }

/** Logs a share action from the share panel, rate-limited per device. */
export async function logShare(event: string, kind: string) {
  if (!(SHARE_EVENTS as readonly string[]).includes(event)) return false;
  const ctx = await requestContext();
  if (!(await withinLimit("share_device_hour", ctx.device ?? ctx.ipRange))) return false;
  await countEvent(event, kind.replace(/[^a-z0-9_-]/gi, "").slice(0, 30));
  return true;
}

/** Card renders are limited per device and per IP range so nobody can mass-produce images. */
export async function cardAllowed() {
  const ctx = await requestContext();
  return (await withinLimit("card_device_hour", ctx.device)) && (await withinLimit("card_ip_hour", ctx.ipRange));
}


/** Share funnel for the editor and the probe: totals over the last `days` days. */
export async function shareFunnel(days = 7) {
  const { eventTotals } = await import("@/lib/events");
  const t = await eventTotals(days, [...SHARE_EVENTS, "share_visit", "share_signup"]), sum = (n: string) => t.filter(x => x.name === n).reduce((a, x) => a + x.n, 0);
  const shares = SHARE_EVENTS.reduce((a, e) => a + sum(e), 0), visits = sum("share_visit"), signups = sum("share_signup");
  const links = await getDb().select({ n: sql<number>`count(*)`, v: sql<number>`coalesce(sum(visits),0)`, s: sql<number>`coalesce(sum(signups),0)` }).from(shareLinks).get();
  return { days, shares, visits, signups, visitPerShare: shares ? Math.round(100 * visits / shares) / 100 : null, signupPct: visits ? Math.round(1000 * signups / visits) / 10 : null,
    links: { total: Number(links?.n ?? 0), visitsAllTime: Number(links?.v ?? 0), signupsAllTime: Number(links?.s ?? 0) } };
}
