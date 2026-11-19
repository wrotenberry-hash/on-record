/**
 * Tone rules for every sentence a reader sees (owner, 18 Nov 2026, persuasion and retention round, point 7):
 * calm, specific, no outrage wording, no adjectives about legislators.
 *
 * Pure: no imports, so tests and scripts load it directly. Used by the written check on bill summaries
 * (lib/analysis/checker.ts), by the average-reader test (a judge's tone finding counts only when the words it quotes
 * are really on the page: `toneFinding`), and by tests that run it over the site's fixed wording (vote lines, emails,
 * notices, share captions).
 */

/** Words that tell the reader how to feel, or hurry them. Whole words, any case. */
export const OUTRAGE_WORDS = [
  // Only words with no plain legal or everyday meaning in a bill: "explosive", "urgent", "breaking", "destroyed", "hero"
  // are left out because bills are about explosives, urgent care, breaking a law, destroyed property and the HEROES Act.
  "slams", "slammed", "lashes out", "claps back", "eviscerates", "outrage", "outraged", "outrageous", "fury", "furious", "shocking",
  "stunning", "bombshell", "scandalous", "disgrace", "disgraceful", "betrayal", "betrayed", "betrays", "shameful", "appalling",
  "horrifying", "terrifying", "alarming", "unbelievable", "jaw-dropping", "heroic", "villain", "traitor", "finally", "breaking news",
  "act now", "don't miss", "you won't believe", "wake up", "must-see", "must-read",
] as const;

/** Adjectives that characterise a legislator instead of saying what they did. The same list for every party. */
export const MEMBER_LABELS = [
  "embattled", "controversial", "firebrand", "outspoken", "powerful", "influential", "moderate", "liberal", "conservative", "progressive",
  "hardline", "hard-line", "far-left", "far-right", "radical", "extreme", "extremist", "vulnerable", "popular", "unpopular", "respected",
  "disgraced", "maverick", "staunch", "fierce", "vocal", "prominent", "notorious", "beloved", "courageous", "brave", "cowardly", "corrupt",
  "honest", "dishonest", "weak", "tough", "principled", "loyal", "rogue", "establishment", "populist", "centrist", "hawkish", "dovish",
  "ultra-conservative", "ultra-liberal", "socialist", "fringe", "mainstream", "career", "out-of-touch", "do-nothing",
] as const;

const MEMBER = "(?:Rep\\.|Reps\\.|Sen\\.|Sens\\.|Representatives?|Senators?|Speaker|Leader|Chair(?:man|woman)?|Whip|Delegate|Governor|Gov\\.|lawmakers?|legislators?|politicians?|congress(?:man|woman|men|women|members?)|sponsors?|Republicans?|Democrats?|incumbents?)";
const BETWEEN = "(?:(?:Republican|Democratic|Democrat|GOP|House|Senate|state|U\\.S\\.|Texas|freshman|senior|junior|former)\\s+){0,3}";
const alt = (words: readonly string[]) => words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]/g, m => (m === "-" ? "-" : "\\s+"))).join("|");
const OUTRAGE = new RegExp(`(^|[^a-z-])(${alt(OUTRAGE_WORDS)})(?=$|[^a-z-])`, "gi");
// "embattled Sen. Lee", "moderate House Republicans"
const LABEL_BEFORE = new RegExp(`\\b(${alt(MEMBER_LABELS)})\\s+${BETWEEN}${MEMBER}(?=$|[^a-z])`, "gi");
// "Sen. Lee is outspoken", "Rep. Mary Ann Roe, a staunch …"
const LABEL_AFTER = new RegExp(`\\b${MEMBER}\\s+[A-Z][\\w.'’-]*(?:\\s+[A-Z][\\w.'’-]*){0,2}(?:\\s*,|\\s+(?:is|was|remains|has been))\\s+(?:an?\\s+|the\\s+)?(?:very\\s+|most\\s+|more\\s+)?(${alt(MEMBER_LABELS)})\\b`, "g");

export type ToneProblem = { kind: "outrage" | "exclamation" | "member-label"; words: string };

/** Every tone problem in a text, each with the words that caused it. An empty list means the text is calm. */
export function toneProblems(text: string): ToneProblem[] {
  const out: ToneProblem[] = [], seen = new Set<string>();
  const add = (kind: ToneProblem["kind"], words: string) => { const k = `${kind}:${words.toLowerCase()}`; if (!seen.has(k)) { seen.add(k); out.push({ kind, words }); } };
  for (const m of text.matchAll(OUTRAGE)) add("outrage", m[2]);
  if (/[A-Za-z0-9”"')]\s*!/.test(text)) add("exclamation", "!");
  for (const m of text.matchAll(LABEL_BEFORE)) add("member-label", m[0].trim());
  for (const m of text.matchAll(LABEL_AFTER)) add("member-label", m[0].trim());
  return out;
}

/** One sentence for the writer or the editor. */
export function toneLine(p: ToneProblem): string {
  return p.kind === "outrage" ? `Outrage or hurry wording: "${p.words}". Say what happened, with the number or the date, and nothing about how to feel.`
    : p.kind === "exclamation" ? "An exclamation mark. End the sentence with a full stop."
    : `An adjective about a legislator: "${p.words}". Give the name, the office and what they did or said; never a label.`;
}

/** What the tone judge returns in the average-reader test. */
export type ToneVerdict = { calm: boolean; words: string[]; why: string };

/**
 * A judge's finding counts only when it quotes words that are really on the page. A judge that says "not calm" without
 * quoting anything, or quotes words that are not there, is not believed: the written rule above is the floor, and the
 * judge adds only what it can point to.
 */
export function toneFinding(v: ToneVerdict | null | undefined, page: string): string | null {
  if (!v || v.calm) return null;
  const flat = page.replace(/\s+/g, " ").toLowerCase();
  const real = [...new Set((v.words ?? []).map(w => w.replace(/\s+/g, " ").replace(/^["“'‘]+|["”'’.,;:]+$/g, "").trim()).filter(w => w.length >= 3 && flat.includes(w.toLowerCase())))];
  if (!real.length) return null;
  return `The page is not calm and specific. A reader checking the tone pointed to: ${real.slice(0, 6).map(w => `"${w}"`).join(", ")}${v.why ? ` (${v.why.replace(/\s+/g, " ").slice(0, 200)})` : ""}. Say what happened without outrage or alarm wording, and describe no legislator with an adjective: name, office, and what they did or said.`;
}

export const TONE_JUDGE_ADDITION = `Last, judge the TONE of the page the readers saw (given as "THE PAGE"). It must be calm and specific. "calm": false only if the page itself (a) uses outrage, alarm or hurry wording that tells the reader how to feel, (b) praises or blames anyone, or (c) describes a legislator with an adjective or label ("moderate", "embattled", "outspoken", "powerful") instead of by name, office and what they did or said. A reason credited to a named person, restated in neutral words, is fine. Party names, offices and official titles are not labels. Under "words" quote, exactly as written on the page, every word or phrase that breaks the rule; if you cannot quote one, the page is calm. One short sentence of "why".`;
