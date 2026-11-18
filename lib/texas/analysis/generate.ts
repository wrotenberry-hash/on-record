/**
 * Writing one Texas summary, and a run of them (owner instruction, 17 Nov 2026, Texas build point 3).
 *
 * The same loop as the federal generator (lib/analysis/generate.ts, summarise() and runAnalysisBatch()): write, keep
 * what was right from the draft before, repair mechanically, check every written rule, then the average-reader test;
 * at most three attempts, each rewrite given the specific failures; a summary that still fails is held for the
 * editor. The checker, the repair rules, the reader-test rules and the hold-or-show routing are the federal ones.
 *
 * Everything outside is passed in (the model client, the source gatherer, the store, the month's spend), so the
 * whole loop runs in the tests with a stand-in model and no database. lib/texas/summaries.ts supplies the real ones.
 *
 * Log lines, in the federal form with a TX_ prefix:
 *   TX_SUMMARY_ATTEMPT <bill> | attempt N | written rules PASS|FAIL | <model>, <cost> USD, <seconds> s | repairs N | {failures, repairs}
 *   TX_READER_TEST <bill> | attempt N | PASS|FAIL | $<cost> | {reasons, reader}
 *   TX_REVIEW_PACKET <bill> | SOURCE <id> / CONTEXT / SUMMARY / HEADINGS / CITED <section> | part k/n | …
 */
import { routeSummary, type CheckResult, type ReviewRoute, type SummaryDraft } from "../../analysis/checker.ts";
import { keepWhatWasRight } from "../../analysis/repair.ts";
import { callCost, maxCallCost, type Price } from "../../model-cost.ts";
import { eligibilityLine, orderEligible, type EligBill, type Eligibility } from "./eligibility.ts";
import { txSourcePacketLines, type GatherOutcome, type TxBillInput, type TxGathered } from "./gather.ts";
import { parseTxDraft, TX_INSTRUCTIONS, TX_MAX_OUTPUT_TOKENS, TX_MAX_TEXT_CHARS, TX_PROMPT_VERSION, txInputFor, txSourcesBlock, txSummarySchema } from "./prompt.ts";
import { runTxReaderTest, type TxModelClient, type TxReaderTest } from "./reader.ts";
import { txCitedSection, versionCodeOf } from "./sources.ts";
import { checkTxSummary, repairTxDraft, type TxCheckContext } from "./standard.ts";

export type TxLimits = {
  /** The monthly cap shared with the federal summaries (ANALYSIS_SPEND_CAP_USD). */
  spendCapUsd: number;
  /** How many Texas summaries may exist (TEXAS_MAX_SUMMARIES; 5 = the owner's test set). */
  maxSummaries: number;
  /** The low-cost model: the test reader and its judge, and the writer's fallback. */
  model: string; writerModel: string; reasoning: string; prices: Record<string, Price>;
  /** Summaries rewritten per run because the generator or the bill's text changed (they do not count against maxSummaries). */
  regenPerRun: number };

export type TxCandidate = TxBillInput & EligBill & { authors: readonly string[] };
export type TxAttempt = { draft: SummaryDraft; check: CheckResult; reader?: TxReaderTest; repairs: string[]; model: string; costUsd: number };
export type TxWritten = { attempts: TxAttempt[]; final: TxAttempt; costUsd: number; readerCostUsd: number; inputTokens: number; outputTokens: number; model: string };

/** "SB 4 (89R)": how a Texas bill is named in the log lines. */
export const txLabel = (b: { identifier: string; tloSession: string }) => `TX ${b.identifier} (${b.tloSession})`;

export function txCheckContext(c: { title: string }, g: TxGathered): TxCheckContext {
  return { title: c.title, sections: g.text.sections, billText: g.text.text, truncated: g.text.chars > TX_MAX_TEXT_CHARS, docs: g.docs.map(d => ({ id: d.id, text: d.text })), sides: g.sides, agencies: g.agencies };
}

/** The model's input for one bill. */
export function txModelInput(c: TxCandidate, g: TxGathered): string {
  return txInputFor({ identifier: c.identifier, sessionName: c.sessionName, title: c.title, authors: c.authors,
    latestAction: c.latestActionDescription ? { date: c.latestActionDate ?? null, text: c.latestActionDescription } : null,
    textVersion: g.text.versionLabel, textDate: g.text.date, sections: g.text.sections, billText: g.text.text, truncated: g.text.chars > TX_MAX_TEXT_CHARS,
    sources: g.docs, notes: g.notes, allowedFor: g.sides.filter(s => s.side === "for").map(s => s.attribution), allowedAgainst: g.sides.filter(s => s.side === "against").map(s => s.attribution),
    hasPrimer: g.docs.some(d => d.id === "PRIMER") });
}

/** Write, check, repair and reader-test one summary: at most three attempts. Returns { stop } when nothing could be written within the caps. */
export async function writeTxSummary(a: { client: TxModelClient; limits: TxLimits; candidate: TxCandidate; gathered: TxGathered; summaryId: string; deadline: number;
  spentSoFar: () => number; log?: (line: string) => void; now?: () => number }): Promise<TxWritten | { stop: string }> {
  const { client, limits, candidate: c, gathered: g, summaryId } = a, log = a.log ?? (() => undefined), now = a.now ?? Date.now;
  const label = txLabel(c), input = txModelInput(c, g), ctx = txCheckContext(c, g);
  const sourcesText = `${txSourcesBlock({ sources: g.docs, notes: g.notes, allowedFor: ctx.sides.filter(s => s.side === "for").map(s => s.attribution), allowedAgainst: ctx.sides.filter(s => s.side === "against").map(s => s.attribution), hasPrimer: false })}\n\nBILL TEXT:\n${g.text.text.slice(0, TX_MAX_TEXT_CHARS)}`;
  let writer = limits.writerModel;
  const worst = maxCallCost(writer, input.length + TX_INSTRUCTIONS.length, TX_MAX_OUTPUT_TOKENS, limits.prices);
  const attempts: TxAttempt[] = [];
  let inTok = 0, outTok = 0, cost = 0, readerCost = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (a.spentSoFar() + cost + readerCost + worst > limits.spendCapUsd) { if (!attempts.length) return { stop: `spend cap $${limits.spendCapUsd} would be exceeded` }; break; }
    const remaining = a.deadline - now();
    if (remaining < 45_000) { if (!attempts.length) return { stop: "time budget" }; log(`TX_SUMMARY_ATTEMPT ${label} | attempt ${attempt} | SKIPPED | time budget`); break; }
    const prior = attempts.at(-1);
    const thisInput = prior ? `${input}\n\nYour previous draft failed these checks. Fix every one, keep what was right, and stay neutral:\n- ${prior.check.failures.join("\n- ")}\n\nPrevious draft:\n${JSON.stringify(prior.draft)}` : input;
    const t0 = now();
    let draft: SummaryDraft, usd: number;
    try {
      const r = await client({ purpose: "tx_analysis", model: writer, refId: summaryId, schemaName: "tx_bill_summary", schema: txSummarySchema, instructions: TX_INSTRUCTIONS, input: thisInput,
        maxOutputTokens: TX_MAX_OUTPUT_TOKENS, timeoutMs: Math.min(110_000, remaining - 15_000), reasoning: limits.reasoning });
      const priced = callCost(writer, r.usage, 0, limits.prices);
      inTok += priced.inputTokens; outTok += priced.outputTokens; cost += priced.usd; usd = priced.usd;
      draft = parseTxDraft(r.text);
    } catch (error) {
      const message = (error instanceof Error ? error.message : "error").slice(0, 200);
      log(`TX_SUMMARY_ATTEMPT ${label} | attempt ${attempt} | ERROR | ${writer} | ${message}`);
      // The key may not have the stronger model: fall back to the low-cost one once rather than write nothing.
      if (writer !== limits.model && /returned (?:400|403|404)(?!\d)/.test(message)) { writer = limits.model; attempt--; continue; }
      if (!attempts.length) throw error;
      break; // keep the earlier draft; it is held for the editor
    }
    // A rewrite changes only the parts its failures were about; the rest is kept from the draft before.
    const kept = prior ? keepWhatWasRight(prior.draft, draft, prior.check.failures) : { draft, kept: [] as string[] };
    const repaired = repairTxDraft(kept.draft, { sourceIds: g.docs.map(d => d.id), numberedSections: g.text.sections.length > 0 });
    if (kept.kept.length) repaired.notes.unshift(`kept from the draft before: ${kept.kept.join(", ")}`);
    const check = checkTxSummary(repaired.draft, ctx);
    log(`TX_SUMMARY_ATTEMPT ${label} | attempt ${attempt} | written rules ${check.passed ? "PASS" : "FAIL"} | ${writer}, ${usd.toFixed(4)} USD, ${Math.round((now() - t0) / 1000)} s | repairs ${repaired.notes.length} | ${JSON.stringify({ failures: check.failures, repairs: repaired.notes.slice(0, 12) }).slice(0, 1300)}`);
    const row: TxAttempt = { draft: repaired.draft, check, repairs: repaired.notes, model: writer, costUsd: usd };
    if (check.passed && a.deadline - now() > 30_000) {
      // The average-reader test runs only on a draft that already passes the written rules.
      try {
        const reader = await runTxReaderTest(client, limits.model, summaryId, repaired.draft, sourcesText, limits.prices, Math.min(60_000, a.deadline - now() - 10_000));
        row.reader = reader; readerCost += reader.costUsd;
        log(`TX_READER_TEST ${label} | attempt ${attempt} | ${reader.passed ? "PASS" : "FAIL"} | $${reader.costUsd} | ${JSON.stringify({ reasons: reader.reasons, reader: reader.reader }).slice(0, 1300)}`);
        if (!reader.passed) { check.passed = false; check.failures.push(...reader.reasons.map(r => `Average-reader test: ${r}`)); }
      } catch (error) {
        check.passed = false; check.failures.push(`Average-reader test could not run (${(error instanceof Error ? error.message : "error").slice(0, 120)}); held for review.`);
        attempts.push(row); break;
      }
    } else if (check.passed) { check.passed = false; check.failures.push("Average-reader test did not run (time budget); held for review."); attempts.push(row); break; }
    attempts.push(row);
    if (check.passed) break;
  }
  const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
  return { attempts, final: attempts.at(-1)!, costUsd: round(cost + readerCost), readerCostUsd: round(readerCost), inputTokens: inTok, outputTokens: outTok, model: writer };
}

// ───────────── A run ─────────────

export type TxExisting = { id: string; sequence: number; promptVersion: string; textVersion: string; status: "visible" | "held" | "rejected"; updatedAt: number; attemptsSoFar: number };

/** Everything stored for one summary (the store writes it to the tx_summary* tables). */
export type TxSummaryRecord = { id: string; billId: string; sequence: number; rewriteOf: TxExisting | null; route: ReviewRoute; eligibility: Eligibility;
  content: { textVersion: string; textVersionLabel: string; textDate: string | null; textUrl: string; textChars: number; truncated: number; headline: string; whatItDoes: SummaryDraft["whatItDoes"];
    whoItAffects: SummaryDraft["whoItAffects"]; whatChangesForYou: string; caseFor: SummaryDraft["caseFor"]; caseAgainst: SummaryDraft["caseAgainst"]; unknowns: string[]; confidence: SummaryDraft["confidence"];
    confidenceReason: string; checkPassed: number; attempts: number; status: "visible" | "held"; model: string; promptVersion: string; inputTokens: number; outputTokens: number; costUsd: number;
    sources: Array<{ label: string; url: string; date: string | null }> };
  structure: { howItWorksToday: NonNullable<SummaryDraft["howItWorksToday"]>; changes: NonNullable<SummaryDraft["changes"]>; whyNow: string; primers: string[] };
  details: { plainEnglish: string; question: string; sourceDocs: Array<{ id: string; kind: string; label: string; url: string; date: string | null }>;
    fiscal: { url: string; date: string | null; describes: string; headline: string | null; noSignificantImpact: boolean } | null; notes: string[]; unread: string[] };
  checks: Array<{ attempt: number; passed: boolean; failures: string[]; warnings: string[]; metrics: CheckResult["metrics"]; repairs: string[]; model: string; costUsd: number }>;
  readerTests: Array<{ attempt: number; passed: boolean; headline: string; plainEnglish: string; reader: unknown; judge: unknown; reasons: string[]; costUsd: number; model: string }> };

export type TxStore = { countSummaries(): Promise<number>; existingFor(billId: string): Promise<TxExisting | null>; save(record: TxSummaryRecord): Promise<void> };

export type TxOutcome = { billId: string; label: string; status: "visible" | "held"; queue: ReviewRoute["queue"]; attempts: number; checkPassed: boolean; confidence: string; costUsd: number;
  readerTestCostUsd: number; readerTest: "pass" | "fail" | "not run"; inputTokens: number; outputTokens: number; readingGrade: number; totalWords: number; regenerated: boolean; eligibility: string; sources: string[] };
export type TxRun = { status: "COMPLETE" | "PARTIAL" | "FAILED" | "SKIPPED"; made: TxOutcome[]; skippedNoText: string[]; notEligible: number; stoppedBy: string | null; error?: string; requests: number; ms: number };

/** Time one summary can need: up to three drafts, each followed by the reader test (the federal figure, measured 17 Nov). */
export const TX_FULL_CYCLE_MS = 75_000;

/** Does a stored summary need writing again? An older generator wrote it, or the bill has a newer text published since. */
export function needsRewrite(ex: TxExisting, c: Pick<TxCandidate, "versions">): boolean {
  if (ex.status === "rejected") return false;
  if (ex.promptVersion !== TX_PROMPT_VERSION) return true;
  const newest = [...c.versions].filter(v => v.url && v.date).sort((x, y) => (x.date ?? "").localeCompare(y.date ?? "")).at(-1);
  const code = newest?.url ? versionCodeOf(newest.url) : null;
  // Only a version dated after the summary was written counts, so a feed that lags behind the official site cannot cause a rewrite on every run.
  return !!code && !!newest?.date && code !== ex.textVersion.toUpperCase() && Date.parse(`${newest.date}T00:00:00Z`) > ex.updatedAt;
}

export function txRecord(c: TxCandidate, g: TxGathered, w: TxWritten, id: string, sequence: number, rewriteOf: TxExisting | null, eligibility: Eligibility): TxSummaryRecord {
  const d = w.final.draft, route = routeSummary({ checkPassed: w.final.check.passed, confidence: d.confidence, sequenceIndex: sequence });
  const first = (rewriteOf?.attemptsSoFar ?? 0) + 1;
  return { id, billId: c.id, sequence, rewriteOf, route, eligibility,
    content: { textVersion: g.text.versionCode, textVersionLabel: g.text.versionLabel, textDate: g.text.date, textUrl: g.text.url, textChars: g.text.chars, truncated: g.text.chars > TX_MAX_TEXT_CHARS ? 1 : 0,
      headline: d.headline, whatItDoes: d.whatItDoes, whoItAffects: d.whoItAffects, whatChangesForYou: d.whatChangesForYou, caseFor: d.caseFor, caseAgainst: d.caseAgainst, unknowns: d.unknowns,
      confidence: d.confidence, confidenceReason: d.confidenceReason, checkPassed: w.final.check.passed ? 1 : 0, attempts: w.attempts.length, status: route.status, model: w.model, promptVersion: TX_PROMPT_VERSION,
      inputTokens: w.inputTokens, outputTokens: w.outputTokens, costUsd: w.costUsd, sources: g.sourceList },
    structure: { howItWorksToday: d.howItWorksToday ?? [], changes: d.changes ?? [], whyNow: d.whyNow ?? "", primers: g.primers.map(p => p.id) },
    details: { plainEnglish: d.plainEnglish ?? "", question: d.question ?? "", sourceDocs: g.docs.map(x => ({ id: x.id, kind: x.kind, label: x.label, url: x.url, date: x.date })),
      fiscal: g.fiscal ? { url: g.fiscal.url, date: g.fiscal.date, describes: g.fiscal.describes, headline: g.fiscal.headline, noSignificantImpact: g.fiscal.noSignificantImpact } : null, notes: g.notes, unread: g.unread },
    checks: w.attempts.map((x, i) => ({ attempt: first + i, passed: x.check.passed, failures: x.check.failures, warnings: x.check.warnings, metrics: x.check.metrics, repairs: x.repairs, model: x.model, costUsd: x.costUsd })),
    readerTests: w.attempts.flatMap((x, i) => x.reader ? [{ attempt: first + i, passed: x.reader.passed, headline: x.draft.headline, plainEnglish: x.draft.plainEnglish ?? "", reader: x.reader.reader, judge: x.reader.judge,
      reasons: x.reader.reasons, costUsd: x.reader.costUsd, model: x.reader.model }] : []) };
}

/** The finished summary beside the bill sections it cites, as log lines for the editor's review (the federal REVIEW_PACKET form). */
export function txReviewPacketLines(label: string, rec: TxSummaryRecord, g: TxGathered, size = 1500): string[] {
  const lines = (kind: string, text: string) => { const parts = Math.max(1, Math.ceil(text.length / size)); return Array.from({ length: parts }, (_, k) => `TX_REVIEW_PACKET ${label} | ${kind} | part ${k + 1}/${parts} | ${text.slice(k * size, (k + 1) * size)}`); };
  const last = rec.checks.at(-1);
  const out = lines("SUMMARY", JSON.stringify({ label, billId: rec.billId, status: rec.content.status, queue: rec.route.queue, checkPassed: rec.content.checkPassed === 1, attempts: rec.content.attempts,
    failures: last?.failures ?? [], warnings: last?.warnings ?? [], readingGrade: last?.metrics.readingGrade ?? null, totalWords: last?.metrics.totalWords ?? null, costUsd: rec.content.costUsd,
    eligibility: eligibilityLine(rec.eligibility), headline: rec.content.headline, details: rec.details, structure: rec.structure, whatItDoes: rec.content.whatItDoes, whoItAffects: rec.content.whoItAffects,
    whatChangesForYou: rec.content.whatChangesForYou, caseFor: rec.content.caseFor, caseAgainst: rec.content.caseAgainst, unknowns: rec.content.unknowns, confidence: rec.content.confidence,
    confidenceReason: rec.content.confidenceReason, textUrl: rec.content.textUrl, promptVersion: rec.content.promptVersion }));
  out.push(...lines("HEADINGS", `${g.text.chars} chars; ${g.text.sections.map(s => `Sec. ${s.num}. ${s.heading}`.slice(0, 90)).join(" || ")}`.slice(0, 1400)));
  const cites = new Set([...rec.content.whatItDoes, ...rec.content.whoItAffects, ...rec.structure.howItWorksToday].map(p => p.section).concat(rec.structure.changes.map(r => r.source)));
  for (const cite of cites) {
    const n = txCitedSection(cite), sec = n ? g.text.sections.find(s => s.num.toUpperCase() === n) : null;
    if (sec) out.push(...lines(`CITED ${cite}`, `[${sec.text.length} chars] ${sec.text.slice(0, 16000)}`));
    else if (n || /^full text$/i.test(cite.trim())) out.push(...lines(`CITED ${cite}`, n ? "NOT FOUND IN THE BILL TEXT" : `[${g.text.text.length} chars] ${g.text.text.slice(0, 16000)}`));
  }
  return out;
}

/**
 * Write summaries until the time budget, the Texas summary limit or the monthly spend cap is reached. Only bills with
 * a hearing, a vote or a follower are ever written: the list is filtered here again, whatever the caller passed in.
 */
export async function runTxBatch(a: { candidates: readonly TxCandidate[]; gather: (c: TxCandidate) => Promise<GatherOutcome>; client: TxModelClient; store: TxStore; limits: TxLimits;
  /** Dollars already spent this month on summaries, federal and Texas together. */
  spentThisMonth: number; budgetMs: number; max?: number; log?: (line: string) => void; now?: () => number; newId?: () => string }): Promise<TxRun> {
  const now = a.now ?? Date.now, log = a.log ?? (() => undefined), newId = a.newId ?? (() => crypto.randomUUID());
  const started = now(), deadline = started + a.budgetMs, made: TxOutcome[] = [], skippedNoText: string[] = [];
  const queue = orderEligible(a.candidates);
  const notEligible = a.candidates.length - queue.length;
  let spent = a.spentThisMonth, requests = 0, stoppedBy: string | null = null, fresh = 0, rewritten = 0;
  const finish = (status: TxRun["status"], error?: string): TxRun => ({ status, made, skippedNoText, notEligible, stoppedBy, ...(error ? { error } : {}), requests, ms: now() - started });
  if (spent >= a.limits.spendCapUsd) { stoppedBy = `spend cap reached ($${spent.toFixed(2)} of $${a.limits.spendCapUsd})`; return finish("SKIPPED"); }
  try {
    const existing = await a.store.countSummaries();
    const room = Math.min(a.max ?? Infinity, a.limits.maxSummaries - existing);
    if (!queue.length) stoppedBy = "no Texas bill has had a hearing or a vote, and none is followed";
    for (const { bill: c, eligibility } of queue) {
      const ex = await a.store.existingFor(c.id);
      if (ex ? !needsRewrite(ex, c) || rewritten >= a.limits.regenPerRun : fresh >= room) { if (!ex && !stoppedBy) stoppedBy = existing + fresh >= a.limits.maxSummaries ? `Texas summary limit reached (${existing + fresh} of ${a.limits.maxSummaries})` : "this run's limit"; continue; }
      if (deadline - now() < TX_FULL_CYCLE_MS) { stoppedBy = "time budget"; break; }
      const g = await a.gather(c);
      requests += g.ok ? g.gathered.requests : g.requests;
      if (!g.ok) {
        if (g.reason === "refused") { stoppedBy = `stopped: ${g.detail}`; break; } // an official site refused: stop cleanly, never retry
        skippedNoText.push(c.id); continue;
      }
      const label = txLabel(c);
      for (const line of txSourcePacketLines(label, g.gathered)) log(line);
      const id = ex?.id ?? newId();
      const w = await writeTxSummary({ client: a.client, limits: a.limits, candidate: c, gathered: g.gathered, summaryId: id, deadline, spentSoFar: () => spent, log, now });
      if ("stop" in w) { stoppedBy = w.stop; break; }
      // A document that prints the arguments exists but could not be read: the summary cannot say there is no case against, so the editor decides.
      if (g.gathered.unread.length) {
        w.final.check.passed = false;
        w.final.check.failures.push(`Could not be read: ${g.gathered.unread.join("; ")}. Held for review, because arguments it prints may be missing from this summary.`);
        log(`TX_SUMMARY_HELD ${label} | unread source | ${g.gathered.unread.join("; ")}`);
      }
      const rec = txRecord(c, g.gathered, w, id, ex ? ex.sequence : existing + fresh, ex, eligibility);
      await a.store.save(rec);
      for (const line of txReviewPacketLines(label, rec, g.gathered)) log(line);
      if (ex) rewritten++; else fresh++;
      spent += w.costUsd;
      const m = w.final.check.metrics;
      made.push({ billId: c.id, label, status: rec.route.status, queue: rec.route.queue, attempts: w.attempts.length, checkPassed: w.final.check.passed, confidence: w.final.draft.confidence,
        costUsd: Math.round(w.costUsd * 10000) / 10000, readerTestCostUsd: Math.round(w.readerCostUsd * 10000) / 10000, readerTest: w.final.reader ? (w.final.reader.passed ? "pass" : "fail") : "not run",
        inputTokens: w.inputTokens, outputTokens: w.outputTokens, readingGrade: m.readingGrade, totalWords: m.totalWords, regenerated: !!ex, eligibility: eligibilityLine(eligibility), sources: g.gathered.docs.map(d => d.id) });
    }
    log(`TX_REVIEW_PACKET done | ${made.length} summaries`);
    return finish(stoppedBy === "time budget" ? "PARTIAL" : "COMPLETE");
  } catch (error) {
    stoppedBy = "error";
    return finish(made.length ? "PARTIAL" : "FAILED", (error instanceof Error ? error.message : "Texas summaries failed").slice(0, 300));
  }
}
