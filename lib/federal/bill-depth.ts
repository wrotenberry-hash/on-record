import { READER_S } from "@/lib/analysis/publish-gate";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { billCategories, officialAmendments, officialBillActions, officialBillDepth, officialBills, officialFloorSchedule, officialMemberVotes,
  officialPoliticians, officialRollCalls } from "@/db/schema";
import { amendmentLine, lifecycle, weekOf, type BillAction } from "@/lib/federal/depth-parse";

/** Round B reads over the Round A tables. Official data only. */

/**
 * The bill's timeline. Floor votes (motion to proceed, cloture, discharge, failed passage, veto override) are
 * steps of their own, from the actions and from the roll calls on file, so a bill the Senate refused to take up
 * shows that even before its actions are read.
 */
export async function billTimeline(billId: string, introducedAt: string | null) {
  const db = getDb();
  const [rows, rolls] = await Promise.all([
    db.select().from(officialBillActions).where(eq(officialBillActions.billId, billId)).orderBy(asc(officialBillActions.seq)),
    db.select({ id: officialRollCalls.id, chamber: officialRollCalls.chamber, rollNumber: officialRollCalls.rollNumber, votedAt: officialRollCalls.votedAt,
      question: officialRollCalls.question, title: officialRollCalls.title, result: officialRollCalls.result, yea: officialRollCalls.yea, nay: officialRollCalls.nay })
      .from(officialRollCalls).where(eq(officialRollCalls.billId, billId))]);
  const actions: BillAction[] = rows.map(r => ({ seq: r.seq, actionDate: r.actionDate, text: r.text, type: r.type, actionCode: r.actionCode,
    chamber: (r.chamber as "house" | "senate" | null), committees: (r.committees as string[] | null) ?? [], rollCalls: [] }));
  const life = lifecycle(actions, introducedAt, rolls);
  if (!rows.length && !life.steps.some(st => "floor" in st)) return null;
  return { ...life, sourceUrl: rows[0]?.sourceUrl ?? null, retrievedAt: rows[0]?.retrievedAt ?? null, actions: actions.slice(-8).reverse() };
}

export async function billAmendments(billId: string) {
  const rows = await getDb().select().from(officialAmendments).where(eq(officialAmendments.billId, billId)).orderBy(desc(officialAmendments.latestActionDate)).limit(30);
  return rows.map(r => ({ ...r, line: amendmentLine({ purpose: r.purpose, description: r.description, chamber: r.chamber as "house" | "senate", number: r.number }) }));
}

/** For each roll call: Yea, Nay, Present and Not Voting by party (D, R, I and others), from the member votes on file. */
export async function rollCallParties(rollCallIds: string[]) {
  if (!rollCallIds.length) return new Map<string, Record<string, Record<string, number>>>();
  const rows = await getDb().select({ id: officialMemberVotes.rollCallId, position: officialMemberVotes.position, party: officialPoliticians.party, n: sql<number>`count(*)` })
    .from(officialMemberVotes).innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId))
    .where(inArray(officialMemberVotes.rollCallId, rollCallIds)).groupBy(officialMemberVotes.rollCallId, officialMemberVotes.position, officialPoliticians.party);
  const out = new Map<string, Record<string, Record<string, number>>>();
  for (const r of rows) {
    const party = partyCode(r.party);
    const e = out.get(r.id) ?? {};
    (e[r.position] ??= {})[party] = ((e[r.position] ?? {})[party] ?? 0) + Number(r.n);
    out.set(r.id, e);
  }
  return out;
}
export function partyCode(p: string) { const x = p.toLowerCase(); return x.startsWith("dem") ? "D" : x.startsWith("rep") ? "R" : x.startsWith("ind") ? "I" : "Other"; }

export async function floorThisWeek(billId: string, now = Date.now()) {
  return getDb().select().from(officialFloorSchedule).where(and(eq(officialFloorSchedule.billId, billId), gte(officialFloorSchedule.weekOf, weekOf(now))));
}

/**
 * "Moving this week": bills with an action in the last 7 days or on a floor schedule this week, newest first,
 * optionally for one of the 14 issues.
 */
export async function movingThisWeek(issue: string | null, now = Date.now(), limit = 60) {
  const db = getDb(), since = new Date(now - 7 * 86400e3).toISOString().slice(0, 10), week = weekOf(now);
  const acted = db.select({ billId: officialBillActions.billId }).from(officialBillActions).where(gte(officialBillActions.actionDate, since));
  const scheduled = db.select({ billId: sql<string>`${officialFloorSchedule.billId}` }).from(officialFloorSchedule).where(and(gte(officialFloorSchedule.weekOf, week), sql`${officialFloorSchedule.billId} is not null`));
  const rows = await db.select({ id: officialBills.id, billType: officialBills.billType, number: officialBills.number, title: officialBills.title,
    latestActionText: officialBills.latestActionText, latestActionAt: officialBills.latestActionAt, stage: officialBillDepth.stage,
    headline: sql<string | null>`(select s.headline from analysis_bill_summaries s where s.bill_id = ${officialBills.id} and ${READER_S} order by s.created_at desc limit 1)`,
    onFloor: sql<string | null>`(select group_concat(distinct f.chamber) from official_floor_schedule f where f.bill_id = ${officialBills.id} and f.week_of >= ${week})`,
    issues: sql<string | null>`(select group_concat(bc.category_slug) from bill_categories bc where bc.bill_id = ${officialBills.id})` })
    .from(officialBills).leftJoin(officialBillDepth, eq(officialBillDepth.billId, officialBills.id))
    .where(and(sql`(${officialBills.id} in ${acted} or ${officialBills.id} in ${scheduled} or ${officialBills.latestActionAt} >= ${since})`,
      ...(issue ? [sql`exists (select 1 from ${billCategories} bc where bc.bill_id = ${officialBills.id} and bc.category_slug = ${issue})`] : [])))
    .orderBy(desc(officialBills.latestActionAt)).limit(limit);
  return rows;
}

/** Roll calls for a bill with their totals, newest first (used by the chamber vote summary). */
export async function billRollCalls(billId: string) {
  return getDb().select().from(officialRollCalls).where(eq(officialRollCalls.billId, billId)).orderBy(desc(officialRollCalls.votedAt));
}
