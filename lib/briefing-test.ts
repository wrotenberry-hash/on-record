import { createHash } from "node:crypto";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisBillSummaries } from "@/db/schema";
import { responseRequest, outputText } from "@/lib/automated-research";
import { callCost, priceTable } from "@/lib/model-cost";
import { summarySpendSince } from "@/lib/model-calls";
import { analysisLimits } from "@/lib/analysis/generate";
import { readerVisible } from "@/lib/analysis/publish-gate";
import { summaryForBill } from "@/lib/analysis/queries";
import { getCursor, setCursor } from "@/lib/federal/ingest";
import { inlineFromSummary, inlineProblems, INLINE_VERSION, type InlineText } from "@/lib/briefing-inline";

/**
 * The average-reader test for a briefing item (owner, 20 Nov 2026: "Each inline item must pass the average-reader test
 * on its own, with no knowledge of the full page assumed").
 *
 * A reader sees the item's three lines and nothing else, and says how things work today and what would change. A
 * second reading compares those answers with the approved summary. An item is shown inline only after it has passed;
 * the result is kept per summary and per wording, so an item is tested once and again only if its words change.
 * The calls are counted with the summaries' reader tests, inside the same monthly cap; no new limit and no new table
 * (results sit in the existing key-value store).
 */
export type InlineTest = { v: string; hash: string; passed: boolean; reasons: string[]; by: "rules" | "reader"; at: number };
const KEY = (summaryId: string) => `brief:test:${summaryId}`;
export const inlineHash = (t: InlineText) => createHash("sha256").update(`${INLINE_VERSION}\n${t.headline}\n${t.today}\n${t.thisBill}`).digest("hex").slice(0, 24);

/** The stored result for this summary's item, if it was made for exactly these words. */
export async function inlineTestFor(summaryId: string, t: InlineText): Promise<InlineTest | null> {
  const raw = await getCursor(getDb(), KEY(summaryId)).catch(() => null);
  if (!raw) return null;
  try { const r = JSON.parse(raw) as InlineTest; return r.v === INLINE_VERSION && r.hash === inlineHash(t) ? r : null; } catch { return null; }
}

const READER = `You are an ordinary adult with no legal or political training. You are shown one short item from a daily briefing about a bill. You see nothing else about the bill.

Answer from the item alone, in your own everyday words, one or two sentences each:
- howItWorksToday: how do things work today, before this bill?
- whatWouldChange: what exactly would change if this bill passed?
- wordsNotUnderstood: any word or phrase in the item you did not understand (an empty list if none).
- namesNotExplained: look at the FIRST LINE only (the headline). List any named group, tribe, place, organization, program or special term in it that the first line itself does not explain and that most adults would not already know. Names nearly everyone knows (Congress, the Senate, a U.S. state, the National Mall, Social Security, the Army) do not count. An empty list if none.
If the item does not tell you, answer exactly "It doesn't say." Do not guess.`;
const JUDGE = `You check whether a reader understood a short briefing item about a bill. You are given the fuller approved summary the item was cut from, and the reader's two answers. The reader saw only the item.

For each answer give a verdict:
- "correct": it says what the summary says, with the specifics the item gave (the amount, the group, the rule).
- "vague": it is roughly right but loses the specifics, or the reader could not tell.
- "wrong": it says something the summary does not, or the opposite.
Give one short reason for each.`;
const verdict = { type: "object", additionalProperties: false, required: ["verdict", "why"], properties: { verdict: { type: "string", enum: ["correct", "wrong", "vague"] }, why: { type: "string" } } };
const READER_SCHEMA = { type: "object", additionalProperties: false, required: ["howItWorksToday", "whatWouldChange", "wordsNotUnderstood", "namesNotExplained"],
  properties: { howItWorksToday: { type: "string" }, whatWouldChange: { type: "string" }, wordsNotUnderstood: { type: "array", items: { type: "string" } }, namesNotExplained: { type: "array", items: { type: "string" } } } };
const JUDGE_SCHEMA = { type: "object", additionalProperties: false, required: ["howItWorksToday", "whatWouldChange"], properties: { howItWorksToday: verdict, whatWouldChange: verdict } };

type Ask = (name: string, instructions: string, input: string, schema: unknown, refId: string) => Promise<{ text: string; costUsd: number }>;
const askModel: Ask = async (name, instructions, input, schema, refId) => {
  const key = process.env.OPENAI_API_KEY?.trim() || "", model = analysisLimits().model;
  if (!key) throw Error("no model key");
  const response = await responseRequest(key, model, { instructions, input, max_output_tokens: 900, timeoutMs: 60_000, text: { format: { type: "json_schema", name, strict: true, schema } } }, { purpose: "reader_test", refId });
  return { text: outputText(response).map(x => x.text ?? "").join(""), costUsd: callCost(model, response.usage, 0, priceTable(process.env.OPENAI_PRICES_JSON)).usd };
};

/** What the reader is shown: the three lines, as on the page. Where it stands and the legislators' votes are facts from the record, not part of the test. */
export const readerItem = (t: InlineText) => `${t.headline}\nToday: ${t.today}\nThis bill: ${t.thisBill}`;

/** Why the reader's answers fail the item (empty when it passes). Pure. */
export function readerVerdict(reader: { howItWorksToday?: string; whatWouldChange?: string; wordsNotUnderstood?: string[]; namesNotExplained?: string[] } | null,
  judge: { howItWorksToday?: { verdict?: string; why?: string }; whatWouldChange?: { verdict?: string; why?: string } } | null, headline = ""): string[] {
  if (!reader || !judge) return ["The reader test gave no usable answer."];
  const out: string[] = [];
  for (const [name, k] of [["how things work today", "howItWorksToday"], ["what would change", "whatWouldChange"]] as const) {
    const v = judge[k]?.verdict;
    if (v !== "correct") out.push(`A reader of the item alone got ${name} ${v === "wrong" ? "wrong" : "only roughly"}: ${(judge[k]?.why ?? "").slice(0, 160)}`);
  }
  const words = (reader.wordsNotUnderstood ?? []).map(w => w.trim()).filter(Boolean);
  if (words.length) out.push(`Words a reader did not understand: ${words.slice(0, 5).join(", ")}.`);
  // Owner, 20 Nov 2026: "A headline must make sense alone: say who or what a named group is … and avoid unexplained terms."
  // 20 Nov 2026, first run of this rule: the test reader also listed names from the other lines ("Forest Service") and U.S. states
  // ("California"). Only a name that is in the headline itself counts, and a state is a name everyone knows.
  const STATES = /^(?:alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|puerto rico|america|united states)$/i;
  const names = (reader.namesNotExplained ?? []).map(w => w.trim()).filter(w => w && !STATES.test(w) && (!headline || headline.toLowerCase().includes(w.toLowerCase())));
  if (names.length) out.push(`The headline does not make sense alone: it names ${names.slice(0, 4).join(", ")} without saying what that is.`);
  return out;
}

const monthStart = (now: number) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const WORST_CASE_USD = 0.06;

/**
 * Tests the items of approved summaries that have no result for their current words, newest first, a few a run, and
 * only while the summaries' monthly cap has room. An item that breaks a written rule is recorded as failed without a
 * model call. Stops starting new tests when the run's time is up; the rest wait for the next run. Returns counts and
 * the bills tested.
 */
export async function runInlineTests(now = Date.now(), o: { max?: number; ask?: Ask; budgetMs?: number } = {}) {
  const db = getDb(), ask = o.ask ?? askModel, cap = analysisLimits().spendCapUsd, max = o.max ?? 8, stopAt = Date.now() + (o.budgetMs ?? 200_000);
  const rows = await db.select({ id: analysisBillSummaries.id, billId: analysisBillSummaries.billId }).from(analysisBillSummaries).where(readerVisible()).orderBy(desc(analysisBillSummaries.createdAt)).limit(60);
  const out = { tested: [] as Array<{ billId: string; passed: boolean; by: string }>, alreadyTested: 0, noInlineText: 0, stoppedBy: null as string | null, costUsd: 0 };
  let spent = await summarySpendSince(monthStart(now)).catch(() => cap);
  for (const r of rows) {
    if (out.tested.length >= max) { out.stoppedBy = `${max} a run`; break; }
    const s = await summaryForBill(r.billId, false).catch(() => null);
    const text = s?.structure ? inlineFromSummary({ headline: s.summary.headline, changes: s.structure.changes, howItWorksToday: s.structure.howItWorksToday }) : null;
    if (!s || !text) { out.noInlineText++; continue; }
    if (await inlineTestFor(s.summary.id, text)) { out.alreadyTested++; continue; }
    const save = async (passed: boolean, reasons: string[], by: InlineTest["by"]) => {
      await setCursor(db, KEY(s.summary.id), JSON.stringify({ v: INLINE_VERSION, hash: inlineHash(text), passed, reasons: reasons.slice(0, 6), by, at: now } satisfies InlineTest));
      out.tested.push({ billId: r.billId, passed, by });
    };
    const rules = inlineProblems(text);
    if (rules.length) { await save(false, rules, "rules"); continue; }
    if (spent + WORST_CASE_USD > cap) { out.stoppedBy = "the summaries' monthly cap"; break; }
    if (Date.now() > stopAt) { out.stoppedBy = "the time allowed for one run"; break; }
    try {
      const a = await ask("briefing_item_reader", READER, readerItem(text), READER_SCHEMA, s.summary.id);
      const fuller = [s.summary.headline, ...s.structure!.howItWorksToday.map(p => `Today: ${p.text}`), ...s.structure!.changes.map(c => `${c.label ? `${c.label}. ` : ""}Today: ${c.today} If this passes: ${c.ifPassed}`)].join("\n");
      const j = await ask("briefing_item_judge", JUDGE, `THE APPROVED SUMMARY\n${fuller}\n\nTHE ITEM THE READER SAW\n${readerItem(text)}\n\nTHE READER'S ANSWERS\n${a.text}`, JUDGE_SCHEMA, s.summary.id);
      spent += a.costUsd + j.costUsd; out.costUsd += a.costUsd + j.costUsd;
      let reader = null, judge = null;
      try { reader = JSON.parse(a.text); judge = JSON.parse(j.text); } catch { /* an unreadable answer is a fail, below */ }
      const reasons = readerVerdict(reader, judge, text.headline);
      await save(!reasons.length, reasons, "reader");
    } catch (e) { out.stoppedBy = `a model call failed: ${(e instanceof Error ? e.message : "error").slice(0, 120)}`; break; }
  }
  out.costUsd = Math.round(out.costUsd * 1e4) / 1e4;
  if (out.tested.length) console.log(`BRIEF_ITEM_TESTS | ${out.tested.map(t => `${t.billId}:${t.passed ? "pass" : "fail"}(${t.by})`).join(" ")} | $${out.costUsd}${out.stoppedBy ? ` | stopped by ${out.stoppedBy}` : ""}`);
  return out;
}
