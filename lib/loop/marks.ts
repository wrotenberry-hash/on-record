/**
 * Counting opens and returns without tracking anyone (owner's point 12, 18 Nov 2026).
 *
 * A mark is 16 random bytes made at the moment a message is sent. It is written into the message (the address of a
 * tiny picture in the weekly email, or the link in a notice's email) and stored NOWHERE else: not with the account,
 * not in the send log, not in the notice. It is not made from the account, the email address or the time, so it
 * cannot be worked back to a person. When the picture is loaded or the link is followed, one row goes into
 * anon_marks (kind, mark, period). The table's key is (kind, mark), so the same message opened ten times is one row.
 * A row says "one more open" and never who.
 *
 * Each mark travels with a short signature made with the site's secret, so only marks the site handed out are
 * counted; a stranger loading made-up addresses adds nothing. The signature is made from the mark, not from the
 * reader, so it adds no link to a person.
 *
 * What the numbers cannot tell: mail apps that load pictures ahead of time (Apple Mail's privacy setting does) count
 * as an open even when nobody read the email, and mail apps that block pictures count as no open even when somebody
 * did. So the open rate is a rough guide, high on Apple devices and low elsewhere.
 *
 * Database functions take the handle first and read no request and no secret: tests/loop.test.mjs runs them against
 * a temporary database built from the migrations.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gte, isNotNull, lte, or, sql } from "drizzle-orm";
import { anonMarks, digestSends, loopNotices } from "../../db/schema.ts";
import { isoWeek } from "../digest-format.ts";
import type { Db } from "../verify/residence-store.ts";

export type MarkKind = "weekly_open" | "loop_return";
const b64u = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const WEEK = /^\d{4}-W\d{2}$/, MARK = /^[A-Za-z0-9_-]{22}$/;

/** 16 random bytes as 22 letters and digits. Nothing about a reader goes into it. */
export function newMark(): string { return b64u(randomBytes(16)); }

function signature(secret: string, kind: MarkKind, period: string, mark: string) {
  return b64u(createHmac("sha256", `anon-mark:v1:${secret}`).update(`${kind}|${period}|${mark}`).digest()).slice(0, 22);
}

/**
 * A new mark with its signature, ready to put in an address: "<mark>.<week>.<signature>" for the weekly email (the
 * week it was sent in, so an email opened the following Monday still counts for its own week), "<mark>.<signature>"
 * for a notice's link.
 */
export function mintToken(kind: MarkKind, secret: string, period = ""): string {
  const mark = newMark();
  return period ? `${mark}.${period}.${signature(secret, kind, period, mark)}` : `${mark}.${signature(secret, kind, "", mark)}`;
}

/** The mark inside a token, when the site made it; null for anything else. */
export function readToken(kind: MarkKind, token: string | null | undefined, secret: string): { mark: string; period: string | null } | null {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 2 && parts.length !== 3) return null;
  const mark = parts[0], period = parts.length === 3 ? parts[1] : "", given = parts[parts.length - 1];
  if (!MARK.test(mark) || (period && !WEEK.test(period))) return null;
  const want = Buffer.from(signature(secret, kind, period, mark)), got = Buffer.from(given);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return { mark, period: period || null };
}

/** One row per mark, however often it arrives. True when this was the first time. */
export async function recordMark(db: Db, kind: MarkKind, mark: string, period: string, now: number): Promise<boolean> {
  const rows = await db.insert(anonMarks).values({ kind, mark, period, at: now }).onConflictDoNothing().returning({ mark: anonMarks.mark });
  return rows.length > 0;
}

/** The weekly email's picture was loaded. Counts once per email; a token the site did not make counts nothing. */
export async function countOpen(db: Db, token: string | null | undefined, secret: string, now: number): Promise<boolean> {
  const t = readToken("weekly_open", String(token ?? "").replace(/\.gif$/i, ""), secret);
  if (!t?.period) return false;
  return recordMark(db, "weekly_open", t.mark, t.period, now);
}

/** The address a push notification opens: there is no mark in it, because the text of a push is kept with the reader's id. */
export const PUSH_ARRIVAL = "p";

/**
 * A reader came back through a notice's link. From an email the link carries its own one-time mark. From a push
 * notification it cannot (what a push says is stored beside the reader's id, and a mark must be stored nowhere), so
 * the mark is made on arrival: each arrival through a push counts once. `fromReader` says the request came from an
 * invited reader's own device, the only place a push can be opened; without it a push arrival is not counted.
 */
export async function countReturn(db: Db, token: string | null | undefined, secret: string, now: number, fromReader: boolean): Promise<boolean> {
  if (token === PUSH_ARRIVAL) return fromReader ? recordMark(db, "loop_return", newMark(), isoWeek(now), now) : false;
  const t = readToken("loop_return", token, secret);
  if (!t || t.period) return false;
  return recordMark(db, "loop_return", t.mark, isoWeek(now), now);
}

/** Where a notice's link may lead: the home screen, the list of notices, or one bill's page. Anything else goes home, so the link can never send a reader to another site. */
export function safeReturnPath(to: string | null | undefined): string {
  const t = String(to ?? "");
  return t === "/notices" || /^\/(texas\/)?bills\/[A-Za-z0-9-]{1,60}$/.test(t) ? t : "/";
}
/** The link a notice's push or email carries. */
export function returnLink(site: string, token: string, path: string) { return `${site}/n/${token}?to=${encodeURIComponent(safeReturnPath(path))}`; }

/** A transparent 1×1 GIF: the picture in the weekly email. */
export const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

const rate = (part: number, whole: number) => (whole > 0 ? Math.min(1, Math.round((1000 * part) / whole) / 1000) : null);
export const NOTICE_DAYS = 28;

/**
 * The two measures for the What's next page. Totals only.
 *
 * Weekly email: for the latest week in which an email went out (this week before Monday's send has none, so the
 * week before is shown), emails sent, distinct pictures loaded, and the rate. Picture preloading inflates it.
 * Notices: over the last 28 days, notices that left the site (by push or by email), distinct returns through a
 * notice's link, and the rate. One push that tells of several notices can bring one return, so the rate runs low
 * when notices arrive together; a reader who taps both the push and the email of one notice counts twice.
 */
export async function loopMeasures(db: Db, now = Date.now()) {
  const latest = await db.select({ week: digestSends.week }).from(digestSends).where(and(eq(digestSends.ok, 1), lte(digestSends.sentAt, now))).orderBy(sql`${digestSends.sentAt} desc`).limit(1).get();
  const week = latest?.week ?? isoWeek(now), since = now - NOTICE_DAYS * 86400e3;
  const n = async (q: Promise<{ n: number } | undefined>) => Number((await q)?.n ?? 0);
  const [weeklyEmailsSent, weeklyOpens, noticesSent, noticeReturns] = await Promise.all([
    n(db.select({ n: sql<number>`count(*)` }).from(digestSends).where(and(eq(digestSends.week, week), eq(digestSends.ok, 1))).get()),
    n(db.select({ n: sql<number>`count(*)` }).from(anonMarks).where(and(eq(anonMarks.kind, "weekly_open"), eq(anonMarks.period, week))).get()),
    n(db.select({ n: sql<number>`count(*)` }).from(loopNotices).where(and(gte(loopNotices.createdAt, since), or(isNotNull(loopNotices.pushedAt), isNotNull(loopNotices.emailedAt)))).get()),
    n(db.select({ n: sql<number>`count(*)` }).from(anonMarks).where(and(eq(anonMarks.kind, "loop_return"), gte(anonMarks.at, since))).get()),
  ]);
  return { week, weeklyEmailsSent, weeklyOpens, weeklyOpenRate: rate(weeklyOpens, weeklyEmailsSent), noticeDays: NOTICE_DAYS, noticesSent, noticeReturns, noticeReturnRate: rate(noticeReturns, noticesSent) };
}
