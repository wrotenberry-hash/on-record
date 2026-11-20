/**
 * Suggest changes, the editor's approval queue: the rules (owner, 20 Nov 2026; docs/SUGGEST_CHANGES.md).
 * "AI drafts the menu; nothing goes live until the editor approves it in a queue that shows the option beside its
 * source text." Pure: no database, no request, relative imports only, so tests/change-queue.test.mjs loads this file.
 *
 * Three things are decided here and nowhere else:
 *  - where an option's quoted words sit in the stored section (`highlightQuote`): the text is only located, never changed;
 *  - what an editor must not miss on a group of options (`groupProblems`);
 *  - whether a menu may be approved (`canGoLive`): both directions always travel together, and an approved option whose
 *    quoted words are not in the stored section stops the whole menu ("we never invent policy").
 */
import type { BillSystem, OptionDirection, OptionSource } from "./types.ts";

export type OptionStatus = "draft" | "approved" | "rejected" | "retired";
export type OptionChecks = { passed: boolean; failures: string[]; reader?: string };

/** One row of change_options, as the queue reads it. */
export type QueueOption = {
  id: string; seq: number; source: OptionSource; sourceLabel: string; sourceRef: string;
  sectionVersion: string; sectionNum: string; quote: string; otherQuote: string | null;
  groupKey: string; kind: string; about: string; direction: OptionDirection; wording: string;
  checks: OptionChecks; status: OptionStatus; editorNote: string | null;
};

/** One stored section (bill_text_sections), with only what the queue shows. `body` is the section as published. */
export type QueueSection = { version: string; versionLabel: string; num: string; heading: string; body: string; sourceUrl: string };

/**
 * The options about one number, date, limit, difference or amendment. The shared fields come from the first option in
 * the group. `section` is the stored section the group cites (null when it is not stored); `other` is, for a difference
 * between versions, the same-numbered section of another stored version.
 */
export type OptionGroup = {
  key: string; source: OptionSource; sourceLabel: string; sourceRef: string;
  sectionVersion: string; sectionNum: string; quote: string; otherQuote: string | null;
  kind: string; about: string; options: QueueOption[];
  section: QueueSection | null; other: QueueSection | null;
};

export type Highlight = { before: string; match: string; after: string };

/**
 * Finds `quote` in `body` and returns the body cut in three around it. Runs of spaces and line breaks count as one
 * space on both sides, because a quote is often copied with different line breaks than the published text. Everything
 * else must match character for character, capitals included. The three parts joined are exactly `body`.
 * Returns null when the quote is empty or is not in the body.
 */
export function highlightQuote(body: string, quote: string): Highlight | null {
  const want = quote.replace(/\s+/g, " ").trim();
  if (!want) return null;
  let flat = "", gap = false;
  const at: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (/\s/.test(ch)) { if (!gap) { flat += " "; at.push(i); gap = true; } }
    else { flat += ch; at.push(i); gap = false; }
  }
  const found = flat.indexOf(want);
  if (found < 0) return null;
  const start = at[found], end = at[found + want.length - 1] + 1;
  return { before: body.slice(0, start), match: body.slice(start, end), after: body.slice(end) };
}

/** The order options are shown in, inside a group. */
export const DIRECTION_ORDER: OptionDirection[] = ["up", "down", "keep", "remove", "adopt", "reject", "this_version", "other_version"];
const place = (d: OptionDirection) => { const i = DIRECTION_ORDER.indexOf(d); return i < 0 ? DIRECTION_ORDER.length : i; };

const UP_DOWN: Record<string, [string, string]> = {
  amount: ["Higher", "Lower"], percent: ["Higher", "Lower"], count: ["Higher", "Lower"],
  date: ["Later", "Earlier"], duration: ["Longer", "Shorter"], coverage: ["More people", "Fewer people"],
};

/**
 * The word a reader sees for a direction. For a difference between versions the word is the version's own label
 * ("Introduced in House"), passed in `versions`; without it, plain stand-ins.
 */
export function directionWord(kind: string, direction: OptionDirection, versions?: { thisLabel?: string | null; otherLabel?: string | null }): string {
  const [up, down] = UP_DOWN[kind] ?? UP_DOWN.amount;
  switch (direction) {
    case "up": return up;
    case "down": return down;
    case "keep": return "Keep as written";
    case "remove": return "Remove";
    case "adopt": return "Adopt this amendment";
    case "reject": return "Do not adopt it";
    case "this_version": return versions?.thisLabel?.trim() || "This version";
    case "other_version": return versions?.otherLabel?.trim() || "The other version";
  }
}

/** The section an option cites. When two stored sections share a number (a bill in divisions), the one that holds the quote. */
function findSection(sections: QueueSection[], version: string, num: string, quote: string): QueueSection | null {
  const same = sections.filter(s => s.version === version && s.num === num);
  return same.find(s => highlightQuote(s.body, quote)) ?? same[0] ?? null;
}

/**
 * Options grouped by `group_key`, groups in the order their first option was drafted (`seq`), options inside a group
 * in `DIRECTION_ORDER`. `sections` are the stored sections of the bill; each group is given the one it cites.
 */
export function groupOptions(options: QueueOption[], sections: QueueSection[] = []): OptionGroup[] {
  const groups = new Map<string, OptionGroup>();
  for (const o of [...options].sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id))) {
    let g = groups.get(o.groupKey);
    if (!g) {
      g = { key: o.groupKey, source: o.source, sourceLabel: o.sourceLabel, sourceRef: o.sourceRef, sectionVersion: o.sectionVersion, sectionNum: o.sectionNum,
        quote: o.quote, otherQuote: o.otherQuote, kind: o.kind, about: o.about, options: [], section: findSection(sections, o.sectionVersion, o.sectionNum, o.quote), other: null };
      const otherQuote = o.source === "version" ? o.otherQuote : null;
      if (otherQuote) {
        const others = sections.filter(s => s.num === o.sectionNum && s.version !== o.sectionVersion);
        const named = o.sourceRef.toLowerCase().split(/[^a-z0-9]+/);
        g.other = others.find(s => highlightQuote(s.body, otherQuote)) ?? others.find(s => named.includes(s.version.toLowerCase())) ?? (others.length === 1 ? others[0] : null);
      }
      groups.set(o.groupKey, g);
    }
    g.options.push(o);
  }
  for (const g of groups.values()) g.options.sort((a, b) => place(a.direction) - place(b.direction) || a.seq - b.seq);
  return [...groups.values()];
}

/** The labels of the two versions a group compares, for `directionWord`. */
export function versionLabels(g: OptionGroup): { thisLabel: string | null; otherLabel: string | null } {
  return { thisLabel: g.section?.versionLabel ?? null, otherLabel: g.other?.versionLabel ?? null };
}
/** The word a reader sees for one option of a group. */
export function optionWord(g: OptionGroup, o: Pick<QueueOption, "direction">): string { return directionWord(g.kind, o.direction, versionLabels(g)); }

/** Directions that are only ever offered together. */
const PAIRS: Array<[OptionDirection, OptionDirection]> = [["up", "down"], ["adopt", "reject"], ["this_version", "other_version"]];

/** Names that end in a full stop without ending a sentence ("H.R. 2102", "Sec. 3", "U.S."). */
const ABBREVIATIONS = /\b(?:[A-Za-z]\.)+|\b(?:[Ss]ecs?|No|Nos|Con|Res|Amdt|Rep|Sen|Gov|Dept|Inc|Co|St|Mr|Mrs|Ms|Dr|vs|etc|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\./g;
/** How many sentences a wording holds. A full stop inside a number ("$1.5 billion") or after a known short form does not count. */
export function sentenceCount(wording: string): number {
  const text = wording.trim().replace(ABBREVIATIONS, m => m.replace(/\./g, "")).replace(/[.!?]+["'”’)\]]*$/, "");
  if (!text) return 0;
  return text.split(/[.!?]+["'”’)\]]*\s+/).filter(Boolean).length;
}

/** Whether an option's quoted words are in the stored section its group cites. */
export function quoteFound(g: OptionGroup, o: QueueOption): boolean {
  return !!g.section && o.sectionVersion === g.sectionVersion && o.sectionNum === g.sectionNum && highlightQuote(g.section.body, o.quote) !== null;
}

const q = (word: string) => `“${word}”`;
const sectionName = (num: string) => (num === "FULL" ? "the full text" : `section ${num}`);

/**
 * Plain sentences for everything an editor must not miss on a group, as it was drafted. An empty list means nothing
 * was found. Retired options are left out; a rejected option still counts as drafted, so rejecting one direction does
 * not make the draft look incomplete (`approvedProblems` covers what is approved).
 */
export function groupProblems(g: OptionGroup): string[] {
  const out: string[] = [], drafted = g.options.filter(o => o.status !== "retired"), open = drafted.filter(o => o.status !== "rejected");
  const has = (d: OptionDirection) => drafted.some(o => o.direction === d);
  const word = (d: OptionDirection) => q(directionWord(g.kind, d, versionLabels(g)));

  if (!g.section) out.push(`The text of ${sectionName(g.sectionNum)} in version “${g.sectionVersion}” is not stored, so the quoted words cannot be checked against it.`);
  for (const [a, b] of PAIRS) {
    if (has(a) && !has(b)) out.push(`${word(a)} is offered without ${word(b)}. Both directions must be offered together.`);
    if (has(b) && !has(a)) out.push(`${word(b)} is offered without ${word(a)}. Both directions must be offered together.`);
  }
  if (g.source === "dial") {
    if (!has("keep")) out.push(`${word("keep")} is missing. It is always offered for a number, date or limit in the bill's own text.`);
    if (!has("remove")) out.push(`${word("remove")} is missing. It is always offered for a number, date or limit in the bill's own text.`);
  }
  if (g.source === "version" && g.otherQuote) {
    if (!g.other) out.push(`The other version's words are not found in ${sectionName(g.sectionNum)} of any other stored version.`);
    else if (!highlightQuote(g.other.body, g.otherQuote)) out.push(`The other version's words are not found in ${sectionName(g.sectionNum)} of ${g.other.versionLabel}.`);
  }
  for (const o of open) {
    const name = word(o.direction);
    if (o.sectionVersion !== g.sectionVersion || o.sectionNum !== g.sectionNum) out.push(`${name} cites a different section than the rest of its group.`);
    else if (g.section && !highlightQuote(g.section.body, o.quote)) out.push(`${name}: its quoted words are not found in the stored text of ${sectionName(g.sectionNum)}.`);
    if (!o.checks.passed) out.push(`${name} did not pass the automatic checks${o.checks.failures.length ? `: ${o.checks.failures.map(f => f.trim().replace(/[.\s]+$/, "")).join("; ")}.` : "."}`);
    const sentences = sentenceCount(o.wording);
    if (sentences === 0) out.push(`${name} has no wording.`);
    else if (sentences > 1) out.push(`${name}: the wording is more than one sentence.`);
  }
  return out;
}

/**
 * What stops a group from going to readers, looking only at the options the editor approved. Both directions travel
 * together: approving "Higher" while "Lower" is not approved is refused, and a number, date or limit always carries
 * "Keep as written" and "Remove". An approved option whose quoted words are not in the stored section is refused too.
 * A group with nothing approved has no problem: it is simply not offered.
 */
export function approvedProblems(g: OptionGroup): string[] {
  const approved = g.options.filter(o => o.status === "approved");
  if (!approved.length) return [];
  const out: string[] = [], has = (d: OptionDirection) => approved.some(o => o.direction === d);
  const word = (d: OptionDirection) => q(directionWord(g.kind, d, versionLabels(g)));
  for (const [a, b] of PAIRS) {
    if (has(a) && !has(b)) out.push(`${word(a)} is approved but ${word(b)} is not. Both directions go together: approve both or reject both.`);
    if (has(b) && !has(a)) out.push(`${word(b)} is approved but ${word(a)} is not. Both directions go together: approve both or reject both.`);
  }
  if (g.source === "dial") for (const d of ["keep", "remove"] as const) {
    if (!has(d)) out.push(`${word(d)} is not approved. It goes with every approved option about a number, date or limit.`);
  }
  for (const o of approved) if (!quoteFound(g, o)) out.push(`${word(o.direction)} is approved, but its quoted words are not found in the stored text of the section it cites.`);
  return out;
}

const sentenceCase = (s: string) => { const t = s.trim(); return t ? t[0].toUpperCase() + t.slice(1) : "This group"; };
/** A group's name on the page: its `about`, starting with a capital. */
export function groupTitle(g: Pick<OptionGroup, "about">): string { return sentenceCase(g.about); }

/** Whether a menu may be approved, and every reason it may not. */
export function canGoLive(groups: OptionGroup[]): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!groups.some(g => g.options.some(o => o.status === "approved"))) reasons.push("No option is approved yet.");
  for (const g of groups) for (const p of approvedProblems(g)) reasons.push(`${groupTitle(g)}: ${p}`);
  return { ok: reasons.length === 0, reasons };
}

export type OptionCounts = { draft: number; approved: number; rejected: number; retired: number };
export function optionCounts(options: Array<{ status: OptionStatus }>): OptionCounts {
  const c: OptionCounts = { draft: 0, approved: 0, rejected: 0, retired: 0 };
  for (const o of options) if (o.status in c) c[o.status]++;
  return c;
}

/** The stored `checks` value, read defensively: anything that is not a clear pass counts as not passed. */
export function readChecks(raw: unknown): OptionChecks {
  const c = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  if (!c || typeof c.passed !== "boolean") return { passed: false, failures: ["The automatic checks were not recorded for this option."] };
  const failures = Array.isArray(c.failures) ? c.failures.filter((f): f is string => typeof f === "string" && f.trim() !== "") : [];
  return { passed: c.passed, failures, ...(typeof c.reader === "string" && c.reader.trim() ? { reader: c.reader.trim() } : {}) };
}

/** The line under an option that says how the automatic checks went. */
export function checkLine(checks: OptionChecks): string {
  const why = checks.failures.map(f => f.trim().replace(/[.\s]+$/, "")).filter(Boolean).join("; ");
  const first = checks.passed ? "Automatic checks: passed." : why ? `Automatic checks: did not pass. ${why}.` : "Automatic checks: did not pass.";
  return checks.reader ? `${first} Average-reader test: ${checks.reader.replace(/[.\s]+$/, "")}.` : first;
}

/** The anchor of a section on the stored text page: "sec-" and the section number in lower case, every run of other characters a dash. */
export function sectionAnchor(num: string): string { return num === "FULL" ? "sec-full" : `sec-${num.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`; }
/** The bill's own page on the site. */
export function billHref(system: BillSystem, billKey: string): string { return `${system === "texas" ? "/texas/bills" : "/bills"}/${encodeURIComponent(billKey)}`; }
/** The stored section an option cites, on the site's own text page. */
export function sectionHref(system: BillSystem, billKey: string, version: string, num: string): string {
  return `${billHref(system, billKey)}/text?v=${encodeURIComponent(version)}#${sectionAnchor(num)}`;
}

const PLACE_WORDS: Record<string, string> = { introduced: "Introduced", committee: "In committee", hearing_scheduled: "Hearing scheduled", out_of_committee: "Out of committee",
  floor: "On the floor", other_chamber: "In the other chamber", resolving: "The two chambers were settling their differences", final: "Final" };
const STATE_WORDS: Record<string, string> = { open: "it could still be changed", narrow: "it could be changed only in a limited way", closed: "the window was closed", not_open_yet: "the window had not opened yet" };
/**
 * `window_at_draft` in words. A stored place code ("committee"), or a place and a state ("committee:open"), is put in
 * plain words; a sentence is shown as stored; nothing stored says so.
 */
export function windowWords(stored: string | null | undefined): string {
  const text = (stored ?? "").trim();
  if (!text) return "not recorded";
  const [place, state, ...rest] = text.split(/[\s:/|,]+/);
  if (rest.length || !PLACE_WORDS[place] || (state !== undefined && !STATE_WORDS[state])) return text;
  return state ? `${PLACE_WORDS[place]}; ${STATE_WORDS[state]}` : PLACE_WORDS[place];
}

/** The heading of a cited section: "Section 3: Authorization of appropriations", or the stored heading when it already names the section. */
export function sectionTitle(num: string, heading: string | null | undefined): string {
  const h = (heading ?? "").trim(), name = num === "FULL" ? "Full text" : `Section ${num}`;
  if (!h) return name;
  return /^(sec(tion)?\b\.?|§|full text)/i.test(h) ? h : `${name}: ${h}`;
}

export const STATUS_WORD: Record<OptionStatus, string> = { draft: "Waiting for you", approved: "Approved", rejected: "Rejected", retired: "Retired" };
export type MenuStatus = "review" | "live" | "closed" | "failed";
/** A menu's status in the editor's words. "live" is approved; in this phase readers still do not see it. */
export const MENU_STATUS_WORD: Record<MenuStatus, string> = { review: "Waiting for you", live: "Approved", closed: "Closed", failed: "Drafting did not finish" };

/** The two sentences both pages show at the top. Readers see nothing from a menu in this phase, approved or not. */
export const NOTHING_SHOWN = "Nothing here is shown to readers until you approve it.";
export const NOT_YET_SHOWN = "In this phase an approved menu is still not shown to readers: choosing comes in the next phase.";
