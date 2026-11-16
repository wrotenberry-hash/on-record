import { and, eq, isNull, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { billCategories, categorySuggestions, ingestRuns, officialBills } from "@/db/schema";
import { outputText, responseRequest } from "@/lib/automated-research";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";
import { billLabel } from "@/components/federal/badges";
import { billStatusUrl, parseBillStatus } from "@/lib/analysis/billtext";
import { callCost, priceTable } from "@/lib/model-cost";
import { decideSuggestion } from "@/lib/analysis/classify-rules";

/**
 * AI issue suggestions for bills Congress.gov has not given a policy area
 * (owner request, Round 2). One small model call per bill, from the title, the
 * latest action and the CRS summary when there is one. Applied suggestions are
 * stored with method "ai" and their confidence, and labelled "Sorted by AI".
 */
const SLUGS = ISSUE_CATEGORIES.map(c => c.slug);
const schema = { type: "object", additionalProperties: false, required: ["category", "confidence", "rationale"], properties: {
  category: { type: "string", enum: [...SLUGS, "none"] }, confidence: { type: "number" }, rationale: { type: "string" } } };
const shape = z.object({ category: z.string(), confidence: z.number(), rationale: z.string() });
const INSTRUCTIONS = `Sort one U.S. bill into at most one of these issues, or "none" if no issue clearly fits: ${ISSUE_CATEGORIES.map(c => `${c.slug} (${c.name})`).join(", ")}.
Judge only what the bill is about, never whether it is good. Use only the material given. confidence is your probability (0 to 1) that a careful editor would pick the same issue; use "none" with high confidence for ceremonial or commemorative measures that fit no issue. rationale: one short neutral sentence.`;

const USER_AGENT = "OnRecord/0.2 (+https://on-record-wrotenberry.vercel.app)";

export type ClassifyRun = { status: "COMPLETE" | "PARTIAL" | "FAILED" | "SKIPPED"; done: number; applied: number; queued: number; noFit: number; costUsd: number; stoppedBy: string | null; error?: string };

export async function runClassifyBatch({ budgetMs, max = 40 }: { budgetMs: number; max?: number }): Promise<ClassifyRun> {
  const started = Date.now(), deadline = started + budgetMs, db = getDb();
  const key = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_SUMMARY_MODEL?.trim() || process.env.OPENAI_EXTRACT_MODEL?.trim() || "gpt-5.4-mini";
  const run: ClassifyRun = { status: "COMPLETE", done: 0, applied: 0, queued: 0, noFit: 0, costUsd: 0, stoppedBy: null };
  if (!key) return { ...run, status: "SKIPPED", stoppedBy: "OPENAI_API_KEY not set" };
  const hasCategory = db.select({ one: sql`1` }).from(billCategories).where(eq(billCategories.billId, officialBills.id));
  const hasSuggestion = db.select({ one: sql`1` }).from(categorySuggestions).where(eq(categorySuggestions.billId, officialBills.id));
  const due = await db.select({ id: officialBills.id, congress: officialBills.congress, billType: officialBills.billType, number: officialBills.number,
    title: officialBills.title, latestActionText: officialBills.latestActionText })
    .from(officialBills).where(and(eq(officialBills.detailStatus, "complete"), isNull(officialBills.policyArea), notExists(hasCategory), notExists(hasSuggestion)))
    .limit(max);
  if (!due.length) return { ...run, status: "SKIPPED", stoppedBy: "no unsorted bill without a suggestion" };
  const id = crypto.randomUUID();
  await db.insert(ingestRuns).values({ id, job: "classify", status: "RUNNING", startedAt: started, detail: { due: due.length } });
  const table = priceTable(process.env.OPENAI_PRICES_JSON);
  try {
    for (const b of due) {
      if (Date.now() + 20_000 > deadline) { run.stoppedBy = "time budget"; run.status = "PARTIAL"; break; }
      let crs: string | null = null;
      try {
        const res = await fetch(billStatusUrl(b.congress, b.billType, b.number), { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
        if (res.ok) crs = parseBillStatus(await res.text()).crsSummary;
      } catch { /* the title is enough to try */ }
      const input = [`Bill: ${billLabel(b.billType, b.number)}. Title: ${b.title}`, b.latestActionText ? `Latest action: ${b.latestActionText}` : "",
        crs ? `Official CRS summary: ${crs.slice(0, 3000)}` : "No CRS summary yet."].filter(Boolean).join("\n");
      const response = await responseRequest(key, model, { instructions: INSTRUCTIONS, input, max_output_tokens: 1200, reasoning: { effort: "low" }, timeoutMs: 40_000,
        text: { format: { type: "json_schema", name: "on_record_issue", strict: true, schema } } }, { purpose: "classify", refId: b.id });
      const parsed = shape.parse(JSON.parse(outputText(response).map(x => x.text ?? "").join("")));
      const category = SLUGS.includes(parsed.category as typeof SLUGS[number]) ? parsed.category : null;
      const confidence = Math.max(0, Math.min(1, parsed.confidence));
      const status = decideSuggestion(category, confidence);
      const cost = callCost(model, response.usage, 0, table).usd;
      await db.insert(categorySuggestions).values({ billId: b.id, categorySlug: category, confidence, rationale: parsed.rationale.slice(0, 300), model, costUsd: cost, status, createdAt: Date.now() });
      if (status === "applied") await db.insert(billCategories).values({ billId: b.id, categorySlug: category!, method: "ai", confidence, createdAt: Date.now() }).onConflictDoNothing();
      run.done++; run.costUsd += cost;
      if (status === "applied") run.applied++; else if (status === "queued") run.queued++; else run.noFit++;
    }
  } catch (error) {
    run.status = run.done ? "PARTIAL" : "FAILED"; run.stoppedBy = "error"; run.error = (error instanceof Error ? error.message : "classify failed").slice(0, 200);
  }
  run.costUsd = Math.round(run.costUsd * 10000) / 10000;
  await db.update(ingestRuns).set({ status: run.status === "SKIPPED" ? "COMPLETE" : run.status, finishedAt: Date.now(), detail: run, error: run.error ?? null }).where(eq(ingestRuns.id, id));
  return run;
}

/** Editor decision on a queued suggestion: approve applies it (method "editor"), reject records that it does not fit. */
export async function decideCategorySuggestion(billId: string, approve: boolean, categorySlug?: string | null) {
  const db = getDb(), now = Date.now();
  const row = await db.select().from(categorySuggestions).where(eq(categorySuggestions.billId, billId)).get();
  if (!row) return;
  const slug = categorySlug && SLUGS.includes(categorySlug as typeof SLUGS[number]) ? categorySlug : row.categorySlug;
  if (approve && slug) {
    await db.insert(billCategories).values({ billId, categorySlug: slug, method: "editor", confidence: row.confidence, createdAt: now }).onConflictDoNothing();
    await db.update(categorySuggestions).set({ status: "approved", categorySlug: slug, decidedAt: now }).where(eq(categorySuggestions.billId, billId));
  } else await db.update(categorySuggestions).set({ status: "rejected", decidedAt: now }).where(eq(categorySuggestions.billId, billId));
}

export async function queuedSuggestions() {
  return getDb().select({ s: categorySuggestions, title: officialBills.title, billType: officialBills.billType, number: officialBills.number })
    .from(categorySuggestions).innerJoin(officialBills, eq(officialBills.id, categorySuggestions.billId))
    .where(eq(categorySuggestions.status, "queued")).orderBy(categorySuggestions.confidence).limit(60);
}

export async function suggestionCounts() {
  const rows = await getDb().select({ status: categorySuggestions.status, n: sql<number>`count(*)`, usd: sql<number>`coalesce(sum(${categorySuggestions.costUsd}), 0)` })
    .from(categorySuggestions).groupBy(categorySuggestions.status);
  return Object.fromEntries(rows.map(r => [r.status, { bills: Number(r.n), usd: Math.round(Number(r.usd) * 10000) / 10000 }]));
}
