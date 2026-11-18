/**
 * Official Texas sources for bill summaries (owner instruction, 17 Nov 2026, Texas build point 3).
 *
 * The generator may use, each cited by an id and linked on the page:
 *   - the bill text for one version (Texas Legislature Online, TLO)                         → cited by section ("Sec. 3")
 *   - ANALYSIS: the committee bill analysis for that version (TLO; Senate analyses are by the Senate Research Center)
 *   - HRO:      the House Research Organization analysis, when the bill reached the House floor (hro.house.texas.gov)
 *   - FISCAL:   the Legislative Budget Board fiscal note (TLO)
 *   - STATUS:   the bill's actions and recorded votes (the site's own copy of the record; TLO is the official record)
 *   - LAW, LAW2: current law the bill amends (statutes.capitol.texas.gov)
 *   - PRIMER:   approved Texas explainers
 * Never news, advocacy groups or members' own sites: every address built here is on an official host (OFFICIAL_HOSTS).
 *
 * Pure: no database, no network. Tested in tests/texas-summaries-sources.test.mjs.
 * What was read from the real site on 17 Nov 2026 (89th Legislature, S.B. 4): the Text page, the enrolled bill text, the
 * House committee analysis, the Senate Research Center analysis, the fiscal note and the action list. Those parsers are
 * tested against the saved files. hro.house.texas.gov and statutes.capitol.texas.gov refused connections from the build
 * machine, so the HRO and statute readers are built against hand-made samples of each document's structure and their
 * address patterns are from memory: both are marked UNVERIFIED below.
 */

export const TLO = "https://capitol.texas.gov";
/**
 * The hosts a Texas summary reads from. Committee and Senate Research Center analyses and Legislative Budget Board
 * fiscal notes are all published on Texas Legislature Online, so three hosts are enough. Each is listed for readers
 * in lib/trust.ts (tests/trust.test.mjs fails if one is not); add a host there before adding it here.
 */
export const OFFICIAL_HOSTS = ["capitol.texas.gov", "hro.house.texas.gov", "statutes.capitol.texas.gov"] as const;

/** Is this address on one of the official hosts the owner allowed, over https? Anything else is never fetched or linked as a source. */
export function isOfficialUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === "https:" && !u.username && !u.port && (OFFICIAL_HOSTS as readonly string[]).includes(u.hostname.toLowerCase()); }
  catch { return false; }
}

// ───────────── Text ─────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", sect: "§", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", middot: "·" };
export function decodeEntities(s: string): string {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m);
}

/**
 * TLO serves Word-made analyses as windows-1252 without saying so in the response header, and other documents as UTF-8.
 * Bytes that are valid UTF-8 are read as UTF-8; anything else as windows-1252. A character the publisher already lost
 * (U+FFFD, seen in Senate Research Center files where a dash stood) becomes a dash between digits and a space elsewhere.
 */
export function decodeBody(bytes: Uint8Array): string {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder("windows-1252").decode(bytes); }
  return text.replace(/(\d)\uFFFD(\d)/g, "$1-$2").replace(/\uFFFD/g, " ");
}

/** HTML to text, one paragraph or table row per line. */
export function htmlToLines(html: string): string[] {
  const t = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|title|head)\b[\s\S]*?<\/\1>/gi, " ").replace(/\s+/g, " ")
    .replace(/<br\s*\/?>|<\/(?:p|tr|div|h\d|li|table|center)>/gi, "\n").replace(/<[^>]+>/g, " ");
  return decodeEntities(t).split("\n").map(l => l.replace(/[ \t\u00a0]+/g, " ").trim()).filter(Boolean);
}

// ───────────── Addresses on Texas Legislature Online ─────────────

/** "SB 4" → { prefix: "SB", number: 4 }; null for anything that is not a bill or resolution number. */
export function billParts(identifier: string): { prefix: string; number: number } | null {
  const m = identifier.replace(/\s+/g, "").toUpperCase().match(/^(HB|SB|HJR|SJR|HCR|SCR|HR|SR)(\d{1,5})$/);
  return m ? { prefix: m[1], number: Number(m[2]) } : null;
}
/** TLO's file name stem: "SB 4" → "SB00004", "SJR 2" → "SJ00002" (seen on the real Text pages for 89R SB 4 and SJR 2). */
export function tloDocCode(identifier: string): string | null {
  const p = billParts(identifier);
  return p ? `${p.prefix.length === 3 ? p.prefix.slice(0, 2) : p.prefix}${String(p.number).padStart(5, "0")}` : null;
}
/** The page that lists every version of a bill with its text, fiscal note and analysis. */
export function tloTextPageUrl(tloSession: string, identifier: string): string {
  return `${TLO}/BillLookup/Text.aspx?LegSess=${encodeURIComponent(tloSession)}&Bill=${encodeURIComponent(identifier.replace(/\s+/g, ""))}`;
}
export type TloDocKind = "billtext" | "analysis" | "fiscalnotes";
/** e.g. https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00004F.htm */
export function tloDocUrl(tloSession: string, identifier: string, kind: TloDocKind, versionCode: string): string | null {
  const code = tloDocCode(identifier);
  return code && /^[A-Z0-9]{1,3}$/.test(versionCode) ? `${TLO}/tlodocs/${tloSession}/${kind}/html/${code}${versionCode}.htm` : null;
}
/** The version letter at the end of a TLO document address ("…/SB00004F.htm" → "F"). */
export const versionCodeOf = (url: string) => url.match(/\/[A-Z]{2}\d{5}([A-Z0-9]{1,3})\.html?$/i)?.[1].toUpperCase() ?? null;

export type TloVersionRow = { version: string; code: string | null; textUrl: string | null; fiscalNoteUrl: string | null; analysisUrl: string | null };

/** The versions table of a TLO Text page, in the page's own order (oldest first). */
export function parseTloTextPage(html: string): TloVersionRow[] {
  const out: TloVersionRow[] = [];
  for (const row of html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<td\b[^>]*data-label="([^"]*)"[^>]*>([\s\S]*?)<\/td>/gi)].map(m => ({ label: m[1].toLowerCase(), html: m[2] }));
    const version = cells.find(c => c.label === "version");
    if (!version) continue;
    const link = (label: RegExp) => { const c = cells.find(x => label.test(x.label)); const u = c?.html.match(/href="([^"]+\/html\/[^"]+\.html?)"/i)?.[1]; return u && isOfficialUrl(u) ? u : null; };
    const textUrl = link(/^bill$/), fiscalNoteUrl = link(/fiscal/), analysisUrl = link(/analysis/);
    const name = decodeEntities(version.html.replace(/<[^>]+>/g, " ")).replace(/[\s\u00a0]+/g, " ").trim();
    if (!name) continue;
    out.push({ version: name, code: versionCodeOf(textUrl ?? fiscalNoteUrl ?? analysisUrl ?? ""), textUrl, fiscalNoteUrl, analysisUrl });
  }
  return out;
}

export type PickedDocs = { text: TloVersionRow; analysis: TloVersionRow | null; fiscal: TloVersionRow | null };
/**
 * The right version: the newest one with a published text. Its own analysis and fiscal note when they exist; otherwise
 * the nearest EARLIER version's (an analysis of a later version could describe parts this text does not have). The page
 * says which version each document describes.
 */
export function pickDocs(rows: readonly TloVersionRow[]): PickedDocs | null {
  let at = -1;
  rows.forEach((r, i) => { if (r.textUrl) at = i; });
  if (at < 0) return null;
  const nearest = (has: (r: TloVersionRow) => boolean) => { for (let i = at; i >= 0; i--) if (has(rows[i])) return rows[i]; return null; };
  // A note written for a later printing with no text of its own ("Senate Amendments Printing") is not used: its figures may count floor changes this text does not have.
  return { text: rows[at], analysis: nearest(r => !!r.analysisUrl), fiscal: nearest(r => !!r.fiscalNoteUrl) };
}

// ───────────── Bill text ─────────────

export type TxSection = { num: string; heading: string; text: string };
export type TxBillText = { caption: string | null; text: string; sections: TxSection[]; chars: number; certification: string | null };

/** How the text marks changes to current law, told to the model and to reviewers. */
export const BILL_TEXT_MARKS = "In the bill text, «words inside these marks» are ADDED to current law and [words in square brackets] are REMOVED from it. Unmarked words in a section that amends a law are current law that stays.";

/**
 * A TLO bill text page to plain text with its sections. Each table row is one printed line; a line that starts with
 * an indent begins a paragraph. Underlined words (added to current law) are kept inside « »; struck words already
 * stand in [square brackets] in the official text. Sections are numbered "SECTION 3." or, in a bill with articles,
 * "SECTION 1.01." — the number is kept as printed.
 */
export function parseTloBillText(html: string): TxBillText {
  const body = html.replace(/<(script|style|title|head)\b[\s\S]*?<\/\1>/gi, " ").replace(/<u>([\s\S]*?)<\/u>/gi, "«$1»").replace(/<\/?s>/gi, "");
  const paras: string[] = [];
  for (const row of body.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map(m => ({ centered: /align="?center/i.test(m[1]) || /<center>/i.test(m[2]), raw: decodeEntities(m[2].replace(/<[^>]+>/g, "")).replace(/[\r\n\t]+/g, " ") }));
    const cell = cells.filter(c => c.raw.replace(/[\s\u00a0]/g, "") && !/^[\s\u00a0]*\d+(?:-\d+)?[\s\u00a0]*$/.test(c.raw)).at(-1);
    if (!cell) continue;
    const line = cell.raw.replace(/[ \u00a0]+/g, " ").trim();
    // A signature rule ("______") always starts its own paragraph: it opens the signature block of an enrolled bill.
    const startsParagraph = cell.centered || /^[\s\u00a0]{3,}/.test(cell.raw) || /^_{5,}/.test(line) || !paras.length;
    if (startsParagraph) paras.push(line); else paras[paras.length - 1] += ` ${line}`;
  }
  const clean = paras.map(p => p.replace(/»\s*«/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const enact = clean.findIndex(p => /^BE IT (?:ENACTED|RESOLVED) BY THE LEGISLATURE/i.test(p));
  const actAt = clean.findIndex(p => /^(?:A BILL TO BE ENTITLED|AN ACT|A JOINT RESOLUTION|(?:HOUSE|SENATE) (?:JOINT|CONCURRENT) RESOLUTION|RESOLUTION)\b/i.test(p));
  // The caption ("relating to …") sits between "AN ACT" and the enacting line, often on the same printed paragraph as "AN ACT".
  const caption = enact > 0 ? clean.slice(Math.max(0, actAt), enact).join(" ").replace(/^(?:A BILL TO BE ENTITLED\s+)?(?:AN ACT|A JOINT RESOLUTION|(?:HOUSE|SENATE) (?:JOINT|CONCURRENT) RESOLUTION|RESOLUTION)\b\s*/i, "").trim() || null : null;
  // The signature block of an enrolled bill is not part of any section; its certification states the final votes.
  const signAt = clean.findIndex((p, i) => i > enact && /^(?:_{5,}|President of the Senate|Speaker of the House|I hereby certify|I certify)/i.test(p));
  const bodyParas = signAt > 0 ? clean.slice(0, signAt) : clean;
  const certification = signAt > 0 ? (clean.slice(signAt).join(" ").replace(/_{3,}/g, " ").match(/I (?:hereby )?certify[^_]*?(?:\.(?=\s+[A-Z][a-z]+ (?:of|Clerk)\b)|\.$)/g) ?? []).join(" ").replace(/\s+/g, " ").slice(0, 900) || null : null;
  const sections: TxSection[] = [];
  let current: TxSection | null = null;
  for (const p of bodyParas.slice(Math.max(0, enact + 1))) {
    const m = p.match(/^SECTION\s+(\d+(?:\.\d+)?[A-Za-z]?)\.\s*(.*)$/);
    if (m) { const h = m[2].replace(/[«»]/g, ""); current = { num: m[1], heading: (h.indexOf(":") > 0 && h.indexOf(":") < 200 ? h.slice(0, h.indexOf(":")) : h).slice(0, 160).trim(), text: p }; sections.push(current); }
    else if (/^ARTICLE\s+\d+[A-Z]?\./.test(p)) current = null;
    else if (current) current.text += `\n${p}`;
  }
  for (const s of sections) s.text = s.text.slice(0, 20_000);
  const text = bodyParas.join("\n");
  return { caption, text, sections, chars: text.length, certification };
}

/** The section number a citation points at: "Sec. 3", "Section 1.02(a-3)", "SECTION 2.15" → "3", "1.02", "2.15". */
export function txCitedSection(cite: string): string | null {
  return cite.match(/(?:sec(?:tion)?s?\.?|§)\s*(\d+(?:\.\d+)?[A-Za-z]?)(?![\d.]*\d)/i)?.[1].toUpperCase() ?? null;
}

// ───────────── Committee bill analysis (TLO): House committee analyses and Senate Research Center analyses ─────────────

export type TxBillAnalysis = { writer: "Senate Research Center" | "House committee"; committee: string | null; author: string | null; version: string | null; date: string | null;
  /** The author's or sponsor's statement of intent (Senate) or the background and purpose (House): why the bill was filed. */
  intent: string | null; intentHeading: string | null;
  /** What the bill does, section by section (Senate) or by subject (House). */
  analysis: string | null; effectiveDate: string | null; comparison: string | null };

const ANALYSIS_HEADINGS = /^(?:AUTHOR'?S?\s*\/\s*SPONSOR'?S? STATEMENT OF INTENT|BACKGROUND AND PURPOSE|CRIMINAL JUSTICE IMPACT|RULEMAKING AUTHORITY|SECTION BY SECTION ANALYSIS|ANALYSIS|EFFECTIVE DATE|COMPARISON OF [A-Z ]+|SUMMARY OF COMMITTEE CHANGES|RESOLUTION ANALYSIS)$/;

export function parseBillAnalysis(html: string, maxPart = 6000): TxBillAnalysis | null {
  const lines = htmlToLines(html).map(l => l.replace(/[’‘]/g, "'"));
  const start = lines.findIndex(l => /^BILL ANALYSIS$/i.test(l));
  if (start < 0) return null;
  const parts = new Map<string, string[]>();
  const header: string[] = [];
  let key: string | null = null;
  for (const l of lines.slice(start + 1)) {
    if (ANALYSIS_HEADINGS.test(l)) { key = l.replace(/\s+/g, " "); if (!parts.has(key)) parts.set(key, []); continue; }
    if (key) parts.get(key)!.push(l); else header.push(l);
  }
  const part = (re: RegExp) => { const k = [...parts.keys()].find(x => re.test(x)); return k ? { heading: k, lines: parts.get(k)! } : null; };
  const senate = header.some(l => /Senate Research Center/i.test(l)) || !!part(/STATEMENT OF INTENT/);
  const intentPart = part(/STATEMENT OF INTENT/) ?? part(/BACKGROUND AND PURPOSE/);
  // The Senate statement ends where the footnotes or the formal "amends current law" sentence begin.
  const cut = intentPart ? intentPart.lines.findIndex(l => /^Footnotes?:?$/i.test(l) || /^\[\d+\]/.test(l) || /\bamends current law relating to\b/i.test(l)) : -1;
  const intent = intentPart ? (cut >= 0 ? intentPart.lines.slice(0, cut) : intentPart.lines).join(" ").replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim().slice(0, maxPart) : "";
  const body = part(/^SECTION BY SECTION ANALYSIS$/) ?? part(/^ANALYSIS$/) ?? part(/RESOLUTION ANALYSIS/);
  const effective = part(/^EFFECTIVE DATE$/)?.lines.join(" ") ?? body?.lines.find(l => /^(?:SECTION [\d.]+\.\s*)?Effective date/i.test(l)) ?? null;
  const by = header.find(l => /^By:/i.test(l))?.replace(/^By:\s*/i, "").trim() ?? null;
  const date = header.find(l => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(l)) ?? null;
  const idx = header.findIndex(l => /^By:/i.test(l));
  const committee = idx >= 0 ? header[idx + 1] ?? null : null;
  const version = header.slice(idx + 2).filter(l => l !== date && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(l)).join(" ").replace(/\s+/g, " ").trim() || null;
  return { writer: senate ? "Senate Research Center" : "House committee", committee: committee && !/^\d/.test(committee) ? committee : null, author: by, version,
    date: date ? usDate(date) : null, intent: intent || null, intentHeading: intentPart?.heading ?? null,
    analysis: body ? body.lines.join("\n").slice(0, maxPart) : null, effectiveDate: effective ? effective.replace(/\s+/g, " ").slice(0, 600) : null,
    comparison: part(/^COMPARISON OF|SUMMARY OF COMMITTEE CHANGES/)?.lines.join(" ").slice(0, 1500) ?? null };
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** "8/25/2025" or "May 21, 2025" → "2025-08-25"; null when it is neither. */
export function usDate(s: string): string | null {
  const a = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (a) return `${a[3]}-${a[1].padStart(2, "0")}-${a[2].padStart(2, "0")}`;
  const b = s.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/), m = b ? MONTHS.indexOf(b[1].toLowerCase()) : -1;
  return b && m >= 0 ? `${b[3]}-${String(m + 1).padStart(2, "0")}-${b[2].padStart(2, "0")}` : null;
}

// ───────────── Legislative Budget Board fiscal note (TLO) ─────────────

export type TxFiscalNote = { date: string | null; version: string | null;
  /** The note's own top line: the two-year effect on the state's main account, or that no significant effect is expected. */
  headline: string | null; noSignificantImpact: boolean;
  /** Year by year, as printed: an amount in parentheses is a cost or a loss. */
  fiveYear: Array<{ fiscalYear: string; amount: string }>;
  fiscalAnalysis: string | null; methodology: string | null; localGovernment: string | null; sourceAgencies: string | null };

const FISCAL_HEADINGS = /^(Fiscal Analysis|Methodology|Technology|Local Government Impact|Source Agencies:?|LBB Staff:?)$/i;

export function parseFiscalNote(html: string, maxPart = 3000): TxFiscalNote | null {
  const lines = htmlToLines(html);
  if (!lines.some(l => /LEGISLATIVE BUDGET BOARD/i.test(l)) || !lines.some(l => /FISCAL NOTE/i.test(l))) return null;
  const date = lines.map(usDate).find(Boolean) ?? null;
  const inRe = lines.findIndex(l => /^IN RE:?$/i.test(l) || /^IN RE:/i.test(l));
  const reLine = inRe >= 0 ? (/^IN RE:?$/i.test(lines[inRe]) ? lines[inRe + 1] ?? "" : lines[inRe]) : "";
  const version = reLine.match(/\),\s*([^()]+?)\s*$/)?.[1].trim() ?? null;
  const headline = lines.find(l => /^Estimated Two-year Net Impact\b/i.test(l) || /^No (?:significant )?fiscal implication to the State\b/i.test(l) || /fiscal (?:implications|impact)[^.]*cannot be determined/i.test(l)) ?? null;
  const fiveYear: TxFiscalNote["fiveYear"] = [];
  const tableAt = lines.findIndex(l => /General Revenue-Related Funds, Five-\s*Year Impact/i.test(l));
  if (tableAt >= 0) for (const l of lines.slice(tableAt + 1, tableAt + 12)) {
    const m = l.match(/^(20\d\d)\s+(\(?-?\$[\d,]+\)?)$/);
    if (m) fiveYear.push({ fiscalYear: m[1], amount: m[2] }); else if (fiveYear.length) break;
  }
  const parts = new Map<string, string[]>();
  let key: string | null = null;
  for (const l of lines) {
    const inline = l.match(/^(Source Agencies|LBB Staff):\s*(.*)$/i); // these two carry their content on the same line
    if (inline) { key = inline[1].toLowerCase(); parts.set(key, inline[2] ? [inline[2]] : []); continue; }
    if (FISCAL_HEADINGS.test(l)) { key = l.replace(/:$/, "").toLowerCase(); parts.set(key, []); continue; }
    if (key) parts.get(key)!.push(l);
  }
  const part = (k: string) => parts.get(k)?.join(" ").replace(/\s+/g, " ").trim().slice(0, maxPart) || null;
  return { date, version, headline, noSignificantImpact: !!headline && /^No (?:significant )?fiscal implication/i.test(headline), fiveYear,
    fiscalAnalysis: part("fiscal analysis"), methodology: part("methodology"), localGovernment: part("local government impact"), sourceAgencies: part("source agencies") };
}

export function fiscalNoteText(n: TxFiscalNote): string {
  return [`Legislative Budget Board fiscal note${n.date ? `, dated ${n.date}` : ""}${n.version ? `, for the bill ${n.version.replace(/^As /, "as ")}` : ""}.`,
    n.headline ? `Its top line: ${n.headline}` : "",
    n.fiveYear.length ? `Effect on the state's main account for general spending, by budget year (an amount in parentheses is a cost): ${n.fiveYear.map(r => `${r.fiscalYear}: ${r.amount}`).join("; ")}.` : "",
    n.fiscalAnalysis ? `What the note says the bill does: ${n.fiscalAnalysis}` : "", n.methodology ? `How the cost was worked out: ${n.methodology}` : "",
    n.localGovernment ? `Effect on local governments: ${n.localGovernment}` : "", n.sourceAgencies ? `Agencies that supplied figures: ${n.sourceAgencies}` : ""].filter(Boolean).join("\n");
}

// ───────────── House Research Organization bill analysis (hro.house.texas.gov) — UNVERIFIED against the real site ─────────────

/**
 * UNVERIFIED (the host refused connections from the build machine on 17 Nov 2026). From memory, HRO publishes one PDF
 * per bill on the House daily floor report, at /pdf/ba<session>/<bill>.pdf, e.g. /pdf/ba89r/sb0004.pdf.
 */
export function hroAnalysisUrl(tloSession: string, identifier: string): string | null {
  const p = billParts(identifier);
  return p ? `https://hro.house.texas.gov/pdf/ba${tloSession.toLowerCase()}/${p.prefix.toLowerCase()}${String(p.number).padStart(4, "0")}.pdf` : null;
}

export type HroAnalysis = { date: string | null; subject: string | null; committee: string | null; vote: string | null; background: string | null; digest: string | null;
  supportersSay: string | null; criticsSay: string | null; otherCriticsSay: string | null; notes: string | null };

const HRO_PARTS = ["SUBJECT", "COMMITTEE", "VOTE", "SENATE VOTE", "WITNESSES", "BACKGROUND", "DIGEST", "SUPPORTERS SAY", "OTHER CRITICS SAY", "OTHER OPPONENTS SAY", "CRITICS SAY", "OPPONENTS SAY", "NOTES"] as const;

/**
 * An HRO bill analysis from its plain text (the PDF's text, or an HTML page turned to text). HRO prints the same
 * headings in every analysis: SUBJECT, COMMITTEE, VOTE, WITNESSES, BACKGROUND, DIGEST, SUPPORTERS SAY, CRITICS SAY
 * (OPPONENTS SAY in older sessions), OTHER CRITICS SAY, NOTES. Built against a hand-made sample of that structure.
 */
export function parseHroAnalysis(text: string, maxPart = 4500): HroAnalysis | null {
  if (!/HOUSE\s+RESEARCH\s+ORGANIZATION/i.test(text)) return null;
  // Running page headers ("SB 4  House Research Organization  page 2") are not part of any section.
  const raw = text.replace(/\r/g, "").replace(/^\s*(?:[HS][BJCR]{1,2}R? \d+\s*\n\s*)?House Research Organization\s*\n?\s*page \d+\s*$/gim, "").replace(/^\s*-\s*\d+\s*-\s*$/gm, "");
  // The headings stand in a narrow left column, so a two-word heading can come out of a PDF split over two lines
  // ("SUPPORTERS  text …" then "SAY:  text …"). Such a pair is joined back into one heading.
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i].match(/^\s*(SUPPORTERS|CRITICS|OPPONENTS|OTHER CRITICS|OTHER OPPONENTS|OTHER|SENATE)\s{2,}(\S.*)?$/), b = a ? lines[i + 1].match(/^\s*((?:CRITICS |OPPONENTS )?SAY|VOTE):\s*(.*)$/) : null;
    if (a && b) { lines[i] = `${a[1]} ${b[1]}: ${a[2] ?? ""} ${b[2]}`; lines.splice(i + 1, 1); }
  }
  const body = lines.join("\n");
  if (!/(?:^|\n)\s*SUPPORTERS SAY\s*:/.test(body)) return null; // every HRO analysis prints this heading
  const re = new RegExp(`(?:^|\\n)\\s*(${HRO_PARTS.join("|")})\\s*:`, "g");
  const marks = [...body.matchAll(re)].map(m => ({ name: m[1], at: m.index!, end: m.index! + m[0].length }));
  const parts = new Map<string, string>();
  marks.forEach((m, i) => { const t = body.slice(m.end, marks[i + 1]?.at ?? body.length).replace(/\s+/g, " ").trim(); if (!parts.has(m.name)) parts.set(m.name, t.slice(0, maxPart)); });
  const get = (...names: string[]) => names.map(n => parts.get(n)).find(Boolean) ?? null;
  const date = body.slice(0, marks[0]?.at ?? 400).match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/)?.[1] ?? null;
  return { date: date ? usDate(date) : null, subject: get("SUBJECT"), committee: get("COMMITTEE"), vote: get("VOTE"), background: get("BACKGROUND"), digest: get("DIGEST"),
    supportersSay: get("SUPPORTERS SAY"), criticsSay: get("CRITICS SAY", "OPPONENTS SAY"), otherCriticsSay: get("OTHER CRITICS SAY", "OTHER OPPONENTS SAY"), notes: get("NOTES") };
}

export function hroText(h: HroAnalysis): string {
  return [`House Research Organization bill analysis${h.date ? `, ${h.date}` : ""}. It reports what supporters and critics say; the views are theirs, not the organization's.`,
    h.subject ? `Subject: ${h.subject}` : "", h.background ? `Background: ${h.background}` : "", h.digest ? `Digest (what the bill would do): ${h.digest}` : "",
    h.supportersSay ? `SUPPORTERS SAY: ${h.supportersSay}` : "SUPPORTERS SAY: (nothing printed)",
    h.criticsSay ? `CRITICS SAY: ${h.criticsSay}` : "CRITICS SAY: (nothing printed)", h.otherCriticsSay ? `OTHER CRITICS SAY: ${h.otherCriticsSay}` : "",
    h.notes ? `Notes: ${h.notes}` : ""].filter(Boolean).join("\n");
}

/** Did the bill reach the House floor? HRO writes an analysis only for bills on the House's daily calendar. */
export function reachedHouseFloor(actions: ReadonlyArray<{ description: string; chamber?: string | null }>): boolean {
  return actions.some(a => a.chamber === "lower" && /\bplaced on\b.*\bcalendar\b|\bread 2nd time\b|\bread second time\b|\bpassed to 3rd reading\b|\bpassed to engrossment\b|\bread 3rd time\b/i.test(a.description));
}

// ───────────── Current law (statutes.capitol.texas.gov) — UNVERIFIED against the real site ─────────────

/** The codes of Texas law and the short names the statutes site uses in its addresses (from memory; UNVERIFIED). */
export const TX_CODES: Record<string, string> = { "Agriculture Code": "AG", "Alcoholic Beverage Code": "AL", "Business & Commerce Code": "BC", "Business and Commerce Code": "BC",
  "Business Organizations Code": "BO", "Civil Practice and Remedies Code": "CP", "Education Code": "ED", "Election Code": "EL", "Estates Code": "ES", "Family Code": "FA", "Finance Code": "FI",
  "Government Code": "GV", "Health and Safety Code": "HS", "Human Resources Code": "HR", "Insurance Code": "IN", "Labor Code": "LA", "Local Government Code": "LG", "Natural Resources Code": "NR",
  "Occupations Code": "OC", "Parks and Wildlife Code": "PW", "Penal Code": "PE", "Property Code": "PR", "Special District Local Laws Code": "SD", "Tax Code": "TX", "Transportation Code": "TN",
  "Utilities Code": "UT", "Water Code": "WA" };

export type StatuteCite = { code: string; section: string };
/** Sections of current law the bill amends ("Section 11.13(b), Tax Code, is amended"), in order, without repeats. Added sections have no current text and are left out. */
export function statuteCites(billText: string, max = 2): StatuteCite[] {
  const out: StatuteCite[] = [];
  for (const m of billText.replace(/[«»]/g, "").matchAll(/\bSection\s+(\d+[A-Z]?\.\d+[A-Za-z]?)(?:\([^)]{1,8}\))*,\s+((?:[A-Z][A-Za-z]+|&|and)(?:\s+(?:[A-Z][A-Za-z]+|&|and|of)){0,5}\s+Code),\s+(?:as [^,]{1,80},\s+)?is amended\b/g)) {
    const code = m[2].replace(/\s+/g, " ");
    if (TX_CODES[code] && !out.some(c => c.code === code && c.section === m[1])) out.push({ code, section: m[1] });
    if (out.length >= max) break;
  }
  return out;
}
/** UNVERIFIED pattern: one page per chapter, each section an anchor, e.g. /Docs/TX/htm/TX.11.htm#11.13 */
export function statuteUrl(c: StatuteCite): string | null {
  const abbr = TX_CODES[c.code], chapter = c.section.split(".")[0];
  return abbr ? `https://statutes.capitol.texas.gov/Docs/${abbr}/htm/${abbr}.${chapter}.htm#${c.section}` : null;
}
/** One section's text from a chapter page: from "Sec. 11.13." to the next "Sec. …" heading. Built against a hand-made sample. */
export function parseStatuteSection(html: string, section: string, max = 4000): string | null {
  const text = htmlToLines(html).join("\n");
  const esc = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = text.search(new RegExp(`(?:^|\\n)Sec\\.\\s*${esc}\\.\\s`));
  if (start < 0) return null;
  const rest = text.slice(start).replace(/^\n/, "");
  const next = rest.slice(10).search(/\nSec\.\s*\d+[A-Z]?\.\d+[A-Za-z-]*\.\s/);
  return (next >= 0 ? rest.slice(0, next + 10) : rest).replace(/\s+/g, " ").trim().slice(0, max) || null;
}

// ───────────── The bill's own record (actions and votes from the database) ─────────────

export type TxActionRow = { date: string; description: string; chamber?: string | null; classification?: readonly string[] | null };
export type TxVoteRow = { date: string; motion: string; result: string; chamber?: string | null; counts?: Record<string, number> | null; tallyOk?: number | boolean | null };
/** "2025-06-16" → "June 16, 2025": the form a summary writes a date in, so the date it gives can be found in the record. */
export function longDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/), month = m ? MONTHS[Number(m[2]) - 1] : null;
  return m && month ? `${month[0].toUpperCase()}${month.slice(1)} ${Number(m[3])}, ${m[1]}` : iso;
}
const chamberName = (c?: string | null) => (c === "upper" ? "Senate" : c === "lower" ? "House" : c === "executive" ? "Governor" : "");

/**
 * What the Legislature has done with the bill, as the model's "STATUS" source. A vote is listed with its totals only
 * when the record lists how members voted; a floor decision without such a record is stated as a decision with no
 * member-by-member record (brief rule: never imply a position without a recorded vote).
 */
export function statusText(bill: { identifier: string; sessionName: string; title: string; latestActionDate?: string | null; latestActionDescription?: string | null },
  actions: readonly TxActionRow[], votes: readonly TxVoteRow[], certification?: string | null, maxActions = 45): string {
  const key = (a: TxActionRow) => /filed|referred to|hearing|testimony|reported|read 2nd|read 3rd|passed|failed|adopted|concur|conference|record vote|signed|sent to the governor|vetoed|effective|calendar/i.test(a.description);
  const kept = actions.filter(key).slice(-maxActions);
  const lines = [`${bill.identifier}, ${bill.sessionName}. Caption: ${bill.title}`,
    "Actions on the bill, oldest first (the site's copy of the record; Texas Legislature Online is the official record):",
    ...kept.map(a => `${longDate(a.date)}, ${chamberName(a.chamber)}: ${a.description}`.replace(/\s+/g, " ")),
    votes.length ? "Recorded votes (the record lists how each member voted):" : "Recorded votes: none in the record. A decision listed above without a recorded vote has no member-by-member record.",
    ...votes.filter(v => v.tallyOk !== 0 && v.tallyOk !== false).map(v => `${longDate(v.date)}, ${chamberName(v.chamber)}: "${v.motion || "vote"}", result ${v.result || "not stated"}${v.counts ? `, ${Object.entries(v.counts).map(([o, n]) => `${o} ${n}`).join(", ")}` : ""}`),
    bill.latestActionDescription && !kept.some(a => a.description === bill.latestActionDescription) ? `Latest action${bill.latestActionDate ? ` (${longDate(bill.latestActionDate)})` : ""}: ${bill.latestActionDescription}` : "",
    certification ? `The final printed bill certifies: ${certification}` : ""];
  return lines.filter(Boolean).join("\n");
}
