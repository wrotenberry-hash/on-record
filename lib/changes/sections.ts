/**
 * Suggest changes: a bill's text split into its sections, as published (owner, 20 Nov 2026; docs/SUGGEST_CHANGES.md).
 *
 * Every option on a menu of changes quotes the bill word for word, and the quote is checked against the section stored
 * here. So the body of a section is the published text: the words, punctuation, quotation marks (``like this'') and
 * numbers are never changed. Only white space is: a paragraph the printer broke over several lines is joined into one
 * line, and paragraphs are kept one to a line. A line the printer broke at a hyphen ("combat-" / "related") is joined
 * without a space, because the printed bill reads "combat-related".
 *
 * Pure: no database, no network; relative imports only, so tests/bill-text.test.mjs loads this file directly.
 *
 * How a federal section is told from a quoted one (splitFederalDetailed, below):
 *   - A section of THIS bill starts at the left margin with "SEC. 2." or "SECTION 1." in capitals, or, in appropriations
 *     bills and House rules, as a paragraph indented four spaces that opens "Sec. 101." in mixed case.
 *   - Quoted matter (a section of another law the bill rewrites) opens every paragraph with `` in the Government
 *     Publishing Office's text, so "``SEC. 399H." is never a section of this bill: it stays in the body of the section
 *     that quotes it. The same goes for a table header such as "      SEC. 4101. PROCUREMENT (In Thousands of Dollars)".
 *   - A section a committee struck out is printed inside <DELETED> marks. It is not a section of this version and is
 *     not kept (the earlier version holds it); `struck` counts them. Struck words inside a kept section stay in its
 *     body with their <DELETED> marks, and quoteInSection() refuses a quote taken from them.
 *   - "SEC. 4701. ... (In Thousands of Dollars)" boxed between rules of dashes is a funding table's caption.
 *   - A table of contents lists "Sec. 101. Short title." in mixed case at the margin: never a section start.
 */
import { parseTloBillText } from "../texas/analysis/sources.ts";

export type SplitSection = { num: string; heading: string; body: string };
export type FederalSplit = {
  sections: SplitSection[];
  /** Sections printed as struck out (inside <DELETED> marks) and so left out of `sections`. */
  struck: number;
  /** Section numbers printed more than once in this version and so stored as "5/2" (two committees' texts in one print, or a misnumbered bill). */
  repeated: number;
  /** Characters in the whole published text of this version. */
  chars: number;
};

/** The one section of a text with no numbered sections (most resolutions). */
export const FULL_NUM = "FULL";
export const FULL_HEADING = "Full text";
/** Text between the enacting or resolving words and the first numbered section, when it says more than those words. */
export const START_NUM = "START";
export const START_HEADING = "Text before the first numbered section";

// ───────────── Matching a quote to a section ─────────────

/** The one canonical form for matching: every run of white space (line breaks, tabs, non-breaking spaces) becomes one space. Case, quotation marks and punctuation are never touched. */
export function normalise(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** A quote shorter than this proves nothing: "the Secretary" is in every section. */
export const MIN_QUOTE_CHARS = 12;

/**
 * Is this quote in this section, word for word? True only when the quote, in canonical form, is at least 12
 * characters long and is found whole in the section's body in canonical form. Text a committee struck out
 * (<DELETED>...</DELETED> in a reported federal version) is not part of the bill any more: a quote found only there,
 * or one that carries the marks themselves, is refused.
 */
export function quoteInSection(quote: string, body: string): boolean {
  const q = normalise(quote), b = normalise(body);
  if (q.length < MIN_QUOTE_CHARS || /<\/?DELETED>/.test(q)) return false;
  if (!b.includes("<DELETED>")) return b.includes(q);
  const struck: Array<[number, number]> = [];
  for (let at = b.indexOf("<DELETED>"); at >= 0;) {
    const close = b.indexOf("</DELETED>", at), end = close < 0 ? b.length : close + "</DELETED>".length;
    struck.push([at, end]);
    at = b.indexOf("<DELETED>", end);
  }
  for (let at = b.indexOf(q); at >= 0; at = b.indexOf(q, at + 1)) {
    if (!struck.some(([from, to]) => at < to && at + q.length > from)) return true;
  }
  return false;
}

/** A stable, URL-safe id for a section's heading on the page: "2" → "sec-2", "1.01" → "sec-1-01", "FULL" → "sec-full". */
export function sectionAnchor(num: string): string {
  return `sec-${num.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "full"}`;
}

/** A numbered section's number: "2", "101", "8001A", "B-101" (division B), "5/2" (a number printed twice), "1.01" (Texas). */
const NUMBERED = /^(?:[A-Z]{1,2}-)?\d+(?:\.\d+)?[A-Za-z]?(?:\/\d+)?$/;

/**
 * What to call a section above its text: "Sec. 2. SHORT TITLE", "Sec. 8001", "Full text", "TITLE I MILITARY PERSONNEL".
 * A Texas section has no printed heading (its text opens "SECTION 3."), so it is called "Section 3".
 */
export function sectionTitle(s: { num: string; heading: string; system?: "federal" | "texas" }): string {
  if (!NUMBERED.test(s.num)) return s.heading || s.num;
  if (s.system === "texas") return `Section ${s.num}`;
  return s.heading ? `Sec. ${s.num}. ${s.heading}` : `Sec. ${s.num}`;
}

// ───────────── Federal: the Government Publishing Office's plain text ─────────────

function decodeEntities(s: string): string {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

/** The published lines of a version, right-trimmed. Real HTML tags go; the text's own marks (&lt;DELETED&gt;) stay. */
function publishedLines(html: string): string[] {
  const pre = html.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/i)?.[1] ?? html;
  return decodeEntities(pre.replace(/<[^>]+>/g, "")).replace(/\r/g, "").split("\n").map(l => l.replace(/[ \t]+$/, "")).filter(l => !/^<\/?DOC>$/.test(l.trim()));
}

const indentOf = (line: string) => line.length - line.trimStart().length;
const SECTION_AT_MARGIN = /^(?:SEC\.|SECTION) (\d+[A-Za-z]?)\.(?: +(.*))?$/;
const SECTION_RUN_IN = /^ {4}Sec\. (\d+[A-Za-z]?)\. +\S/;
const SECTION_STRUCK = /^<DELETED>\s*(?:SEC\.|SECTION) (\d+[A-Za-z]?)\./;
const STRUCTURE = /^\s*(DIVISION [A-Z]{1,2}|TITLE [IVXLCDM]+|Subtitle [A-Z]{1,2}|PART [IVXLC]+|PART \d+|CHAPTER \d+|Subchapter [A-Z]{1,2}|Subpart [A-Z]{1,2})(?:--.*)?$/;
/** A line of a table of contents: "Sec. 101. Short title." or "Title I--Agricultural Programs", in mixed case at the margin. */
const TOC_ENTRY = /^(?:Sec\. \d|Title [IVXLCDM]+--)/;
const RULE_OF_DASHES = /^\s*-{20,}\s*$/;
/** Where the text of the measure stops and the printer's endorsement begins. Looked for only after the last section starts. */
const END_MATTER = [/^\s*<all>\s*$/, /^\s{8,}Passed the (?:House of Representatives|Senate)\b/, /^\s{8,}Attest:\s*$/, /^\s{20,}(?:Union |House )?Calendar No\. \d+\s*$/,
  /^\s{20,}Speaker of the House of Representatives\.\s*$/, /^\d+(?:st|nd|rd|th|d) CONGRESS\s*$/];
const FORM_LINE = /^\s+(?:A BILL|AN ACT|(?:JOINT |CONCURRENT )?RESOLUTION|Joint Resolution|Concurrent Resolution|An Act)\s*$/;
const OPENING = /^\s*(?:<DELETED>\s*)?(?:Be it enacted|Resolved|Whereas)\b/;
/** The enacting or resolving words alone: nothing a section could be quoted from. */
const BARE_CLAUSE = /^(?:Be it enacted|Resolved)\b[^.;:]{0,220},$/;

/** An appropriations Act ends, after its last numbered section, with a paragraph of its own that names the Act. */
const CLOSING_CITE = /^ {4,5}This (?:Act|division|title|joint resolution) may be cited as /;
export const CLOSING_HEADING = "Short title (closing paragraph)";

type Mark = { at: number; kind: "section" | "structure" | "closing"; num: string; runIn: boolean; label: string };

/**
 * Is this division or title heading part of a table of contents? There, the lines after it (past other headings) are
 * entries such as "Sec. 101. Short title." A real heading is followed by a section or by a paragraph.
 */
function inContents(lines: string[], at: number, contentsOpen: boolean, lastPrinted: Map<string, number>): boolean {
  // The last headings of a table of contents have no entries under them; the same heading is printed again where it really starts.
  if (contentsOpen && (lastPrinted.get(normalise(lines[at])) ?? at) > at) return true;
  for (let i = at + 1; i < lines.length && i < at + 400; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (TOC_ENTRY.test(l)) return true;
    if (STRUCTURE.test(l)) continue;
    if (SECTION_AT_MARGIN.test(l) || (/^ {4}\S/.test(l) && /[a-z]/.test(l)) || /^\s*(?:``|<DELETED>)/.test(l)) return false;
  }
  return false;
}

/** Paragraphs the printer broke over several lines, joined; one paragraph to a line. Words and punctuation are untouched. */
function joinPublished(lines: string[]): string {
  const out: string[] = [];
  let cur: string | null = null, first = 0, cont: number | null = null, hang = false, hyphen = false, prevLen = 0;
  const flush = () => { if (cur !== null) out.push(cur); cur = null; cont = null; };
  const startsItem = (t: string) => /^(?:``)?(?:\((?:[a-z]{1,4}|[A-Z]{1,4}|\d{1,3})\)[\s(]|(?:SEC\.|Sec\.|SECTION|Section) \d)/.test(t);
  const endsParagraph = (t: string) => /(?:[.;:]|--|''|; (?:and|or))$/.test(t);
  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    // A table row or a rule of dashes is kept exactly as printed: its columns are its meaning.
    if (/^\s*-{5,}\s*$/.test(line) || (line.trim().match(/\S {2,}(?=\S)/g) ?? []).length >= 3) { flush(); out.push(line); continue; }
    const indent = indentOf(line), text = line.trim().replace(/ {2,}/g, " ");
    let continues = false;
    if (cur !== null) {
      // A printed line is broken only when it is full, so a short line ends its paragraph.
      if (hyphen) continues = true;
      else if (prevLen < 50 || STRUCTURE.test(line)) continues = false;
      else if (cont !== null) continues = indent === cont && !(startsItem(text) && endsParagraph(cur));
      else if (indent === first - 4) continues = !(startsItem(text) && endsParagraph(cur));
      else if (hang && indent >= first + 8) continues = true;
      else if (first === 0 && indent === 0 && prevLen >= 60 && !hang && !startsItem(text)) continues = true;
      if (continues && cont === null) cont = indent;
    }
    if (continues) cur = hyphen ? `${cur}${text}` : `${cur} ${text}`;
    else { flush(); cur = text; first = indent; hang = /^(?:``)?(?:(?:SEC\.|Sec\.|SECTION) \S+ |\d+[A-Za-z-]*\. )/.test(text); }
    // "combat-" at the end of a printed line continues as "related": the bill reads "combat-related".
    hyphen = /[A-Za-z0-9)]-$/.test(text) && !/--$/.test(text);
    prevLen = line.length;
  }
  flush();
  return out.join("\n");
}

/**
 * The sections of one version of a federal bill, in order, with the count of struck-out sections left out.
 * `html` is the Government Publishing Office's HTML rendering (a single <pre>).
 */
export function splitFederalDetailed(html: string): FederalSplit {
  const lines = publishedLines(html);
  const chars = lines.join("\n").trim().length;
  const formAt = lines.findIndex(l => FORM_LINE.test(l));
  let start = lines.findIndex((l, i) => i > formAt && OPENING.test(l));
  if (start < 0) start = formAt + 1;

  // 1. Where each section, struck section and division or title heading starts.
  const marks: Mark[] = [];
  let deleted = false, contentsOpen = false;
  const lastPrinted = new Map<string, number>();
  lines.forEach((l, i) => { if (i >= start && STRUCTURE.test(l)) lastPrinted.set(normalise(l), i); });
  // "SEC. 4701. ... (In Thousands of Dollars)" boxed between two rules of dashes is the caption of a funding table, not a section.
  const caption = (i: number) => RULE_OF_DASHES.test(lines[i - 1] ?? "") && [1, 2, 3].some(k => RULE_OF_DASHES.test(lines[i + k] ?? "") && lines.slice(i + 1, i + k).every(x => x.trim()));
  let struck = 0, inStruck = false;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i], wasDeleted = deleted;
    const opens = l.lastIndexOf("<DELETED>"), closes = l.lastIndexOf("</DELETED>");
    if (opens >= 0 || closes >= 0) deleted = opens > closes;
    // A struck-out section: its heading and every paragraph struck with it are dropped. Anything not struck stays where it is.
    if (!wasDeleted && SECTION_STRUCK.test(l)) { struck++; inStruck = true; }
    if (inStruck && (wasDeleted || /^\s*<DELETED>/.test(l)) && (deleted || /<\/DELETED>$/.test(l))) { lines[i] = ""; continue; }
    if (wasDeleted) continue;
    let m: RegExpMatchArray | null;
    if (CLOSING_CITE.test(l) && marks.length && (marks.at(-1)!.runIn || marks.at(-1)!.kind === "structure")) marks.push({ at: i, kind: "closing", num: "", runIn: true, label: "" });
    else if ((m = l.match(SECTION_AT_MARGIN)) && !caption(i)) marks.push({ at: i, kind: "section", num: m[1], runIn: false, label: "" });
    else if ((m = l.match(SECTION_RUN_IN))) marks.push({ at: i, kind: "section", num: m[1], runIn: true, label: "" });
    else if ((m = l.match(STRUCTURE))) { if (!inContents(lines, i, contentsOpen, lastPrinted)) marks.push({ at: i, kind: "structure", num: "", runIn: false, label: m[1] }); else continue; }
    if (marks.at(-1)?.at === i) inStruck = false;
    if (TOC_ENTRY.test(l)) contentsOpen = true;
    else if (marks.at(-1)?.at === i || (/^ {4}\S/.test(l) && /[a-z]/.test(l))) contentsOpen = false;
  }

  // 2. Where the measure's own text stops.
  const lastStart = marks.filter(k => k.kind === "section").at(-1)?.at ?? start;
  let end = lines.length;
  for (let i = lastStart + 1; i < lines.length; i++) if (END_MATTER.some(re => re.test(lines[i]))) { end = i; break; }

  // 3. The text between one start and the next.
  type Block = SplitSection & { division: string; numbered: boolean };
  const blocks: Block[] = [];
  const lead = joinPublished(lines.slice(start, Math.min(marks[0]?.at ?? end, end)));
  let division = "", title = "", lower = "";
  for (const [k, mark] of marks.entries()) {
    if (mark.at >= end) break;
    const stop = Math.min(marks[k + 1]?.at ?? end, end);
    if (mark.kind === "closing") {
      blocks.push({ num: [division && `DIV ${division}`, "SHORT TITLE"].filter(Boolean).join(" "), heading: CLOSING_HEADING, body: joinPublished(lines.slice(mark.at, stop)), division, numbered: false });
      continue;
    }
    // The heading: the rest of the first line and the lines printed under it with a deep indent.
    // In an enrolled bill a long heading runs on at the margin, still in capitals, until its full stop.
    let bodyAt = mark.at + 1;
    const runsOn = (l: string, above: string) => indentOf(l) >= 8 || (indentOf(l) === 0 && !/\.$/.test(above) && /[A-Z]/.test(l) && l === l.toUpperCase());
    if (!mark.runIn) while (bodyAt < stop && lines[bodyAt].trim() && runsOn(lines[bodyAt], lines[bodyAt - 1])) bodyAt++;
    if (mark.kind === "structure") {
      if (/^DIVISION/.test(mark.label)) { division = mark.label.replace(/^DIVISION /, ""); title = ""; lower = ""; }
      else if (/^TITLE/.test(mark.label)) { title = mark.label.replace(/^TITLE /, ""); lower = ""; }
      else lower = mark.label;
      let heading = normalise(joinPublished(lines.slice(mark.at, bodyAt)));
      // An appropriations title prints its name on a line of its own under "TITLE I".
      let nameAt = bodyAt;
      while (nameAt < stop && !lines[nameAt].trim()) nameAt++;
      if (!/--/.test(heading) && nameAt < stop && indentOf(lines[nameAt]) >= 8 && lines[nameAt].trim() === lines[nameAt].trim().toUpperCase() && !lines[nameAt + 1]?.trim()) {
        heading = `${heading} ${lines[nameAt].trim()}`; bodyAt = nameAt + 1;
      }
      const body = joinPublished(lines.slice(bodyAt, stop));
      // Text under a division or title heading and before its first numbered section (an appropriations title's accounts).
      if (body) blocks.push({ num: [division && `DIV ${division}`, title && `TITLE ${title}`, lower].filter(Boolean).join(" "), heading, body, division, numbered: false });
      continue;
    }
    const first = mark.runIn ? "" : lines[mark.at].match(SECTION_AT_MARGIN)?.[2] ?? "";
    const heading = mark.runIn ? "" : normalise(joinPublished([first, ...lines.slice(mark.at + 1, bodyAt)])).replace(/\.$/, "");
    const body = joinPublished(lines.slice(mark.runIn ? mark.at : bodyAt, stop));
    blocks.push({ num: mark.num, heading, body, division, numbered: true });
  }

  const numbered = blocks.filter(b => b.numbered);
  if (!numbered.length) {
    // No numbered sections: the whole text is one section (most resolutions, and one-paragraph bills).
    const body = joinPublished(lines.slice(start, end));
    return { sections: body ? [{ num: FULL_NUM, heading: FULL_HEADING, body }] : [], struck, repeated: 0, chars };
  }
  // Divisions that each start again at "SEC. 101." are told apart by their letter: "A-101", "B-101".
  const count = (list: Block[]) => { const seen = new Map<string, number>(); for (const b of list) seen.set(b.num, (seen.get(b.num) ?? 0) + 1); return seen; };
  if ([...count(numbered).values()].some(n => n > 1)) for (const b of numbered) if (b.division) b.num = `${b.division}-${b.num}`;
  // A number still used twice keeps its place in the order and says which one it is: "5", then "5/2".
  const times = new Map<string, number>();
  let repeated = 0;
  for (const b of blocks) { const n = (times.get(b.num) ?? 0) + 1; times.set(b.num, n); if (n > 1) { b.num = `${b.num}/${n}`; if (b.numbered) repeated++; } }
  const sections: SplitSection[] = [];
  if (lead && !BARE_CLAUSE.test(normalise(lead))) sections.push({ num: START_NUM, heading: START_HEADING, body: lead });
  for (const b of blocks) sections.push({ num: b.num, heading: b.heading, body: b.body });
  return { sections, struck, repeated, chars };
}

/** The sections of one version of a federal bill, in order. `seq` in the store is the place in this list. */
export function splitFederal(html: string): SplitSection[] {
  return splitFederalDetailed(html).sections;
}

// ───────────── Texas: the Legislature's bill text ─────────────

/**
 * The sections of one version of a Texas bill, in order. The page is read by parseTloBillText (lib/texas/analysis/
 * sources.ts), which keeps the published marks: «words added to current law» and [words removed from it]. Unlike that
 * reader's own section list, a section here is never cut at 20,000 characters. A Texas section has no printed heading:
 * the body opens with its own "SECTION 3." and `heading` is the reader's short label for it.
 */
export function splitTexas(html: string): SplitSection[] {
  const parsed = parseTloBillText(html);
  const paragraphs = parsed.text.split("\n");
  const enact = paragraphs.findIndex(p => /^BE IT (?:ENACTED|RESOLVED) BY THE LEGISLATURE/i.test(p));
  const sections: SplitSection[] = [];
  let current: SplitSection | null = null;
  for (const p of paragraphs.slice(Math.max(0, enact + 1))) {
    const m = p.match(/^SECTION\s+(\d+(?:\.\d+)?[A-Za-z]?)\.\s*(.*)$/);
    if (m) {
      const h = m[2].replace(/[«»]/g, "");
      current = { num: m[1], heading: (h.indexOf(":") > 0 && h.indexOf(":") < 200 ? h.slice(0, h.indexOf(":")) : h).slice(0, 160).trim(), body: p };
      sections.push(current);
    } else if (/^ARTICLE\s+\d+[A-Z]?\./.test(p)) current = null;
    else if (current) current.body += `\n${p}`;
  }
  if (sections.length) return sections;
  const body = parsed.text.trim();
  return body ? [{ num: FULL_NUM, heading: FULL_HEADING, body }] : [];
}
