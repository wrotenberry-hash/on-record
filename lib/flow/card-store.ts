/**
 * The database side of the first screen and the home screen's lists (lib/flow/cards.ts holds the words). Every function
 * takes the database handle and reads no request and no secret, so tests/first-screen.test.mjs runs these same
 * functions against a temporary database built from the real migrations.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { billFollows, officialBillDepth, officialBills, officialMemberVotes, officialPoliticians, officialRollCalls, txBills, txMemberVotes, txPeople, txVotes, userFollows } from "../../db/schema.ts";
import type { Db } from "../verify/residence-store.ts";
import type { FedVoteRow, TxVoteRow } from "./cards.ts";

/** How many of a member's latest recorded votes are read to find the meaningful ones. */
export const FED_ROWS = 300, TX_ROWS = 120;

/** A member of Congress's recorded votes on bills since `since`, newest first. Procedural votes are still in here; cards.ts filters. */
export async function fedVoteRows(db: Db, politicianId: string, since: number, limit = FED_ROWS): Promise<FedVoteRow[]> {
  return db.select({ rollCallId: officialRollCalls.id, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question, title: officialRollCalls.title,
    result: officialRollCalls.result, yea: officialRollCalls.yea, nay: officialRollCalls.nay, chamber: officialRollCalls.chamber, billId: officialBills.id, billTitle: officialBills.title,
    billType: officialBills.billType, number: officialBills.number, position: officialMemberVotes.position })
    .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId)).innerJoin(officialBills, eq(officialBills.id, officialRollCalls.billId))
    .where(and(eq(officialMemberVotes.politicianId, politicianId), gte(officialRollCalls.votedAt, since))).orderBy(desc(officialRollCalls.votedAt), desc(officialRollCalls.id)).limit(limit);
}

/** A Texas legislator's votes in record votes since `sinceDay` ("2026-01-31"), newest first. */
export async function txVoteRows(db: Db, personId: string, sinceDay: string, limit = TX_ROWS): Promise<TxVoteRow[]> {
  return db.select({ motion: txVotes.motion, date: txVotes.date, result: txVotes.result, counts: txVotes.counts, tallyOk: txVotes.tallyOk, option: txMemberVotes.option,
    billId: txBills.id, identifier: txBills.identifier, title: txBills.title })
    .from(txMemberVotes).innerJoin(txVotes, eq(txVotes.id, txMemberVotes.voteId)).innerJoin(txBills, eq(txBills.id, txVotes.billId))
    .where(and(eq(txMemberVotes.personId, personId), gte(txVotes.date, sinceDay))).orderBy(desc(txVotes.date), desc(txVotes.id)).limit(limit);
}

/* ------------------------------------------------------- the home screen's lists --- */

/** The members a reader follows, by id. Federal ids are Biographical Directory ids; Texas ids are the tx_people ids. */
export async function followedMemberIds(db: Db, userId: string | null): Promise<string[]> {
  if (!userId) return [];
  return (await db.select({ id: userFollows.politicianId }).from(userFollows).where(eq(userFollows.userId, userId))).map(r => r.id);
}

export type HomeVote = { key: string; votedAt: number; question: string; title: string | null; billId: string | null; billTitle: string | null; billType: string | null; number: number | null;
  name: string; memberId: string; position: string };

/**
 * Recorded votes by these members of Congress since a time, newest first: at most `cap` rows, and the true number
 * there are, so a capped list can say how many more exist. Official data.
 */
export async function memberVotesSince(db: Db, memberIds: readonly string[], since: number, cap: number): Promise<{ rows: HomeVote[]; total: number }> {
  const ids = [...new Set(memberIds)];
  if (!ids.length) return { rows: [], total: 0 };
  const where = and(inArray(officialMemberVotes.politicianId, ids), gte(officialRollCalls.votedAt, since));
  const [rows, count] = await Promise.all([
    db.select({ rollCallId: officialRollCalls.id, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question, title: officialRollCalls.title, billId: officialRollCalls.billId,
      billTitle: officialBills.title, billType: officialBills.billType, number: officialBills.number, name: officialPoliticians.fullName, memberId: officialPoliticians.id, position: officialMemberVotes.position })
      .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId)).innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId))
      .leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId)).where(where).orderBy(desc(officialRollCalls.votedAt), desc(officialRollCalls.id)).limit(cap),
    db.select({ n: sql<number>`count(*)` }).from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId))
      .innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId)).where(where).get(),
  ]);
  return { rows: rows.map(({ rollCallId, ...r }) => ({ ...r, key: `${rollCallId}-${r.memberId}` })), total: Number(count?.n ?? 0) };
}

export type MovedBill = { id: string; title: string; stage: string; stageDate: string | null };

/** The bills a reader follows whose stage changed on or after a day: at most `cap`, and the true number. */
export async function followedBillsMovedSince(db: Db, userId: string | null, sinceDay: string, cap: number): Promise<{ rows: MovedBill[]; total: number }> {
  if (!userId) return { rows: [], total: 0 };
  const where = and(eq(billFollows.userId, userId), gte(officialBillDepth.stageDate, sinceDay));
  const [rows, count] = await Promise.all([
    db.select({ id: officialBills.id, title: officialBills.title, stage: officialBillDepth.stage, stageDate: officialBillDepth.stageDate }).from(billFollows)
      .innerJoin(officialBills, eq(officialBills.id, billFollows.billId)).innerJoin(officialBillDepth, eq(officialBillDepth.billId, billFollows.billId))
      .where(where).orderBy(desc(officialBillDepth.stageDate), officialBills.id).limit(cap),
    db.select({ n: sql<number>`count(*)` }).from(billFollows).innerJoin(officialBills, eq(officialBills.id, billFollows.billId))
      .innerJoin(officialBillDepth, eq(officialBillDepth.billId, billFollows.billId)).where(where).get(),
  ]);
  return { rows: rows.map(r => ({ ...r, stage: String(r.stage ?? "") })), total: Number(count?.n ?? 0) };
}

/** How many Texas bills had an action on or after a day. A count only. */
export async function texasBillsMovedSince(db: Db, sinceDay: string): Promise<number> {
  return Number((await db.select({ n: sql<number>`count(*)` }).from(txBills).where(gte(txBills.latestActionDate, sinceDay)).get())?.n ?? 0);
}

/** The Texas legislators among these ids, for the Following page (a follow of a Texas member is kept under the tx_people id). */
export async function texasMembersByIds(db: Db, ids: readonly string[]) {
  const list = [...new Set(ids)].filter(id => !/^[A-Z]\d{6}$/.test(id));
  if (!list.length) return [];
  return db.select({ id: txPeople.id, name: txPeople.name, party: txPeople.party, chamber: txPeople.chamber, district: txPeople.district }).from(txPeople).where(inArray(txPeople.id, list)).orderBy(txPeople.name);
}
