/**
 * The automated rule checker for AI-written bill summaries (docs/TALK_IS_CHEAP_PLAN.md,
 * Phase B). Pure: no database, no network, no model. Every rule is unit-tested
 * in tests/analysis.test.mjs. A summary that fails is regenerated once with the
 * failures as feedback; a second failure holds it for an editor.
 */
// The ".ts" ending lets the node test runner load this without a bundler (tsconfig: allowImportingTsExtensions).
import { EVERYDAY_NAMES, fillerIn, HAS_SPECIFIC, headlineProblems, mechanicsShare, STRUCTURE_LIMITS, unexplainedAcronyms, unexplainedJargon, unquantifiedChanges, vagueChangeRow, type ChangeRow } from "./standard.ts";

export type Section = { num: string; heading: string; text?: string };

/** Normalise a citation such as "Sec. 2", "Section 2(a)" or "§ 3" to its section number, or null. */
export function citedSection(cite: string): string | null {
  const id = cite.trim().toUpperCase();
  if (/^(FULL|RULE|REPORT|CRS|CBO|BILL|STATUS|PRIMER|FLOOR\d?|USC \d+ §[0-9A-Z-]+)$/.test(id)) return id;
  if (/^full text$/i.test(cite.trim())) return "FULL";
  const m = cite.match(/(?:sec(?:tion)?s?\.?|§)\s*(\d+[A-Za-z]?)/i);
  return m ? m[1].toUpperCase() : null;
}

/** Does the cite point at a section the text contains? Text without numbered sections accepts "Full text". */
export function citeExists(cite: string, sections: readonly Section[]): boolean {
  if (!sections.length) return /full text|sec(?:tion)?\.?\s*1\b/i.test(cite);
  if (/^full text$/i.test(cite.trim()) && sections.some(s => s.num === "FULL")) return true;
  const n = citedSection(cite);
  return n !== null && sections.some(s => s.num.toUpperCase() === n);
}


const STOP = new Set("about above after again against along among another because before being below between could during every first other shall should their there these those through under until where which while would years section subsection paragraph amended amend inserting striking following united states including provide provides provided person persons respect".split(" "));
/** Content words, crudely stemmed: lower case, five letters or more, common endings dropped. */
export function contentWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z]{5,}/g) ?? []) {
    if (STOP.has(w)) continue;
    out.add(w.replace(/(ations?|ments?|ings?|ies|ied|ed|es|s)$/, "").slice(0, 7));
  }
  return out;
}

/**
 * Does the cited section share at least one content word with the point that cites
 * it? A point that shares none is almost always cited to the wrong section. Null
 * when the section's text is not available (nothing to check against).
 */
export function citeSupports(pointText: string, cite: string, sections: readonly Section[]): boolean | null {
  const n = citedSection(cite);
  const section = n ? sections.find(s => s.num.toUpperCase() === n) : sections.length === 0 ? null : undefined;
  if (!section?.text) return null;
  const sectionWords = contentWords(`${section.heading} ${section.text}`);
  for (const w of contentWords(pointText)) if (sectionWords.has(w)) return true;
  return false;
}

export type Point = { text: string; section: string };
/** source: the id of the official source the argument comes from (b5+; e.g. "RULE", "REPORT", "CRS", "BILL"). */
export type Argument = { argument: string; attribution: string; source?: string };
export type SummaryDraft = {
  headline: string;
  /** b5+ (owner review, 16 Nov): 2–3 sentences anyone could repeat to a friend. */
  plainEnglish?: string;
  /** b5+: what the rule or law the bill changes or blocks does today; required when it changes one. */
  background?: string;
  backgroundSources?: string[];
  /** b5+: the reader's voting question, from the plain headline ("Do you support blocking …?"). */
  question?: string;
  /** b7+ (owner, 17 Nov): the subject from zero, in 3 to 5 short bullets, before the reader is told what changes. */
  howItWorksToday?: Point[];
  /** b7+: one row per change, "Today: … → If this passes: …". */
  changes?: ChangeRow[];
  /** b7+: one or two sentences on why this is being voted on now. */
  whyNow?: string;
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
  unknownWords: 30, totalWords: 360, totalWordsB5: 900, plainWords: 80, backgroundWords: 90, questionWords: 18, maxPoints: 3, maxUnknowns: 3, gradeFail: 12, gradeWarn: 9 } as const;

export function words(text: string): string[] { return text.trim().split(/\s+/).filter(Boolean); }
// 17 Nov: an explanation in parentheses ("user fees (a charge insurers pay …)") is required by the standard, so it does not
// count against a part's own word limit. The whole-summary limit and the reading grade still count every word.
const wc = (t: string) => words(t.replace(/\([^()]*\)/g, " ")).length;

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

/**
 * Round 1 review (16 Nov 2026): official names are names, not vocabulary. Two accurate summaries were held
 * only because "Nuclear Regulatory Commission" and similar names pushed the grade over the limit. For the
 * reading level, a run of two or more capitalised words (with of/the/and/for between) counts as one short word.
 */
export function withoutOfficialNames(text: string): string {
  return text.replace(/\b(?!(?:The|A|An|This|That|These|Those|If|Each|Any|No|Most|Some|Under|When|After|Before|Would)\b)[A-Z][A-Za-z'’&.-]*(?:\s+(?:of|the|and|for|on|in|&)\s+[A-Z][A-Za-z'’&.-]*|\s+[A-Z][A-Za-z'’&.-]*)+/g, "Name");
}
/**
 * Round 1 second review (16 Nov 2026): the bill's own subject words are not jargon the summary can avoid. A veterans'
 * bill must say "disability compensation". Words of 3+ letters from the bill's official title count as one short word.
 */
export function withoutSubjectTerms(text: string, subject = ""): string {
  const terms = new Set(words(subject.toLowerCase()).map(w => w.replace(/[^a-z-]/g, "")).filter(w => w.length > 3));
  if (!terms.size) return text;
  return text.replace(/[A-Za-z][A-Za-z-]*/g, w => terms.has(w.toLowerCase()) || terms.has(w.toLowerCase().replace(/s$/, "")) ? "term" : w);
}
export function plainGrade(text: string, subject = ""): number { return readingGrade(withoutSubjectTerms(withoutOfficialNames(text), subject)); }

/** An argument framed as "X could say ..." repeats the attribution and makes the longest sentences in a summary. */
export const SAYS_FRAME = /^\s*(?:the\s+)?[\w'’ -]{0,60}?\b(?:could|would|might|may)\s+(?:say|argue|contend|note|point out)\b/i;

/** Share of a point's content words that also appear in the section it cites (null when the section text is not available). */
export function citeOverlap(pointText: string, cite: string, sections: readonly Section[]): number | null {
  const n = citedSection(cite), section = n ? sections.find(s => s.num.toUpperCase() === n) : null;
  if (!section?.text) return null;
  const sw = contentWords(`${section.heading} ${section.text}`), pw = [...contentWords(pointText)];
  return pw.length ? pw.filter(w => sw.has(w)).length / pw.length : null;
}

/** "Most people would see no direct change unless they vote": a broad exception cancels the claim (Round 1 review). */
const NO_CHANGE_UNLESS = /\bmost (people|americans|readers)\b[^.]*\b(no|not)\b[^.]*\bchange\b[^.]*\b(unless|except)\b/i;

export function bannedWordsIn(text: string): string[] {
  const found = new Set<string>();
  for (const word of BANNED_WORDS) {
    const pattern = new RegExp(`(^|[^a-z-])${word.replace(/[-\s]/g, m => (m === "-" ? "-" : "\\s+"))}($|[^a-z-])`, "i");
    if (pattern.test(text)) found.add(word);
  }
  return [...found];
}

/** Every sentence the model wrote, for the word, opinion and reading-level checks. */
export type ReadingField = { kind: "headline" | "label" | "text"; get(): string; set(v: string): void };
/**
 * Every piece of text a reader sees, in reading order, each with a way to rewrite it. The jargon and abbreviation
 * checks read them in this order (the first use of a term must carry its explanation), and the repair step
 * (lib/analysis/repair.ts) writes its fixes back through the same list, so the two can never disagree.
 */
export function readingFields(d: SummaryDraft): ReadingField[] {
  const f = <T,>(o: T, k: keyof T, kind: ReadingField["kind"] = "text"): ReadingField => ({ kind, get: () => String(o[k] ?? ""), set: v => { (o as Record<string, unknown>)[k as string] = v; } });
  const at = (list: string[], i: number): ReadingField => ({ kind: "text", get: () => list[i] ?? "", set: v => { list[i] = v; } });
  return [f(d, "headline", "headline"), f(d, "plainEnglish"),
    ...(d.changes ?? []).flatMap(r => [f(r, "label", "label"), f(r, "before"), f(r, "today"), f(r, "ifPassed")]),
    ...(d.howItWorksToday ?? []).map(p => f(p, "text")), f(d, "whyNow"), f(d, "background"),
    ...d.whatItDoes.map(p => f(p, "text")), ...d.whoItAffects.map(p => f(p, "text")), f(d, "whatChangesForYou"),
    ...d.caseFor.map(a => f(a, "argument")), ...d.caseAgainst.map(a => f(a, "argument")), ...d.unknowns.map((_, i) => at(d.unknowns, i))];
}

export function proseOf(d: SummaryDraft): string[] {
  const end = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
  return [end(d.headline), ...(d.plainEnglish ? [d.plainEnglish.trim()] : []), ...(d.howItWorksToday ?? []).map(p => end(p.text)),
    ...(d.changes ?? []).flatMap(r => [...(r.before?.trim() ? [end(r.before)] : []), end(r.today), end(r.ifPassed)]), ...(d.whyNow ? [d.whyNow.trim()] : []), ...(d.background ? [d.background.trim()] : []), ...d.whatItDoes.map(p => end(p.text)), ...d.whoItAffects.map(p => end(p.text)), end(d.whatChangesForYou),
    ...d.caseFor.map(a => end(a.argument)), ...d.caseAgainst.map(a => end(a.argument)), ...d.unknowns.map(end)];
}

/**
 * What the b5 checks need from the run: the official sources the model was given, the agency names (so an agency's
 * name is not read as a program), the actors the record supplies for each side, and whether background is required.
 */
export type SourceContext = { title: string; docs: ReadonlyArray<{ id: string; text: string }>; agencies: readonly string[];
  allowedFor: readonly string[]; allowedAgainst: readonly string[]; needsBackground: boolean;
  /** b7: "How it works today", "What would change" and "Why now" are required and checked. */
  structure?: boolean;
  /** The bill would cancel a rule already issued: every change row must say what the old rule was, the new rule, and what passing does. */
  cancelsRule?: boolean;
  /** What each named member said on the floor: a reason credited to a speaker must come from that speaker's own words. */
  speakers?: ReadonlyArray<{ name: string; text: string }> };

export function checkSummary(d: SummaryDraft, sectionsIn: readonly Section[], opts: { truncated?: boolean; subject?: string; fullText?: string; sources?: SourceContext; b5Shape?: boolean } = {}): CheckResult {
  const failures: string[] = [], warnings: string[] = [];
  const fail = (m: string) => failures.push(m), warn = (m: string) => warnings.push(m);
  // Owner review, 16 Nov: a resolution with no numbered sections was checked against nothing. Its full text is now its one section.
  const sources = opts.sources;
  const sections: Section[] = [...(sectionsIn.length || !opts.fullText ? sectionsIn : [{ num: "FULL", heading: "Full text", text: opts.fullText }]),
    ...(sources?.docs ?? []).map(x => ({ num: x.id.toUpperCase(), heading: x.id, text: x.text }))];
  const cite = (c: string) => /full text/i.test(c) && !sectionsIn.length ? "FULL" : c;

  // Headline: a "Would ..." sentence of at most 20 words.
  const modern = !!(opts.sources || opts.b5Shape); // the 17 Nov writing standard: a clear verb first, at most 15 words
  if (modern) for (const m of headlineProblems(d.headline)) fail(m);
  else {
    if (!/^Would\b/.test(d.headline.trim())) fail("Headline must start with \"Would\".");
    if (wc(d.headline) > LIMITS.headlineWords) fail(`Headline is ${wc(d.headline)} words; the limit is ${LIMITS.headlineWords}.`);
  }

  const points = (label: string, list: Point[]) => {
    if (list.length < 1 || list.length > LIMITS.maxPoints) fail(`${label} needs 1 to ${LIMITS.maxPoints} points; it has ${list.length}.`);
    list.forEach((p, i) => {
      if (wc(p.text) > LIMITS.pointWords) fail(`${label} point ${i + 1} is ${wc(p.text)} words; the limit is ${LIMITS.pointWords}.`);
      if (!p.section.trim()) fail(`${label} point ${i + 1} cites no section.`);
      else if (opts.b5Shape && !sources && /^(RULE|REPORT|CRS|CBO|FLOOR|STATUS|USC )/i.test(p.section.trim())) { /* a source citation; sources are not re-fetched on re-review */ }
      else if (!citeExists(cite(p.section), sections)) fail(`${label} point ${i + 1} cites "${p.section}", which is not a section of this text or one of the sources.`);
      else if (citeSupports(p.text, cite(p.section), sections) === false) fail(`${label} point ${i + 1} shares no key words with ${p.section}; cite the section or source that says it.`);
      else { const share = citeOverlap(p.text, cite(p.section), sections); if (share !== null && share < 0.34) warn(`${label} point ${i + 1} uses mostly words that are not in ${p.section}; check it adds no group or effect the section does not state.`); }
    });
  };
  points("What it does", d.whatItDoes);
  points("Who it affects", d.whoItAffects);

  if (!d.whatChangesForYou.trim()) fail("What changes for you is empty.");
  else if (wc(d.whatChangesForYou) > LIMITS.changesWords) fail(`What changes for you is ${wc(d.whatChangesForYou)} words; the limit is ${LIMITS.changesWords}.`);
  if (NO_CHANGE_UNLESS.test(d.whatChangesForYou)) fail("What changes for you says most people see no change, then adds an exception; say the change for the affected group first.");

  // The case for and against: exactly two each, attributed, of comparable length.
  // b5 (owner review, 16 Nov): 1 or 2 each, attributed only to an actor the official record supplies (the named sponsor,
  // the agency that issued a rule, the reporting committee, its minority views), each citing the source it comes from.
  // A side with no actor in the record is left empty and the page says so.
  const side = (label: string, list: Argument[], allowedActors?: readonly string[]) => {
    if (!allowedActors && opts.b5Shape) { if (list.length > 2) fail(`${label} needs at most 2 arguments; it has ${list.length}.`); }
    else if (!allowedActors) { if (list.length !== 2) fail(`${label} needs exactly 2 arguments; it has ${list.length}.`); }
    else if (!allowedActors.length) { if (list.length) fail(`${label}: the official record names no one who makes this case, so leave it empty; the page says so.`); }
    else if (list.length > 2) fail(`${label} needs at most 2 arguments; it has ${list.length}.`);
    list.forEach((a, i) => {
      const n = wc(a.argument);
      if (n > LIMITS.argumentWords) fail(`${label} argument ${i + 1} is ${n} words; the limit is ${LIMITS.argumentWords}.`);
      if (n < LIMITS.argumentMinWords) fail(`${label} argument ${i + 1} is ${n} words; the minimum is ${LIMITS.argumentMinWords}.`);
      const who = a.attribution.trim();
      if (!who) fail(`${label} argument ${i + 1} has no attribution.`);
      else if (VAGUE_ATTRIBUTION.test(who)) fail(`${label} argument ${i + 1} is attributed only to "${who}"; say which kind of supporter or critic.`);
      if (SAYS_FRAME.test(a.argument)) fail(`${label} argument ${i + 1} starts "… could say"; state the reason itself; the attribution already says who.`);
      if (allowedActors && who && !attributionAllowed(who, allowedActors)) fail(`${label} argument ${i + 1} is attributed to "${who}", who is not in the record; use one of: ${allowedActors.map(x => `"${x}"`).join("; ")}.`);
      if (allowedActors && sources) {
        const src = a.source?.trim() ?? "";
        if (!src) fail(`${label} argument ${i + 1} names no source; cite the official source it comes from.`);
        else if (!citeExists(src, sections)) fail(`${label} argument ${i + 1} cites "${src}", which is not one of the sources provided.`);
        else if (citeSupports(a.argument, src, sections) === false) fail(`${label} argument ${i + 1} shares no key words with ${src}; base it on what that source says.`);
        const speaker = (sources.speakers ?? []).find(sp => new RegExp(`\\b${sp.name.split(" of ")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(who));
        if (speaker && /^FLOOR/i.test(src)) {
          const said = contentWords(speaker.text), arg = [...contentWords(a.argument)];
          if (arg.length && arg.filter(w => said.has(w)).length / arg.length < 0.34) fail(`${label} argument ${i + 1} is credited to ${speaker.name}, but most of its words are not in what ${speaker.name} said on the floor. Use a reason they actually gave.`);
        }
      }
    });
  };
  side("Case for", d.caseFor, sources?.allowedFor);
  side("Case against", d.caseAgainst, sources?.allowedAgainst);
  const forWords = d.caseFor.reduce((n, a) => n + wc(a.argument), 0), againstWords = d.caseAgainst.reduce((n, a) => n + wc(a.argument), 0);
  const gap = Math.abs(forWords - againstWords), allowed = Math.max(8, Math.round(0.25 * Math.max(forWords, againstWords)));
  // With reasons taken from the record, one side may have two and the other one: then compare the length of each argument, not the totals.
  const perFor = d.caseFor.length ? forWords / d.caseFor.length : 0, perAgainst = d.caseAgainst.length ? againstWords / d.caseAgainst.length : 0;
  if (modern) { if (d.caseFor.length && d.caseAgainst.length && Math.abs(perFor - perAgainst) > Math.max(8, 0.3 * Math.max(perFor, perAgainst))) fail(`The case for averages ${Math.round(perFor)} words an argument and the case against ${Math.round(perAgainst)}; give both sides the same care and similar length.`); }
  else if (gap > allowed) fail(`The case for is ${forWords} words and the case against is ${againstWords}; they must be within ${allowed} words of each other.`);

  if (d.unknowns.length < 1 || d.unknowns.length > LIMITS.maxUnknowns) fail(`What we don't know needs 1 to ${LIMITS.maxUnknowns} points; it has ${d.unknowns.length}.`);
  d.unknowns.forEach((u, i) => { if (wc(u) > LIMITS.unknownWords) fail(`What we don't know point ${i + 1} is ${wc(u)} words; the limit is ${LIMITS.unknownWords}.`); });

  const prose = proseOf(d), all = [...prose, ...d.caseFor.map(a => a.attribution), ...d.caseAgainst.map(a => a.attribution)].join(" ");
  const banned = bannedWordsIn(all);
  if (banned.length) fail(`Loaded words: ${banned.join(", ")}. Even in a reason credited to a member, restate it in neutral words: say what the member says would happen, without the label.`);
  for (const [re, label] of OPINION_PATTERNS) if (re.test(all)) fail(`Contains ${label}.`);

  // The bill's own text is a source too: a fact in "What would change" may come straight from it.
  if (sources) checkB5(d, { ...sources, docs: [...sources.docs, { id: "BILL", text: opts.fullText ?? sectionsIn.map(x => `${x.heading} ${x.text ?? ""}`).join(" ") }] }, fail, warn);

  const totalWords = prose.reduce((n, s) => n + words(s).length, 0);
  if (totalWords > (sources ? LIMITS.totalWordsB5 : LIMITS.totalWords)) fail(`The summary is ${totalWords} words; the limit is ${sources ? LIMITS.totalWordsB5 : LIMITS.totalWords} (about two phone screens).`);
  const grade = plainGrade(prose.join(" "), opts.subject); // official names and the bill's own title words count as one short word each
  if (grade > LIMITS.gradeFail) {
    // Round 1 review: the bare grade gave the model nothing to act on, so its second try stayed dense. Name what to fix.
    const long = prose.map(x => ({ x, n: wc(x) })).filter(y => y.n > 18).sort((a, b) => b.n - a.n).slice(0, 3).map(y => `"${words(y.x).slice(0, 6).join(" ")}…" (${y.n} words)`);
    const hard = [...new Set(words(withoutSubjectTerms(withoutOfficialNames(prose.join(" ")), opts.subject)).map(w => w.replace(/[^A-Za-z-]/g, "").toLowerCase()).filter(w => w.length > 8 && syllables(w) >= 4))].slice(0, 6).map(w => `"${w}"`);
    fail(`Reading level is grade ${grade}; the limit is ${LIMITS.gradeFail} (target about 8).${long.length ? ` Split these sentences in two: ${long.join("; ")}.` : ""}${hard.length ? ` Use plainer words for, or explain: ${hard.join(", ")}.` : ""}`);
  }
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

/**
 * Owner review, 16 Nov 2026 (S.J.Res. 197). The new template's rules:
 * - "In plain English": 2–3 sentences: what it does, to whom, why it matters now; not a restatement of the title.
 * - "Background": required when the bill changes or blocks an existing rule or law; from the rule or law itself.
 * - Every named thing in the headline, plain English, background and question must appear in an official source,
 *   where an agency's name ("Centers for Medicare & Medicaid Services") does not count as a mention of a program.
 * - "What changes for you": one concrete example of a real kind of person, never "only matters if you are affected".
 * - The voting question uses the plain headline: "Do you support …?".
 */
export function checkB5(d: SummaryDraft, src: SourceContext, fail: (m: string) => void, warn: (m: string) => void) {
  const texts = [src.title, ...src.docs.map(x => x.text)];
  const claims = (label: string, text: string) => {
    const missing = unsupportedClaims(text, texts, src.agencies);
    if (missing.length) fail(`${label} names ${missing.map(m => `"${m}"`).join(", ")}, which no official source provided says. Use only what the sources say; an agency's name is not a program it runs.`);
  };
  claims("The headline", d.headline);
  if (titleShare(d.headline, src.title) > 0.8 && words(d.headline).length > 6) fail("The headline restates the official title; say what the bill would do in plain words.");

  const plain = d.plainEnglish?.trim() ?? "";
  if (!plain) fail("In plain English is empty.");
  else {
    const n = sentences(plain).length;
    if (n < 2 || n > 3) fail(`In plain English needs 2 or 3 sentences (what it does, who feels it, why it is being fought over now); it has ${n}.`);
    if (wc(plain) > LIMITS.plainWords) fail(`In plain English is ${wc(plain)} words; the limit is ${LIMITS.plainWords}.`);
    if (titleShare(plain, src.title) > 0.6) fail("In plain English mostly restates the official title; explain what it does, to whom, and why it matters now.");
    claims("In plain English", plain);
  }

  const bg = d.background?.trim() ?? "";
  if (src.needsBackground && !bg) fail("Background is required: this bill changes or blocks an existing rule or law; say what that rule or law does today, from its source.");
  if (bg) {
    if (wc(bg) > LIMITS.backgroundWords) fail(`Background is ${wc(bg)} words; the limit is ${LIMITS.backgroundWords}.`);
    const ids = (d.backgroundSources ?? []).map(x => x.trim()).filter(Boolean);
    if (!ids.length) fail("Background names no source; cite the rule, the law or the report it comes from.");
    for (const id of ids) if (!src.docs.some(x => x.id.toUpperCase() === id.toUpperCase())) fail(`Background cites "${id}", which is not one of the sources provided.`);
    claims("Background", bg);
  }

  const q = d.question?.trim() ?? "";
  if (!/^Do you support\b.*\?$/.test(q)) fail("The voting question must read \"Do you support …?\".");
  else {
    if (wc(q) > LIMITS.questionWords) fail(`The voting question is ${wc(q)} words; the limit is ${LIMITS.questionWords}.`);
    if (titleShare(q, src.title) > 0.8 && words(q).length > 8) fail("The voting question restates the official title; use the plain headline.");
    claims("The voting question", q);
  }

  // ── The 17 Nov writing standard (lib/analysis/standard.ts) ──
  // ── b7: how it works today → what would change → why now ──
  const today = d.howItWorksToday ?? [], rows = d.changes ?? [], why = d.whyNow?.trim() ?? "";
  if (src.structure) {
    const L = STRUCTURE_LIMITS;
    if (today.length < L.todayMin || today.length > L.todayMax) fail(`How it works today needs ${L.todayMin} to ${L.todayMax} short bullets that explain the subject from zero; it has ${today.length}.`);
    today.forEach((p, i) => {
      if (wc(p.text) > L.todayWords) fail(`How it works today bullet ${i + 1} is ${wc(p.text)} words; the limit is ${L.todayWords}.`);
      if (!p.section.trim() || !src.docs.some(x => x.id.toUpperCase() === p.section.trim().toUpperCase()) && !/^(?:sec|full)/i.test(p.section.trim())) fail(`How it works today bullet ${i + 1} cites "${p.section}", which is not one of the sources provided.`);
      claims(`How it works today bullet ${i + 1}`, p.text);
    });
    if (rows.length < L.changesMin || rows.length > L.changesMax) fail(`What would change needs ${L.changesMin} to ${L.changesMax} rows, one per change ("Today: … → If this passes: …"); it has ${rows.length}.`);
    rows.forEach((r, i) => {
      const why2 = vagueChangeRow(r);
      if (why2) fail(`What would change row ${i + 1} is vague: ${why2}. Say what the rule is today and what it would be, with the number or date from the sources.`);
      if (wc(r.today) > L.rowWords || wc(r.ifPassed) > L.rowWords) fail(`What would change row ${i + 1} is too long; each side is at most ${L.rowWords} words.`);
      if (!r.source?.trim()) fail(`What would change row ${i + 1} names no source.`);
      if (!r.label?.trim()) fail(`What would change row ${i + 1} has no label; name the thing that changes in a few words ("The fee insurers pay").`);
      else if (wc(r.label) > 14) fail(`What would change row ${i + 1}'s label is ${wc(r.label)} words; keep it under 15.`);
      if (src.cancelsRule && !r.before?.trim()) fail(`What would change row ${i + 1} does not say what the old rule was. For a bill that cancels a rule, give all three: before the rule, now under the rule, and if this bill passes.`);
      claims(`What would change row ${i + 1}`, `${r.label ?? ""}. ${r.before ?? ""} ${r.today} ${r.ifPassed}`);
    });
    if (rows.length && !rows.some(r => HAS_SPECIFIC.test(`${r.today} ${r.ifPassed}`))) fail("What would change has no number or date in any row. Use the figures in the sources.");
    if (!why) fail("Why now is empty: say in one or two sentences why this is being voted on now (a deadline, a new rule, a court ruling, a vote).");
    else {
      const n = sentences(why).length;
      if (n > 2) fail(`Why now is ${n} sentences; use one or two.`);
      if (wc(why) > L.whyNowWords) fail(`Why now is ${wc(why)} words; the limit is ${L.whyNowWords}.`);
      if (!HAS_SPECIFIC.test(why)) fail("Why now gives no date or vote. Say what happened and when, from the sources.");
      claims("Why now", why);
    }
  }

  // Owner review, 17 Nov: before reading the rows the reader must already know what the old rule was and what the new rule is.
  if (src.structure && src.cancelsRule && !plainStatesAChange(plain, rows))
    fail("In plain English does not say what the old rule was and what the new rule is. Give at least one change with both figures (before the rule, and now), taken from a What would change row, as in the example: \"no plan could leave one person owing over $12,000 a year …; now some plans can go up to $15,600\".");

  // Owner review, 17 Nov: "raises the most some buyers can owe" says nothing. From what, to what?
  if (src.structure) for (const x of unquantifiedChanges([plain, ...today.map(p => p.text), ...rows.flatMap(r => [r.before ?? "", r.today, r.ifPassed])].join(" ")))
    fail(`"${x}…" says something goes up or down without the number. Say from what to what, with the figures in the sources.`);

  const reading = readingFields(d).map(f => f.get().trim());
  for (const t of unexplainedJargon(reading)) fail(t.part === 0
    ? `The headline uses "${t.term}"; a headline has no room to explain it, so use plain words (${t.plain}).`
    : `"${t.term}" is used without explaining it. Replace it with plain words (${t.plain}) or explain it in parentheses the first time.`);
  const ac = unexplainedAcronyms(reading.slice(1));
  if (ac.length) fail(`Abbreviation${ac.length > 1 ? "s" : ""} never spelled out: ${ac.map(a => `"${a}"`).join(", ")}. Write the full name first, or use plain words.`);
  const filler = fillerIn([d.headline, plain, ...d.whatItDoes.map(p => p.text), ...d.whoItAffects.map(p => p.text), d.whatChangesForYou].join(" . "));
  if (filler.length) fail(`Filler instead of facts: ${filler.join("; ")}. Say exactly what changes, with the numbers, dates and people the sources give.`);
  const specifics = [d.headline, plain, ...d.whatItDoes.map(p => p.text)].join(" ");
  if (!HAS_SPECIFIC.test(specifics)) {
    if (d.confidence !== "low") fail("No concrete fact (a number, dollar amount, date or count of people) in the headline, plain English or what it does. Use the specifics in the sources; if the sources truly do not say what changes, say that plainly in what we don't know and set confidence to low.");
    else warn("The sources give no concrete figures; the summary says so and is low-confidence.");
  }
  const did = d.whatItDoes.map(p => p.text);
  [["Case for", d.caseFor], ["Case against", d.caseAgainst]].forEach(([label, list]) => (list as Argument[]).forEach((a, i) => {
    if (mechanicsShare(a.argument, did) >= 0.8) fail(`${label} argument ${i + 1} only repeats what the bill does. Give the reason and the stakes: ${label === "Case for" ? "why would someone want this?" : "what would be lost or harmed?"}`);
  }));

  if (CIRCULAR_CHANGE.test(d.whatChangesForYou)) fail("What changes for you is circular (\"only matters if you are affected\"); give one concrete example of a real person and what would change for them.");
  else if (!HAS_EXAMPLE.test(d.whatChangesForYou)) fail("What changes for you needs one concrete example of a real kind of person, e.g. \"A family in Ohio buying a 2027 marketplace plan would …\".");
  if (!d.caseAgainst.length) warn("No public statement of reasons against it was found in the official record; the page says so.");
  if (!d.caseFor.length) warn("No public statement of reasons for it was found in the official record; the page says so.");
}

const FIGURES = /\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|trillion))?|\d[\d,]*(?:\.\d+)?\s?(?:percent|%)|\b\d[\d,]*(?:\.\d+)?\s(?:years?|months?|days?|hours?|weeks?)\b/gi;
const figuresIn = (t: string) => (t.match(FIGURES) ?? []).map(x => x.replace(/\s+/g, " ").replace(/,/g, "").toLowerCase());
/** Does the plain-English part state one change with its figure before the rule and its figure now? Rows without figures on both sides are not asked for. */
export function plainStatesAChange(plain: string, rows: ReadonlyArray<{ before?: string; today: string }>): boolean {
  const said = new Set(figuresIn(plain));
  const numeric = rows.filter(r => figuresIn(r.before ?? "").length && figuresIn(r.today).length);
  if (!numeric.length) return true;
  return numeric.some(r => figuresIn(r.before ?? "").some(x => said.has(x)) && figuresIn(r.today).some(x => said.has(x) && !figuresIn(r.before ?? "").includes(x)));
}

// ───────────── Claim checks (formerly claims.ts; kept in this file so the tests load it without a bundler) ─────────────
/**
 * Owner review, 16 Nov 2026: S.J.Res. 197's headline said the rule was for "Medicare, Medicaid". It is the ACA
 * marketplace payment rule for 2027 and the Basic Health Program; the model read the agency's name, "Centers for
 * Medicare & Medicaid Services", as the programs. These pure checks make every named thing in the headline, the
 * plain-English summary, the background and the voting question appear in an official source, where an agency's
 * name does not count as a mention of a program. No network, no model.
 */

const CIVIC = new Set(("would do you support congress senate house representatives representative senator senators president federal government " +
  "state states united america american americans member members sec section bill bills resolution resolutions act acts law laws rule rules agency " +
  "department the a an this that these those it its if for and or of to in on by with under from as at is are be not no yes would could should " +
  "most some many any all each every new current today now under after before when while").split(" "));

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** An agency's own name, and the short forms readers know it by, so a mention of the agency is not taken as a mention of a program. */
export function agencyForms(names: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    const n = raw.trim().replace(/\s+/g, " ");
    if (!n) continue;
    out.add(n);
    const dept = n.match(/^(.+?) Department$/); if (dept) { out.add(dept[1]); out.add(`Department of ${dept[1]}`); }
    const deptOf = n.match(/^Department of (?:the )?(.+)$/); if (deptOf) { out.add(deptOf[1]); out.add(`${deptOf[1]} Department`); }
    for (const part of n.split(/\s+of the\s+/)) if (part !== n && part.split(" ").length > 1) out.add(part);
    const initials = n.split(/\s+/).filter(w => /^[A-Z]/.test(w)).map(w => w[0]).join("");
    if (initials.length >= 2 && initials.length <= 5) out.add(initials);
  }
  if ([...out].some(x => /Health and Human Services/.test(x))) out.add("HHS");
  if ([...out].some(x => /Centers for Medicare & Medicaid Services/.test(x))) { out.add("CMS"); out.add("Centers for Medicare and Medicaid Services"); }
  return [...out].sort((a, b) => b.length - a.length);
}

/** Generic agency and committee names ("Department of …", "… Commission", "Committee on …"). */
const AGENCY_AFTER = /\b(?:Centers?|Department|Administration|Agency|Commission|Bureau|Office|Service|Services|Board|Corporation|Institutes?|Authority|Council|Committee)\s+(?:of|for|on)\s+(?:the\s+)?[A-Z][\w'’.-]*(?:\s+(?:(?:and|&|of|the|for)\s+)?[A-Z][\w'’.-]*)*/g;
const AGENCY_BEFORE = /\b(?:[A-Z][\w'’.-]*\s+(?:(?:and|&|of)\s+)?){1,5}(?:Department|Administration|Agency|Commission|Bureau|Office|Service|Board|Corporation|Authority|Council)\b/g;

export function maskAgencies(text: string, agencies: readonly string[]): string {
  let t = text;
  for (const a of agencyForms(agencies)) t = t.replace(new RegExp(`\\b${esc(a)}\\b`, "g"), " AGENCYNAME ");
  return t.replace(AGENCY_AFTER, " AGENCYNAME ").replace(AGENCY_BEFORE, " AGENCYNAME ");
}

/** Named things a reader would take as facts: capitalised words that do not start a sentence, acronyms, years, money and percentages. */
export function claimTerms(text: string): string[] {
  const out = new Set<string>();
  for (const sentence of text.split(/(?<=[.!?])\s+|;\s+|:\s+/)) {
    const tokens = sentence.trim().split(/\s+/).filter(Boolean);
    tokens.forEach((tok, i) => {
      const w = tok.replace(/^[("“'‘]+|[)"”'’,.;:!?]+$/g, "").replace(/['’]s$/, "");
      if (!w) return;
      if (/^\$?\d[\d,.]*(?:%| percent| million| billion)?$/.test(w) && (/^(19|20)\d{2}$/.test(w) || /^\$/.test(w) || /%$/.test(tok))) { out.add(w); return; }
      if (/^[A-Z]{2,6}s?$/.test(w)) { out.add(w.replace(/s$/, "")); return; } // acronym, even at the start
      if (i === 0) return; // a sentence's first word is capitalised anyway
      if (/^[A-Z][a-z][\w.-]*$/.test(w) && w.length >= 3 && !CIVIC.has(w.toLowerCase())) out.add(w);
    });
  }
  return [...out];
}

function initialsIn(corpus: string): Set<string> {
  const out = new Set<string>();
  const words = corpus.split(/[^A-Za-z&]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    let acc = "";
    for (let j = i; j < Math.min(words.length, i + 7); j++) {
      const w = words[j];
      if (/^(of|and|the|for|&|on)$/i.test(w)) continue;
      if (!/^[A-Z]/.test(w)) break;
      acc += w[0];
      if (acc.length >= 2) out.add(acc);
    }
  }
  return out;
}

/** Terms in `claim` that no official source supports, once agency names are masked on both sides. */
export function unsupportedClaims(claim: string, sources: readonly string[], agencies: readonly string[]): string[] {
  const corpusRaw = maskAgencies(sources.join(" \n "), agencies);
  const corpus = corpusRaw.toLowerCase();
  const inits = initialsIn(corpusRaw);
  return claimTerms(maskAgencies(claim, agencies)).filter(t => {
    if (t === "AGENCYNAME") return false;
    // The name people know is accurate when the source uses the official one ("HealthCare.gov" for a Federally-facilitated Exchange).
    if (EVERYDAY_NAMES.some(n => n.everyday.test(t) && n.official.test(corpusRaw))) return false;
    if (/^[A-Z]{2,6}$/.test(t)) return !(new RegExp(`\\b${esc(t)}\\b`).test(corpusRaw) || inits.has(t));
    const l = t.toLowerCase();
    if (/^[\d$]/.test(t)) return !corpus.includes(l.replace(/^\$/, "")) ;
    const stem = l.replace(/(ies|es|s)$/, "");
    return !new RegExp(`\\b${esc(stem)}`).test(corpus);
  });
}

const CONTENT = (s: string) => new Set((s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(w => !CIVIC.has(w) && !["would", "block", "blocks", "blocking", "allow", "require"].includes(w)).map(w => w.replace(/(ies|es|s)$/, "")));

/** Share of a passage's content words that are words of the official title: a high share means it restates the title. */
export function titleShare(text: string, title: string): number {
  const t = CONTENT(title), w = [...CONTENT(text)];
  return w.length ? w.filter(x => t.has(x)).length / w.length : 0;
}

export const CIRCULAR_CHANGE = /\bonly\s+(?:matter|matters|apply|applies|affect|affects)\b[^.]*\bif\b|\bif you are affected\b|\bwould notice no direct change\b|\bif (?:the|this) (?:rule|bill|law|resolution) (?:applies|affects) (?:to )?you\b|\bdepends on whether you are affected\b/i;
// 17 Nov, first real run: "A company planning a uranium enrichment plant could start building …" and "A soldier medically
// retired after a combat injury and 12 years of service could keep …" were refused. A kind of person, then what happens to them.
export const HAS_EXAMPLE = /\bfor (?:example|instance)\b|(?:^|[.!?]\s+)(?:A|An|One|Someone)\s+(?:[a-z0-9-]+\s+){0,5}(?:who|whose|in|with|buying|earning|working|living|receiving|running|filing|paying|retiring|serving|shopping|enrolled|getting|using|covered)\b|(?:^|[.!?]\s+)(?:A|An|One|Someone)\s+(?:[\w'’$,()%.-]+\s+){1,16}?(?:would|could|will|can|may|must|might)\b/;

export function sentences(text: string): string[] { return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean); }

/** Does an attribution name one of the actors the record supplies? Generic labels ("budget analysts") do not. */
export function attributionAllowed(attribution: string, allowed: readonly string[]): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9& ]+/g, " ").replace(/\s+/g, " ").trim();
  const a = n(attribution);
  return allowed.some(x => { const b = n(x); return !!b && (a === b || a.includes(b) || b.includes(a) && a.split(" ").length >= 2); });
}
