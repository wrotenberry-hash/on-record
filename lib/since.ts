import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { billFollows, officialBillDepth, officialBills, officialMemberVotes, officialPoliticians, officialRollCalls, txBills, userFollows } from "@/db/schema";
import { STAGE_LABEL, type StageKey } from "@/lib/federal/depth-parse";

/** What changed since a time: votes by the reader's members, followed bills that moved, Texas bills that moved. Official data. */
export async function sinceItems(since: number, userId: string | null, memberIds: string[], state: string | null) {
  const db = getDb(), sinceDate = new Date(since).toISOString().slice(0, 10);
  const follows = userId ? (await db.select({ id: userFollows.politicianId }).from(userFollows).where(eq(userFollows.userId, userId))).map(r => r.id) : [];
  const members = [...new Set([...memberIds, ...follows])];
  const [votes, bills, tx] = await Promise.all([
    members.length ? db.select({ rollCallId: officialRollCalls.id, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question, title: officialRollCalls.title, billId: officialRollCalls.billId,
      billTitle: officialBills.title, name: officialPoliticians.fullName, memberId: officialPoliticians.id, position: officialMemberVotes.position })
      .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId)).innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId))
      .leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId)).where(and(inArray(officialMemberVotes.politicianId, members), gte(officialRollCalls.votedAt, since)))
      .orderBy(desc(officialRollCalls.votedAt)).limit(30) : Promise.resolve([]),
    userId ? db.select({ id: officialBills.id, title: officialBills.title, stage: officialBillDepth.stage, stageDate: officialBillDepth.stageDate }).from(billFollows)
      .innerJoin(officialBills, eq(officialBills.id, billFollows.billId)).innerJoin(officialBillDepth, eq(officialBillDepth.billId, billFollows.billId))
      .where(and(eq(billFollows.userId, userId), gte(officialBillDepth.stageDate, sinceDate))).limit(20) : Promise.resolve([]),
    state === "TX" ? db.select({ n: sql<number>`count(*)` }).from(txBills).where(gte(txBills.latestActionDate, sinceDate)).get() : Promise.resolve(null),
  ]);
  return { votes, bills: bills.map(b => ({ ...b, stageLabel: STAGE_LABEL[b.stage as StageKey] ?? b.stage })), texasMoved: Number(tx?.n ?? 0) };
}
