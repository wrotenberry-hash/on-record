/**
 * Runs lib/analysis/unrepair.ts over the stored summaries of the current generator. A summary that changes keeps its
 * earlier wording in analysis_summary_versions ("Earlier versions are kept, not overwritten": lib/trust.ts), and one
 * line is logged: SUMMARY_CLEANUP <bill> | removed "…". Nothing is written when nothing is wrong, so it is safe on every run.
 */
import { eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisBillSummaries, analysisSummaryDetails, analysisSummaryStructure, analysisSummaryVersions } from "@/db/schema";
import { cleanSummaryText } from "@/lib/analysis/unrepair";

export async function cleanMisappliedExplanations(): Promise<Array<{ billId: string; removed: string[] }>> {
  const db = getDb(), out: Array<{ billId: string; removed: string[] }> = [];
  const rows = await db.select().from(analysisBillSummaries).where(ne(analysisBillSummaries.status, "rejected"));
  for (const s of rows) {
    const [d, st] = await Promise.all([db.select().from(analysisSummaryDetails).where(eq(analysisSummaryDetails.summaryId, s.id)).get(),
      db.select().from(analysisSummaryStructure).where(eq(analysisSummaryStructure.summaryId, s.id)).get()]);
    const next = { whatItDoes: s.whatItDoes.map(x => ({ ...x })), whoItAffects: s.whoItAffects.map(x => ({ ...x })), whatChangesForYou: s.whatChangesForYou,
      caseFor: s.caseFor.map(x => ({ ...x })), caseAgainst: s.caseAgainst.map(x => ({ ...x })), unknowns: [...s.unknowns] };
    const nd = d ? { plainEnglish: d.plainEnglish, background: d.background } : null;
    const ns = st ? { howItWorksToday: st.howItWorksToday.map(x => ({ ...x })), changes: st.changes.map(x => ({ ...x })), whyNow: st.whyNow } : null;
    const removed = cleanSummaryText(next, nd, ns);
    if (!removed.length) continue;
    const now = Date.now();
    await db.insert(analysisSummaryVersions).values({ id: crypto.randomUUID(), summaryId: s.id, promptVersion: s.promptVersion,
      content: { reason: "An explanation in parentheses had been attached to the wrong word by the automatic repair step; it was removed.", removed, details: d ?? null, structure: st ?? null,
        headline: s.headline, whatItDoes: s.whatItDoes, whoItAffects: s.whoItAffects, whatChangesForYou: s.whatChangesForYou, caseFor: s.caseFor, caseAgainst: s.caseAgainst, unknowns: s.unknowns,
        confidence: s.confidence, confidenceReason: s.confidenceReason, status: s.status, model: s.model },
      checkPassed: s.checkPassed, costUsd: 0, replacedAt: now });
    await db.update(analysisBillSummaries).set(next).where(eq(analysisBillSummaries.id, s.id));
    if (d && nd) await db.update(analysisSummaryDetails).set({ plainEnglish: nd.plainEnglish, background: nd.background, updatedAt: now }).where(eq(analysisSummaryDetails.summaryId, s.id));
    if (st && ns) await db.update(analysisSummaryStructure).set({ howItWorksToday: ns.howItWorksToday, changes: ns.changes, whyNow: ns.whyNow, updatedAt: now }).where(eq(analysisSummaryStructure.summaryId, s.id));
    console.log(`SUMMARY_CLEANUP ${s.billId} | ${s.status} | removed ${removed.join(", ")}`);
    out.push({ billId: s.billId, removed });
  }
  return out;
}
