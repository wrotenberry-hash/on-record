import { desc, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { readerFeedback } from "@/db/schema";

export async function saveFeedback(answer: string, audience: string) {
  await getDb().insert(readerFeedback).values({ id: crypto.randomUUID(), answer, audience, createdAt: Date.now() });
}

export async function feedbackList(limit = 100) {
  return getDb().select().from(readerFeedback).orderBy(desc(readerFeedback.createdAt)).limit(limit);
}

/** Counts only, for the health probe. Never the answers. */
export async function feedbackCounts() {
  const db = getDb(), week = Date.now() - 7 * 24 * 3600 * 1000;
  const [all, recent] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(readerFeedback).get(),
    db.select({ n: sql<number>`count(*)` }).from(readerFeedback).where(gte(readerFeedback.createdAt, week)).get(),
  ]);
  return { answers: Number(all?.n ?? 0), last7Days: Number(recent?.n ?? 0) };
}
