/**
 * The automated rule checker for AI-written bill summaries (docs/TALK_IS_CHEAP_PLAN.md,
 * Phase B). Pure: no database, no network, no model. Every rule is unit-tested
 * in tests/analysis.test.mjs. A summary that fails is regenerated once with the
 * failures as feedback; a second failure holds it for an editor.
 */
export type Section = { num: string; heading: string };

/** Normalise a citation such as "Sec. 2", "Section 2(a)" or "§ 3" to its section number, or null. */
export function citedSection(cite: string): string | null {
  const m = cite.match(/(?:sec(?:tion)?s?\.?|§)\s*(\d+[A-Za-z]?)/i);
  return m ? m[1].toUpperCase() : null;
}

/** Does the cite point at a section the text contains? Text without numbered sections accepts "Full text". */
export function citeExists(cite: string, sections: readonly Section[]): boolean {
  if (!sections.length) return /full text|sec(?:tion)?\.?\s*1\b/i.test(cite);
  const n = citedSection(cite);
  return n !== null && sections.some(s => s.num.toUpperCase() === n);
}


export type Point = { text: string; section: string };
export type Argument = { argument: string; attribution: string };
export type SummaryDraft = {
  headline: string;
  whatItDoes: Point[];
  whoItAffects: Point[];
  whatChangesForYou: string;
  caseFor: Argument[];
  caseAgainst: Argument[];
  unknowns: string[];
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
};
export type CheckResult = { passed: boolean; failures: string[]; warnings: string[];
  metrics: { totalWords: number; readingGrade: number; forWords: number; againstWords: number } };

/**
 * Loaded words: adjectives and labels that tell the reader what to think.
 * Matched as whole words, any case. Quoted bill titles are not checked (the
 * headline and prose are written by the model; the official title is not).
 */
export const BANNED_WORDS = [
  "sweeping", "radical", "common-sense", "commonsense", "common sense", "controversial", "landmark", "historic", "historical",
  "devastating", "extreme", "extremist", "draconian", "reckless", "so-called", "unprecedented", "disastrous", "dangerous",
  "job-killing", "giveaway", "handout", "bailout", "scheme", "outrageous", "shameful", "massive", "slash", "slashes", "gut", "guts",
  "loophole", "loopholes", "bold", "game-changing", "game changer", "partisan", "bipartisan", "attack", "attacks", "war on",
  "crisis", "disaster", "rammed", "sneaky", "power grab", "rubber-stamp", "woke", "far-left", "far-right", "ultra",
] as const;

/** First-person opinion and grading language: the summary describes, it does not judge. */
const OPINION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(we|i) (believe|think|feel|recommend)\b/i, "first-person opinion"],
  [/\bin (our|my) (view|opinion)\b/i, "first-person opinion"],
  [/\b(good|bad|best|worst) (bill|law|idea|policy)\b/i, "a verdict on the bill"],
  [/\b(grade|rating|scorecard)\b/i, "a grade or rating"],
];

const VAGUE_ATTRIBUTION = /^(some|many|others|people|critics|supporters|opponents|proponents|experts|observers|some people|many people|it is argued)$/i;

export const LIMITS = { headlineWords: 20, pointWords: 35, changesWords: 45, argumentWords: 40, argumentMinWords: 8,
  unknownWords: 30, totalWords: 360, maxPoints: 3, maxUnknowns: 3, gradeFail: 12, gradeWarn: 9 } as const;

export function words(text: string): string[] { return text.trim().split(/\s+/).filter(Boolean); }
const wc = (t: string) => words(t).length;

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/** Flesch-Kincaid grade level. A rough measure: it rewards short sentences and short words. */
export function readingGrade(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length);
  const ws = words(text.replace(/\(([^)]*)\)/g, " ")).filter(w => /[a-z]/i.test(w));
  if (!ws.length) return 0;
  const syl = ws.reduce((n, w) => n + syllables(w), 0);
  return Math.round((0.39 * (ws.length / sentences) + 11.8 * (syl / ws.length) - 15.59) * 10) / 10;
}

export function bannedWordsIn(text: string): string[] {
  const found = new Set<string>();
  for (const word of BANNED_WORDS) {
    const pattern = new RegExp(`(^|[^a-z-])${word.replace(/[-\s]/g, m => (m === "-" ? "-" : "\\s+"))}($|[^a-z-])`, "i");
    if (pattern.test(text)) found.add(word);
  }
  return [...found];
}

/** Every sentence the model wrote, for the word, opinion and reading-level checks. */
export function proseOf(d: SummaryDraft): string[] {
  const end = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
  return [end(d.headline), ...d.whatItDoes.map(p => end(p.text)), ...d.whoItAffects.map(p => end(p.text)), end(d.whatChangesForYou),
    ...d.caseFor.map(a => end(a.argument)), ...d.caseAgainst.map(a => end(a.argument)), ...d.unknowns.map(end)];
}

export function checkSummary(d: SummaryDraft, sections: readonly Section[], opts: { truncated?: boolean } = {}): CheckResult {
  const failures: string[] = [], warnings: string[] = [];
  const fail = (m: string) => failures.push(m), warn = (m: string) => warnings.push(m);

  // Headline: a "Would ..." sentence of at most 20 words.
  if (!/^Would\b/.test(d.headline.trim())) fail("Headline must start with \"Would\".");
  if (wc(d.headline) > LIMITS.headlineWords) fail(`Headline is ${wc(d.headline)} words; the limit is ${LIMITS.headlineWords}.`);

  const points = (label: string, list: Point[]) => {
    if (list.length < 1 || list.length > LIMITS.maxPoints) fail(`${label} needs 1 to ${LIMITS.maxPoints} points; it has ${list.length}.`);
    list.forEach((p, i) => {
      if (wc(p.text) > LIMITS.pointWords) fail(`${label} point ${i + 1} is ${wc(p.text)} words; the limit is ${LIMITS.pointWords}.`);
      if (!p.section.trim()) fail(`${label} point ${i + 1} cites no section.`);
      else if (!citeExists(p.section, sections)) fail(`${label} point ${i + 1} cites "${p.section}", which is not a section of this text.`);
    });
  };
  points("What it does", d.whatItDoes);
  points("Who it affects", d.whoItAffects);

  if (!d.whatChangesForYou.trim()) fail("What changes for you is empty.");
  else if (wc(d.whatChangesForYou) > LIMITS.changesWords) fail(`What changes for you is ${wc(d.whatChangesForYou)} words; the limit is ${LIMITS.changesWords}.`);

  // The case for and against: exactly two each, attributed, of comparable length.
  const side = (label: string, list: Argument[]) => {
    if (list.length !== 2) fail(`${label} needs exactly 2 arguments; it has ${list.length}.`);
    list.forEach((a, i) => {
      const n = wc(a.argument);
      if (n > LIMITS.argumentWords) fail(`${label} argument ${i + 1} is ${n} words; the limit is ${LIMITS.argumentWords}.`);
      if (n < LIMITS.argumentMinWords) fail(`${label} argument ${i + 1} is ${n} words; the minimum is ${LIMITS.argumentMinWords}.`);
      const who = a.attribution.trim();
      if (!who) fail(`${label} argument ${i + 1} has no attribution.`);
      else if (VAGUE_ATTRIBUTION.test(who)) fail(`${label} argument ${i + 1} is attributed only to "${who}"; say which kind of supporter or critic.`);
    });
  };
  side("Case for", d.caseFor);
  side("Case against", d.caseAgainst);
  const forWords = d.caseFor.reduce((n, a) => n + wc(a.argument), 0), againstWords = d.caseAgainst.reduce((n, a) => n + wc(a.argument), 0);
  const gap = Math.abs(forWords - againstWords), allowed = Math.max(8, Math.round(0.25 * Math.max(forWords, againstWords)));
  if (gap > allowed) fail(`The case for is ${forWords} words and the case against is ${againstWords}; they must be within ${allowed} words of each other.`);

  if (d.unknowns.length < 1 || d.unknowns.length > LIMITS.maxUnknowns) fail(`What we don't know needs 1 to ${LIMITS.maxUnknowns} points; it has ${d.unknowns.length}.`);
  d.unknowns.forEach((u, i) => { if (wc(u) > LIMITS.unknownWords) fail(`What we don't know point ${i + 1} is ${wc(u)} words; the limit is ${LIMITS.unknownWords}.`); });

  const prose = proseOf(d), all = [...prose, ...d.caseFor.map(a => a.attribution), ...d.caseAgainst.map(a => a.attribution)].join(" ");
  const banned = bannedWordsIn(all);
  if (banned.length) fail(`Loaded words: ${banned.join(", ")}.`);
  for (const [re, label] of OPINION_PATTERNS) if (re.test(all)) fail(`Contains ${label}.`);

  const totalWords = prose.reduce((n, s) => n + wc(s), 0);
  if (totalWords > LIMITS.totalWords) fail(`The summary is ${totalWords} words; the limit is ${LIMITS.totalWords} (about two phone screens).`);
  const grade = readingGrade(prose.join(" "));
  if (grade > LIMITS.gradeFail) fail(`Reading level is grade ${grade}; the limit is ${LIMITS.gradeFail} (target about 8).`);
  else if (grade > LIMITS.gradeWarn) warn(`Reading level is grade ${grade}; the target is about 8.`);

  if (opts.truncated && d.confidence === "high") fail("The model read only part of a long bill, so confidence cannot be high.");
  if (!d.confidenceReason.trim()) warn("No reason given for the confidence level.");

  return { passed: failures.length === 0, failures, warnings, metrics: { totalWords, readingGrade: grade, forWords, againstWords } };
}

/** 1 in 5: the 5th, 10th, 15th… summary ever generated is sampled for an editor's audit. */
export const SAMPLE_EVERY = 5;
export function isSampled(sequenceIndex: number, every = SAMPLE_EVERY) { return sequenceIndex % every === every - 1; }

export type ReviewRoute = { status: "visible" | "held"; queue: null | "sample" | "low_confidence" | "check_failed" };
/**
 * What happens to a finished summary. Held summaries are hidden until an editor
 * approves them; a sampled summary stays visible and waits for an audit.
 */
export function routeSummary(r: { checkPassed: boolean; confidence: SummaryDraft["confidence"]; sequenceIndex: number }): ReviewRoute {
  if (!r.checkPassed) return { status: "held", queue: "check_failed" };
  if (r.confidence === "low") return { status: "held", queue: "low_confidence" };
  if (isSampled(r.sequenceIndex)) return { status: "visible", queue: "sample" };
  return { status: "visible", queue: null };
}

/** Spread picks across categories: each pick takes the best-ranked bill in the least-covered category. */
export function spreadAcrossCategories<T extends { categorySlug: string }>(ranked: readonly T[], covered: ReadonlyMap<string, number>): T[] {
  const counts = new Map(covered), left = [...ranked], out: T[] = [];
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if ((counts.get(left[i].categorySlug) ?? 0) < (counts.get(left[best].categorySlug) ?? 0)) best = i;
    const [pick] = left.splice(best, 1);
    out.push(pick); counts.set(pick.categorySlug, (counts.get(pick.categorySlug) ?? 0) + 1);
  }
  return out;
}
