/**
 * Said vs. Did rules (Round G). Pure, no imports; tested in tests/dashboard.test.mjs.
 * The rule is the same for every speaker and party: a statement counts only when
 * it names a bill by number and says, in so many words, that the speaker supports
 * or opposes it (or will vote for or against it). It is then compared with the
 * speaker's own recorded vote on passing that bill. Matches are shown as well as
 * contradictions. Anything vaguer is not matched.
 */
export type SaidStance = "for" | "against";
const BILL = /\b(H\.?\s?R\.?|S\.?|H\.?\s?J\.?\s?Res\.?|S\.?\s?J\.?\s?Res\.?)\s?(\d{1,5})\b/i;
const FOR = /\b(i|we)\s+(will\s+)?(strongly\s+)?(support|back|vote\s+(for|yes\s+on)|am\s+voting\s+for|cosponsor(ed)?)\b/i;
const AGAINST = /\b(i|we)\s+(will\s+)?(strongly\s+)?(oppose|vote\s+(against|no\s+on)|am\s+voting\s+against|reject)\b/i;

export function saidAboutBill(text: string): { label: string; type: string; number: number; stance: SaidStance } | null {
  const m = text.match(BILL);
  if (!m) return null;
  const f = FOR.test(text), a = AGAINST.test(text);
  if (f === a) return null; // neither, or both: not explicit enough
  const type = m[1].toLowerCase().replace(/[.\s]/g, "");
  return { label: `${m[1].replace(/\s+/g, " ")} ${m[2]}`.replace(/\s+(\d)/, " $1"), type, number: Number(m[2]), stance: f ? "for" : "against" };
}

/** Compare a stated stance with a recorded passage vote. Present / not voting are not compared. */
export function saidVsDid(stance: SaidStance, position: string): "match" | "contradiction" | null {
  if (position !== "Yea" && position !== "Nay") return null;
  return (stance === "for") === (position === "Yea") ? "match" : "contradiction";
}

/**
 * Quiet kill (Round G): a bill stopped by a procedural vote rather than a vote on
 * the bill itself. Cloture or a motion to proceed that failed, or a motion to table
 * or recommit that carried. Same rule for every bill and party.
 */
export function isQuietKill(kind: string, question: string, result: string | null) {
  if (kind !== "procedural") return false;
  const failed = /fail|rejected|not agreed|not invoked/i.test(result ?? "");
  return (failed && /cloture|proceed/i.test(question)) || (!failed && !!result && /table|recommit/i.test(question));
}
