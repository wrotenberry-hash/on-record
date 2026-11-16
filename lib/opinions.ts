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

/* Round J (master plan): Support / Oppose / Unsure with history. Unsure is private and never counted. */
export type Answer = Stance | "unsure";
export async function answerFor(userId: string | null, billId: string): Promise<Answer | null> {
  if (!userId) return null;
  const s = await stanceFor(userId, billId);
  if (s) return s;
  const { readerUnsure } = await import("@/db/schema");
  const u = await getDb().select({ b: readerUnsure.billId }).from(readerUnsure).where(and(eq(readerUnsure.userId, userId), eq(readerUnsure.billId, billId))).get();
  return u ? "unsure" : null;
}
export async function setAnswer(userId: string, billId: string, answer: Answer | null, reason: string | null) {
  const { readerUnsure, positionHistory } = await import("@/db/schema");
  const db = getDb();
  await setStance(userId, billId, answer === "support" || answer === "oppose" ? answer : null);
  if (answer === "unsure") await db.insert(readerUnsure).values({ userId, billId, updatedAt: Date.now() }).onConflictDoUpdate({ target: [readerUnsure.userId, readerUnsure.billId], set: { updatedAt: Date.now() } });
  else await db.delete(readerUnsure).where(and(eq(readerUnsure.userId, userId), eq(readerUnsure.billId, billId)));
  await db.insert(positionHistory).values({ id: crypto.randomUUID(), userId, billId, stance: answer ?? "cleared", reason, at: Date.now() });
}
export async function answerHistory(userId: string | null, billId: string) {
  if (!userId) return [];
  const { positionHistory } = await import("@/db/schema");
  const { desc } = await import("drizzle-orm");
  return getDb().select().from(positionHistory).where(and(eq(positionHistory.userId, userId), eq(positionHistory.billId, billId))).orderBy(desc(positionHistory.at)).limit(10);
}
