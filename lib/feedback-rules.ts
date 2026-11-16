/**
 * Round 4 feedback prompt (pure; tested in tests/trial.test.mjs). One question,
 * shown to an invite-only trial reader once their invite has been used on three
 * separate days, until they answer or dismiss it (cookie `or_fb`). The answer is
 * stored without the invite, the reader or the page it was given on.
 */
export const FEEDBACK_COOKIE = "or_fb";
export const FEEDBACK_AFTER_VISITS = 3;
export const FEEDBACK_QUESTION = "What one thing would make On Record more useful to you?";
export const FEEDBACK_MAX = 600;

export function shouldAskFeedback(activeDays: number | null | undefined, cookieValue: string | null | undefined) {
  return !cookieValue && Number(activeDays ?? 0) >= FEEDBACK_AFTER_VISITS;
}

/** Trimmed, length-capped, single-spaced. Null when nothing is left to keep. */
export function cleanFeedback(raw: unknown): string | null {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, FEEDBACK_MAX);
  return text.length >= 2 ? text : null;
}
