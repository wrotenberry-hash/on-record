/**
 * The average-reader test for menu choices (owner, 20 Nov 2026: each option "passes the average-reader test already
 * used for summaries"). Same idea as the summaries' test, cut down to what a one-sentence choice can be tested on:
 * a reader who sees only the sentence must be able to say which way it moves things. If the reader cannot, or says
 * the opposite, the choice fails and its whole group is left out. Pure: relative imports only.
 */
import type { DraftedGroup } from "./draft.ts";
import type { OptionDirection } from "./types.ts";

export const CHOICE_READER_INSTRUCTIONS = `You are an ordinary adult with no legal or political training. You are shown short sentences, each a possible change to a bill. You see nothing else about the bill.

For each sentence, answer two things from the sentence alone:
- way: which way the sentence moves things. "more" (a higher amount or number, a later date, a longer time, more people or things covered), "less" (a lower amount or number, an earlier date, a shorter time, fewer people or things covered), "same" (it keeps things as they are written), "gone" (it takes something out), or "unclear" if you cannot tell.
- restated: the sentence in your own everyday words, at most 15 words. If you do not understand it, write "I don't understand."

Do not guess. If a sentence could be read two ways, answer "unclear".`;

export const CHOICE_READER_SCHEMA = { type: "object", additionalProperties: false, required: ["answers"], properties: { answers: { type: "array", items: {
  type: "object", additionalProperties: false, required: ["id", "way", "restated"],
  properties: { id: { type: "string" }, way: { type: "string", enum: ["more", "less", "same", "gone", "unclear"] }, restated: { type: "string" } } } } } };

export type ReaderWay = "more" | "less" | "same" | "gone" | "unclear";
export type ReaderAnswer = { id: string; way: ReaderWay; restated: string };

const EXPECT: Partial<Record<OptionDirection, ReaderWay>> = { up: "more", down: "less", keep: "same", remove: "gone" };
/** The sentence ids are "<group id>.<direction>" so the answers can be matched back. */
export const choiceId = (groupId: string, direction: OptionDirection) => `${groupId}.${direction}`;

/** What the reader is shown: the sentences only, in a shuffled-looking but fixed order (by id), with no hint of the expected answer. */
export function readerInput(groups: readonly DraftedGroup[]): string {
  return groups.flatMap(g => g.options.map(o => `${choiceId(g.id, o.direction)}: ${o.wording}`)).join("\n");
}

export function parseReaderAnswer(text: string): ReaderAnswer[] {
  try {
    const j = JSON.parse(text) as { answers?: unknown };
    return Array.isArray(j?.answers) ? (j.answers as ReaderAnswer[]).filter(a => a && typeof a.id === "string" && typeof a.way === "string") : [];
  } catch { return []; }
}

/**
 * For each group, why it fails the reader test (empty when it passes). A dial choice must be read the right way. A
 * choice between two versions has no "way", so it fails only when the reader does not understand it. A choice the
 * reader gave no answer for fails: silence is not a pass.
 */
export function readerFailures(groups: readonly DraftedGroup[], answers: readonly ReaderAnswer[]): Map<string, string[]> {
  const by = new Map(answers.map(a => [a.id.trim(), a])), out = new Map<string, string[]>();
  for (const g of groups) {
    const fails: string[] = [];
    for (const o of g.options) {
      const a = by.get(choiceId(g.id, o.direction)), want = EXPECT[o.direction];
      if (!a) { fails.push(`The reader gave no answer for the "${o.direction}" choice.`); continue; }
      if (/don'?t understand/i.test(a.restated)) fails.push(`The reader did not understand the "${o.direction}" choice.`);
      else if (want && a.way !== want) fails.push(`The reader read the "${o.direction}" choice as "${a.way}" (${a.restated.slice(0, 120)}).`);
      else if (!want && a.way === "unclear" && /unclear|not sure|can'?t tell/i.test(a.restated)) fails.push(`The reader could not tell what the "${o.direction}" choice does.`);
    }
    out.set(g.id, fails);
  }
  return out;
}
