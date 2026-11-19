/**
 * Vote alerts (owner's point 2, 18 Nov 2026). A reader whose setting is on hears about every MEANINGFUL vote (a vote
 * on a bill itself: lib/flow/votes.ts) by a legislator they follow. The issues a reader picked no longer decide it.
 *
 * At most one message per reader per scheduled update: the newest five votes, then how many more and where they are
 * listed. The message goes to the reader's alert list and their devices (the existing notifyUser) and, for a reader
 * with a confirmed email address, by email.
 *
 * Only votes that arrived since the last update are announced. For Congress that is by the time of the vote. Texas
 * gives a day, not a time, so the last day seen is remembered with the votes already announced for that day.
 *
 * Database handle first, no request and no secret: tests/loop.test.mjs runs it against a temporary database.
 */
import { and, eq, gt, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { alertPrefs, ingestCursors, officialBills, officialMemberVotes, officialRollCalls, officialTallyChecks, readerAccounts, txBills, txMemberVotes, txVotes, userFollows } from "../../db/schema.ts";
import { BRAND } from "../brand.ts";
import { meaningfulVote, plainBillName, txMeaningfulVote, txVoteLine, voteLine } from "../flow/votes.ts";
import type { Db } from "../verify/residence-store.ts";
import { membersById } from "./people.ts";
import { alertBundle, fedBillLabel, type AlertVote } from "./rules.ts";

const DAY = 86400e3;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const chunks = <T>(a: readonly T[], n = 90) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
export const FED_CURSOR = "alerts:lastVotedAt", TX_CURSOR = "alerts:txVotes";
export const ALERT_EMAIL_CAP = 200;

export type AlertDeps = {
  notify?: (userId: string, alert: { title: string; body: string; url: string }) => Promise<{ pushed: number }>;
  send?: (to: string, subject: string, text: string) => Promise<{ ok: boolean }>;
  site?: string;
  /** The most alert emails one run may send; readers past it still get the alert on the site and their devices. */
  emailCap?: number;
};

async function cursor(db: Db, key: string) { return (await db.select().from(ingestCursors).where(eq(ingestCursors.key, key)).get())?.value ?? null; }
async function setCursor(db: Db, key: string, value: string, now: number) {
  await db.insert(ingestCursors).values({ key, value, updatedAt: now }).onConflictDoUpdate({ target: ingestCursors.key, set: { value, updatedAt: now } });
}

type NewVote = { voteId: string; memberId: string; vote: Omit<AlertVote, "member"> };

/** New votes on bills in Congress since the last update, one entry per followed member who is listed in them. */
async function newFederal(db: Db, now: number, members: readonly string[]): Promise<NewVote[]> {
  const since = Number((await cursor(db, FED_CURSOR)) ?? now - DAY);
  const rolls = await db.select({ id: officialRollCalls.id, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question, title: officialRollCalls.title, result: officialRollCalls.result,
    yea: officialRollCalls.yea, nay: officialRollCalls.nay, chamber: officialRollCalls.chamber, billId: officialRollCalls.billId, billTitle: officialBills.title, billType: officialBills.billType, number: officialBills.number })
    .from(officialRollCalls).leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId)).where(and(gt(officialRollCalls.votedAt, since), lte(officialRollCalls.votedAt, now)));
  if (!rolls.length) return [];
  await setCursor(db, FED_CURSOR, String(Math.max(...rolls.map(r => r.votedAt))), now);
  const meaningful = rolls.flatMap(r => { if (!r.billId || !r.billType || r.number === null) return [];
    const kind = meaningfulVote({ question: r.question, result: r.result, title: r.title, billTitle: r.billTitle, hasBill: true }); return kind ? [{ ...r, kind }] : []; });
  if (!meaningful.length || !members.length) return [];
  const review = new Set<string>(), out: NewVote[] = [];
  for (const part of chunks(meaningful.map(r => r.id))) {
    for (const r of await db.select({ id: officialTallyChecks.rollCallId }).from(officialTallyChecks).where(and(inArray(officialTallyChecks.rollCallId, part), eq(officialTallyChecks.ok, 0)))) review.add(r.id);
    for (const ids of chunks(members)) for (const v of await db.select().from(officialMemberVotes).where(and(inArray(officialMemberVotes.rollCallId, part), inArray(officialMemberVotes.politicianId, ids)))) {
      const r = meaningful.find(x => x.id === v.rollCallId)!, label = fedBillLabel(r.billType!, r.number!);
      const name = plainBillName({ title: r.billTitle ?? "", billType: r.billType, label }).text;
      out.push({ voteId: r.id, memberId: v.politicianId, vote: { billLabel: label, path: `/bills/${r.billId}`, at: r.votedAt,
        line: voteLine({ position: v.position, kind: r.kind, name, result: r.result, yea: r.yea, nay: r.nay, question: r.question, chamber: r.chamber, billType: r.billType, tallyUnderReview: review.has(r.id) }) } });
    }
  }
  return out;
}

/** The same for Texas record votes (only a record vote lists each member). */
async function newTexas(db: Db, now: number, members: readonly string[]): Promise<NewVote[]> {
  let last: { date: string; ids: string[] } = { date: day(now - DAY), ids: [] }, first = true;
  try { const c = JSON.parse((await cursor(db, TX_CURSOR)) ?? "null") as { date?: unknown; ids?: unknown } | null;
    if (c && typeof c.date === "string" && Array.isArray(c.ids)) { last = { date: c.date, ids: c.ids.map(String) }; first = false; } } catch { /* an unreadable marker starts again from yesterday */ }
  const rows = (await db.select({ id: txVotes.id, motion: txVotes.motion, date: txVotes.date, result: txVotes.result, counts: txVotes.counts, tallyOk: txVotes.tallyOk, billId: txVotes.billId,
    identifier: txBills.identifier, title: txBills.title }).from(txVotes).innerJoin(txBills, eq(txBills.id, txVotes.billId)).where(and(gte(txVotes.date, last.date), lte(txVotes.date, day(now + DAY)))))
    .filter(v => first || v.date.slice(0, 10) > last.date || !last.ids.includes(v.id));
  if (!rows.length) return [];
  const newest = rows.map(v => v.date.slice(0, 10)).sort().at(-1)!;
  await setCursor(db, TX_CURSOR, JSON.stringify({ date: newest, ids: [...(newest === last.date ? last.ids : []), ...rows.filter(v => v.date.slice(0, 10) === newest).map(v => v.id)] }), now);
  const meaningful = rows.flatMap(v => { const kind = txMeaningfulVote(v.motion); return kind ? [{ ...v, kind }] : []; });
  if (!meaningful.length || !members.length) return [];
  const out: NewVote[] = [];
  for (const part of chunks(meaningful.map(v => v.id))) for (const ids of chunks(members))
    for (const mv of await db.select().from(txMemberVotes).where(and(inArray(txMemberVotes.voteId, part), isNotNull(txMemberVotes.personId), inArray(txMemberVotes.personId, ids)))) {
      const v = meaningful.find(x => x.id === mv.voteId)!, counts = v.counts as Record<string, number> | null;
      const name = plainBillName({ title: v.title, billType: "hb", label: v.identifier }).text;
      out.push({ voteId: v.id, memberId: mv.personId!, vote: { billLabel: v.identifier, path: `/texas/bills/${v.billId}`, at: Date.parse(v.date) || now,
        line: txVoteLine({ option: mv.option, kind: v.kind, name, result: v.result, yes: counts?.yes, no: counts?.no, tallyOk: v.tallyOk === 1 }) } });
    }
  return out;
}

export async function runVoteAlerts(db: Db, now = Date.now(), deps: AlertDeps = {}) {
  const users = (await db.select({ userId: alertPrefs.userId }).from(alertPrefs).where(eq(alertPrefs.instantVotes, 1))).map(u => u.userId);
  const out = { readers: users.length, sent: 0, votes: 0, emailed: 0, emailFailed: 0, emailCapped: 0 };
  const follows = new Map<string, string[]>();
  for (const part of chunks(users)) for (const f of await db.select().from(userFollows).where(inArray(userFollows.userId, part))) follows.set(f.userId, [...(follows.get(f.userId) ?? []), f.politicianId]);
  const followed = [...new Set([...follows.values()].flat())];
  // Both lists are read on every run, with or without followers, so the markers always move on and old votes are never announced late.
  const votes = [...(await newFederal(db, now, followed)), ...(await newTexas(db, now, followed))];
  if (!votes.length) return out;
  const names = new Map((await membersById(db, followed)).map(m => [m.id, m.short]));
  const site = deps.site ?? "", cap = deps.emailCap ?? ALERT_EMAIL_CAP;
  for (const userId of users) {
    const mine = new Set(follows.get(userId) ?? []);
    const bundle = alertBundle(votes.filter(v => mine.has(v.memberId) && names.has(v.memberId)).map(v => ({ ...v.vote, member: names.get(v.memberId)! })), { site, brand: BRAND.name });
    if (!bundle) continue;
    out.sent++; out.votes += bundle.shown + bundle.more;
    if (deps.notify) await deps.notify(userId, { title: bundle.title, body: bundle.body, url: bundle.path }).catch(() => null);
    const account = deps.send ? await db.select().from(readerAccounts).where(eq(readerAccounts.appUserId, userId)).get() : null;
    if (!deps.send || !account?.verifiedAt) continue;
    if (out.emailed + out.emailFailed >= cap) { out.emailCapped++; continue; }
    const r = await deps.send(account.email, bundle.subject, bundle.text).catch(() => ({ ok: false }));
    if (r.ok) out.emailed++; else out.emailFailed++;
  }
  return out;
}
