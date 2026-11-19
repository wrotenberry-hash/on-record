/**
 * Closing the loop (owner's point 4, 18 Nov 2026): when a bill a reader answered (voice_votes) or follows
 * (bill_follows) gets a floor vote, passes, fails, is signed or is vetoed, the reader gets one notice.
 *
 * The notice (loop_notices) keeps the result with its numbers and date, how each of the reader's own legislators
 * voted, and whether the result matched what counted residents of the reader's district said. It does not keep the
 * reader's answer: that is read from voice_votes when the notice is shown or emailed.
 *
 * Safe to run on every scheduled update. The table allows one notice per reader, bill and event, and a notice is
 * sent (push, email) only in the run that wrote it, so a second run writes nothing and sends nothing.
 *
 * Database handle first, no request and no secret (the caller passes the sender functions and the site secret), so
 * tests/loop.test.mjs runs this against a temporary database built from the migrations.
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alertPrefs, billFollows, loopNotices, officialBillActions, officialBillDepth, officialBills, officialMemberVotes, officialRollCalls, officialTallyChecks, readerAccounts,
  txBillActions, txBills, txMemberVotes, txVotes, voiceVotes } from "../../db/schema.ts";
import { BRAND } from "../brand.ts";
import { totalsForBill } from "../constituent/store.ts";
import type { ScopeTotals } from "../constituent/rules.ts";
import type { Db } from "../verify/residence-store.ts";
import { mintToken, PUSH_ARRIVAL, returnLink } from "./marks.ts";
import { ownLegislators, placeOf, type Member, type Place } from "./people.ts";
import { answerLine, billPath, districtLine, districtScope, federalEvents, fedBillLabel, LOOP_WINDOW_DAYS, memberLines, noticeBody, noticeEmail, noticePush, rollCallEvent, shouldNotify, texasEvents, txVoteEvent,
  type BillRef, type Chamber, type LoopEvent, type MemberVote, type OutNotice } from "./rules.ts";

const DAY = 86400e3;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const chunks = <T>(a: readonly T[], n = 90) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export type LoopDeps = {
  /** The existing notifyUser (lib/push.ts): records the alert and pushes to the reader's devices. */
  notify?: (userId: string, alert: { title: string; body: string; url: string }) => Promise<{ pushed: number }>;
  /** The existing sendTo (lib/mailer.ts). */
  send?: (to: string, subject: string, text: string) => Promise<{ ok: boolean }>;
  site?: string;
  /** Signs the one-time marks in email links (lib/loop/marks.ts). */
  secret?: string;
  /** The most notice emails one run may send. The rest stay on the site and in the push. */
  emailCap?: number;
};
export const LOOP_EMAIL_CAP = 200;

type BillData = { bill: BillRef; events: LoopEvent[]; /** Every vote on the bill itself, by the id of the roll call or record vote. */ voteOf: Map<string, { chamber: Chamber; date: string }>;
  /** Record votes this site's copy has no member list for. */ unlisted: Set<string> };

async function federalBill(db: Db, id: string, now: number): Promise<BillData | null> {
  const b = await db.select().from(officialBills).where(eq(officialBills.id, id)).get();
  if (!b) return null;
  const bill: BillRef = { key: b.id, level: "federal", label: fedBillLabel(b.billType, b.number), title: b.title, billType: b.billType };
  const [rolls, actions, depth] = await Promise.all([db.select().from(officialRollCalls).where(eq(officialRollCalls.billId, id)),
    db.select().from(officialBillActions).where(eq(officialBillActions.billId, id)), db.select().from(officialBillDepth).where(eq(officialBillDepth.billId, id)).get()]);
  const review = new Set<string>();
  for (const part of chunks(rolls.map(r => r.id))) for (const r of await db.select({ id: officialTallyChecks.rollCallId }).from(officialTallyChecks).where(and(inArray(officialTallyChecks.rollCallId, part), eq(officialTallyChecks.ok, 0)))) review.add(r.id);
  const rollCalls = rolls.map(r => ({ id: r.id, chamber: r.chamber, votedAt: r.votedAt, question: r.question, title: r.title, result: r.result, yea: r.yea, nay: r.nay, underReview: review.has(r.id) }));
  const events = federalEvents({ bill, rollCalls, actions, depth: depth ?? null, now });
  const voteOf = new Map<string, { chamber: Chamber; date: string }>();
  for (const rc of rollCalls) { const e = rollCallEvent(rc, bill); if (e?.voteId && e.chamber) voteOf.set(e.voteId, { chamber: e.chamber, date: e.date }); }
  return { bill, events, voteOf, unlisted: new Set() };
}

async function texasBill(db: Db, id: string): Promise<BillData | null> {
  const b = await db.select().from(txBills).where(eq(txBills.id, id)).get();
  if (!b) return null;
  const bill: BillRef = { key: b.id, level: "state", label: b.identifier, title: b.title, billType: "hb" };
  const [votes, actions] = await Promise.all([db.select().from(txVotes).where(eq(txVotes.billId, id)), db.select().from(txBillActions).where(eq(txBillActions.billId, id))]);
  const tv = votes.map(v => ({ id: v.id, motion: v.motion, date: v.date, result: v.result, chamber: v.chamber, counts: v.counts as Record<string, number> | null, tallyOk: v.tallyOk === 1 }));
  const events = texasEvents({ bill, votes: tv, actions: actions.map(a => ({ date: a.date, description: a.description, chamber: a.chamber, classification: a.classification as string[] | null })) });
  const voteOf = new Map<string, { chamber: Chamber; date: string }>();
  for (const v of tv) { const e = txVoteEvent(v, bill); if (e?.voteId && e.chamber) voteOf.set(e.voteId, { chamber: e.chamber, date: e.date }); }
  const listed = new Set<string>();
  for (const part of chunks([...voteOf.keys()])) for (const r of await db.selectDistinct({ id: txMemberVotes.voteId }).from(txMemberVotes).where(and(inArray(txMemberVotes.voteId, part), isNotNull(txMemberVotes.personId)))) listed.add(r.id);
  return { bill, events, voteOf, unlisted: new Set([...voteOf.keys()].filter(k => !listed.has(k))) };
}

/** How these members voted in every vote on the bill itself. */
async function memberVotes(db: Db, data: BillData, members: readonly Member[]): Promise<MemberVote[]> {
  const ids = members.map(m => m.id), voteIds = [...data.voteOf.keys()];
  if (!ids.length || !voteIds.length) return [];
  const out: MemberVote[] = [];
  for (const part of chunks(voteIds)) {
    const rows = data.bill.level === "federal"
      ? await db.select({ voteId: officialMemberVotes.rollCallId, memberId: officialMemberVotes.politicianId, position: officialMemberVotes.position }).from(officialMemberVotes)
        .where(and(inArray(officialMemberVotes.rollCallId, part), inArray(officialMemberVotes.politicianId, ids)))
      : (await db.select({ voteId: txMemberVotes.voteId, memberId: txMemberVotes.personId, position: txMemberVotes.option }).from(txMemberVotes)
        .where(and(inArray(txMemberVotes.voteId, part), inArray(txMemberVotes.personId, ids)))).flatMap(r => (r.memberId ? [{ ...r, memberId: r.memberId }] : []));
    for (const r of rows) { const v = data.voteOf.get(r.voteId); if (v) out.push({ ...r, ...v }); }
  }
  return out;
}

/** Bills with something on record in the last 14 days. Only these are looked at, so a run stays small. */
async function activeBills(db: Db, now: number): Promise<{ federal: Set<string>; texas: Set<string> }> {
  const from = now - (LOOP_WINDOW_DAYS + 1) * DAY, fromDay = day(from);
  const [rolls, actions, depth, tv, ta] = await Promise.all([
    db.selectDistinct({ id: officialRollCalls.billId }).from(officialRollCalls).where(and(isNotNull(officialRollCalls.billId), gte(officialRollCalls.votedAt, from))),
    db.selectDistinct({ id: officialBillActions.billId }).from(officialBillActions).where(and(gte(officialBillActions.actionDate, fromDay), inArray(officialBillActions.stage, ["passed_first", "failed", "law", "vetoed"]))),
    db.select({ id: officialBillDepth.billId }).from(officialBillDepth).where(and(gte(officialBillDepth.stageDate, fromDay), inArray(officialBillDepth.stage, ["law", "vetoed"]))),
    db.selectDistinct({ id: txVotes.billId }).from(txVotes).where(gte(txVotes.date, fromDay)),
    db.selectDistinct({ id: txBillActions.billId }).from(txBillActions).where(gte(txBillActions.date, fromDay)),
  ]);
  return { federal: new Set([...rolls, ...actions, ...depth].flatMap(r => (r.id ? [r.id] : []))), texas: new Set([...tv, ...ta].map(r => r.id)) };
}

/**
 * Writes the notices that are due and sends each reader's new ones: one push and, for a reader with a confirmed
 * email who has not switched bill emails off, one email, however many notices this run wrote for them.
 */
export async function runLoopNotices(db: Db, now = Date.now(), deps: LoopDeps = {}) {
  const out = { bills: 0, written: 0, readers: 0, pushed: 0, emailed: 0, emailFailed: 0, emailCapped: 0 };
  const active = await activeBills(db, now), keys = [...active.federal, ...active.texas];
  if (!keys.length) return out;
  // Who is waiting on which bill, and since when: the earlier of their answer and their follow.
  const waiting = new Map<string, Map<string, number>>();
  const wait = (billKey: string, userId: string, at: number) => { const m = waiting.get(billKey) ?? new Map<string, number>(); m.set(userId, Math.min(m.get(userId) ?? Infinity, at)); waiting.set(billKey, m); };
  for (const part of chunks(keys)) {
    for (const r of await db.select({ userId: voiceVotes.userId, billKey: voiceVotes.billKey, at: voiceVotes.createdAt }).from(voiceVotes).where(inArray(voiceVotes.billKey, part))) wait(r.billKey, r.userId, r.at);
    for (const r of await db.select({ userId: billFollows.userId, billKey: billFollows.billId, at: billFollows.createdAt }).from(billFollows).where(inArray(billFollows.billId, part))) wait(r.billKey, r.userId, r.at);
  }
  const places = new Map<string, Place | null>(), people = new Map<string, Member[]>(), fresh = new Map<string, Array<OutNotice & { id: string; billKey: string }>>();
  for (const [billKey, readers] of waiting) {
    const data = active.federal.has(billKey) ? await federalBill(db, billKey, now) : await texasBill(db, billKey);
    if (!data?.events.length) continue;
    out.bills++;
    const votesFor = new Map<string, MemberVote[]>(), totals = new Map<string, ScopeTotals | null>();
    for (const [userId, since] of readers) {
      const due = data.events.filter(e => shouldNotify(e, since, now));
      if (!due.length) continue;
      const have = new Set((await db.select({ ref: loopNotices.eventRef }).from(loopNotices).where(and(eq(loopNotices.userId, userId), eq(loopNotices.billKey, billKey)))).map(r => r.ref));
      const todo = due.filter(e => !have.has(e.ref));
      if (!todo.length) continue;
      if (!places.has(userId)) places.set(userId, await placeOf(db, userId));
      const place = places.get(userId) ?? null, placeKey = place ? `${place.state}|${place.congressional}|${place.stateUpper}|${place.stateLower}` : "";
      if (!people.has(placeKey)) people.set(placeKey, await ownLegislators(db, place));
      const mine = people.get(placeKey)!.filter(m => m.level === data.bill.level), who = mine.map(m => m.id).join(",");
      if (!votesFor.has(who)) votesFor.set(who, await memberVotes(db, data, mine));
      for (const [i, e] of todo.entries()) {
        const scope = districtScope(data.bill.level, place, e.chamber);
        if (scope && !totals.has(scope)) totals.set(scope, (await totalsForBill(db, billKey, [scope])).get(scope) ?? null);
        // A chamber that decided with no vote by name counts only once it has decided: not in a notice about something earlier.
        const unrecorded = new Map(data.events.filter(x => !x.voteId && x.chamber && x.date <= e.date).map(x => [x.chamber!, x.advanced === true] as const));
        const body = noticeBody(e.result, memberLines(mine, e, votesFor.get(who)!, { unrecorded, unlisted: data.unlisted }), districtLine(scope, scope ? totals.get(scope) : null, e.advanced));
        // Events are oldest first; a millisecond apart keeps that order, so the newest event heads the reader's list.
        const id = crypto.randomUUID(), path = billPath(data.bill);
        const made = await db.insert(loopNotices).values({ id, userId, billKey, event: e.event, eventRef: e.ref, title: e.title.slice(0, 200), body, url: path, createdAt: now + i }).onConflictDoNothing().returning({ id: loopNotices.id });
        if (!made.length) continue; // another run wrote it first
        out.written++;
        fresh.set(userId, [...(fresh.get(userId) ?? []), { id, billKey, title: e.title, body, path, answer: null }]);
      }
    }
  }
  // Sending: only what this run wrote.
  const site = deps.site ?? "", cap = deps.emailCap ?? LOOP_EMAIL_CAP;
  for (const [userId, notices] of fresh) {
    out.readers++;
    const pref = await db.select({ on: alertPrefs.instantBills }).from(alertPrefs).where(eq(alertPrefs.userId, userId)).get();
    if (pref && !pref.on) continue; // bill alerts switched off: the notices are still listed on the site
    const ids = notices.map(n => n.id);
    if (deps.notify) {
      const p = noticePush(notices);
      const sent = await deps.notify(userId, { title: p.title, body: p.body, url: `/n/${PUSH_ARRIVAL}?to=${encodeURIComponent(p.path)}` }).catch(() => ({ pushed: 0 }));
      if (sent.pushed > 0) { out.pushed += notices.length; await db.update(loopNotices).set({ pushedAt: now }).where(inArray(loopNotices.id, ids)); }
    }
    const account = deps.send ? await db.select().from(readerAccounts).where(eq(readerAccounts.appUserId, userId)).get() : null;
    if (!deps.send || !account?.verifiedAt) continue;
    if (out.emailed + out.emailFailed >= cap) { out.emailCapped++; continue; }
    const answers = await answersFor(db, userId, notices.map(n => n.billKey));
    // Each link carries its own one-time mark, made here and kept nowhere.
    const mail = noticeEmail(notices.map(n => ({ ...n, answer: answers.get(n.billKey) ?? null })), { site, brand: BRAND.name, link: path => returnLink(site, mintToken("loop_return", deps.secret ?? ""), path) });
    const r = await deps.send(account.email, mail.subject, mail.text).catch(() => ({ ok: false }));
    if (r.ok) { out.emailed++; await db.update(loopNotices).set({ emailedAt: now }).where(inArray(loopNotices.id, ids)); } else out.emailFailed++;
  }
  return out;
}

/** The reader's own answer line for each bill ("You said Support." or "You follow this bill."). Read for that reader only. */
async function answersFor(db: Db, userId: string, billKeys: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>(), keys = [...new Set(billKeys)];
  if (!keys.length) return out;
  const [answers, follows] = await Promise.all([db.select({ billKey: voiceVotes.billKey, answer: voiceVotes.answer }).from(voiceVotes).where(and(eq(voiceVotes.userId, userId), inArray(voiceVotes.billKey, keys))),
    db.select({ billKey: billFollows.billId }).from(billFollows).where(and(eq(billFollows.userId, userId), inArray(billFollows.billId, keys)))]);
  for (const k of keys) { const line = answerLine(answers.find(a => a.billKey === k)?.answer, follows.some(f => f.billKey === k)); if (line) out.set(k, line); }
  return out;
}

/* ───────────────────────────── On the site ───────────────────────────── */

export type NoticeView = { id: string; title: string; /** The result, each legislator's vote, the district line. */ lines: string[]; /** "You said Support." Read now, for this reader only. */ answer: string | null;
  url: string; createdAt: number; isNew: boolean };
export const NOTICES_SHOWN = 3;
export const NOTICES_PAGE = 30;

/**
 * A reader's notices, newest first, never more than `limit`. `more` is how many older ones are not in the list, so
 * the screen can say so and stop. With `recentOnly`, the home screen's short list: only notices not yet seen, or
 * from the last 14 days.
 */
export async function listNotices(db: Db, userId: string, o: { limit?: number; recentOnly?: boolean; now?: number } = {}): Promise<{ items: NoticeView[]; total: number; more: number }> {
  const limit = Math.max(1, Math.min(o.limit ?? NOTICES_SHOWN, NOTICES_PAGE)), now = o.now ?? Date.now();
  const where = o.recentOnly ? and(eq(loopNotices.userId, userId), sql`(${loopNotices.seenAt} is null or ${loopNotices.createdAt} >= ${now - LOOP_WINDOW_DAYS * DAY})`) : eq(loopNotices.userId, userId);
  const [rows, count] = await Promise.all([db.select().from(loopNotices).where(where).orderBy(desc(loopNotices.createdAt), desc(loopNotices.id)).limit(limit),
    db.select({ n: sql<number>`count(*)` }).from(loopNotices).where(eq(loopNotices.userId, userId)).get()]);
  const answers = await answersFor(db, userId, rows.map(r => r.billKey));
  const total = Number(count?.n ?? 0);
  return { items: rows.map(r => ({ id: r.id, title: r.title, lines: r.body.split("\n"), answer: answers.get(r.billKey) ?? null, url: r.url, createdAt: r.createdAt, isNew: r.seenAt === null })), total, more: Math.max(0, total - rows.length) };
}

/** Notes that these notices have been shown to the reader on the site, so they are marked "New" once. */
export async function markNoticesSeen(db: Db, userId: string, ids: readonly string[], now = Date.now()) {
  for (const part of chunks(ids)) await db.update(loopNotices).set({ seenAt: now }).where(and(eq(loopNotices.userId, userId), inArray(loopNotices.id, part), isNull(loopNotices.seenAt)));
}
