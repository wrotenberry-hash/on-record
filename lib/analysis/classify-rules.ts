/**
 * Rules for AI issue suggestions (Round 2). Pure; tested in tests/trial.test.mjs.
 * A bill with no official policy area gets one model suggestion from the 14
 * issues (or "none"). At or above the threshold it is applied and labelled as
 * sorted by AI; below it, it waits for the editor.
 */
export const APPLY_THRESHOLD = 0.75;
export type SuggestionStatus = "applied" | "queued" | "no_fit";

export function decideSuggestion(category: string | null, confidence: number, threshold = APPLY_THRESHOLD): SuggestionStatus {
  if (!(confidence >= 0 && confidence <= 1)) return "queued";
  if (confidence < threshold) return "queued";
  return category ? "applied" : "no_fit";
}
