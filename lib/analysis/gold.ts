/**
 * Gold examples: summaries written by hand to the 17 Nov writing standard from the official sources, used as examples
 * in the generator prompt. Owner instruction: they are used ONLY after the owner approves them.
 * The texts live in gold-examples.ts so the tests can check them against the same rules as any summary.
 */
import { GOLD_EXAMPLES } from "./gold-examples.ts";

/** Set to true only when the owner has approved the examples in docs/GOLD_SUMMARIES.md. */
export const GOLD_APPROVED = false;

export function goldExamplesBlock(): string {
  if (!GOLD_APPROVED || !GOLD_EXAMPLES.length) return "";
  return `\n\nEXAMPLES of summaries that meet the standard (for the style and level of detail; never copy their facts):\n${GOLD_EXAMPLES.map(g => `${g.label}:\n${JSON.stringify(g.summary)}`).join("\n\n")}`;
}
