/**
 * The weekly email (owner's point 3, 18 Nov 2026): what goes into one reader's email, and the Monday send.
 * The words and the order are lib/digest-format.ts. Database handle first, no request and no secret (the caller
 * passes the mailer, the site address, the secret for the open mark and the unsubscribe link), so tests/loop.test.mjs
 * runs these same functions against a temporary database built from the migrations.
 */
import { and, asc, eq, gte, inArray, isNotNull, lt, lte } from "drizzle-orm";
import { billCategories, billFollows, digestSends, issueCategories, officialBillDepth, officialBills, officialFloorSchedule, officialMemberVotes, officialRollCalls, officialTallyChecks,
  readerAccounts, readerIssues, txBills, txEvents, txMemberVotes, txVotes, voiceVotes } from "../../db/schema.ts";
import { formatDigest, isoWeek, type WeeklyComing, type WeeklyInput, type WeeklyMoved, type WeeklyVote } from "../digest-format.ts";
import { weekOf } from "../federal/depth-parse.ts";
import { clip, longDate } from "../flow/votes.ts";
import type { Db } from "../verify/residence-store.ts";
import { mintToken } from "./marks.ts";
import { everyoneFor, type Member } from "./people.ts";
import { billPhrase, chamberName, did, fedBillLabel, pickMoved, rollCallEvent, stageSentence, txVoteEvent } from "./rules.ts";

const WEEK_MS = 7 * 86400e3;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const chunks = <T>(a: readonly T[], n = 90) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type WeeklyDeps = {
  site: string;
  /** The Analysis headline of each bill a reader may see a summary for (lib/analysis/publish-gate.ts decides). None: official titles only. */
  headlines?: (billIds: string[]) => Promise<Map<string, string>>;
};
type Sorted = WeeklyVote & { date: string; at: number; billId: string };

/** (a) Votes on a bill itself, since `since`, in which one of these members is listed. One entry per vote, newest first. */
async function votesThisWeek(db: Db, members: readonly Member[], since: number, now: number, site: string): Promise<Sorted[]> {
  const out: Sorted[] = [], line = (m: Member, position: string) => `${m.short} ${did(position)}.`;
  const fedIds = members.filter(m => m.level === "federal").map(m => m.id), txIds = members.filter(m => m.level === "state").map(m => m.id);
  if (fedIds.length) {
    const rows = (await Promise.all(chunks(fedIds).map(ids => db.select({ memberId: officialMemberVotes.politicianId, position: officialMemberVotes.position, rc: officialRollCalls,
      billTitle: officialBills.title, billType: officialBills.billType, number: officialBills.number })
      .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId)).innerJoin(officialBills, eq(officialBills.id, officialRollCalls.billId))
      .where(and(inArray(officialMemberVotes.politicianId, ids), gte(officialRollCalls.votedAt, since), lte(officialRollCalls.votedAt, now)))))).flat();
    const review = new Set<string>(), rollIds = [...new Set(rows.map(r => r.rc.id))];
    for (const part of chunks(rollIds)) for (const r of await db.select({ id: officialTallyChecks.rollCallId }).from(officialTallyChecks).where(and(inArray(officialTallyChecks.rollCallId, part), eq(officialTallyChecks.ok, 0)))) review.add(r.id);
    for (const id of rollIds) {
      const mine = rows.filter(r => r.rc.id === id), { rc, billTitle, billType, number } = mine[0];
      const e = rollCallEvent({ ...rc, underReview: review.has(id) }, { label: fedBillLabel(billType, number), title: billTitle, billType });
      if (!e) continue; // a procedural step or an amendment
      out.push({ result: e.result, members: members.flatMap(m => { const v = mine.find(r => r.memberId === m.id); return v ? [line(m, v.position)] : []; }),
        billUrl: `${site}/bills/${rc.billId}`, sourceUrl: rc.sourceUrl, date: e.date, at: rc.votedAt, billId: rc.billId! });
    }
  }
  if (txIds.length) {
    // Texas gives the day of a vote, not the time. The email covers the days up to yesterday, so a vote is listed once: a Monday vote is in next Monday's email.
    const rows = (await Promise.all(chunks(txIds).map(ids => db.select({ memberId: txMemberVotes.personId, option: txMemberVotes.option, v: txVotes, identifier: txBills.identifier, title: txBills.title, tloUrl: txBills.tloUrl })
      .from(txMemberVotes).innerJoin(txVotes, eq(txVotes.id, txMemberVotes.voteId)).innerJoin(txBills, eq(txBills.id, txVotes.billId))
      .where(and(inArray(txMemberVotes.personId, ids), gte(txVotes.date, day(since)), lt(txVotes.date, day(now))))))).flat();
    for (const id of [...new Set(rows.map(r => r.v.id))]) {
      const mine = rows.filter(r => r.v.id === id), { v, identifier, title, tloUrl } = mine[0];
      const e = txVoteEvent({ id: v.id, motion: v.motion, date: v.date, result: v.result, chamber: v.chamber, counts: v.counts as Record<string, number> | null, tallyOk: v.tallyOk === 1 }, { label: identifier, title, billType: "hb" });
      if (!e) continue;
      out.push({ result: e.result, members: members.flatMap(m => { const mv = mine.find(r => r.memberId === m.id); return mv ? [line(m, mv.option)] : []; }),
        billUrl: `${site}/texas/bills/${v.billId}`, sourceUrl: tloUrl, date: e.date, at: Date.parse(e.date) || 0, billId: v.billId });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
}

/** (b) One bill in the reader's issues whose stage changed since `since`: the one that went furthest. Bills in Congress only (Texas bills are not sorted into the 14 issues). */
async function movedThisWeek(db: Db, issues: readonly string[], since: number, now: number, site: string, skip: ReadonlySet<string>): Promise<(WeeklyMoved & { billId: string }) | null> {
  if (!issues.length) return null;
  const rows = await db.select({ billId: officialBills.id, title: officialBills.title, billType: officialBills.billType, number: officialBills.number, stage: officialBillDepth.stage, stageDate: officialBillDepth.stageDate,
    issue: issueCategories.name }).from(billCategories).innerJoin(officialBillDepth, eq(officialBillDepth.billId, billCategories.billId)).innerJoin(officialBills, eq(officialBills.id, billCategories.billId))
    .innerJoin(issueCategories, eq(issueCategories.slug, billCategories.categorySlug))
    .where(and(inArray(billCategories.categorySlug, [...issues]), isNotNull(officialBillDepth.stage), gte(officialBillDepth.stageDate, day(since)), lte(officialBillDepth.stageDate, day(now + 86400e3)))).limit(400);
  const best = pickMoved(rows.flatMap(r => (r.stage && r.stageDate && !skip.has(r.billId) ? [{ ...r, stage: r.stage, stageDate: r.stageDate }] : [])));
  if (!best) return null;
  const label = fedBillLabel(best.billType, best.number);
  return { issue: best.issue, bill: billPhrase({ label, title: best.title, billType: best.billType }), what: stageSentence(best.stage, best.stageDate)!, billUrl: `${site}/bills/${best.billId}`, billId: best.billId };
}

/**
 * (c) One thing on the schedule: a bill on the House or Senate floor schedule for this week or a later one, from
 * the earliest week listed. A bill the reader answered or follows comes first, then one in their issues, then the
 * first on the list. With nothing scheduled, a reader in Texas gets the next Texas hearing.
 */
async function comingUp(db: Db, userId: string, issues: readonly string[], state: string | null, now: number, site: string): Promise<(WeeklyComing & { billId: string | null }) | null> {
  const floor = await db.select({ chamber: officialFloorSchedule.chamber, weekOf: officialFloorSchedule.weekOf, label: officialFloorSchedule.label, description: officialFloorSchedule.description,
    billId: officialBills.id, title: officialBills.title, billType: officialBills.billType, number: officialBills.number })
    .from(officialFloorSchedule).leftJoin(officialBills, eq(officialBills.id, officialFloorSchedule.billId)).where(gte(officialFloorSchedule.weekOf, weekOf(now)))
    .orderBy(asc(officialFloorSchedule.weekOf), asc(officialFloorSchedule.chamber), asc(officialFloorSchedule.label)).limit(120);
  const first = floor.filter(f => f.weekOf === floor[0]?.weekOf);
  if (first.length) {
    const ids = first.flatMap(f => (f.billId ? [f.billId] : []));
    const [answered, followed, inIssue] = ids.length ? await Promise.all([
      db.select({ id: voiceVotes.billKey }).from(voiceVotes).where(and(eq(voiceVotes.userId, userId), inArray(voiceVotes.billKey, ids))),
      db.select({ id: billFollows.billId }).from(billFollows).where(and(eq(billFollows.userId, userId), inArray(billFollows.billId, ids))),
      issues.length ? db.select({ id: billCategories.billId }).from(billCategories).where(and(inArray(billCategories.billId, ids), inArray(billCategories.categorySlug, [...issues]))) : Promise.resolve([]),
    ]) : [[], [], []];
    const mine = new Set([...answered, ...followed].map(r => r.id)), issue = new Set(inIssue.map(r => r.id));
    const rank = (f: typeof first[number]) => (f.billId && mine.has(f.billId) ? 2 : f.billId && issue.has(f.billId) ? 1 : 0);
    const pick = [...first].sort((a, b) => rank(b) - rank(a))[0], w = pick.weekOf;
    const week = longDate(`${w.slice(0, 4)}-${w.slice(4, 6)}-${w.slice(6, 8)}`);
    const bill = pick.billId && pick.title !== null && pick.billType && pick.number !== null ? billPhrase({ label: fedBillLabel(pick.billType, pick.number), title: pick.title, billType: pick.billType })
      : pick.description ? `${pick.label} (${clip(pick.description, 80)})` : pick.label;
    return { text: `${cap(chamberName(pick.chamber === "senate" ? "senate" : "house"))} plans to take up ${bill} in the week of ${week}.`, url: pick.billId ? `${site}/bills/${pick.billId}` : `${site}/coming`, billId: pick.billId };
  }
  if (state !== "TX") return null;
  const hearing = await db.select().from(txEvents).where(gte(txEvents.start, day(now))).orderBy(asc(txEvents.start)).limit(1).get();
  return hearing ? { text: `A Texas legislative hearing is set for ${longDate(hearing.start)}: ${clip(hearing.name, 100)}.`, url: `${site}/texas`, billId: null } : null;
}

/** Everything one reader's email is built from. `nobody`: the reader has no place, no follows and no issues, so there is nothing that is theirs to report. */
export async function weeklyInput(db: Db, userId: string, since: number, now: number, deps: WeeklyDeps): Promise<WeeklyInput & { nobody: boolean }> {
  const [{ place, members }, issues] = await Promise.all([everyoneFor(db, userId), db.select({ slug: readerIssues.slug }).from(readerIssues).where(eq(readerIssues.userId, userId)).then(r => r.map(x => x.slug))]);
  if (!members.length && !issues.length) return { votes: [], moved: null, coming: null, hasIssues: false, nobody: true };
  const votes = await votesThisWeek(db, members, since, now, deps.site);
  const [moved, coming] = await Promise.all([movedThisWeek(db, issues, since, now, deps.site, new Set(votes.map(v => v.billId))), comingUp(db, userId, issues, place?.state ?? null, now, deps.site)]);
  const headlines = deps.headlines ? await deps.headlines([...new Set([...votes.map(v => v.billId), ...(moved ? [moved.billId] : [])])]).catch(() => new Map<string, string>()) : new Map<string, string>();
  return { votes: votes.map(v => ({ result: v.result, members: v.members, billUrl: v.billUrl, sourceUrl: v.sourceUrl, headline: headlines.get(v.billId) ?? null })),
    moved: moved ? { issue: moved.issue, bill: moved.bill, what: moved.what, billUrl: moved.billUrl, headline: headlines.get(moved.billId) ?? null } : null,
    coming: coming ? { text: coming.text, url: coming.url } : null, hasIssues: issues.length > 0, nobody: false };
}

export type SendDeps = WeeklyDeps & {
  /** The existing sendTo (lib/mailer.ts), with the HTML body beside the text. */
  send: (to: string, subject: string, text: string, html: string) => Promise<{ ok: true } | { ok: false; error: string; domainNeeded?: boolean }>;
  /** Signs the open mark (lib/loop/marks.ts). */
  secret: string;
  /** The one-tap unsubscribe link for an account. */
  unsubscribe: (accountId: string) => Promise<string>;
};

/**
 * Monday's email: one per week to every reader with a confirmed email address who has not opted out, when they
 * have a place, follow someone or picked an issue, and something happened. A week with nothing sends nothing and
 * writes no row. The unique (account, week) row in digest_sends is what makes it once a week.
 */
export async function runWeekly(db: Db, now: number, deps: SendDeps) {
  const week = isoWeek(now);
  const accounts = await db.select().from(readerAccounts).where(and(isNotNull(readerAccounts.verifiedAt), eq(readerAccounts.digestOptIn, 1)));
  const out = { accounts: accounts.length, sent: 0, empty: 0, failed: 0, domainNeeded: false };
  for (const a of accounts) {
    if (await db.select({ id: digestSends.id }).from(digestSends).where(and(eq(digestSends.accountId, a.id), eq(digestSends.week, week))).get()) continue;
    const since = Math.max(a.lastDigestAt ?? 0, now - WEEK_MS);
    const input = await weeklyInput(db, a.appUserId, since, now, deps);
    // The mark in the picture's address is made here, for this one email, and kept nowhere: not with the account and not in the send log.
    const mail = input.nobody ? null : formatDigest(input, { site: deps.site, unsubscribe: await deps.unsubscribe(a.id), pixel: `${deps.site}/o/${mintToken("weekly_open", deps.secret, week)}.gif` });
    if (!mail) { out.empty++; continue; }
    const sent = await deps.send(a.email, mail.subject, mail.text, mail.html);
    await db.insert(digestSends).values({ id: crypto.randomUUID(), accountId: a.id, week, sentAt: now, items: mail.items, ok: sent.ok ? 1 : 0, error: sent.ok ? null : sent.error }).onConflictDoNothing();
    if (sent.ok) { out.sent++; await db.update(readerAccounts).set({ lastDigestAt: now }).where(eq(readerAccounts.id, a.id)); }
    else { out.failed++; if (sent.domainNeeded) out.domainNeeded = true; }
  }
  return out;
}
