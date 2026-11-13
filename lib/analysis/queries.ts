import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisBillSummaries, analysisChecks, analysisReviewQueue, ingestRuns, officialBills, officialCostEstimates, officialMemberVotes, officialPoliticians } from "@/db/schema";

/**
 * The summary shown on a bill page. Readers see only a visible summary; the
 * signed-in editor (private preview) also sees a held one, labelled as held.
 */
export async function summaryForBill(billId: string, includeHeld: boolean) {
  const db = getDb();
  const rows = await db.select().from(analysisBillSummaries).where(and(eq(analysisBillSummaries.billId, billId),
    includeHeld ? inArray(analysisBillSummaries.status, ["visible", "held"]) : eq(analysisBillSummaries.status, "visible")))
    .orderBy(desc(analysisBillSummaries.createdAt)).limit(1);
  const summary = rows[0];
  if (!summary) return null;
  const [checks, queue] = await Promise.all([
    db.select().from(analysisChecks).where(eq(analysisChecks.summaryId, summary.id)).orderBy(desc(analysisChecks.attempt)),
    db.select().from(analysisReviewQueue).where(eq(analysisReviewQueue.summaryId, summary.id)).get(),
  ]);
  return { summary, checks, queue: queue ?? null };
}

export async function costEstimates(billId: string) {
  return getDb().select().from(officialCostEstimates).where(eq(officialCostEstimates.billId, billId)).orderBy(desc(officialCostEstimates.pubDate));
}

/** How the viewer's followed members voted on this bill's roll calls. */
export async function followedVotes(rollCallIds: string[], followed: Set<string>) {
  if (!rollCallIds.length || !followed.size) return [];
  return getDb().select({ rollCallId: officialMemberVotes.rollCallId, position: officialMemberVotes.position, rawPosition: officialMemberVotes.rawPosition,
    id: officialPoliticians.id, fullName: officialPoliticians.fullName, party: officialPoliticians.party, state: officialPoliticians.state,
    chamber: officialPoliticians.chamber, district: officialPoliticians.district })
    .from(officialMemberVotes).innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId))
    .where(and(inArray(officialMemberVotes.rollCallId, rollCallIds), inArray(officialMemberVotes.politicianId, [...followed])));
}

/** The editor's review list: open items first, then the latest decisions. */
export async function reviewQueue() {
  const db = getDb();
  return db.select({ q: analysisReviewQueue, s: analysisBillSummaries, billTitle: officialBills.title, billType: officialBills.billType, number: officialBills.number })
    .from(analysisReviewQueue).innerJoin(analysisBillSummaries, eq(analysisBillSummaries.id, analysisReviewQueue.summaryId))
    .innerJoin(officialBills, eq(officialBills.id, analysisBillSummaries.billId))
    .orderBy(sql`${analysisReviewQueue.status} <> 'open'`, desc(analysisReviewQueue.createdAt)).limit(60);
}

export async function allSummaries() {
  const db = getDb();
  return db.select({ s: analysisBillSummaries, billTitle: officialBills.title, billType: officialBills.billType, number: officialBills.number,
    reason: analysisReviewQueue.reason, queueStatus: analysisReviewQueue.status,
    grade: sql<number | null>`(select json_extract(metrics, '$.readingGrade') from analysis_checks c where c.summary_id = ${analysisBillSummaries.id} order by attempt desc limit 1)`,
    words: sql<number | null>`(select json_extract(metrics, '$.totalWords') from analysis_checks c where c.summary_id = ${analysisBillSummaries.id} order by attempt desc limit 1)` })
    .from(analysisBillSummaries).innerJoin(officialBills, eq(officialBills.id, analysisBillSummaries.billId))
    .leftJoin(analysisReviewQueue, eq(analysisReviewQueue.summaryId, analysisBillSummaries.id))
    .orderBy(desc(analysisBillSummaries.createdAt)).limit(100);
}

/** Counts and spend for the health probe and the editor page. No bill text or summary text. */
export async function analysisCounts() {
  const db = getDb();
  const [byStatus, open, spend, last] = await Promise.all([
    db.select({ status: analysisBillSummaries.status, n: sql<number>`count(*)`, usd: sql<number>`coalesce(sum(${analysisBillSummaries.costUsd}), 0)` })
      .from(analysisBillSummaries).groupBy(analysisBillSummaries.status),
    db.select({ n: sql<number>`count(*)` }).from(analysisReviewQueue).where(eq(analysisReviewQueue.status, "open")).get(),
    db.select({ usd: sql<number>`coalesce(sum(cost_usd), 0)`, calls: sql<number>`count(*)` }).from(sql`model_calls`).where(sql`purpose = 'analysis'`).get(),
    db.select().from(ingestRuns).where(eq(ingestRuns.job, "analysis")).orderBy(desc(ingestRuns.startedAt)).limit(1).get(),
  ]);
  const count = (s: string) => Number(byStatus.find(r => r.status === s)?.n ?? 0);
  const detail = (last?.detail ?? {}) as { stoppedBy?: string | null; made?: unknown[] };
  return { summaries: byStatus.reduce((n, r) => n + Number(r.n), 0), visible: count("visible"), held: count("held"), rejected: count("rejected"),
    openReviews: Number(open?.n ?? 0), summaryCostUsd: Math.round(byStatus.reduce((n, r) => n + Number(r.usd), 0) * 10000) / 10000,
    analysisCallsUsd: Math.round(Number(spend?.usd ?? 0) * 10000) / 10000, analysisCalls: Number(spend?.calls ?? 0),
    lastRun: last ? { status: last.status, startedAt: new Date(last.startedAt).toISOString(), made: Array.isArray(detail.made) ? detail.made.length : 0, stoppedBy: detail.stoppedBy ?? null,
      error: last.error ? last.error.replace(/https?:\/\/\S+/g, "[url]").slice(0, 160) : null } : null };
}
