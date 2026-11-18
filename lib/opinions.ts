import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { billCategories, officialMemberVotes, officialRollCalls, positionHistory, readerAccounts, voiceVotes } from "@/db/schema";
import { voteKind } from "@/lib/federal/vote-kinds";
import { agreementByIssue, type Stance } from "@/lib/agreement";
import { castVote, importLegacy } from "@/lib/constituent/store";

/**
 * The reader's own answers on bills: Support, Oppose or Unsure, with an optional private reason. A single answer is
 * read only for that reader and never shown to anyone else. Since 18 Nov 2026 (docs/CONSTITUENT_VOICE.md) every answer
 * lives in one table, voice_votes, for federal and state bills alike; answers that count are added, without a name,
 * into totals (lib/constituent). Answers given before that date are copied in once, uncounted, the first time the
 * reader is seen again (`importLegacy`), and stay uncounted unless the reader chooses otherwise.
 */
export type Answer = Stance | "unsure";
const mine = async (userId: string) => { await importLegacy(getDb(), userId).catch(() => null); return getDb(); };

export async function answerFor(userId: string | null, billId: string): Promise<Answer | null> {
  if (!userId) return null;
  const db = await mine(userId);
  return ((await db.select({ a: voiceVotes.answer }).from(voiceVotes).where(and(eq(voiceVotes.userId, userId), eq(voiceVotes.billKey, billId))).get())?.a ?? null) as Answer | null;
}
export async function stanceFor(userId: string | null, billId: string): Promise<Stance | null> {
  const a = await answerFor(userId, billId);
  return a === "support" || a === "oppose" ? a : null;
}
/** Every answer of the reader, newest first; `billIds` narrows it. */
export async function answersOf(userId: string | null, billIds?: readonly string[], limit = 500): Promise<Array<{ billId: string; answer: Answer; at: number }>> {
  if (!userId || (billIds && !billIds.length)) return [];
  const db = await mine(userId);
  const rows = await db.select({ billId: voiceVotes.billKey, answer: voiceVotes.answer, at: voiceVotes.updatedAt }).from(voiceVotes)
    .where(billIds ? and(eq(voiceVotes.userId, userId), inArray(voiceVotes.billKey, [...billIds])) : eq(voiceVotes.userId, userId)).orderBy(desc(voiceVotes.updatedAt)).limit(limit);
  return rows.map(r => ({ ...r, answer: r.answer as Answer }));
}
export async function stancesOf(userId: string): Promise<Map<string, Stance>> {
  return new Map((await answersOf(userId)).filter(r => r.answer !== "unsure").map(r => [r.billId, r.answer as Stance]));
}

export type AnswerExtra = { accountId?: string | null; counts?: 1 | -1; device?: string | null; ipRange?: string | null; reasonHash?: string | null };
/** Saves, changes or clears the reader's answer and keeps the change in their history. */
export async function setAnswer(userId: string, billId: string, answer: Answer | null, reason: string | null, extra: AnswerExtra = {}) {
  const db = await mine(userId);
  const accountId = extra.accountId !== undefined ? extra.accountId : (await db.select({ id: readerAccounts.id }).from(readerAccounts).where(eq(readerAccounts.appUserId, userId)).get())?.id ?? null;
  await castVote(db, { userId, accountId, billKey: billId, answer, reason, reasonHash: extra.reasonHash ?? null, device: extra.device ?? null, ipRange: extra.ipRange ?? null, counts: extra.counts, now: Date.now() });
}
export async function setStance(userId: string, billId: string, stance: Stance | null) { return setAnswer(userId, billId, stance, null); }

export async function answerHistory(userId: string | null, billId: string) {
  if (!userId) return [];
  return getDb().select().from(positionHistory).where(and(eq(positionHistory.userId, userId), eq(positionHistory.billId, billId))).orderBy(desc(positionHistory.at)).limit(10);
}

/** The reader's agreement with one member, per issue, from the reader's own answers and the member's passage votes. Shown only to that reader. */
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
