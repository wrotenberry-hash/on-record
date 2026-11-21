/**
 * The short hint beside a collapsed section's heading on the bill page: a count for a list ("(4)"), the first few
 * words for a paragraph. Pure, so node's test runner loads it.
 */
export const countHint = (n: number) => `(${n})`;
export function wordsHint(text: string | null | undefined, words = 8): string | null {
  const w = (text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return null;
  return w.length > words ? `${w.slice(0, words).join(" ").replace(/[,;:]$/, "")}…` : w.join(" ");
}
/** The sections of a bill page that stay open: the core a reader needs before anything else. Everything else is one tappable heading. */
export const OPEN_SECTIONS = ["headline", "plain English", "what would change", "how it works today", "where it stands", "your question"] as const;
