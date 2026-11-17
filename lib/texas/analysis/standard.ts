/**
 * The federal writing standard, applied to Texas bills (owner instruction, 17 Nov 2026: "same standard and
 * average-reader test"). The rules themselves are the federal ones, imported unchanged from lib/analysis/checker.ts,
 * standard.ts and repair.ts. This file only translates between the two worlds, because three federal parts are
 * written for Congress and cannot be changed from here (lib/analysis is the lead's this week):
 *
 *   1. Citations. The federal checker knows "Sec. 2" and a fixed list of source ids (RULE, REPORT, CRS, CBO, FLOOR,
 *      STATUS, PRIMER, "USC 10 §1413a"). Texas bills number sections "SECTION 1.01" and cite ANALYSIS, HRO, FISCAL,
 *      LAW. Before the federal check runs, each Texas citation is swapped for a stand-in the federal checker accepts;
 *      its messages are translated back. The model and the page only ever see the Texas ids.
 *   2. Jargon. A few federal explanations are wrong in Texas ("fiscal year … starts October 1", "appropriations: money
 *      Congress approves", "enrolled: signed up; people in the plans", "sponsor: the member who wrote the bill"). Those
 *      terms are hidden from the federal list and checked against the Texas list below, by the same rule.
 *   3. Abbreviations and source ids the federal repair step does not know (LBB, HRO, "the FISCAL source").
 *
 * What the lead could later share between the two: citedSection() taking article-style numbers and a per-jurisdiction
 * id list; JARGON and KNOWN_ABBREVIATIONS taking a jurisdiction; the id list in repair.ts.
 *
 * Pure: no database, no network, no model. Tested in tests/texas-summaries.test.mjs.
 */
import { checkSummary, contentWords, readingFields, type CheckResult, type Section, type SummaryDraft } from "../../analysis/checker.ts";
import { explainedAt, plainWordsNearby, unexplainedAcronyms, type JargonTerm } from "../../analysis/standard.ts";
import { repairDraft } from "../../analysis/repair.ts";
import { txCitedSection, type TxSection } from "./sources.ts";

// ───────────── Texas source ids ─────────────

export const TX_SOURCE_IDS = ["ANALYSIS", "HRO", "FISCAL", "STATUS", "LAW", "LAW2", "PRIMER"] as const;
export type TxSourceId = (typeof TX_SOURCE_IDS)[number];
/** The stand-in each Texas id travels under inside the federal checker (any id on its fixed list will do). */
const FEDERAL_STAND_IN: Record<TxSourceId, string> = { ANALYSIS: "REPORT", HRO: "CRS", FISCAL: "CBO", STATUS: "STATUS", LAW: "USC 1 §1", LAW2: "USC 2 §2", PRIMER: "PRIMER" };
export const isTxSourceId = (c: string): c is TxSourceId => (TX_SOURCE_IDS as readonly string[]).includes(c.trim().toUpperCase());

// ───────────── Jargon: the Texas list ─────────────

const j = (term: string, pattern: string, plain: string): JargonTerm => ({ term, re: new RegExp(`\\b(?:${pattern})\\b`, "i"), plain });

/**
 * Texas terms an average reader does not know, each with reviewed plain words. Checked exactly like the federal list:
 * replaced by plain words or explained in parentheses on first use, never in the headline. Add a term whenever a
 * review or the reader test finds a new one. No explanation carries a figure (a figure must come from the sources).
 */
export const TX_JARGON: JargonTerm[] = [
  // How the Legislature works
  j("engrossed", "engross(?:ed|ment)", "the version passed by the chamber where the bill started"),
  j("enrolled", "enrolled (?:bill|version|text|copy)|reported enrolled", "the final version passed by both chambers"),
  j("committee substitute", "committee substitutes?|substituted in committee", "a rewritten version approved by a committee"),
  j("viva voce", "viva voce", "by voice, with no record of how each member voted"),
  j("sine die", "sine die", "the last day of the session"),
  j("Calendars Committee", "(?:committee on |local and consent )?calendars committee|calendar committee", "the House committee that decides which bills reach a vote"),
  j("intent calendar", "intent calendar", "the Senate's list of bills members plan to bring up"),
  j("point of order", "points? of order", "a member's objection that a rule was broken"),
  j("second reading", "(?:second|2nd) reading", "the first of two votes a chamber takes on a bill"),
  j("third reading", "(?:third|3rd) reading", "the final vote a chamber takes on a bill"),
  j("joint resolution", "joint resolutions?", "a measure that asks voters to change the Texas Constitution"),
  j("sponsor", "(?:co-?)?sponsors?", "the member who carries the bill in the other chamber"),
  j("called session", "called sessions?|special sessions?", "extra weeks of lawmaking that only the Governor can order"),
  j("sunset review", "sunset (?:review|date|provision|bill|advisory commission|act)|sunsets?", "a scheduled review that ends a state agency unless lawmakers renew it"),
  j("preempt", "pre-?empt(?:s|ed|ion|ing)?", "override city and county rules"),
  // Money
  j("fiscal note", "fiscal notes?", "the state budget office's estimate of what the bill would cost"),
  j("appropriations", "appropriat(?:ions?|es?|ed|ing)", "money the Legislature approves to be spent"),
  j("fiscal year", "fiscal years?", "the state's budget year, which starts September 1"),
  j("biennium", "bienni(?:um|al|a)", "the state's two-year budget period"),
  j("General Revenue", "general revenue(?:[- ]related)?(?: funds?)?", "the state's main account for general spending"),
  j("rider", "(?:budget )?riders?", "an instruction attached to the state budget"),
  j("Economic Stabilization Fund", "economic stabilization fund|rainy day fund", "the state's savings account"),
  // Property tax and school money
  j("ad valorem", "ad valorem(?: tax(?:es|ation)?)?", "property tax, which is based on what a property is worth"),
  j("residence homestead", "(?:residence )?homesteads?(?: exemptions?)?", "the home a person owns and lives in"),
  j("appraised value", "apprais(?:ed|al) (?:value|district|roll)s?", "the value the county appraisal office sets for a property"),
  j("tax rate compression", "(?:tax )?(?:rate )?compress(?:ion|ed|es)|maximum compressed (?:tax )?rates?", "state-ordered cuts in school tax rates"),
  j("hold harmless", "hold[- ]harmless", "a promise that the change will not cost a district money"),
  j("Foundation School Program", "foundation school (?:program|fund)", "the state's main system for paying for public schools"),
  j("recapture", "recapture(?: payments?)?", "money that school districts with high property values send to the state"),
  j("maintenance and operations", "maintenance and operations|M&O", "the part of a school tax that pays day-to-day costs"),
  j("interest and sinking", "interest and sinking|I&S", "the part of a school tax that repays borrowed money"),
  j("basic allotment", "basic allotment", "the base amount the state sets for each student"),
  j("average daily attendance", "average daily attendance", "the number of students in class on a typical day"),
  // Courts and crime
  j("state jail felony", "state jail felon(?:y|ies)", "the lowest level of serious crime"),
  j("Class A misdemeanor", "class [abc] misdemeanors?", "a level of minor crime"),
  j("deferred adjudication", "deferred adjudication", "probation that can end without a conviction"),
  j("injunctive relief", "injunctive relief|injunctions?", "a court order to stop doing something"),
  j("sovereign immunity", "(?:sovereign|governmental) immunity", "the rule that the government usually cannot be sued"),
];

/**
 * Federal jargon patterns hidden from the federal check and repair for a Texas bill, because the federal explanation
 * is wrong here or the word is an ordinary one in Texas records. Each either has a Texas entry above or is plain
 * ("students enrolled in a district", "offset the loss", "the issuer of the bonds", "the commissioner disapproves").
 */
const HIDE_FROM_FEDERAL = /\b(?:enroll(?:ed|ees?|ment|ing|s)?|engross(?:ed|ment)|appropriat(?:ions?|es?|ed|ing)|fiscal years?|(?:co-?)?sponsors?|joint resolutions?|sunsets?|suspension of the rules|(?:budget )?reconciliation|continuing resolutions?|disapprov(?:es|ed|ing|al)|issuers?|offsets?|user fees?|pre-?empt(?:s|ed|ion|ing)?)\b/gi;
/** U+2060 (word joiner): invisible, not a word character, so a hidden term matches no federal pattern and is restored by removing it. */
const WJ = "\u2060";
export const hide = (text: string) => text.replace(HIDE_FROM_FEDERAL, m => m[0] + WJ + m.slice(1));
export const unhide = (text: string) => text.replaceAll(WJ, "");

/** Texas jargon used without an explanation on first use. Same rule as the federal unexplainedJargon(). */
export function txUnexplainedJargon(parts: readonly string[]): Array<{ term: string; plain: string; part: number }> {
  const out: Array<{ term: string; plain: string; part: number }> = [];
  for (const t of TX_JARGON) for (let p = 0; p < parts.length; p++) {
    const m = t.re.exec(parts[p]);
    if (!m) continue;
    if (p === 0 || !(explainedAt(parts[p], m.index, m[0].length) || plainWordsNearby(parts[p], m.index + m[0].length, t.plain))) out.push({ term: m[0], plain: t.plain, part: p });
    break;
  }
  return out;
}

// ───────────── Abbreviations ─────────────

/** Bodies whose initials Texas records use. The first use becomes "Full Name (ABC)". */
export const TX_ABBREVIATIONS: Record<string, string> = {
  LBB: "Legislative Budget Board", HRO: "House Research Organization", SRC: "Senate Research Center", TEA: "Texas Education Agency", ISD: "independent school district",
  HHSC: "Health and Human Services Commission", DPS: "Department of Public Safety", TCEQ: "Texas Commission on Environmental Quality", PUC: "Public Utility Commission",
  ERCOT: "Electric Reliability Council of Texas", TDCJ: "Texas Department of Criminal Justice", DFPS: "Department of Family and Protective Services", TWC: "Texas Workforce Commission",
  TRS: "Teacher Retirement System", ERS: "Employees Retirement System", TLO: "Texas Legislature Online", FSP: "Foundation School Program", DSHS: "Department of State Health Services",
  TDA: "Texas Department of Agriculture", TDI: "Texas Department of Insurance", GLO: "General Land Office", TPWD: "Texas Parks and Wildlife Department", OAG: "Office of the Attorney General",
};
const BILL_NAMES: Array<[RegExp, string]> = [[/\bC\.?S\.?(?=[HS]\.?[BJ])/g, ""], [/\bS\.?J\.?R\.?\s*(?=\d)/g, "Senate Joint Resolution "], [/\bH\.?J\.?R\.?\s*(?=\d)/g, "House Joint Resolution "],
  [/\bS\.?C\.?R\.?\s*(?=\d)/g, "Senate Concurrent Resolution "], [/\bH\.?C\.?R\.?\s*(?=\d)/g, "House Concurrent Resolution "], [/\bS\.?B\.?\s*(?=\d)/g, "Senate Bill "], [/\bH\.?B\.?\s*(?=\d)/g, "House Bill "]];
/** "SB 4", "S.B. 4", "SJR 2" → "Senate Bill 4", "Senate Joint Resolution 2": a bill number is not a word a reader knows. */
export const spellOutBillNumbers = (text: string) => BILL_NAMES.reduce((t, [re, name]) => t.replace(re, name), text);

// ───────────── Repair ─────────────

const TX_ID = "(?:ANALYSIS|HRO|FISCAL|STATUS|LAW2?|PRIMER|BILL)";
const TX_ID_IN_BRACKETS = new RegExp(`\\s*[(\\[]\\s*(?:source:?\\s*)?${TX_ID}(?:\\s*[,;]\\s*${TX_ID})*\\s*[)\\]]`, "g");
/** A Texas source id used as a word. STATUS is replaced here so the federal step never writes "the bill's record in Congress". */
const TX_ID_AS_WORD: Array<[RegExp, string]> = [
  [/\b(?:[Tt]he )?STATUS(?: source| record)?\b/g, "the bill's record in the Legislature"], [/\b(?:[Tt]he )?FISCAL(?: source| note)?\b/g, "the fiscal note"],
  [/\b(?:[Tt]he )?ANALYSIS(?: source)?\b/g, "the committee's bill analysis"], [/\b(?:[Tt]he )?HRO(?: source| analysis)\b/g, "the House Research Organization analysis"],
  [/\b(?:[Tt]he )?LAW2?(?: source)\b/g, "current law"],
];
const capitalise = (text: string) => text.replace(/(^|[.!?]\s+)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

export type TxRepair = { draft: SummaryDraft; notes: string[] };

/**
 * The mechanical repair step for a Texas draft: the Texas fixes the federal step does not know, then the federal
 * repairDraft() itself (with the mis-fitting federal terms hidden), then the Texas jargon explanations. It changes
 * wording only where a rule is mechanical; a wrong fact or a vague row still fails the check and goes back to the model.
 */
export function repairTxDraft(input: SummaryDraft, ctx: { sourceIds: readonly string[]; numberedSections: boolean }): TxRepair {
  let d = structuredClone(input) as SummaryDraft;
  const notes: string[] = [];

  // 1. Texas source ids in sentences, bill numbers, and a citation's letter case ("hro" → "HRO").
  for (const f of readingFields(d)) {
    const before = f.get();
    if (!before) continue;
    let after = before.replace(TX_ID_IN_BRACKETS, "");
    for (const [re, phrase] of TX_ID_AS_WORD) after = after.replace(re, phrase);
    after = capitalise(spellOutBillNumbers(after).replace(/\s+([.,;:])/g, "$1").replace(/\s{2,}/g, " ")).trim();
    if (after !== before.trim()) { f.set(after); notes.push("source id removed from a sentence, or a bill number spelled out"); }
  }
  const fixCase = <T,>(o: T, k: keyof T) => { const v = String(o[k] ?? "").trim(); if (v && v !== v.toUpperCase() && isTxSourceId(v)) { (o as Record<string, unknown>)[k as string] = v.toUpperCase(); notes.push(`citation "${v}" → "${v.toUpperCase()}"`); } };
  for (const p of [...d.whatItDoes, ...d.whoItAffects, ...(d.howItWorksToday ?? [])]) fixCase(p, "section");
  for (const r of d.changes ?? []) fixCase(r, "source");
  for (const a of [...d.caseFor, ...d.caseAgainst]) if (a.source !== undefined) fixCase(a, "source");

  // 2. Texas abbreviations: the first use is spelled out.
  for (const a of unexplainedAcronyms(readingFields(d).slice(1).map(f => f.get()))) {
    const full = TX_ABBREVIATIONS[a];
    if (!full) continue;
    const re = new RegExp(`(?<![A-Za-z(&])${a}(?![A-Za-z&])`);
    const field = readingFields(d).slice(1).find(f => re.test(f.get()));
    if (!field) continue;
    field.set(field.get().replace(re, `${full} (${a})`));
    notes.push(`"${a}" spelled out`);
  }

  // 3. The federal repair step, unchanged, on a copy in which the mis-fitting federal terms are hidden.
  for (const f of readingFields(d)) f.set(hide(f.get()));
  const federal = repairDraft(d, ctx);
  d = federal.draft;
  for (const f of readingFields(d)) f.set(unhide(f.get()));
  notes.push(...federal.notes.map(unhide));

  // 4. Texas jargon: the reviewed plain words, in parentheses, at the first use. Never in the headline.
  for (let pass = 0; pass < 3; pass++) {
    const fields = readingFields(d), open = txUnexplainedJargon(fields.map(f => f.get())).filter(t => fields[t.part].kind !== "headline");
    if (!open.length) break;
    let changed = false;
    for (const t of open) {
      const field = fields[t.part], text = field.get(), term = TX_JARGON.find(x => x.plain === t.plain);
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

// ───────────── The check ─────────────

/** Where a reason for or against may come from: one part of one official document, and the exact credit line the page prints. */
export type TxSide = { side: "for" | "against"; attribution: string; sourceId: TxSourceId; text: string };

export type TxCheckContext = {
  /** The bill's caption (its official title). */
  title: string; sections: readonly TxSection[]; billText: string; truncated?: boolean;
  /** The official sources the model was given, by Texas id. */
  docs: ReadonlyArray<{ id: string; text: string }>;
  sides: readonly TxSide[];
  /** Names of public bodies in the sources, so a body's name is not read as a program. */
  agencies?: readonly string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9& ]+/g, " ").replace(/\s+/g, " ").trim();
const SECTION_BASE = 7000;

/**
 * Check a Texas draft against the federal rules (every one of them, through the federal checkSummary) plus the
 * Texas rules: the Texas jargon list; a reason must come from the part of the document it is credited to; a side with
 * no official source stays empty (a federal rule) and a side the record does print is not left out; every "What
 * would change" row cites a section of this bill or a source provided.
 */
export function checkTxSummary(draft: SummaryDraft, ctx: TxCheckContext): CheckResult {
  const sections = ctx.sections, back = new Map<string, string>();
  const docIds = new Set(ctx.docs.map(d => d.id.toUpperCase()));
  const standIn = (id: string) => FEDERAL_STAND_IN[id.toUpperCase() as TxSourceId] ?? id.toUpperCase();
  let unknown = 0;
  const alias = (cite: string): string => {
    const c = cite.trim();
    if (!c || /^full text$/i.test(c)) return c;
    if (docIds.has(c.toUpperCase())) { const s = standIn(c); if (s !== c.toUpperCase()) back.set(s, c.toUpperCase()); return s; }
    // A federal id the model copied from an example ("CRS") is not a Texas source, even where it is another source's stand-in.
    if (/^(?:RULE|REPORT|CRS|CBO|BILL|FLOOR\d?|USC\b.*)$/i.test(c)) { back.set(`${c}?`, c); return `${c}?`; }
    const n = txCitedSection(c);
    if (n === null) return c;
    const i = sections.findIndex(s => s.num.toUpperCase() === n);
    // A section this bill does not have keeps a number the federal checker will not find, so it is reported.
    const a = `Sec. ${i >= 0 ? SECTION_BASE + i + 1 : SECTION_BASE + 900 + ++unknown}`;
    back.set(a, i >= 0 ? `Sec. ${sections[i].num}` : c);
    return a;
  };
  const d = structuredClone(draft) as SummaryDraft;
  for (const p of [...d.whatItDoes, ...d.whoItAffects, ...(d.howItWorksToday ?? [])]) p.section = alias(p.section);
  for (const r of d.changes ?? []) r.source = alias(r.source ?? "");
  for (const a of [...d.caseFor, ...d.caseAgainst]) if (a.source !== undefined) a.source = alias(a.source);
  for (const f of readingFields(d)) f.set(hide(f.get()));
  const federalSections: Section[] = sections.map((s, i) => ({ num: String(SECTION_BASE + i + 1), heading: hide(s.heading), text: hide(s.text) }));
  const allowed = (side: "for" | "against") => [...new Set(ctx.sides.filter(s => s.side === side && s.text.trim()).map(s => s.attribution))];
  const result = checkSummary(d, federalSections, { truncated: ctx.truncated, subject: ctx.title, fullText: hide(ctx.billText),
    sources: { title: hide(ctx.title), docs: ctx.docs.map(x => ({ id: standIn(x.id), text: hide(x.text) })), agencies: ctx.agencies ?? [], allowedFor: allowed("for"), allowedAgainst: allowed("against"),
      needsBackground: false, structure: true, cancelsRule: false, speakers: [] } });

  // Translate the federal messages back to what the model wrote: Texas ids and this bill's own section numbers.
  // One pass, longest stand-in first, so a translated id is never translated again.
  const stand = [...back.keys()].sort((x, y) => y.length - x.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const standRe = stand.length ? new RegExp(`(?<![A-Za-z])(?:${stand.join("|")})(?![A-Za-z0-9])`, "g") : null;
  const translate = (m: string) => {
    const out = standRe ? unhide(m).replace(standRe, k => back.get(k) ?? k) : unhide(m);
    return out.replace(/the official record names no one who makes this case/, "no official source provided gives this side's reasons").replace(/"No public statement of reasons found\."/, `"${TX_NO_CASE}"`);
  };
  const failures = result.failures.map(translate), warnings = result.warnings.map(translate);

  // Texas rule 1: the Texas jargon list, in reading order.
  const reading = readingFields(draft).map(f => f.get().trim());
  for (const t of txUnexplainedJargon(reading)) failures.push(t.part === 0
    ? `The headline uses "${t.term}"; a headline has no room to explain it, so use plain words (${t.plain}).`
    : `"${t.term}" is used without explaining it. Replace it with plain words (${t.plain}) or explain it in parentheses the first time.`);

  // Texas rule 2: a reason comes from the part of the document it is credited to ("Supporters say" is not "Critics say").
  const sideCheck = (label: string, side: "for" | "against", list: SummaryDraft["caseFor"]) => list.forEach((a, i) => {
    const who = norm(a.attribution);
    const from = ctx.sides.filter(s => s.side === side && s.text.trim()).find(s => { const b = norm(s.attribution); return who === b || who.includes(b) || (b.includes(who) && who.split(" ").length >= 2); });
    if (!from) return; // the federal check has already refused the attribution
    const src = (a.source ?? "").trim().toUpperCase();
    if (src && src !== from.sourceId) failures.push(`${label} argument ${i + 1} is credited to "${from.attribution}" but cites ${src}; cite ${from.sourceId}, the document it comes from.`);
    const said = contentWords(from.text), arg = [...contentWords(a.argument)];
    if (arg.length && arg.filter(w => said.has(w)).length / arg.length < 0.34)
      failures.push(`${label} argument ${i + 1} is credited to "${from.attribution}", but most of its words are not in that part of the document. Use a reason printed there, or leave the side empty.`);
  });
  sideCheck("Case for", "for", draft.caseFor);
  sideCheck("Case against", "against", draft.caseAgainst);
  // Texas rule 2b: a side the official record does print is never left out (the same care for both sides).
  for (const [label, side, list] of [["Case for", "for", draft.caseFor], ["Case against", "against", draft.caseAgainst]] as const) {
    const from = ctx.sides.filter(s => s.side === side && s.text.trim());
    if (from.length && !list.length) failures.push(`${label} is empty, but an official source prints reasons on this side (${from.map(s => s.attribution).join("; ")}). Give 1 or 2 of them, credited as shown.`);
  }

  // Texas rule 3: every change row cites a section of this bill or a source that was provided.
  (draft.changes ?? []).forEach((r, i) => {
    const c = (r.source ?? "").trim();
    if (!c) return; // the federal check reports a missing source
    const n = txCitedSection(c);
    const ok = docIds.has(c.toUpperCase()) || (n !== null && sections.some(s => s.num.toUpperCase() === n)) || (/^full text$/i.test(c) && !sections.length);
    if (!ok) failures.push(`What would change row ${i + 1} cites "${c}", which is not a section of this bill or one of the sources provided.`);
  });

  return { passed: failures.length === 0, failures, warnings, metrics: result.metrics };
}

/** What the page says for a side with no official source (owner instruction: the summary never writes one). */
export const TX_NO_CASE = "No official record of arguments on this side was found.";
export const TX_NO_CASE_FOR = "No official record of arguments for this bill was found.";
export const TX_NO_CASE_AGAINST = "No official record of arguments against this bill was found.";
/** When the official analysis that prints the arguments exists but could not be read: the page says that, not that there are none. */
export const TX_CASE_UNREAD = "The official analysis that prints arguments on this side could not be read when this summary was written.";
/** The line a page prints under "For" or "Against" when the summary gives no argument there; null when it gives one. */
export function txCaseNote(side: "for" | "against", has: boolean, unread: readonly string[]): string | null {
  return has ? null : unread.length ? TX_CASE_UNREAD : side === "for" ? TX_NO_CASE_FOR : TX_NO_CASE_AGAINST;
}

// ───────────── The average-reader test: what a Texas reader knows ─────────────

/** Everyday words a Texas adult knows that the federal list does not carry. A reader flag made only of these is not a failure. */
export const TX_COMMON_KNOWLEDGE = new Set(("texas texan texans legislature legislator legislators governor lieutenant county counties city cities town district districts " +
  "homeowner homeowners home homes house property properties school schools teacher teachers student students public sales college university highway road roads water power electricity " +
  "sheriff constable mayor council session voters voter amendment constitution capitol austin").split(" "));
export function txEverydayFlag(flag: string): boolean {
  const t = flag.toLowerCase().replace(/\(.*?\)/g, " ").replace(/["“”'’.,:;]/g, " ").replace(/\b(?:the|a|an|of|in|for|to|and|or|state|local)\b/g, " ").trim().split(/\s+/).filter(Boolean);
  return t.length > 0 && t.length <= 3 && t.every(w => TX_COMMON_KNOWLEDGE.has(w) || TX_COMMON_KNOWLEDGE.has(w.replace(/s$/, "")));
}
