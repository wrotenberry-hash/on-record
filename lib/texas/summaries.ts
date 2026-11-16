import { analysisPaused, PUBLIC_MIN_PROMPT } from "@/lib/analysis/publish-gate";
import { and, desc, eq, notExists, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { txBills, txBillSponsors, txBillSummaries, txBillVersions } from "@/db/schema";
import { analysisLimits, draftOnce, PROMPT_VERSION } from "@/lib/analysis/generate";
import { MAX_TEXT_CHARS, parseBillTextHtml } from "@/lib/analysis/billtext";
import { checkSummary, routeSummary } from "@/lib/analysis/checker";
import { maxCallCost, priceTable } from "@/lib/model-cost";
import { spendSince } from "@/lib/model-calls";
import { TX_SESSIONS } from "@/lib/texas/parse";

/**
 * Round H: Texas bill summaries in the same template as federal ones (same
 * instructions, same schema, same rule checker, same monthly $25 cap). Text
 * comes from Texas Legislature Online. A summary that fails the checker or has
 * low confidence is held for the editor; 1 in 5 is held for the audit sample.
 */
const UA = "OnRecord/0.2 (+https://on-record-wrotenberry.vercel.app)";

export async function runTexasSummaries({ budgetMs = 120_000, max = 3 }: { budgetMs?: number; max?: number } = {}) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (analysisPaused()) return { status: "SKIPPED", reason: "paused by the owner (16 Nov) while the generator is rebuilt" };
  if (!key) return { status: "SKIPPED", reason: "OPENAI_API_KEY not set" };
  const db = getDb(), deadline = Date.now() + budgetMs, limits = analysisLimits(), table = priceTable(process.env.OPENAI_PRICES_JSON);
  const monthStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
  let spent = await spendSince(monthStart, "analysis");
  const has = db.select({ one: sql`1` }).from(txBillSummaries).where(eq(txBillSummaries.billId, txBills.id));
  // Bills past filing first (they are moving), then the newest filed, each with a text version on TLO.
  const due = await db.select({ id: txBills.id, identifier: txBills.identifier, title: txBills.title, session: txBills.session, stage: txBills.stage, latest: txBills.latestActionDescription,
    url: sql<string | null>`(select v.url from tx_bill_versions v where v.bill_id = ${txBills.id} and v.url is not null order by v.date desc limit 1)`,
    note: sql<string | null>`(select v.note from tx_bill_versions v where v.bill_id = ${txBills.id} and v.url is not null order by v.date desc limit 1)` })
    .from(txBills).where(and(notExists(has), sql`exists (select 1 from ${txBillVersions} v where v.bill_id = ${txBills.id} and v.url is not null)`))
    .orderBy(sql`case ${txBills.stage} when 'filed' then 1 else 0 end`, desc(txBills.latestActionDate)).limit(max * 3);
  const made: Array<{ billId: string; status: string; cost: number; passed: boolean }> = [];
  for (const b of due) {
    if (made.length >= max || Date.now() + 60_000 > deadline || !b.url) break;
    if (spent >= limits.spendCapUsd) return { status: "SKIPPED", reason: `spend cap $${limits.spendCapUsd} reached`, made };
    let html = "";
    try { const r = await fetch(b.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000), cache: "no-store" }); if (r.ok) html = await r.text(); } catch { /* next bill */ }
    if (!html) continue;
    const parsed = parseBillTextHtml(html), truncated = parsed.chars > MAX_TEXT_CHARS;
    const sponsors = (await db.select({ name: txBillSponsors.name }).from(txBillSponsors).where(eq(txBillSponsors.billId, b.id))).map(s => s.name);
    const session = TX_SESSIONS.find(s => s.id === b.session);
    const input = [`This is a Texas state bill, not a U.S. federal bill: ${b.identifier}, ${session?.name ?? `session ${b.session}`}. Official caption: ${b.title}`,
      sponsors.length ? `Authors: ${sponsors.slice(0, 6).join(", ")}` : "Authors: not recorded", b.latest ? `Latest action: ${b.latest}` : "",
      `Text version: ${b.note ?? "latest"} (Texas Legislature Online).`, "Cost: a Legislative Budget Board fiscal note may exist; its amount is not provided here.",
      `Section list: ${parsed.sections.length ? parsed.sections.map(s => `Sec. ${s.num} ${s.heading}`).join(" | ") : "(no numbered sections)"}`,
      truncated ? `Bill text (first ${MAX_TEXT_CHARS} characters only; the rest was cut, so confidence cannot be high):` : "Bill text:", parsed.text.slice(0, MAX_TEXT_CHARS)].filter(Boolean).join("\n\n");
    const worst = maxCallCost(limits.model, input.length, 4000, table);
    if (spent + worst > limits.spendCapUsd) break;
    const id = crypto.randomUUID();
    let draft, cost = 0;
    try { const r = await draftOnce(key, limits.model, limits.reasoning, id, input, 100_000); draft = r.draft; cost = r.cost.usd; }
    catch (error) { const m = error instanceof Error ? error.message : ""; if (/billing or usage limit/i.test(m)) return { status: "STOPPED", reason: "billing refused", made }; continue; }
    spent += cost;
    const check = checkSummary(draft, parsed.sections, { truncated });
    const sequence = Number((await db.select({ n: sql<number>`count(*)` }).from(txBillSummaries).get())?.n ?? 0);
    const route = routeSummary({ checkPassed: check.passed, confidence: draft.confidence, sequenceIndex: sequence });
    await db.insert(txBillSummaries).values({ id, billId: b.id, textUrl: b.url, textLabel: b.note ?? "latest", truncated: truncated ? 1 : 0, headline: draft.headline, whatItDoes: draft.whatItDoes,
      whoItAffects: draft.whoItAffects, whatChangesForYou: draft.whatChangesForYou, caseFor: draft.caseFor, caseAgainst: draft.caseAgainst, unknowns: draft.unknowns, confidence: draft.confidence,
      confidenceReason: draft.confidenceReason, checkPassed: check.passed ? 1 : 0, failures: check.failures, readingGrade: check.metrics.readingGrade, status: route.status, model: limits.model,
      promptVersion: PROMPT_VERSION, costUsd: Math.round(cost * 1e6) / 1e6, createdAt: Date.now() }).onConflictDoNothing();
    made.push({ billId: b.id, status: route.status, cost: Math.round(cost * 10000) / 10000, passed: check.passed });
  }
  return { status: "COMPLETE", made };
}

export async function txSummaryFor(billId: string, includeHeld: boolean) {
  const row = await getDb().select().from(txBillSummaries).where(eq(txBillSummaries.billId, billId)).get();
  return row && ((row.status === "visible" && PUBLIC_MIN_PROMPT !== null) || includeHeld) ? row : null; // owner pause, 16 Nov
}
