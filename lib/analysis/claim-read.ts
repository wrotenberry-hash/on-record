import { outputText, responseRequest } from "@/lib/automated-research";
import { callCost, priceTable } from "@/lib/model-cost";
import { claimFailures, EXTRACT_INSTRUCTIONS, FACTS_SCHEMA, READ_INSTRUCTIONS, READ_SCHEMA, readingInput, type Fact, type ReadProblem } from "./facts.ts";
import type { Part } from "./tiers.ts";

/**
 * The two model calls of "facts first" (owner, 20 Nov 2026): one makes the list of facts before anything is written,
 * one reads a draft against that list claim by claim. What each is told, and everything a program can decide about
 * the answers, is in lib/analysis/facts.ts. Both are counted under the summaries cap (purpose "analysis").
 */
async function ask<T>(key: string, model: string, reasoning: string, name: string, instructions: string, input: string, schema: unknown, refId: string, maxOutputTokens: number, timeoutMs: number) {
  const body: Record<string, unknown> = { instructions, input, max_output_tokens: maxOutputTokens, timeoutMs, text: { format: { type: "json_schema", name, strict: true, schema } } };
  if (reasoning !== "none") body.reasoning = { effort: reasoning };
  let response;
  try { response = await responseRequest(key, model, body, { purpose: "analysis", refId }); }
  catch (error) {
    // A model that does not take a reasoning setting answers 400; retry once without it.
    if (body.reasoning && error instanceof Error && /returned 400/.test(error.message)) { delete body.reasoning; response = await responseRequest(key, model, body, { purpose: "analysis", refId }); }
    else throw error;
  }
  return { value: JSON.parse(outputText(response).map(x => x.text ?? "").join("")) as T, cost: callCost(model, response.usage, 0, priceTable(process.env.OPENAI_PRICES_JSON)) };
}

/** The facts a summary may use, each with the exact words of its source, as the model lists them. Nothing is trusted until verifiedFacts has checked the passages. */
export async function extractFacts(key: string, model: string, reasoning: string, refId: string, sourcesText: string, timeoutMs: number) {
  const r = await ask<{ facts: Fact[] }>(key, model, reasoning, "bill_facts", EXTRACT_INSTRUCTIONS, sourcesText, FACTS_SCHEMA, refId, 9000, timeoutMs);
  const facts = (Array.isArray(r.value.facts) ? r.value.facts : []).map(f => ({ id: String(f.id ?? ""), fact: String(f.fact ?? ""), source: String(f.source ?? ""), passage: String(f.passage ?? ""),
    qualifier: String(f.qualifier ?? ""), exactWords: Array.isArray(f.exactWords) ? f.exactWords.map(String) : [], speaker: String(f.speaker ?? "") }));
  return { facts, cost: r.cost };
}

/** Reads the named parts of a draft against the facts list. Returns, for each part read, its problems as check messages. */
export async function readClaims(key: string, model: string, reasoning: string, refId: string, draft: Record<string, unknown>, facts: readonly Fact[], parts: readonly Part[], timeoutMs: number) {
  const r = await ask<{ problems: ReadProblem[]; coreWrong: boolean; coreWrongWhy: string }>(key, model, reasoning, "claim_reading", READ_INSTRUCTIONS, readingInput(draft, facts, parts), READ_SCHEMA, refId, 5000, timeoutMs);
  const problems = Array.isArray(r.value.problems) ? r.value.problems : [];
  return { byPart: claimFailures(problems, parts), problems: problems.length, coreWrong: r.value.coreWrong === true, coreWrongWhy: String(r.value.coreWrongWhy ?? ""), cost: r.cost };
}
