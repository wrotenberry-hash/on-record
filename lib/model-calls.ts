import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { modelCalls } from "@/db/schema";
import { callCost, priceTable, DEFAULT_WEB_SEARCH_PER_CALL, type Usage } from "@/lib/model-cost";

const prices = () => priceTable(process.env.OPENAI_PRICES_JSON);
const perSearch = () => { const n = Number(process.env.OPENAI_WEB_SEARCH_PER_CALL_USD); return Number.isFinite(n) && n >= 0 && process.env.OPENAI_WEB_SEARCH_PER_CALL_USD ? n : DEFAULT_WEB_SEARCH_PER_CALL; };

/** One row per OpenAI call (billed or refused). Returns the priced cost. */
export async function recordModelCall(c: { model: string; purpose: string; refId: string | null; usage?: Usage; webSearchCalls: number; responseId: string | null; error: string | null }) {
  const cost = callCost(c.model, c.usage, c.webSearchCalls, prices(), perSearch());
  await getDb().insert(modelCalls).values({ id: crypto.randomUUID(), purpose: c.purpose, model: c.model, refId: c.refId,
    inputTokens: cost.inputTokens, cachedInputTokens: cost.cachedInputTokens, outputTokens: cost.outputTokens, webSearchCalls: c.webSearchCalls,
    costUsd: cost.usd, responseId: c.responseId, error: c.error?.slice(0, 200) ?? null, createdAt: Date.now() });
  return cost;
}

export async function spendSince(since: number, purpose?: string): Promise<number> {
  const row = await getDb().select({ usd: sql<number>`coalesce(sum(${modelCalls.costUsd}), 0)` }).from(modelCalls)
    .where(purpose ? and(gte(modelCalls.createdAt, since), eq(modelCalls.purpose, purpose)) : gte(modelCalls.createdAt, since)).get();
  return Number(row?.usd ?? 0);
}

/** Month-to-date style breakdown: priced spend and call count per purpose since `since`. */
export async function spendByPurposeSince(since: number): Promise<Record<string, { usd: number; calls: number }>> {
  const rows = await getDb().select({ purpose: modelCalls.purpose, usd: sql<number>`coalesce(sum(${modelCalls.costUsd}), 0)`, calls: sql<number>`count(*)` })
    .from(modelCalls).where(gte(modelCalls.createdAt, since)).groupBy(modelCalls.purpose);
  return Object.fromEntries(rows.map(r => [r.purpose, { usd: Math.round(Number(r.usd) * 10000) / 10000, calls: Number(r.calls) }]));
}

/** When OpenAI last answered a call without error, or null. A billing refusal older than this is over. */
export async function lastSuccessfulCallAt(): Promise<number | null> {
  const row = await getDb().select({ at: sql<number | null>`max(${modelCalls.createdAt})` }).from(modelCalls).where(sql`${modelCalls.error} is null`).get();
  return row?.at ? Number(row.at) : null;
}

export async function lastBillingRefusal(since: number): Promise<{ at: number; code: string } | null> {
  const row = await getDb().select({ at: modelCalls.createdAt, error: modelCalls.error }).from(modelCalls)
    .where(and(gte(modelCalls.createdAt, since), sql`${modelCalls.error} like 'billing:%'`)).orderBy(sql`${modelCalls.createdAt} desc`).limit(1).get();
  return row ? { at: row.at, code: String(row.error).slice(8) } : null;
}
