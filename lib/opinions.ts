import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { billCategories, officialMemberVotes, officialRollCalls, opinionUserVotes } from "@/db/schema";
import { voteKind } from "@/lib/federal/vote-kinds";
import { agreementByIssue, type Stance } from "@/lib/agreement";

/** OPINION content: the reader's own views. Read only for that reader; never aggregated or shown to others. */
export async function stanceFor(userId: string | null, billId: string): Promise<Stance | null> {
  if (!userId) return null;
  return ((await getDb().select({ s: opinionUserVotes.stance }).from(opinionUserVotes).where(and(eq(opinionUserVotes.userId, userId), eq(opinionUserVotes.billId, billId))).get())?.s ?? null) as Stance | null;
}

export async function setStance(userId: string, billId: string, stance: Stance | null) {
  const db = getDb();
  if (!stance) return db.delete(opinionUserVotes).where(and(eq(opinionUserVotes.userId, userId), eq(opinionUserVotes.billId, billId)));
  return db.insert(opinionUserVotes).values({ userId, billId, stance, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: [opinionUserVotes.userId, opinionUserVotes.billId], set: { stance, updatedAt: Date.now() } });
}

export async function stancesOf(userId: string): Promise<Map<string, Stance>> {
  const rows = await getDb().select().from(opinionUserVotes).where(eq(opinionUserVotes.userId, userId));
  return new Map(rows.map(r => [r.billId, r.stance as Stance]));
}

/** The reader's agreement with one member, per issue, from the reader's own answers and the member's passage votes. */
export async function agreementWith(userId: string, politicianId: string) {
  const stances = await stancesOf(userId);
  if (!stances.size) return { rows: [], answered: 0 };
  const db = getDb(), billIds = [...stances.keys()];
  const [votes, cats] = await Promise.all([
    db.select({ billId: officialRollCalls.billId, question: officialRollCalls.question, title: officialRollCalls.title, position: officialMemberVotes.position, votedAt: officialRollCalls.votedAt, rollCallId: officialRollCalls.id, sourceUrl: officialRollCalls.sourceUrl })
      .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId))
      .where(and(eq(officialMemberVotes.politicianId, politicianId), inArray(officialRollCalls.billId, billIds))),
    db.select().from(billCategories).where(inArray(billCategories.billId, billIds)),
  ]);
  const issues = new Map<string, string[]>();
  for (const c of cats) issues.set(c.billId, [...(issues.get(c.billId) ?? []), c.categorySlug]);
  const memberVotes = votes.filter(v => v.billId).map(v => ({ billId: v.billId!, position: v.position, kind: voteKind(v.question, v.title), votedAt: v.votedAt, rollCallId: v.rollCallId, sourceUrl: v.sourceUrl }));
  return { rows: agreementByIssue(stances, memberVotes, id => issues.get(id) ?? []), answered: stances.size, votes: memberVotes };
}
