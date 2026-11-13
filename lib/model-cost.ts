/**
 * Dollar cost of one OpenAI Responses call, from the token usage the API
 * returns. Pure, tested in tests/analysis.test.mjs.
 *
 * Prices are US dollars per 1M tokens, standard tier, as listed on 2026-11-13.
 * OpenAI's own pricing page could not be read from the build machine; these
 * figures were cross-checked against several third-party listings. Override
 * any of them without a deploy of code by setting OPENAI_PRICES_JSON in Vercel,
 * e.g. {"gpt-5.4-mini":{"input":0.75,"cachedInput":0.075,"output":4.5}}.
 * Every call also stores its raw token counts, so a corrected price can be
 * applied to past calls.
 */
export type Price = { input: number; cachedInput: number; output: number };
export const DEFAULT_PRICES: Record<string, Price> = {
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
};
/** Web search tool: $10 per 1,000 calls. */
export const DEFAULT_WEB_SEARCH_PER_CALL = 0.01;
/** Unknown model: price it like the most expensive one listed rather than as free. */
const FALLBACK: Price = { input: 5, cachedInput: 0.5, output: 30 };

export type Usage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };

export function priceTable(json: string | undefined | null): Record<string, Price> {
  if (!json?.trim()) return DEFAULT_PRICES;
  try {
    const parsed = JSON.parse(json) as Record<string, Partial<Price>>;
    const out: Record<string, Price> = { ...DEFAULT_PRICES };
    for (const [model, p] of Object.entries(parsed)) {
      if ([p.input, p.output].every(v => typeof v === "number" && v >= 0)) out[model] = { input: p.input!, output: p.output!, cachedInput: typeof p.cachedInput === "number" ? p.cachedInput : p.input! };
    }
    return out;
  } catch { return DEFAULT_PRICES; }
}

/** Dated model ids ("gpt-5.4-mini-2026-03-17") price as their family. */
export function priceFor(model: string, table: Record<string, Price> = DEFAULT_PRICES): Price {
  if (table[model]) return table[model];
  const family = Object.keys(table).sort((a, b) => b.length - a.length).find(k => model.startsWith(`${k}-`));
  return family ? table[family] : FALLBACK;
}

export function callCost(model: string, usage: Usage | undefined, webSearchCalls = 0, table: Record<string, Price> = DEFAULT_PRICES, perSearch = DEFAULT_WEB_SEARCH_PER_CALL) {
  const p = priceFor(model, table);
  const input = Number(usage?.input_tokens ?? 0), output = Number(usage?.output_tokens ?? 0);
  const cached = Math.min(input, Number(usage?.input_tokens_details?.cached_tokens ?? 0));
  const usd = ((input - cached) * p.input + cached * p.cachedInput + output * p.output) / 1_000_000 + webSearchCalls * perSearch;
  return { usd: Math.round(usd * 1_000_000) / 1_000_000, inputTokens: input, cachedInputTokens: cached, outputTokens: output };
}

/** Worst case for a call not yet made: every input token uncached and the full output allowance used. */
export function maxCallCost(model: string, inputChars: number, maxOutputTokens: number, table: Record<string, Price> = DEFAULT_PRICES) {
  const p = priceFor(model, table);
  return (Math.ceil(inputChars / 3) * p.input + maxOutputTokens * p.output) / 1_000_000;
}
