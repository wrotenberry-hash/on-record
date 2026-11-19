/**
 * Checking a replaced key with one small live call (owner, 19 Nov 2026).
 *
 * The owner replaces keys in the host's settings, where the site cannot see them change. This check makes one small
 * real request with each key and says pass or fail, in words that say which key and why. It never returns a key or
 * any part of one. Anyone who can reach the health probe can ask for it, so it is paced: the calls go out at most once
 * every 30 minutes, and the earlier answer is returned in between. Pure: no imports.
 */
export const KEY_CHECK_EVERY_MS = 30 * 60 * 1000;
export type KeyResult = { ok: boolean; line: string };
export type KeyCheck = { at: number; openai: KeyResult; openStates: KeyResult };

export function dueForCheck(last: KeyCheck | null, now: number): boolean { return !last || now - last.at >= KEY_CHECK_EVERY_MS; }

/** Reads the stored answer; anything that is not a whole earlier answer counts as none. */
export function readKeyCheck(raw: string | null): KeyCheck | null {
  try {
    const v = raw ? JSON.parse(raw) as Partial<KeyCheck> : null;
    const good = (r: unknown): r is KeyResult => !!r && typeof (r as KeyResult).ok === "boolean" && typeof (r as KeyResult).line === "string";
    return v && typeof v.at === "number" && good(v.openai) && good(v.openStates) ? { at: v.at, openai: v.openai, openStates: v.openStates } : null;
  } catch { return null; }
}

const noKey = (text: string) => text.replace(/sk-[A-Za-z0-9_-]{6,}/g, "[key]").replace(/Bearer\s+\S+/gi, "Bearer [key]");

/** What an OpenAI result means, from the error text the site's own caller produces (null = the call was answered). */
export function openaiLine(error: string | null, configured: boolean, costUsd = 0): KeyResult {
  if (!configured) return { ok: false, line: "OpenAI key: FAIL. OPENAI_API_KEY is not set in production." };
  if (!error) return { ok: true, line: `OpenAI key: PASS. One small live call was answered${costUsd > 0 ? ` (cost $${costUsd.toFixed(4)})` : ""}.` };
  const why = /billing|usage limit|quota/i.test(error) ? "The key is accepted, but OpenAI refused the call for billing or a usage limit"
    : /returned 401/.test(error) ? "OpenAI rejected the key (401): it is wrong, revoked, or pasted with an extra character"
    : /returned 403/.test(error) ? "OpenAI refused the key for this model or project (403)"
    : /returned 404/.test(error) ? "OpenAI does not offer the configured model to this key (404)"
    : /rate limit/i.test(error) ? "OpenAI answered with a rate limit (429); the key is accepted, try again in a few minutes"
    : /timeout|timed out|aborted/i.test(error) ? "OpenAI did not answer in time"
    : `The call failed: ${noKey(error).slice(0, 120)}`;
  return { ok: false, line: `OpenAI key: FAIL. ${why}.` };
}

/** What an Open States answer means, from its HTTP status (0 = no answer). */
export function openStatesLine(status: number, configured: boolean): KeyResult {
  if (!configured) return { ok: false, line: "Open States key: FAIL. OPENSTATES_API_KEY is not set in production." };
  if (status >= 200 && status < 300) return { ok: true, line: "Open States key: PASS. One small live call was answered." };
  const why = status === 401 || status === 403 ? `Open States rejected the key (${status}): it is wrong, inactive, or pasted with an extra character`
    : status === 429 ? "Open States answered with its rate limit (429): the key is accepted, but today's allowance is used up or requests came too fast"
    : status === 0 ? "Open States did not answer" : `Open States answered ${status}`;
  return { ok: false, line: `Open States key: FAIL. ${why}.` };
}
