/**
 * The checks every menu option must pass before an editor ever sees it (owner, 20 Nov 2026: "We never invent policy.
 * Every option cites the exact section of bill text it changes", "zero unsourced options is the bar").
 *
 * These are rules, not judgment: a quote is in the section or it is not; a number in the sentence is in the quote or
 * it is not. An option that fails is not stored. Pure: relative imports only.
 */
import { toneLine, toneProblems } from "../analysis/tone.ts";
import { squash, type DialKind } from "./dials.ts";
import type { OptionDirection } from "./types.ts";

export const OPTION_LIMITS = { wordingWords: 26, wordingMinWords: 4, aboutWords: 14, quoteMin: 12, quoteMax: 600 };

/** True only when the quote is found, word for word, in the section's text (whitespace aside). */
export function quoteFound(quote: string, body: string): boolean {
  const q = squash(quote);
  return q.length >= OPTION_LIMITS.quoteMin && squash(body).includes(q);
}

const SCALE: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15,
  eighteen: 18, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, fifty: 50, sixty: 60, ninety: 90, hundred: 100 };

/**
 * Every figure in a text, as plain numbers: "$100 million" and "$100,000,000" both give 100000000; "50 percent" gives
 * 50; "January 12, 2027" gives 12 and 2027; "two years" gives 2. Used to make sure a sentence states no figure its
 * source does not.
 */
export function figuresIn(text: string): number[] {
  const out: number[] = [], t = squash(text);
  for (const m of t.matchAll(/(\d[\d,]*(?:\.\d+)?)(?:\s?(thousand|million|billion|trillion))?/gi)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(m[2] ? n * SCALE[m[2].toLowerCase()] : n);
  }
  for (const m of t.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|eighteen|twenty|thirty|forty-five|forty|fifty|sixty|ninety|hundred)\b(?=[- ](?:percent|days?|weeks?|months?|years?|hours?|times|thirds?|members|people|offen[cs]es?))/gi))
    out.push(WORDS[m[1].toLowerCase()]);
  return out;
}

/** Figures in `text` that `source` does not contain (a figure written out in millions matches the same figure in digits). */
export function figuresNotIn(text: string, source: string): number[] {
  const have = new Set(figuresIn(source));
  // "$100 million a year" restates "$100,000,000"; "2 years" restates "2 years". A bare "1" or "one" in ordinary prose is not a figure.
  return [...new Set(figuresIn(text).filter(n => !have.has(n)))];
}

const OPPOSITE: Partial<Record<OptionDirection, RegExp>> = {
  up: /\b(?:lower|lowers?|less|fewer|earlier|shorter|sooner|reduc\w+|cuts?|cutting|decreas\w+|shrinks?|narrow\w*|shorten\w*|smaller)\b/i,
  down: /\b(?:higher|raise[sd]?|raising|more|later|longer|increas\w+|extend\w*|expand\w*|widen\w*|lengthen\w*|larger|bigger|adds? )\b/i,
  keep: /\b(?:raise[sd]?|lower\w*|increas\w+|reduc\w+|remove[sd]?|strike|delete)\b/i,
};
const OWN: Partial<Record<OptionDirection, RegExp>> = {
  keep: /\b(?:keep|leave)\b/i,
  remove: /\b(?:remove|strike|take out|drop|delete|end)\b/i,
};
/** Words that take a side or give a reason. An option states the change and nothing else. */
const TAKES_A_SIDE = /\b(?:only|just|merely|simply|unfortunately|wisely|rightly|wrongly|better|worse|best|worst|should|ought|deserve[sd]?|fair|unfair|fairer|excessive|wasteful|generous|modest|reasonable|unreasonable|common[- ]sense|much[- ]needed|harsh|lenient|strict(?:er)?|weak(?:er|en\w*)?|strong(?:er)?|strengthen\w*|too (?:much|little|high|low|long|short|many|few))\b/i;
const GIVES_A_REASON = /\b(?:because|so that|in order to|to help|to protect|to save|to ensure|to prevent|to make sure|to stop|which would|that would help)\b/i;
/** A sentence end inside the text: a full stop, question or exclamation mark followed by a new sentence. */
const SECOND_SENTENCE = /[.!?]["”']?\s+(?=[A-Z])/;

export type OptionDraft = { direction: OptionDirection; wording: string };
export type GroupDraft = {
  kind: DialKind | "difference" | "amendment"; about: string; quote: string; otherQuote?: string | null; value?: string | null;
  options: OptionDraft[];
};

const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** The failures of one sentence a reader would tap. `sources` is the quote (and for a difference the other version's words). */
export function wordingFailures(o: OptionDraft, sources: string): string[] {
  const out: string[] = [], w = o.wording.trim();
  if (!w) return [`The "${o.direction}" choice is empty.`];
  // Full stops that do not end a sentence (abbreviations, decimals) are taken out before sentences are counted.
  const body = w.replace(/\b(?:U\.S|H\.R|S|Sec|No|Pub|L|et al|a\.m|p\.m)\./g, m => m.replace(/\./g, "")).replace(/\$?\d[\d,]*\.\d+/g, "0");
  if (!/[.]$/.test(w) || SECOND_SENTENCE.test(body.replace(/[.]$/, ""))) out.push(`The "${o.direction}" choice must be one sentence ending in a full stop.`);
  if (/[!?]/.test(w)) out.push(`The "${o.direction}" choice has a question or exclamation mark; it states a change, plainly.`);
  const n = wc(w);
  if (n > OPTION_LIMITS.wordingWords) out.push(`The "${o.direction}" choice is ${n} words; the limit is ${OPTION_LIMITS.wordingWords}.`);
  if (n < OPTION_LIMITS.wordingMinWords) out.push(`The "${o.direction}" choice is ${n} words; say what would change.`);
  const extra = figuresNotIn(w, sources);
  if (extra.length) out.push(`The "${o.direction}" choice states ${extra.join(", ")}, which the quoted text does not. Never give a figure the bill does not; offer a direction only.`);
  const opp = OPPOSITE[o.direction], own = OWN[o.direction];
  if (opp && opp.test(w)) out.push(`The "${o.direction}" choice uses a word that points the other way (“${opp.exec(w)![0].trim()}”).`);
  if (own && !own.test(w)) out.push(`The "${o.direction}" choice does not say so in plain words (${o.direction === "keep" ? "keep or leave" : "remove or take out"}).`);
  const side = TAKES_A_SIDE.exec(w); if (side) out.push(`The "${o.direction}" choice takes a side (“${side[0]}”). State the change only.`);
  const why = GIVES_A_REASON.exec(w); if (why) out.push(`The "${o.direction}" choice gives a reason (“${why[0]}”). State the change only.`);
  for (const p of toneProblems(w)) out.push(`The "${o.direction}" choice: ${toneLine(p)}`);
  return out;
}

const NEEDED: Record<"dial" | "difference" | "amendment", OptionDirection[]> = {
  dial: ["up", "down", "keep", "remove"], difference: ["this_version", "other_version"], amendment: ["adopt", "reject"],
};

/**
 * Everything wrong with one group of options, against the stored text. An empty list means the group may go to the
 * editor. `body` is the cited section's text; `otherBody` the other version's section, for a difference.
 */
export function groupFailures(g: GroupDraft, body: string, otherBody?: string | null): string[] {
  const out: string[] = [], family = g.kind === "difference" ? "difference" : g.kind === "amendment" ? "amendment" : "dial";
  if (g.quote && !quoteFound(g.quote, body)) out.push("The quoted words are not in the section cited, word for word.");
  if (!g.quote && !(family === "difference" && g.otherQuote)) out.push("There is no quote from the bill.");
  if (squash(g.quote).length > OPTION_LIMITS.quoteMax) out.push(`The quote is over ${OPTION_LIMITS.quoteMax} characters; quote the clause that holds the change.`);
  if (family === "difference" && g.otherQuote && !(otherBody && quoteFound(g.otherQuote, otherBody))) out.push("The words quoted from the other version are not in that version's section, word for word.");
  if (family === "dial" && g.kind !== "coverage" && g.value && !squash(g.quote).includes(squash(g.value))) out.push(`The figure (${g.value}) is not inside the quoted words.`);
  const about = g.about.trim();
  if (!about) out.push("Nothing says what the quoted thing is.");
  else {
    if (wc(about) > OPTION_LIMITS.aboutWords) out.push(`The description is ${wc(about)} words; the limit is ${OPTION_LIMITS.aboutWords}.`);
    const extra = figuresNotIn(about, `${g.quote} ${g.otherQuote ?? ""}`); if (extra.length) out.push(`The description states ${extra.join(", ")}, which the quoted text does not.`);
    if (TAKES_A_SIDE.test(about) || toneProblems(about).length) out.push("The description takes a side or uses heated words.");
  }
  // Both directions always travel together, and for a dial "keep as written" and "remove" are always offered.
  for (const d of NEEDED[family]) if (g.options.filter(o => o.direction === d).length !== 1) out.push(`The group needs exactly one "${d}" choice.`);
  if (g.options.some(o => !NEEDED[family].includes(o.direction))) out.push("The group has a choice of a kind it should not have.");
  const sources = `${g.quote} ${g.otherQuote ?? ""}`;
  for (const o of g.options) out.push(...wordingFailures(o, sources));
  const seen = new Set<string>();
  for (const o of g.options) { const k = squash(o.wording).toLowerCase(); if (seen.has(k)) out.push("Two choices in the group say the same thing."); seen.add(k); }
  return out;
}
