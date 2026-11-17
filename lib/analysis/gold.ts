/**
 * Gold examples: summaries written by hand to the 17 Nov writing standard from the official sources, used as examples
 * in the generator prompt. Owner instruction: they are used ONLY after the owner approves them.
 * The texts live in gold-examples.ts so the tests can check them against the same rules as any summary.
 */
import { GOLD_EXAMPLES } from "./gold-examples.ts";

/** The owner approved the three examples on 17 Nov 2026 (third version: old rule, new rule, the bill first). Set to false to take them out of the prompt. */
export const GOLD_APPROVED = true;

/** An example exactly as the model must return it: every change row carries "before" ("" when there is no earlier rule). */
export function outputShape(s: (typeof GOLD_EXAMPLES)[number]["summary"]) {
  return { ...s, changes: (s.changes ?? []).map(r => ({ label: r.label ?? "", before: r.before ?? "", today: r.today, ifPassed: r.ifPassed, source: r.source })) };
}

export function goldExamplesBlock(): string {
  if (!GOLD_APPROVED || !GOLD_EXAMPLES.length) return "";
  return `\n\nEXAMPLES of summaries that meet the standard (for the style and level of detail; never copy their facts):\n${GOLD_EXAMPLES.map(g => `${g.label}:\n${JSON.stringify(outputShape(g.summary))}`).join("\n\n")}`;
}
