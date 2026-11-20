import { desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisBillSummaries, analysisRereviews, analysisReviewQueue, officialBills, officialPoliticians } from "@/db/schema";
import { checkSummary, proseOf, type SummaryDraft } from "@/lib/analysis/checker";
import { MAX_TEXT_CHARS, parseBillTextHtml } from "@/lib/analysis/billtext";
import { parityDrift, parityStats, patternOf, sampleFraction } from "@/lib/analysis/parity-rules";
import { currentShape } from "@/lib/analysis/prompt-order";
import { judgedByWrongRules, RECHECK_MISTAKE } from "@/lib/analysis/recheck-rules";
import { billLabel } from "@/components/federal/badges";
import { BRAND } from "@/lib/brand";
import { getCursor } from "@/lib/federal/ingest";
import { partsOfFailure, readSectionState, sectionsKey } from "./tiers.ts";

/**
 * Round F quality checks.
 * 1. Re-review: each week a random 20% of visible summaries (not re-checked in the
 *    last 90 days) are checked again against the bill text with the current rule
 *    checker. A summary that now fails is held (taken off the page, never deleted)
 *    and goes to the editor's queue; the failures are grouped into patterns so the
 *    generator can be fixed. No AI call, so no spend.
 * 2. Parity: summaries grouped by the sponsor's party, compared on length, tone
 *    words and for/against balance (lib/analysis/parity-rules.ts), with an alert on drift.
 */
const WEEK = 7 * 86400e3, FRESH = 90 * 86400e3;
const draftOf = (s: typeof analysisBillSummaries.$inferSelect): SummaryDraft => ({ headline: s.headline, whatItDoes: s.whatItDoes, whoItAffects: s.whoItAffects, whatChangesForYou: s.whatChangesForYou,
  caseFor: s.caseFor, caseAgainst: s.caseAgainst, unknowns: s.unknowns, confidence: s.confidence, confidenceReason: s.confidenceReason } as SummaryDraft);

export async function runRereview(now = Date.now(), budgetMs = 60_000, maxPerRun = 8) {
  const db = getDb(), deadline = now + budgetMs;
  const last = await db.select({ at: sql<number>`max(${analysisRereviews.at})` }).from(analysisRereviews).get();
  // One sample per week; a sample is worked through over several runs (maxPerRun each).
  const visible = await db.select({ id: analysisBillSummaries.id }).from(analysisBillSummaries).where(eq(analysisBillSummaries.status, "visible"));
  if (!visible.length) return { checked: 0, failed: 0, note: "no visible summaries yet" };
  const recent = new Set((await db.select({ id: analysisRereviews.summaryId }).from(analysisRereviews).where(gte(analysisRereviews.at, now - FRESH))).map(r => r.id));
  const weekStart = now - WEEK, doneThisWeek = (await db.select({ id: analysisRereviews.summaryId }).from(analysisRereviews).where(gte(analysisRereviews.at, weekStart))).length;
  const target = Math.max(1, Math.round(visible.length * 0.2));
  if (doneThisWeek >= target && (last?.at ?? 0) > weekStart) return { checked: 0, failed: 0, note: `this week's 20% sample is done (${doneThisWeek})` };
  const pick = sampleFraction(visible.filter(v => !recent.has(v.id)), 1).slice(0, Math.min(maxPerRun, target - doneThisWeek));
  let checked = 0, failed = 0;
  for (const { id } of pick) {
    if (Date.now() > deadline) break;
    const s = await db.select().from(analysisBillSummaries).where(eq(analysisBillSummaries.id, id)).get();
    if (!s) continue;
    let failures: string[] = [], error: string | null = null;
    try {
      const res = await fetch(s.textUrl, { signal: AbortSignal.timeout(30_000), headers: { "user-agent": `${BRAND.userAgentName}/1.0 (quality re-review)` } });
      if (!res.ok) throw new Error(`bill text ${res.status}`);
      const parsed = parseBillTextHtml(await res.text());
      const subject = (await db.select({ title: officialBills.title }).from(officialBills).where(eq(officialBills.id, s.billId)).get())?.title ?? "";
      // b5 summaries may have 0–2 arguments a side (only actors in the record); the sources are not re-fetched here.
      // 19 Nov 2026: this read `s.promptVersion >= "b5"`, a comparison of text, under which "b11" sorts below "b5". Every
      // summary from generator 10 on was therefore checked by the rules for the oldest format (a headline starting
      // "Would", exactly two arguments a side, no source citations) and 4 of the first 5 sampled were taken off the page.
      failures = checkSummary(draftOf(s), parsed.sections, { truncated: parsed.chars > MAX_TEXT_CHARS || !!s.truncated, subject, fullText: parsed.text, b5Shape: currentShape(s.promptVersion) }).failures;
      // Two tiers (20 Nov 2026): a section withheld from readers is stored empty on purpose; its emptiness is not a fault of the summary.
      const off = readSectionState(await getCursor(db, sectionsKey(s.id)).catch(() => null), s.promptVersion).withheld as string[];
      if (off.length) failures = failures.filter(f => { const parts = partsOfFailure(f); return !parts || !parts.every(p => off.includes(p)); });
    } catch (e) { error = (e instanceof Error ? e.message : "fetch failed").slice(0, 200); }
    const passed = !error && !failures.length;
    await db.insert(analysisRereviews).values({ id: crypto.randomUUID(), summaryId: s.id, at: Date.now(), passed: passed ? 1 : 0, failures, promptVersion: s.promptVersion, action: error || passed ? "none" : "held", error });
    checked++;
    if (!error && failures.length) {
      failed++;
      await db.update(analysisBillSummaries).set({ status: "held" }).where(eq(analysisBillSummaries.id, s.id));
      await db.insert(analysisReviewQueue).values({ id: crypto.randomUUID(), summaryId: s.id, reason: "check_failed", status: "open", note: `Re-review ${new Date().toISOString().slice(0, 10)}: ${failures.slice(0, 3).join(" ")}`.slice(0, 500), createdAt: Date.now() })
        .onConflictDoUpdate({ target: analysisReviewQueue.summaryId, set: { status: "open", note: `Re-review: ${failures.slice(0, 3).join(" ")}`.slice(0, 500), decidedAt: null } });
    }
  }
  return { checked, failed, sampleTarget: target, visible: visible.length };
}

export async function rereviewSummary(days = 90, now = Date.now()) {
  const rows = await getDb().select().from(analysisRereviews).where(gte(analysisRereviews.at, now - days * 86400e3)).orderBy(desc(analysisRereviews.at));
  const patterns = new Map<string, number>();
  for (const r of rows) for (const f of r.failures) patterns.set(patternOf(f), (patterns.get(patternOf(f)) ?? 0) + 1);
  return { checked: rows.length, passed: rows.filter(r => r.passed).length, held: rows.filter(r => r.action === "held").length, errors: rows.filter(r => r.error).length,
    // Taken down before 19 Nov 2026 by rules that did not apply to them (lib/analysis/recheck-rules.ts).
    heldByWrongRules: rows.filter(r => r.action === "held" && judgedByWrongRules(r.at, r.promptVersion)).length,
    patterns: [...patterns].map(([pattern, n]) => ({ pattern, n })).sort((a, b) => b.n - a.n).slice(0, 15), recent: rows.slice(0, 20) };
}

/** Party parity over visible summaries (bill sponsor's party). */
export async function parityReport() {
  const db = getDb();
  const rows = await db.select({ s: analysisBillSummaries, party: officialPoliticians.party }).from(analysisBillSummaries)
    .innerJoin(officialBills, eq(officialBills.id, analysisBillSummaries.billId)).leftJoin(officialPoliticians, eq(officialPoliticians.id, officialBills.sponsorId))
    .where(eq(analysisBillSummaries.status, "visible"));
  const stats = parityStats(rows.map(({ s, party }) => ({ party: party ?? "", prose: proseOf(draftOf(s)).join(" "), forText: s.caseFor.map(a => a.argument).join(" "), againstText: s.caseAgainst.map(a => a.argument).join(" "),
    forCount: s.caseFor.length, againstCount: s.caseAgainst.length })));
  return { stats, ...parityDrift(stats), summaries: rows.length };
}

/** Public corrections log entries for summaries taken down after a re-review (the bill, the date, the rule it broke). */
export async function summaryCorrections(limit = 50) {
  const db = getDb();
  const rows = await db.select({ at: analysisRereviews.at, failures: analysisRereviews.failures, promptVersion: analysisRereviews.promptVersion, billId: analysisBillSummaries.billId, billType: officialBills.billType, number: officialBills.number, status: analysisBillSummaries.status })
    .from(analysisRereviews).innerJoin(analysisBillSummaries, eq(analysisBillSummaries.id, analysisRereviews.summaryId)).innerJoin(officialBills, eq(officialBills.id, analysisBillSummaries.billId))
    .where(eq(analysisRereviews.action, "held")).orderBy(desc(analysisRereviews.at)).limit(limit);
  // A takedown made by the wrong rules (before 19 Nov 2026) is listed as the check's mistake, never as a rule the summary broke.
  return rows.map(r => { const mistake = judgedByWrongRules(r.at, r.promptVersion);
    return { at: r.at, billId: r.billId, label: billLabel(r.billType, r.number), mistake, reason: mistake ? RECHECK_MISTAKE : r.failures[0] ?? "failed a rule check",
      nowShowing: mistake ? (r.status === "visible" ? "taken down by mistake and shown again" : "taken down by mistake; not yet shown again") : r.status === "visible" ? "rewritten and shown again" : "withdrawn while it is fixed" }; });
}

/** The bills whose summaries the re-check took down by the wrong rules and that are still down: to be read against their sources. */
export async function wronglyHeldBillIds(limit = 12): Promise<string[]> {
  const rows = await getDb().select({ at: analysisRereviews.at, promptVersion: analysisRereviews.promptVersion, billId: analysisBillSummaries.billId })
    .from(analysisRereviews).innerJoin(analysisBillSummaries, eq(analysisBillSummaries.id, analysisRereviews.summaryId))
    .where(sql`${analysisRereviews.action} = 'held' and ${analysisBillSummaries.status} = 'held'`).orderBy(desc(analysisRereviews.at));
  return [...new Set(rows.filter(r => judgedByWrongRules(r.at, r.promptVersion)).map(r => r.billId))].slice(0, limit);
}
