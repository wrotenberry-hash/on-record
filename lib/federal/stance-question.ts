/**
 * Owner, 16 Nov 2026: the reader's question uses the plain headline, not the official title
 * ("Do you support blocking the 2027 ACA marketplace rule?"), with the official title one tap away.
 * Pure and self-contained (no imports) so node's test runner can load it directly.
 *
 * Preference order: the summary's own question field (when it exists and reads as a question),
 * then a question derived from the reader-visible headline ("Would block X" → "Do you support
 * blocking X?"), then the neutral fallback. Never the raw official title.
 */

export const FALLBACK_QUESTION = "Do you support this bill?";

// Verbs that double their last consonant before -ing (stop → stopping). Everything else follows the regular rules.
const DOUBLE = new Set(["stop", "bar", "ban", "cut", "let", "set", "get", "put", "run", "plan", "ship", "admit", "permit", "omit", "commit", "submit",
  "refer", "transfer", "rebut", "regret", "equip", "drop", "step", "strip", "trim", "cap", "tap", "map", "wrap", "dip", "rid", "bid", "slim", "nab", "rob"]);
// Verbs a headline may coordinate ("restrict X and require Y"): the second one becomes "requiring" too.
const COMMON = new Set(["allow", "add", "ban", "bar", "block", "cancel", "cap", "change", "create", "cut", "designate", "direct", "end", "establish", "expand",
  "extend", "fund", "give", "grant", "increase", "keep", "let", "limit", "lower", "make", "move", "name", "overturn", "permit", "prevent", "prohibit", "protect",
  "provide", "raise", "reduce", "remove", "rename", "repeal", "require", "reset", "restore", "restrict", "set", "stop", "strengthen", "update", "nullify",
  "authorize", "reauthorize", "exempt", "expand", "improve", "award", "honor", "recognize", "condemn", "support", "amend", "treat", "count", "pay", "let"]);
const SKIP = new Set(["also", "only", "temporarily", "permanently", "generally", "partly"]);

/** "block" → "blocking", "require" → "requiring", "stop" → "stopping", "tie" → "tying". */
export function gerund(verb: string): string {
  const v = verb.toLowerCase();
  if (DOUBLE.has(v)) return `${v}${v.at(-1)}ing`;
  if (v.endsWith("ie")) return `${v.slice(0, -2)}ying`;
  if (/(ee|ye|oe)$/.test(v)) return `${v}ing`;
  if (v.endsWith("e") && v.length > 2) return `${v.slice(0, -1)}ing`;
  return `${v}ing`;
}

/** A question from a "Would …" headline, or null when the headline does not have that shape. */
export function questionFromHeadline(headline: string | null | undefined): string | null {
  const h = String(headline ?? "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  const m = h.match(/^Would\s+(.+)$/);
  if (!m) return null;
  const words = m[1].split(" ");
  while (words.length && SKIP.has(words[0].toLowerCase())) words.shift();
  if (words.length < 2 || !/^[a-z]+$/.test(words[0])) return null;
  words[0] = gerund(words[0]);
  // A second verb after "and" / "or" / a comma takes the same form.
  for (let i = 1; i < words.length - 1; i++) {
    const join = words[i].toLowerCase(), next = words[i + 1];
    if ((join === "and" || join === "or") && COMMON.has(next) && /^[a-z]+$/.test(next)) words[i + 1] = gerund(next);
  }
  const q = `Do you support ${words.join(" ")}?`;
  return q.length <= 200 ? q : null;
}

/** The question shown above Support / Oppose / Unsure, and whether it came from the plain headline. */
export function stanceQuestion(input: { question?: string | null; headline?: string | null }): { question: string; plain: boolean } {
  const own = String(input.question ?? "").replace(/\s+/g, " ").trim();
  if (/^Do you support\b.{3,190}\?$/.test(own)) return { question: own, plain: true };
  const derived = questionFromHeadline(input.headline);
  return derived ? { question: derived, plain: true } : { question: FALLBACK_QUESTION, plain: false };
}
