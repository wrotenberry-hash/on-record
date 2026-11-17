/**
 * Mechanical repairs to a draft before it is checked (17 Nov 2026, after the first real run of the b7 generator).
 *
 * In that run no draft passed the written rules in three tries, mostly for faults a program can fix better than a
 * second model call: a term from the jargon list used without its plain-words explanation, "CBO" never spelled out,
 * a source id written into a sentence, "Bill text" or "CRS; REPORT; FLOOR" given as the citation. This step fixes
 * exactly those, using the reviewed jargon list's own wording, and changes nothing else. No model, no network.
 * Everything it cannot fix (a wrong fact, a vague row, a headline with jargon) still fails the check and goes back
 * to the model as feedback.
 */
import { explainedAt, JARGON, unexplainedAcronyms, unexplainedJargon } from "./standard.ts";
import { readingFields, type SummaryDraft } from "./checker.ts";

/** Bodies whose initials the sources use. The first use becomes "Full Name (ABC)". */
export const KNOWN_ABBREVIATIONS: Record<string, string> = {
  CBO: "Congressional Budget Office", CRS: "Congressional Research Service", HHS: "Department of Health and Human Services",
  CMS: "Centers for Medicare & Medicaid Services", VA: "Department of Veterans Affairs", NRC: "Nuclear Regulatory Commission",
  SEC: "Securities and Exchange Commission", IRS: "Internal Revenue Service", DOD: "Department of Defense", EPA: "Environmental Protection Agency",
  FDA: "Food and Drug Administration", GAO: "Government Accountability Office", OMB: "Office of Management and Budget", DHS: "Department of Homeland Security",
  FEMA: "Federal Emergency Management Agency", USDA: "Department of Agriculture", ACA: "Affordable Care Act", DOE: "Department of Energy",
  DOJ: "Department of Justice", FBI: "Federal Bureau of Investigation", FAA: "Federal Aviation Administration", FCC: "Federal Communications Commission",
  FTC: "Federal Trade Commission", SBA: "Small Business Administration", SSA: "Social Security Administration", HUD: "Department of Housing and Urban Development",
};

const ID = "(?:RULE|REPORT|CRS|CBO|FLOOR\\d?|STATUS|PRIMER|BILL|FULL|USC \\d+ §[0-9A-Za-z-]+)";
const ID_ONLY = new RegExp(`^${ID}$`, "i");
/** "(RULE)", "[REPORT; FLOOR]" written into a sentence. */
const ID_IN_BRACKETS = new RegExp(`\\s*[(\\[]\\s*(?:source:?\\s*)?${ID}(?:\\s*[,;]\\s*${ID})*\\s*[)\\]]`, "g");
/** A source id used as a word: "REPORT says", "the STATUS source". */
const ID_AS_WORD: Array<[RegExp, string]> = [
  [/\b(?:[Tt]he )?REPORT(?: source)?\b/g, "the committee report"], [/\b(?:[Tt]he )?STATUS(?: source| record)?\b/g, "the bill's record in Congress"],
  [/\b(?:[Tt]he )?FLOOR\d?(?: source| record)?\b/g, "the floor debate"], [/\b(?:[Tt]he )?RULE(?: source)\b/g, "the rule"], [/\b(?:[Tt]he )?PRIMER(?: source)?\b/g, "the background"],
];
const BILL_TEXT = /^(?:the )?(?:bill|bill text|text of the bill|resolution|resolution text|full text|text)$/i;

const capitalise = (text: string) => text.replace(/(^|[.!?]\s+)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/** One valid citation from whatever the model wrote: the first part that is a section or a source it was given. */
export function repairCitation(cite: string, ctx: { sourceIds: readonly string[]; numberedSections: boolean }): string {
  const c = cite.trim();
  if (!c) return c;
  const ids = new Set(ctx.sourceIds.map(x => x.toUpperCase()));
  const one = (p: string) => BILL_TEXT.test(p) && !ctx.numberedSections ? "Full text" : ID_ONLY.test(p) && !/^USC /i.test(p) ? p.toUpperCase() : p;
  const valid = (p: string) => p === "Full text" || ids.has(p.toUpperCase()) || /(?:sec(?:tion)?s?\.?|§)\s*\d/i.test(p);
  // A list of sources ("CRS; REPORT; FLOOR", "RULE and FLOOR"); a list of sections ("Sec. 2(a), Sec. 2(b)") is left as it is.
  const parts = c.split(/\s*;\s*/).flatMap(p => /sec(?:tion)?s?\.?\s*\d|§/i.test(p) ? [p] : p.split(/\s*,\s*|\s+and\s+/)).map(p => one(p.trim())).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? c;
  return parts.find(valid) ?? parts[0];
}

export type Repair = { draft: SummaryDraft; notes: string[] };

export function repairDraft(input: SummaryDraft, ctx: { sourceIds: readonly string[]; numberedSections: boolean }): Repair {
  const d = structuredClone(input) as SummaryDraft, notes: string[] = [];

  // 1. Citations.
  const fixCite = <T,>(o: T, k: keyof T) => {
    const before = String(o[k] ?? ""), after = repairCitation(before, ctx);
    if (after !== before) { (o as Record<string, unknown>)[k as string] = after; notes.push(`citation "${before}" → "${after}"`); }
  };
  for (const p of [...d.whatItDoes, ...d.whoItAffects, ...(d.howItWorksToday ?? [])]) fixCite(p, "section");
  for (const r of d.changes ?? []) fixCite(r, "source");
  for (const a of [...d.caseFor, ...d.caseAgainst]) if (a.source !== undefined) fixCite(a, "source");

  // 2. Source ids written into sentences.
  for (const f of readingFields(d)) {
    const before = f.get();
    if (!before) continue;
    let after = before.replace(ID_IN_BRACKETS, "");
    for (const [re, words] of ID_AS_WORD) after = after.replace(re, words);
    after = capitalise(after.replace(/\s+([.,;:])/g, "$1").replace(/\s{2,}/g, " ")).trim();
    if (after !== before.trim()) { f.set(after); notes.push("source id removed from a sentence"); }
  }

  // 3. Known abbreviations: the first use is spelled out.
  for (const a of unexplainedAcronyms(readingFields(d).slice(1).map(f => f.get()))) {
    const full = KNOWN_ABBREVIATIONS[a];
    if (!full) continue;
    const re = new RegExp(`(?<![A-Za-z(])${a}(?![A-Za-z])`);
    const field = readingFields(d).slice(1).find(f => re.test(f.get()));
    if (!field) continue;
    field.set(field.get().replace(re, `${full} (${a})`));
    notes.push(`"${a}" spelled out`);
  }

  // 4. Jargon: the reviewed plain-words explanation, in parentheses, at the first use. Never in the headline or a row label.
  for (let pass = 0; pass < 3; pass++) {
    const fields = readingFields(d), open = unexplainedJargon(fields.map(f => f.get())).filter(t => fields[t.part].kind === "text");
    if (!open.length) break;
    let changed = false;
    for (const t of open) {
      const field = fields[t.part], text = field.get(), term = JARGON.find(x => x.plain === t.plain);
      const m = term?.re.exec(text);
      if (!m || explainedAt(text, m.index, m[0].length)) continue;
      const end = m.index + m[0].length;
      field.set(`${text.slice(0, end)} (${t.plain})${text.slice(end)}`);
      notes.push(`"${m[0]}" explained`); changed = true;
    }
    if (!changed) break;
  }
  return { draft: d, notes };
}
