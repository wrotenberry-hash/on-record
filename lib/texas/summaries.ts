import { texasSummariesPaused, TEXAS_SUMMARIES_PUBLIC } from "@/lib/analysis/publish-gate";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ingestRuns, txBillSummaries, txSummaries, txSummaryChecks, txSummaryDetails, txSummaryReaderTests, txSummaryReviewQueue, txSummaryStructure, txSummaryVersions } from "@/db/schema";
import { analysisLimits } from "@/lib/analysis/generate";
import type { Primer } from "@/lib/analysis/primers";
import { outputText, responseRequest } from "@/lib/automated-research";
import { priceTable } from "@/lib/model-cost";
import { spendSince } from "@/lib/model-calls";
import { texasCandidates } from "@/lib/texas/analysis/candidates";
import { BRAND } from "@/lib/brand";
import { gatherTxSources, type Fetcher, type GatherOutcome } from "@/lib/texas/analysis/gather";
import { runTxBatch, type TxCandidate, type TxExisting, type TxLimits, type TxRun, type TxStore, type TxSummaryRecord } from "@/lib/texas/analysis/generate";
import { TX_PROMPT_VERSION } from "@/lib/texas/analysis/prompt";
import { isOfficialUrl } from "@/lib/texas/analysis/sources";
import type { TxModelClient } from "@/lib/texas/analysis/reader";
import { txCaseNote } from "@/lib/texas/analysis/standard";

/**
 * Texas bill summaries to the same standard as the federal ones (owner instruction, 17 Nov 2026, Texas build point 3:
 * "same standard and average-reader test … Only summarize bills that get a committee hearing, a vote, or that a user
 * follows").
 *
 * This file is the wiring: the database, the network and the model. The rules live in lib/texas/analysis/ and are
 * tested without any of the three:
 *   eligibility.ts  which bills may be written, and in what order (candidates.ts reads them from the database)
 *   sources.ts      the official documents and how each is read
 *   gather.ts       fetching them for one bill, paced, official hosts only
 *   standard.ts     the federal checker and repair step applied to Texas citations, terms and abbreviations
 *   prompt.ts       what the model is told; reader.ts the average-reader test; generate.ts the three-attempt loop
 *
 * Money: every model call is entered in the model-call ledger under "tx_analysis" or "tx_reader_test" and counts
 * toward the same monthly cap as the federal summaries (ANALYSIS_SPEND_CAP_USD). TEXAS_MAX_SUMMARIES (default 5, the
 * owner's test set) limits how many Texas summaries exist. Paused unless TEXAS_SUMMARIES_PAUSED=0.
 * Storage: the tx_summar* tables. The old tx_bill_summaries table (first template) is not read or written.
 */
const UA = `${BRAND.userAgentName}/0.2 (+https://on-record-wrotenberry.vercel.app)`;
/** Ledger purposes of every summary call, federal and Texas: together they are held to one monthly cap. */
export const SUMMARY_PURPOSES = ["analysis", "reader_test", "tx_analysis", "tx_reader_test"] as const;

const num = (v: string | undefined, d: number) => { const n = Number(v); return v?.trim() && Number.isFinite(n) && n >= 0 ? n : d; };

export function texasSummaryLimits(): TxLimits & { maxRequestsPerRun: number; paceMs: number } {
  const f = analysisLimits();
  return { spendCapUsd: f.spendCapUsd, model: f.model, writerModel: f.writerModel, reasoning: f.reasoning, prices: priceTable(process.env.OPENAI_PRICES_JSON),
    // Owner, 17 Nov: Texas starts with a test set of five, like the federal summaries did, until he raises it.
    maxSummaries: num(process.env.TEXAS_MAX_SUMMARIES, 5), regenPerRun: num(process.env.TEXAS_REGEN_PER_RUN, 2),
    maxRequestsPerRun: num(process.env.TEXAS_SUMMARY_MAX_REQUESTS, 30), paceMs: num(process.env.TEXAS_SUMMARY_PACE_MS, 1500) };
}

/** What summaries have cost this month, federal and Texas together. */
export async function summariesSpendThisMonth(now = Date.now()): Promise<number> {
  const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  let total = 0;
  for (const p of SUMMARY_PURPOSES) total += await spendSince(monthStart, p);
  return total;
}

/** One request to an official site, identified by the site's user agent. Never throws and never retries. */
const officialFetch: Fetcher = async (url, timeoutMs = 30_000) => {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/pdf;q=0.9,*/*;q=0.5" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store", redirect: "follow" });
    // A redirect that leaves the official sites is not followed into: the document counts as not found.
    if (res.url && !isOfficialUrl(res.url)) return { status: 404, error: "redirected away from the official site" };
    return { status: res.status, contentType: res.headers.get("content-type") ?? "", bytes: res.ok ? new Uint8Array(await res.arrayBuffer()) : undefined };
  } catch (error) { return { status: 0, error: (error instanceof Error ? error.message : "request failed").slice(0, 160) }; }
};

/** The model client: one Responses call, entered in the ledger under its Texas purpose by responseRequest(). */
function modelClient(key: string): TxModelClient {
  return async call => {
    const body: Record<string, unknown> = { instructions: call.instructions, input: call.input, max_output_tokens: call.maxOutputTokens, timeoutMs: call.timeoutMs,
      text: { format: { type: "json_schema", name: call.schemaName, strict: true, schema: call.schema } } };
    if (call.reasoning && call.reasoning !== "none") body.reasoning = { effort: call.reasoning };
    const meta = { purpose: call.purpose, refId: call.refId };
    let response;
    try { response = await responseRequest(key, call.model, body, meta); }
    catch (error) {
      // A model that does not take a reasoning setting answers 400; retry once without it (as the federal generator does).
      if (body.reasoning && error instanceof Error && /returned 400/.test(error.message)) { delete body.reasoning; response = await responseRequest(key, call.model, body, meta); }
      else throw error;
    }
    return { text: outputText(response).map(x => x.text ?? "").join(""), usage: response.usage };
  };
}

/** The tx_summar* tables as the store the generator writes through. */
export const texasSummaryStore: TxStore = {
  async countSummaries() { return Number((await getDb().select({ n: sql<number>`count(*)` }).from(txSummaries).get())?.n ?? 0); },
  async existingFor(billId): Promise<TxExisting | null> {
    const db = getDb();
    const r = await db.select().from(txSummaries).where(eq(txSummaries.billId, billId)).get();
    if (!r) return null;
    const attempts = Number((await db.select({ n: sql<number>`coalesce(max(${txSummaryChecks.attempt}), 0)` }).from(txSummaryChecks).where(eq(txSummaryChecks.summaryId, r.id)).get())?.n ?? 0);
    return { id: r.id, sequence: r.sequence, promptVersion: r.promptVersion, textVersion: r.textVersion, status: r.status, updatedAt: r.updatedAt, attemptsSoFar: attempts };
  },
  async save(rec: TxSummaryRecord) {
    const db = getDb(), now = Date.now(), v = { promptVersion: TX_PROMPT_VERSION, updatedAt: now };
    if (rec.rewriteOf) {
      // Keep what the summary said before, then rewrite the live row in place.
      const old = await db.select().from(txSummaries).where(eq(txSummaries.id, rec.id)).get();
      if (old) await db.insert(txSummaryVersions).values({ id: crypto.randomUUID(), summaryId: old.id, promptVersion: old.promptVersion, textVersion: old.textVersion,
        content: { summary: old, details: await db.select().from(txSummaryDetails).where(eq(txSummaryDetails.summaryId, old.id)).get() ?? null,
          structure: await db.select().from(txSummaryStructure).where(eq(txSummaryStructure.summaryId, old.id)).get() ?? null } as Record<string, unknown>,
        checkPassed: old.checkPassed, costUsd: old.costUsd, replacedAt: now });
      await db.update(txSummaries).set({ ...rec.content, eligibility: rec.eligibility.reasons, updatedAt: now, reviewedAt: null }).where(eq(txSummaries.id, rec.id));
    } else await db.insert(txSummaries).values({ id: rec.id, billId: rec.billId, sequence: rec.sequence, ...rec.content, eligibility: rec.eligibility.reasons, createdAt: now, updatedAt: now });
    const structure = { ...rec.structure, ...v }, details = { ...rec.details, ...v };
    await db.insert(txSummaryStructure).values({ summaryId: rec.id, ...structure }).onConflictDoUpdate({ target: txSummaryStructure.summaryId, set: structure });
    await db.insert(txSummaryDetails).values({ summaryId: rec.id, ...details }).onConflictDoUpdate({ target: txSummaryDetails.summaryId, set: details });
    for (const c of rec.checks) await db.insert(txSummaryChecks).values({ id: crypto.randomUUID(), summaryId: rec.id, attempt: c.attempt, passed: c.passed ? 1 : 0, failures: c.failures, warnings: c.warnings,
      metrics: c.metrics, repairs: c.repairs, model: c.model, costUsd: c.costUsd, promptVersion: TX_PROMPT_VERSION, createdAt: now });
    for (const t of rec.readerTests) await db.insert(txSummaryReaderTests).values({ id: crypto.randomUUID(), summaryId: rec.id, attempt: t.attempt, passed: t.passed ? 1 : 0, headline: t.headline, plainEnglish: t.plainEnglish,
      reader: t.reader as Record<string, unknown>, judge: t.judge as Record<string, unknown>, reasons: t.reasons, costUsd: t.costUsd, model: t.model, promptVersion: TX_PROMPT_VERSION, at: now });
    if (rec.route.queue) await db.insert(txSummaryReviewQueue).values({ id: crypto.randomUUID(), summaryId: rec.id, reason: rec.route.queue, createdAt: now })
      .onConflictDoUpdate({ target: txSummaryReviewQueue.summaryId, set: { reason: rec.route.queue, status: "open", decidedAt: null, note: rec.rewriteOf ? "rewritten" : null } });
    else await db.delete(txSummaryReviewQueue).where(and(eq(txSummaryReviewQueue.summaryId, rec.id), eq(txSummaryReviewQueue.status, "open")));
  },
};

export type TexasSummariesRun = TxRun | { status: "SKIPPED"; reason: string };

/**
 * The scheduled update calls this with whatever time is left (app/api/automation/tick/route.ts). It writes nothing
 * while paused, without a model key, when the monthly cap is reached, or when another run is in progress.
 * `primers`: approved Texas explainers to give the generator (lib/texas/primers.ts, when it exists); none by default.
 */
export async function runTexasSummaries({ budgetMs = 120_000, max, primers = [] }: { budgetMs?: number; max?: number; primers?: readonly Primer[] } = {}): Promise<TexasSummariesRun> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (texasSummariesPaused()) return { status: "SKIPPED", reason: "paused: set TEXAS_SUMMARIES_PAUSED=0 to run" };
  if (!key) return { status: "SKIPPED", reason: "OPENAI_API_KEY not set" };
  const db = getDb(), started = Date.now(), id = crypto.randomUUID(), limits = texasSummaryLimits();
  const busy = await db.select({ id: ingestRuns.id }).from(ingestRuns).where(and(eq(ingestRuns.job, "tx_summaries"), eq(ingestRuns.status, "RUNNING"), sql`${ingestRuns.startedAt} > ${started - 290_000}`)).get();
  if (busy) return { status: "SKIPPED", reason: "another Texas summary run is in progress" };
  const spent = await summariesSpendThisMonth(started);
  if (spent >= limits.spendCapUsd) return { status: "SKIPPED", reason: `spend cap reached ($${spent.toFixed(2)} of ANALYSIS_SPEND_CAP_USD $${limits.spendCapUsd}, federal and Texas together)` };
  await db.insert(ingestRuns).values({ id, job: "tx_summaries", status: "RUNNING", startedAt: started, detail: {} });
  let requests = 0, run: TxRun;
  try {
    const gather = async (c: TxCandidate): Promise<GatherOutcome> => {
      if (requests + 7 > limits.maxRequestsPerRun) return { ok: false, reason: "refused", detail: `this run's limit of ${limits.maxRequestsPerRun} requests to official sites was reached`, requests: 0 };
      const out = await gatherTxSources(c, { fetch: officialFetch, primers, paceMs: limits.paceMs, deadline: started + budgetMs });
      requests += out.ok ? out.gathered.requests : out.requests;
      return out;
    };
    run = await runTxBatch({ candidates: await texasCandidates(), gather, client: modelClient(key), store: texasSummaryStore, limits, spentThisMonth: spent, budgetMs, max, log: line => console.log(line) });
  } catch (error) {
    run = { status: "FAILED", made: [], skippedNoText: [], notEligible: 0, stoppedBy: "error", error: (error instanceof Error ? error.message : "Texas summaries failed").slice(0, 300), requests, ms: Date.now() - started };
  }
  await db.update(ingestRuns).set({ status: run.status === "SKIPPED" ? "COMPLETE" : run.status, finishedAt: Date.now(), detail: run as unknown as Record<string, unknown>, error: run.error ?? null })
    .where(eq(ingestRuns.id, id)).catch(() => undefined);
  return run;
}

/**
 * Everything a Texas bill page needs to show the summary, in the shape the federal page reads from summaryForBill()
 * (lib/analysis/queries.ts): { summary, checks, queue, details, structure }, plus the Texas extras.
 *
 * Readers get a summary only when it is visible (it passed every written rule and the average-reader test, or the
 * editor approved it after it was held) AND the Texas gate is open (TEXAS_SUMMARIES_PUBLIC in
 * lib/analysis/publish-gate.ts, closed today). The signed-in editor (includeHeld) also sees a held one, to be labelled
 * as held. A rejected summary is shown to no one.
 */
export async function txSummaryForPage(billId: string, includeHeld: boolean) {
  const db = getDb();
  const summary = await db.select().from(txSummaries).where(and(eq(txSummaries.billId, billId),
    includeHeld ? inArray(txSummaries.status, ["visible", "held"]) : and(eq(txSummaries.status, "visible"), TEXAS_SUMMARIES_PUBLIC ? sql`1 = 1` : sql`0 = 1`))).get();
  if (!summary) return null;
  const [checks, queue, details, structure, readerTest] = await Promise.all([
    db.select().from(txSummaryChecks).where(eq(txSummaryChecks.summaryId, summary.id)).orderBy(desc(txSummaryChecks.attempt)),
    db.select().from(txSummaryReviewQueue).where(eq(txSummaryReviewQueue.summaryId, summary.id)).get(),
    db.select().from(txSummaryDetails).where(eq(txSummaryDetails.summaryId, summary.id)).get(),
    db.select().from(txSummaryStructure).where(eq(txSummaryStructure.summaryId, summary.id)).get(),
    db.select({ passed: txSummaryReaderTests.passed, at: txSummaryReaderTests.at }).from(txSummaryReaderTests).where(eq(txSummaryReaderTests.summaryId, summary.id)).orderBy(desc(txSummaryReaderTests.attempt)).limit(1).get(),
  ]);
  const same = <T extends { promptVersion: string }>(x: T | undefined) => (x && x.promptVersion === summary.promptVersion ? x : null);
  const d = same(details);
  return { summary, checks, queue: queue ?? null,
    // The federal page reads details.background and details.backgroundSources; a Texas summary never has them.
    details: d ? { ...d, background: null as string | null, backgroundSources: [] as string[] } : null, structure: same(structure),
    /** The line to print where a side has no argument. The summary never writes one itself. */
    caseNotes: { for: txCaseNote("for", summary.caseFor.length > 0, d?.unread ?? []), against: txCaseNote("against", summary.caseAgainst.length > 0, d?.unread ?? []) },
    /** Official: the Legislative Budget Board fiscal note's own top line, its date and address, for a "Cost" section. */
    fiscal: d?.fiscal ?? null,
    /** Sources that could not be read when the summary was written (for the editor's preview). */
    missingSources: d?.notes ?? [],
    readerTest: readerTest ? { passed: readerTest.passed === 1, at: readerTest.at } : null,
    held: summary.status === "held" };
}
export type TxSummaryForPage = NonNullable<Awaited<ReturnType<typeof txSummaryForPage>>>;

/** The editor's decision on a held or sampled Texas summary: approve shows it (subject to the Texas gate), reject hides it for good. */
export async function decideTxSummary(summaryId: string, decision: "approved" | "rejected", reviewerKey: string, note?: string) {
  const db = getDb(), now = Date.now();
  await db.update(txSummaries).set({ status: decision === "approved" ? "visible" : "rejected", reviewedAt: now }).where(eq(txSummaries.id, summaryId));
  await db.update(txSummaryReviewQueue).set({ status: decision, decidedAt: now, reviewerKey, note: note?.slice(0, 500) ?? null }).where(eq(txSummaryReviewQueue.summaryId, summaryId));
}

/** Counts and spend for the health probe and the editor's pages. No bill text, no summary text. */
export async function txSummaryCounts() {
  const db = getDb();
  const [byStatus, open, last, spend] = await Promise.all([
    db.select({ status: txSummaries.status, n: sql<number>`count(*)`, usd: sql<number>`coalesce(sum(${txSummaries.costUsd}), 0)` }).from(txSummaries).groupBy(txSummaries.status),
    db.select({ n: sql<number>`count(*)` }).from(txSummaryReviewQueue).where(eq(txSummaryReviewQueue.status, "open")).get(),
    db.select().from(ingestRuns).where(eq(ingestRuns.job, "tx_summaries")).orderBy(desc(ingestRuns.startedAt)).limit(1).get(),
    db.select({ usd: sql<number>`coalesce(sum(cost_usd), 0)`, calls: sql<number>`count(*)` }).from(sql`model_calls`).where(sql`purpose in ('tx_analysis', 'tx_reader_test')`).get(),
  ]);
  const count = (s: string) => Number(byStatus.find(r => r.status === s)?.n ?? 0), limits = texasSummaryLimits();
  const detail = (last?.detail ?? {}) as { stoppedBy?: string | null; made?: unknown[] };
  return { written: byStatus.reduce((n, r) => n + Number(r.n), 0), visible: count("visible"), held: count("held"), rejected: count("rejected"), openReviews: Number(open?.n ?? 0),
    limit: limits.maxSummaries, paused: texasSummariesPaused(), readersSeeThem: TEXAS_SUMMARIES_PUBLIC, generator: TX_PROMPT_VERSION,
    callsUsd: Math.round(Number(spend?.usd ?? 0) * 10000) / 10000, calls: Number(spend?.calls ?? 0),
    lastRun: last ? { status: last.status, startedAt: new Date(last.startedAt).toISOString(), made: Array.isArray(detail.made) ? detail.made.length : 0, stoppedBy: detail.stoppedBy ?? null } : null };
}

/**
 * The first-template query, kept only so the existing Texas bill page still compiles until it reads
 * txSummaryForPage(). Old-format rows are never shown, so this always answers null.
 * @deprecated use txSummaryForPage
 */
export async function txSummaryFor(billId: string, includeHeld: boolean): Promise<typeof txBillSummaries.$inferSelect | null> {
  void billId; void includeHeld;
  return null;
}
