/**
 * Two tiers (owner, 20 Nov 2026): "A summary's CORE is: headline, plain-English part, 'how it works today', 'what would
 * change', and where it stands. The EXTENDED sections are everything else (reasons for and against, who it affects,
 * what changes for you, cost, what we don't know). A summary goes on show when its core passes every check and the
 * claim-by-claim reading. Each extended section appears only when it passes separately; until then it is simply
 * absent, with no 'coming' placeholder."
 *
 * "Where it stands" and the cost are not written by the model: they come from the official record, so they have no
 * part here. Every check already names the part it is about in its first words ("In plain English is 83 words …");
 * this file sorts those messages into core and extended, and says which parts a correction may touch (repair mode:
 * "correct that item in place … and re-check only what changed"). Pure (no imports), so node's test runner loads it:
 * tests/two-tiers.test.mjs.
 */
export const CORE_PARTS = ["headline", "plainEnglish", "howItWorksToday", "changes"] as const;
export const EXTENDED_PARTS = ["whatItDoes", "whoItAffects", "whatChangesForYou", "caseFor", "caseAgainst", "unknowns", "whyNow", "question"] as const;
export type CorePart = (typeof CORE_PARTS)[number];
export type ExtendedPart = (typeof EXTENDED_PARTS)[number];
export type Part = CorePart | ExtendedPart;
const ALL_PARTS: readonly Part[] = [...CORE_PARTS, ...EXTENDED_PARTS];
export const isCorePart = (p: Part): p is CorePart => (CORE_PARTS as readonly string[]).includes(p);

/** How each part is named at the start of a check's message. The same names the writer is given back when a part must be corrected. */
export const PART_LABEL: Record<Part, string> = { headline: "The headline", plainEnglish: "In plain English", howItWorksToday: "How it works today", changes: "What would change",
  whatItDoes: "What it does", whoItAffects: "Who it affects", whatChangesForYou: "What changes for you", caseFor: "Case for", caseAgainst: "Case against",
  unknowns: "What we don't know", whyNow: "Why now", question: "The voting question" };

/** The fields of a draft that make up each part (a part's fact ids travel with it). */
export const PART_KEYS: Record<Part, readonly string[]> = { headline: ["headline", "headlineFacts"], plainEnglish: ["plainEnglish", "plainEnglishFacts"], howItWorksToday: ["howItWorksToday"],
  changes: ["changes"], whatItDoes: ["whatItDoes"], whoItAffects: ["whoItAffects"], whatChangesForYou: ["whatChangesForYou", "whatChangesFacts"], caseFor: ["caseFor"], caseAgainst: ["caseAgainst"],
  unknowns: ["unknowns"], whyNow: ["whyNow", "whyNowFacts"], question: ["question"] };

const STARTS: Array<[RegExp, readonly Part[]]> = [
  [/^(?:The headline|Headline)\b/, ["headline"]], [/^In plain English\b/, ["plainEnglish"]], [/^What would change\b/, ["changes"]], [/^How it works today\b/, ["howItWorksToday"]],
  [/^Why now\b/, ["whyNow"]], [/^What it does\b/, ["whatItDoes"]], [/^Who it affects\b/, ["whoItAffects"]], [/^What changes for you\b/, ["whatChangesForYou"]],
  [/^Case for\b/, ["caseFor"]], [/^Case against\b/, ["caseAgainst"]], [/^What we don't know\b/, ["unknowns"]], [/^The voting question\b/, ["question"]],
  // The two cases compared with each other (length, balance).
  [/^The case for (?:averages|is)\b/, ["caseFor", "caseAgainst"]],
  // The average-reader test: its judge on a credited reason; the reader of the short note; the reader of the page.
  [/^Average-reader test: The case for\b/, ["caseFor"]], [/^Average-reader test: The case against\b/, ["caseAgainst"]],
  [/^Average-reader test: A reader (?:given only the headline|got|did not understand)\b|^Average-reader test: A reader's answer\b/, ["headline", "plainEnglish"]],
  [/^Average-reader test: A reader (?:given the page|of the page)\b/, ["plainEnglish", "changes", "howItWorksToday"]],
];

const textOf = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The words a message quotes, for the checks that name a word and not a part: a loaded word, a term never explained, an abbreviation. */
function quotedWords(failure: string): string[] | null {
  const loaded = failure.match(/^Loaded words: ([^.]+)\./);
  if (loaded) return loaded[1].split(",").map(w => w.trim()).filter(Boolean);
  const term = failure.match(/^"([^"]+?)…?" (?:is used without explaining it|says something goes up or down)/);
  if (term) return [term[1]];
  const abbr = failure.match(/^Abbreviations? never spelled out: ([^.]+)\./);
  if (abbr) return [...abbr[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  return null;
}

/**
 * The parts a check's message is about; null when it could be anywhere on the page (the reading level, the tone, the
 * total length). `draft` lets a message that names only a word be traced to the parts that hold the word.
 */
export function partsOfFailure(failure: string, draft: Record<string, unknown> = {}): Part[] | null {
  const named = STARTS.filter(([re]) => re.test(failure)).at(-1);
  if (named) return [...named[1]];
  const words = quotedWords(failure);
  if (!words?.length) return null;
  const hit = new Set<Part>();
  for (const w of words) {
    const re = new RegExp(`(^|[^A-Za-z-])${escapeRe(w).replace(/\s+/g, "\\s+")}($|[^A-Za-z-])`, "i");
    const where = ALL_PARTS.filter(p => re.test(textOf(draft[p])));
    if (!where.length) return null;
    for (const p of where) hit.add(p);
  }
  return [...hit];
}

export type Tiered = {
  /** What stops the summary itself: a fault in a core part, or one that could be anywhere. */ core: string[];
  /** For each extended part with a fault: why it is withheld. */ extended: Partial<Record<ExtendedPart, string[]>>;
};

/** Sorts a draft's check messages into the two tiers. */
export function tierFailures(failures: readonly string[], draft: Record<string, unknown> = {}): Tiered {
  const out: Tiered = { core: [], extended: {} };
  for (const f of failures) {
    const parts = partsOfFailure(f, draft);
    if (!parts || parts.some(isCorePart)) { out.core.push(f); continue; }
    for (const p of parts as ExtendedPart[]) (out.extended[p] ??= []).push(f);
  }
  return out;
}

/**
 * The extended parts withheld from readers, in page order. The reasons for and against are one section on the page:
 * a fault on either side withholds both, so a reader is never shown one side of a question alone.
 */
export function withheldParts(t: Tiered): ExtendedPart[] {
  const bad = new Set(EXTENDED_PARTS.filter(p => (t.extended[p]?.length ?? 0) > 0));
  if (bad.has("caseFor") || bad.has("caseAgainst")) { bad.add("caseFor"); bad.add("caseAgainst"); }
  return EXTENDED_PARTS.filter(p => bad.has(p));
}

/** The parts a correction may change: those the failures name. null when a failure could be anywhere, so any part may change. */
export function partsToCorrect(failures: readonly string[], draft: Record<string, unknown> = {}): Part[] | null {
  const out = new Set<Part>();
  for (const f of failures) { const parts = partsOfFailure(f, draft); if (!parts) return null; for (const p of parts) out.add(p); }
  return ALL_PARTS.filter(p => out.has(p));
}

/**
 * Repair mode: a corrected draft replaces only the parts that were to be corrected; every other part stays exactly as
 * it was. Returns the parts whose text really changed (only those are read again).
 */
export function correctedInPlace<T extends Record<string, unknown>>(prior: T, next: T, parts: readonly Part[] | null): { draft: T; changed: Part[] } {
  const draft = structuredClone(prior) as Record<string, unknown>, changed: Part[] = [];
  for (const p of parts ?? ALL_PARTS) {
    const before = JSON.stringify(PART_KEYS[p].map(k => prior[k])), after = JSON.stringify(PART_KEYS[p].map(k => next[k]));
    if (before === after) continue;
    for (const k of PART_KEYS[p]) draft[k] = structuredClone(next[k]);
    changed.push(p);
  }
  if (!parts) for (const k of Object.keys(next)) if (!ALL_PARTS.some(p => PART_KEYS[p].includes(k))) draft[k] = structuredClone(next[k]);
  return { draft: draft as T, changed };
}

/** What a part looks like, for telling whether it changed between two drafts. */
export const partSignature = (draft: Record<string, unknown>, p: Part) => JSON.stringify(PART_KEYS[p].map(k => draft[k] ?? null));

/** A withheld part as it is stored for readers: nothing. The text itself is kept beside the reasons, for the editor and for a later correction. */
export function blankWithheld<T extends Record<string, unknown>>(draft: T, withheld: readonly ExtendedPart[]): T {
  const out = structuredClone(draft) as Record<string, unknown>;
  for (const p of withheld) out[p] = typeof draft[p] === "string" ? "" : [];
  return out as T;
}

/** Where the list of a summary's withheld parts is kept (the existing key-value store; no new table). */
export const sectionsKey = (summaryId: string) => `summary:sections:${summaryId}`;
export type SectionState = { v: string; withheld: ExtendedPart[]; reasons: Partial<Record<ExtendedPart, string[]>>; /** The withheld text, never shown to readers. */ text: Partial<Record<ExtendedPart, unknown>>; at: number };
/** Reads a stored state; anything unreadable, or written for another wording of the summary, withholds nothing. */
export function readSectionState(raw: string | null | undefined, promptVersion: string): { withheld: ExtendedPart[]; reasons: Partial<Record<ExtendedPart, string[]>> } {
  if (!raw) return { withheld: [], reasons: {} };
  try {
    const s = JSON.parse(raw) as Partial<SectionState>;
    if (s.v !== promptVersion || !Array.isArray(s.withheld)) return { withheld: [], reasons: {} };
    return { withheld: s.withheld.filter((p): p is ExtendedPart => (EXTENDED_PARTS as readonly string[]).includes(p)), reasons: s.reasons ?? {} };
  } catch { return { withheld: [], reasons: {} }; }
}

/** The headings a reader sees, for the editor's note about what is not shown yet. */
export const SECTION_NAME: Record<ExtendedPart, string> = { whatItDoes: "What it does", whoItAffects: "Who it affects", whatChangesForYou: "What changes for you", caseFor: "The case for and against",
  caseAgainst: "The case for and against", unknowns: "What we don't know", whyNow: "Why now", question: "The voting question" };
