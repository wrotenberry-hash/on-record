import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { alertEvents, analysisBillSummaries, analysisChecks, analysisReviewQueue, officialBills } from "@/db/schema";
import { billLabel } from "@/components/federal/badges";
import { recordSent, sendEmail, SITE_URL } from "@/lib/monitoring-runtime";
import { CHECKPOINT_SUMMARIES, formatSummariesEmail, summariesEmailDue, type SummaryForEmail } from "@/lib/analysis/report-format";

/** Runtime half of the checkpoint email (see lib/analysis/report-format.ts for the rule and the text). */
export async function firstSummaries(limit = CHECKPOINT_SUMMARIES): Promise<SummaryForEmail[]> {
  const db = getDb();
  const rows = await db.select({ s: analysisBillSummaries, title: officialBills.title, billType: officialBills.billType, number: officialBills.number,
    queue: analysisReviewQueue.reason,
    category: sql<string | null>`(select bc.category_slug from bill_categories bc join issue_categories ic on ic.slug = bc.category_slug where bc.bill_id = ${analysisBillSummaries.billId} order by ic.sort_order limit 1)` })
    .from(analysisBillSummaries).innerJoin(officialBills, eq(officialBills.id, analysisBillSummaries.billId))
    .leftJoin(analysisReviewQueue, eq(analysisReviewQueue.summaryId, analysisBillSummaries.id))
    .orderBy(analysisBillSummaries.sequence).limit(limit);
  const out: SummaryForEmail[] = [];
  for (const r of rows) {
    const last = await db.select().from(analysisChecks).where(eq(analysisChecks.summaryId, r.s.id)).orderBy(desc(analysisChecks.attempt)).limit(1).get();
    out.push({ label: billLabel(r.billType, r.number), title: r.title, billId: r.s.billId, category: r.category, headline: r.s.headline, whatItDoes: r.s.whatItDoes,
      whoItAffects: r.s.whoItAffects, whatChangesForYou: r.s.whatChangesForYou, caseFor: r.s.caseFor, caseAgainst: r.s.caseAgainst, unknowns: r.s.unknowns,
      confidence: r.s.confidence, confidenceReason: r.s.confidenceReason, status: r.s.status, queue: r.queue ?? null, checkPassed: r.s.checkPassed === 1,
      attempts: r.s.attempts, failures: last?.failures ?? [], warnings: last?.warnings ?? [], readingGrade: last?.metrics.readingGrade ?? null,
      totalWords: last?.metrics.totalWords ?? null, costUsd: r.s.costUsd, truncated: r.s.truncated === 1 });
  }
  return out;
}

/** After a summary batch: send the checkpoint email if it is due. Never throws into the run. */
export async function sendSummariesReadyIfDue(): Promise<{ sent: boolean; reason: string }> {
  try {
    const db = getDb();
    const [count, before] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(analysisBillSummaries).get().then(r => Number(r?.n ?? 0)),
      db.select({ n: sql<number>`count(*)` }).from(alertEvents).where(eq(alertEvents.kind, "SUMMARIES_READY")).get().then(r => Number(r?.n ?? 0) > 0),
    ]);
    if (!summariesEmailDue(count, before)) return { sent: false, reason: before ? "already sent" : `${count} of ${CHECKPOINT_SUMMARIES} summaries so far` };
    const rows = await firstSummaries();
    const mail = formatSummariesEmail(rows, SITE_URL);
    const delivery = await sendEmail(mail.subject, mail.text);
    if (!delivery.ok) return { sent: false, reason: delivery.error };
    await recordSent({ kind: "SUMMARIES_READY", subject: mail.subject, detail: `${rows.length} summaries emailed` }, process.env.ALERT_TO_EMAIL?.trim() || "owner");
    return { sent: true, reason: `${rows.length} summaries emailed` };
  } catch (error) { return { sent: false, reason: (error instanceof Error ? error.message : "report failed").slice(0, 200) }; }
}
