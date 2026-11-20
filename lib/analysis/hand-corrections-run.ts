import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisBillSummaries, analysisSummaryDetails, analysisSummaryStructure, analysisSummaryVersions } from "@/db/schema";
import { getCursor, setCursor } from "@/lib/federal/ingest";
import { HAND_CORRECTIONS, HAND_CORRECTIONS_APPROVED, type HandCorrection } from "./hand-corrections.ts";
import { sectionsKey, type SectionState } from "./tiers.ts";

/**
 * Writes the hand corrections the owner has approved (lib/analysis/hand-corrections.ts), each once. The earlier
 * wording is kept as a version before anything is changed. A correction is applied only to the summary it was written
 * for: if the stored rows are not the ones it expects, nothing is written and the mismatch is reported. No model call.
 */
const doneKey = (c: HandCorrection) => `hand-correction:${c.billId}`;

export async function applyHandCorrections(): Promise<{ approved: boolean; applied: string[]; already: string[]; skipped: Array<{ billId: string; why: string }> }> {
  const out = { approved: HAND_CORRECTIONS_APPROVED, applied: [] as string[], already: [] as string[], skipped: [] as Array<{ billId: string; why: string }> };
  if (!HAND_CORRECTIONS_APPROVED) return out;
  const db = getDb();
  for (const c of HAND_CORRECTIONS) {
    if ((await getCursor(db, doneKey(c))) === c.version) { out.already.push(c.billId); continue; }
    const s = await db.select().from(analysisBillSummaries).where(eq(analysisBillSummaries.billId, c.billId)).orderBy(desc(analysisBillSummaries.createdAt)).limit(1).get();
    const details = s ? await db.select().from(analysisSummaryDetails).where(eq(analysisSummaryDetails.summaryId, s.id)).get() : null;
    const st = s ? await db.select().from(analysisSummaryStructure).where(eq(analysisSummaryStructure.summaryId, s.id)).get() : null;
    if (!s || !details || !st) { out.skipped.push({ billId: c.billId, why: "no stored summary with its details and structure" }); continue; }
    const rows = st.changes ?? [], bullets = st.howItWorksToday ?? [];
    if (bullets.length !== c.was.bullets || rows.length !== c.was.rowLabels.length || rows.some((r, i) => (r.label ?? "") !== c.was.rowLabels[i])) {
      out.skipped.push({ billId: c.billId, why: `the stored summary is not the one this correction was written for (${bullets.length} bullets; rows: ${rows.map(r => r.label).join(" | ").slice(0, 300)})` }); continue;
    }
    const now = Date.now(), off = new Set<string>(c.withhold), blank = <T,>(part: string, v: T, empty: T) => (off.has(part) ? empty : v);
    await db.insert(analysisSummaryVersions).values({ id: crypto.randomUUID(), summaryId: s.id, promptVersion: s.promptVersion, checkPassed: s.checkPassed, costUsd: s.costUsd, replacedAt: now,
      content: { details, structure: st, headline: s.headline, whatItDoes: s.whatItDoes, whoItAffects: s.whoItAffects, whatChangesForYou: s.whatChangesForYou, caseFor: s.caseFor, caseAgainst: s.caseAgainst,
        unknowns: s.unknowns, confidence: s.confidence, confidenceReason: s.confidenceReason, status: s.status, model: s.model, replacedBy: `hand correction ${c.version}` } });
    await db.update(analysisBillSummaries).set({ headline: c.headline, whatItDoes: blank("whatItDoes", s.whatItDoes, []), whoItAffects: blank("whoItAffects", s.whoItAffects, []),
      whatChangesForYou: blank("whatChangesForYou", s.whatChangesForYou, ""), caseFor: blank("caseFor", s.caseFor, []), caseAgainst: blank("caseAgainst", s.caseAgainst, []), unknowns: blank("unknowns", s.unknowns, []),
      reviewedAt: now }).where(eq(analysisBillSummaries.id, s.id));
    await db.update(analysisSummaryStructure).set({ howItWorksToday: bullets.map((b, i) => ({ ...b, text: c.howItWorksToday[i].text, section: c.howItWorksToday[i].section ?? b.section })),
      changes: rows.flatMap((r, i) => { const fix = c.changes[i]; return fix ? [{ ...r, ...fix }] : []; }), whyNow: blank("whyNow", st.whyNow, ""), updatedAt: now }).where(eq(analysisSummaryStructure.summaryId, s.id));
    await db.update(analysisSummaryDetails).set({ plainEnglish: c.plainEnglish, question: off.has("question") ? "" : c.question ?? details.question, updatedAt: now }).where(eq(analysisSummaryDetails.summaryId, s.id));
    // Which sections are left off, why, and their earlier text (never shown): the same record the writer keeps.
    const state: SectionState = { v: s.promptVersion, withheld: c.withhold, reasons: Object.fromEntries(c.withhold.map(p => [p, [c.why]])),
      text: { whatItDoes: s.whatItDoes, whoItAffects: s.whoItAffects, whatChangesForYou: s.whatChangesForYou, caseFor: s.caseFor, caseAgainst: s.caseAgainst, unknowns: s.unknowns, whyNow: st.whyNow, question: details.question }, at: now };
    await setCursor(db, sectionsKey(s.id), JSON.stringify(state));
    await setCursor(db, doneKey(c), c.version);
    console.log(`HAND_CORRECTION applied | ${c.billId} | ${c.version} | left off: ${c.withhold.join(", ")}`);
    out.applied.push(c.billId);
  }
  return out;
}
