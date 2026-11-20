import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisBillSummaries, analysisRereviews, analysisReviewQueue } from "@/db/schema";
import { OWNER_APPROVED, ownerApprovedIds } from "@/lib/analysis/owner-approvals";
import { READER_HOLDS } from "@/lib/analysis/reader-holds";
import { judgedByWrongRules } from "@/lib/analysis/recheck-rules";

/**
 * Applies the owner's listed approvals (lib/analysis/owner-approvals.ts). It does exactly what the editor's Approve
 * button does (the queue row becomes "approved", the summary "visible") and nothing else, and only when all of this
 * holds: the bill is listed; its summary is held; that hold came from the weekly re-check's wrong rules of November
 * 2026; and the bill is not on the list of summaries hidden after a reading against their sources. Anything else is
 * left alone and reported. Safe to run on every update: once applied, a line does nothing.
 */
export async function applyOwnerApprovals(now = Date.now()): Promise<Array<{ billId: string; done: boolean; why: string }>> {
  const db = getDb(), out: Array<{ billId: string; done: boolean; why: string }> = [];
  for (const billId of ownerApprovedIds()) {
    const s = await db.select({ id: analysisBillSummaries.id, status: analysisBillSummaries.status }).from(analysisBillSummaries).where(eq(analysisBillSummaries.billId, billId)).get();
    if (!s) { out.push({ billId, done: false, why: "no summary on file" }); continue; }
    if (s.status === "visible") { out.push({ billId, done: false, why: "already on show" }); continue; }
    if (s.status !== "held") { out.push({ billId, done: false, why: `status is ${s.status}; left alone` }); continue; }
    if (READER_HOLDS[billId]) { out.push({ billId, done: false, why: "hidden after a reading against its sources; left alone" }); continue; }
    const last = await db.select({ at: analysisRereviews.at, action: analysisRereviews.action, promptVersion: analysisRereviews.promptVersion }).from(analysisRereviews)
      .where(eq(analysisRereviews.summaryId, s.id)).orderBy(desc(analysisRereviews.at)).limit(1).get();
    if (!last || last.action !== "held" || !judgedByWrongRules(last.at, last.promptVersion)) { out.push({ billId, done: false, why: "not held by the re-check's wrong rules; left alone" }); continue; }
    const note = OWNER_APPROVED[billId].slice(0, 500);
    await db.update(analysisReviewQueue).set({ status: "approved", note, reviewerKey: "owner-instruction", decidedAt: now }).where(eq(analysisReviewQueue.summaryId, s.id));
    await db.update(analysisBillSummaries).set({ status: "visible", reviewedAt: now }).where(and(eq(analysisBillSummaries.id, s.id), eq(analysisBillSummaries.status, "held")));
    out.push({ billId, done: true, why: "approved on the owner's instruction" });
  }
  for (const r of out) if (r.done) console.log(`OWNER_APPROVAL | ${r.billId} | ${r.why}`);
  return out;
}
