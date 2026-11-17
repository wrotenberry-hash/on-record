/**
 * Official sources for bill summaries (owner instruction, 16 Nov 2026): the bill text alone is not enough.
 * The generator may use, each cited and labelled:
 *   - the CRS summary (Congress.gov, through the govinfo BILLSTATUS file)
 *   - the CBO estimate (listing in BILLSTATUS; full text where a committee report reprints it)
 *   - committee reports (govinfo CRPT packages): purpose, background, minority or dissenting views, CBO estimate
 *   - for disapproval resolutions: the disapproved rule (Federal Register: title, agencies, the agency's own summary)
 *   - for bills that change existing law: the U.S. Code sections they amend (govinfo)
 * Never news or advocacy sources: every URL built here is on govinfo.gov, federalregister.gov or congress.gov.
 * Parsers are pure and tested against saved official files (tests/fixtures/sources).
 */

export type SourceKind = "bill_text" | "crs" | "cbo" | "committee_report" | "federal_register" | "us_code" | "floor" | "status";
export type SourceDoc = { id: string; kind: SourceKind; label: string; url: string; text: string };

export const SOURCE_LABELS: Record<SourceKind, string> = {
  bill_text: "Bill text", crs: "CRS summary (Congress.gov)", cbo: "CBO cost estimate", committee_report: "Committee report",
  federal_register: "The rule (Federal Register)", us_code: "Current law (U.S. Code)", floor: "Floor debate (Congressional Record)", status: "Actions in Congress (bill status record)",
};

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&nbsp;/g, " ").replace(/&sect;/g, "§").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–");
export const htmlToText = (html: string) => decode(html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// ---------- Disapproval resolutions (Congressional Review Act) ----------

/** The rule a CRA disapproval resolution names, and the agency that submitted it, from the official title. */
export function disapprovedRule(title: string): { rule: string; agency: string | null } | null {
  if (!/congressional disapproval/i.test(title)) return null;
  const rule = title.match(/relating to\s+["“]([^"”]+)["”]/i)?.[1] ?? title.match(/relating to\s+(.+?)\.?$/i)?.[1];
  if (!rule) return null;
  const agency = title.match(/submitted by the\s+(.+?)\s+relating to/i)?.[1] ?? null;
  return { rule: rule.trim().replace(/\.$/, ""), agency };
}

const norm = (s: string) => s.toLowerCase().replace(/[“”"'’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export type FrDoc = { document_number: string; title: string; type?: string; abstract?: string | null; html_url: string; publication_date: string;
  agencies?: Array<{ name?: string | null; raw_name?: string | null }>; effective_on?: string | null; citation?: string | null };

export const federalRegisterSearchUrl = (rule: string) =>
  `https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&conditions%5Bterm%5D=${encodeURIComponent(`"${rule}"`)}&conditions%5Btype%5D%5B%5D=RULE`;

/** The final rule whose title matches the resolution exactly (corrections and proposed rules are skipped). */
export function pickFederalRegisterRule(results: readonly FrDoc[], rule: string): FrDoc | null {
  const want = norm(rule);
  const final = results.filter(r => (r.type ?? "Rule") === "Rule" && !/;\s*correction\s*$/i.test(r.title));
  return final.find(r => norm(r.title) === want) ?? final.find(r => norm(r.title).startsWith(want)) ?? null;
}

export function federalRegisterDoc(r: FrDoc): SourceDoc {
  const agencies = (r.agencies ?? []).map(a => a.name ?? a.raw_name).filter((x): x is string => !!x);
  const text = [`Title: ${r.title}.`, `Issued by: ${agencies.join("; ") || "not listed"}.`, `Published ${r.publication_date}${r.citation ? ` at ${r.citation}` : ""}${r.effective_on ? `; effective ${r.effective_on}` : ""}.`,
    `The agency's summary of the rule: ${r.abstract ?? "(none published)"}`].join(" ");
  return { id: "RULE", kind: "federal_register", label: `${SOURCE_LABELS.federal_register}: ${r.title}`, url: r.html_url, text };
}

/** Agency names the rule lists, for attributions and for the claim check (an agency's name is not a program). */
export function frAgencies(r: FrDoc): string[] {
  return (r.agencies ?? []).map(a => a.name ?? a.raw_name).filter((x): x is string => !!x);
}

// ---------- Committee reports ----------

/** "H. Rept. 119-390" -> govinfo package CRPT-119hrpt390. */
export function reportPackage(citation: string): string | null {
  const m = citation.match(/^\s*(H|S)\.\s*Rept\.\s*(\d+)-(\d+)/i);
  return m ? `CRPT-${m[2]}${m[1].toLowerCase()}rpt${m[3]}` : null;
}
export const reportUrl = (pkg: string) => `https://www.govinfo.gov/content/pkg/${pkg}/html/${pkg}.htm`;

export function committeeReportCitations(billStatusXml: string): string[] {
  const block = billStatusXml.match(/<committeeReports>([\s\S]*?)<\/committeeReports>/)?.[1] ?? "";
  return [...new Set([...block.matchAll(/<citation>([^<]+)<\/citation>/g)].map(m => m[1].trim()))];
}

const REPORT_HEADINGS = ["PURPOSE AND SUMMARY", "PURPOSE OF LEGISLATION", "PURPOSE", "BACKGROUND AND NEED FOR LEGISLATION", "BACKGROUND AND NEED", "BACKGROUND",
  "HEARINGS", "COMMITTEE CONSIDERATION", "COMMITTEE VOTES", "COMMITTEE OVERSIGHT FINDINGS", "CONGRESSIONAL BUDGET OFFICE COST ESTIMATE", "CONGRESSIONAL BUDGET OFFICE ESTIMATE", "NEW BUDGET AUTHORITY AND CBO COST ESTIMATE", "CBO COST ESTIMATE", "COMMITTEE COST ESTIMATE", "NEW BUDGET AUTHORITY", "PERFORMANCE GOALS AND OBJECTIVES", "ADVISORY COMMITTEE STATEMENT", "APPLICABILITY TO LEGISLATIVE BRANCH", "FEDERAL MANDATES STATEMENT",
  "SECTION-BY-SECTION ANALYSIS", "CHANGES IN EXISTING LAW", "MINORITY VIEWS", "DISSENTING VIEWS", "ADDITIONAL VIEWS"];

/**
 * The parts of a committee report a reader needs: who reported it, its stated purpose and background, the CBO
 * estimate it reprints, and any minority, dissenting or additional views (those are the record's arguments against).
 * Headings in GPO report text are upper case on their own; the table of contents repeats them, so the last
 * occurrence of a heading after the contents is used.
 */
export function parseCommitteeReport(html: string, maxPart = 3500) {
  const pre = html.match(/<pre>([\s\S]*?)<\/pre>/i)?.[1] ?? html;
  const text = decode(pre.replace(/<[^>]+>/g, "")).replace(/\r/g, "");
  const committee = text.match(/from the (Committee on [A-Z][A-Za-z,'&\s]+?),\s+submitted/)?.[1]?.replace(/\s+/g, " ") ?? null;
  const chamber = /HOUSE OF REPRESENTATIVES/.test(text.slice(0, 2000)) ? "House" : /SENATE/.test(text.slice(0, 2000)) ? "Senate" : null;
  const bodyStart = Math.max(0, text.search(/\n\s*(?:I\.\s+)?PURPOSE|\n\s*Purpose and Summary\s*\n/));
  const marks: Array<{ name: string; at: number }> = [];
  for (const h of REPORT_HEADINGS) {
    const re = new RegExp(`\\n\\s*(?:[IVX]+\\.\\s+)?${h.replace(/ /g, "\\s+")}\\s*\\n`, "gi");
    let m: RegExpExecArray | null, last = -1;
    while ((m = re.exec(text))) if (m.index >= bodyStart) { last = m.index; break; }
    if (last >= 0 && !marks.some(x => Math.abs(x.at - last) < 5)) marks.push({ name: h, at: last });
  }
  marks.sort((a, b) => a.at - b.at);
  const part = (names: string[]) => {
    const i = marks.findIndex(x => names.includes(x.name));
    if (i < 0) return null;
    const end = marks[i + 1]?.at ?? text.length;
    return text.slice(marks[i].at, end).replace(/\s+/g, " ").replace(/^\s*[IVX]*\.?\s*/, "").trim().slice(0, maxPart);
  };
  // Who signed minority or dissenting views: names on their own lines just before the views end are too varied to
  // parse safely, so the views are attributed to the committee minority as a group, with the report cited.
  return { committee, chamber, purpose: part(["PURPOSE AND SUMMARY", "PURPOSE OF LEGISLATION", "PURPOSE"]),
    background: part(["BACKGROUND AND NEED FOR LEGISLATION", "BACKGROUND AND NEED", "BACKGROUND"]),
    cbo: part(["CONGRESSIONAL BUDGET OFFICE COST ESTIMATE", "CONGRESSIONAL BUDGET OFFICE ESTIMATE", "NEW BUDGET AUTHORITY AND CBO COST ESTIMATE", "CBO COST ESTIMATE", "COMMITTEE COST ESTIMATE"]), minority: part(["MINORITY VIEWS", "DISSENTING VIEWS"]), additional: part(["ADDITIONAL VIEWS"]) };
}

export function committeeReportDoc(citation: string, url: string, r: ReturnType<typeof parseCommitteeReport>): SourceDoc {
  const by = r.committee ? `${r.chamber ? `${r.chamber} ` : ""}${r.committee}` : "the committee";
  const text = [`${citation}, from the ${by}.`, r.purpose && `Purpose: ${r.purpose}`, r.background && `Background: ${r.background}`,
    r.cbo && `CBO cost estimate as printed in the report: ${r.cbo}`, r.minority && `Minority or dissenting views: ${r.minority}`, r.additional && `Additional views: ${r.additional}`]
    .filter(Boolean).join("\n");
  return { id: "REPORT", kind: "committee_report", label: `${SOURCE_LABELS.committee_report}: ${citation} (${by})`, url, text };
}

// ---------- Current law the bill amends ----------

/** U.S. Code sections the bill text points at: "section 1413a of title 10, United States Code" and "(42 U.S.C. 2243)". */
export function usCodeCites(billText: string, max = 3): Array<{ title: string; section: string }> {
  const out: Array<{ title: string; section: string }> = [];
  const add = (title: string, section: string) => {
    section = section.replace(/[^0-9A-Za-z-]/g, "");
    if (section && !out.some(c => c.title === title && c.section === section)) out.push({ title, section });
  };
  for (const m of billText.matchAll(/\bsection\s+(\d+[A-Za-z-]*)(?:\([^)]*\))*\s+of\s+title\s+(\d+),\s+United States Code/gi)) add(m[2], m[1]);
  // "(42 U.S.C. 4321 et seq.)" names a whole act, not a section the bill changes: skipped.
  for (const m of billText.matchAll(/\(\s*(\d+)\s+U\.S\.C\.\s+(\d+[A-Za-z-]*)\s*\)/g)) add(m[1], m[2]);
  return out.slice(0, max);
}
export const usCodeUrl = (title: string, section: string) => `https://www.govinfo.gov/link/uscode/${title}/${section}?link-type=html`;

/** The text of one U.S. Code section from its govinfo HTML page, from its "§" heading on. */
export function parseUsCodeSection(html: string, title: string, section: string, max = 4000): SourceDoc | null {
  const text = htmlToText(html);
  const i = text.indexOf(`§${section}.`);
  if (i < 0) return null;
  return { id: `USC ${title} §${section}`, kind: "us_code", label: `${SOURCE_LABELS.us_code}: ${title} U.S.C. ${section}`, url: usCodeUrl(title, section),
    text: text.slice(i, i + max) };
}

/** Does the bill block or change an existing rule or law? Then "Background" is required. */
export function changesExistingLaw(title: string, billText: string): boolean {
  return !!disapprovedRule(title) || /\bis amended\b|\bare amended\b|\bis repealed\b/i.test(billText);
}

// ───────────── Owner instruction, 17 Nov 2026: reasons and stakes come from the official record ─────────────
// The agency's stated reasons (the rule's Federal Register preamble) and what named members said on the floor
// (Congressional Record), both read from govinfo.gov.

/** The rule's full text on govinfo: FR-YYYY-MM-DD/html/<document number>.htm */
export const frFullTextUrl = (publicationDate: string, documentNumber: string) =>
  `https://www.govinfo.gov/content/pkg/FR-${publicationDate}/html/${documentNumber}.htm`;

/**
 * The parts of a rule's preamble that say, in the agency's own words, why it made the rule and what the rule's main
 * changes are: the "Executive Summary" and the "Summary of Major Provisions". Footnotes and rule lines are dropped.
 */
export function parseFrPreamble(html: string, max = 11000): { why: string | null; major: string | null; impact: string | null; consumer: string | null; effective: string | null; usesHealthCareGov: boolean } {
  const text = decode(html.replace(/<[^>]+>/g, "")).replace(/\r/g, "");
  const clean = (s: string) => s.replace(/-{20,}[\s\S]*?-{20,}/g, " ").replace(/\\\d+\\/g, "").replace(/\s+/g, " ").trim();
  const head = (re: RegExp, from = 0) => { const m = re.exec(text.slice(from)); return m ? from + m.index : -1; };
  const exec = head(/\n\s*I\.\s+Executive Summary\s*\n/);
  const background = exec >= 0 ? head(/\n\s*II\.\s+[A-Z][^\n]*\n/, exec + 10) : -1;
  const major = head(/\n\s*[A-Z]\.\s+Summary of (?:the )?Major Provisions\s*\n/, Math.max(0, exec));
  const afterMajor = major >= 0 ? head(/\n\s*(?:III|IV)\.\s+[A-Z][^\n]*\n/, major + 10) : -1;
  // The agency's own numbers: how many people, how much money. They sit in the regulatory impact analysis near the end,
  // in sentences that start "We expect/estimate …" and carry a figure about enrollment, premiums, costs or savings.
  const ria = text.lastIndexOf("Regulatory Impact Analysis");
  const tail = clean(text.slice(ria > 0 ? ria : Math.floor(text.length * 0.8)));
  const impactSentences = tail.split(/(?<=[.])\s+(?=[A-Z])/).filter(x => x.length < 420
    && /\b[Ww]e (?:expect|estimate|anticipate|project|have estimated)\b|\bis expected to\b|\bare expected to\b/.test(x)
    && /\b\d[\d,.]*\s?(?:million|billion|percent)\b|\$\d/.test(x)
    && /\b(?:enroll|premium|consumers?|individuals|people|households|beneficiar|uninsured|coverage)/i.test(x));
  const rank = (x: string) => (/\boverall\b|\baverage enrollment\b|\btotal\b/i.test(x) ? 0 : 1) + (/million enrollees|million (?:people|individuals|consumers)/i.test(x) ? 0 : 1);
  const impact = [...new Set(impactSentences)].sort((a, b) => rank(a) - rank(b)).slice(0, 9).join(" ").slice(0, 3200) || null;
  // Dollar amounts a person would meet: limits, fees and payments stated for a plan year, anywhere in the rule.
  // (Dashed lines also frame tables, so the footnote stripping used above would swallow text here.)
  const body = text.slice(Math.max(0, exec)).replace(/\\\d+\\/g, "").replace(/\s+/g, " ");
  const dollarSentences = body.split(/(?<=[.])\s+(?=[A-Z])/).filter(x => x.length < 700 && /\$\d{1,3}(?:,\d{3})+|\$\d+(?:\.\d+)? (?:million|billion)/.test(x)
    && /\b(?:out-of-pocket|cost sharing|deductible|annual limit|self-only|user fee)/i.test(x) && /\b(?:PY|plan year|benefit year) 20\d\d\b|\bfor 20\d\d\b/.test(x) && !/PMPM|\d x \d|=|commenters?/.test(x));
  // The year the rule is about: the plan year it names most often.
  const years = new Map<string, number>();
  for (const m of body.matchAll(/\b(?:PY|plan year|benefit year) (20\d\d)\b/g)) years.set(m[1], (years.get(m[1]) ?? 0) + 1);
  const latest = [...years.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const rankD = (x: string) => (new RegExp(`\\b${latest}\\b`).test(x) ? 0 : 2) + (/self-only|out-of-pocket|annual limitation/i.test(x) ? 0 : 1);
  const consumer = [...new Set(dollarSentences)].sort((a, b) => rankD(a) - rankD(b)).slice(0, 8).map(x => x.length > 420 ? `…${x.slice(-420)}` : x).join(" ").slice(0, 3400) || null;
  const effective = clean(text.slice(0, 6000)).match(/(?:These regulations are|This (?:final )?rule is) effective (?:on )?([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1] ?? null;
  return { why: exec >= 0 ? clean(text.slice(exec, background > exec ? background : exec + 4000)).slice(0, 2500) : null,
    major: major >= 0 ? clean(text.slice(major, afterMajor > major ? afterMajor : major + 30000)).slice(0, max) : null, impact, consumer, effective,
    usesHealthCareGov: /HealthCare\.gov/i.test(text) };
}

/** Congressional Record volume for a calendar year (2025 is volume 171). */
export const crVolume = (year: number) => year - 1854;

/** Floor-record page references in the bill's actions: "(consideration: CR S5139-5140)" → { chamber: "S", page: 5139, date }. Debate first. */
export function crPageRefs(billStatusXml: string, max = 2): Array<{ chamber: "H" | "S"; page: number; date: string; kind: string }> {
  const out: Array<{ chamber: "H" | "S"; page: number; date: string; kind: string }> = [];
  for (const item of billStatusXml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const date = item[1].match(/<actionDate>([^<]+)<\/actionDate>/)?.[1], text = item[1].match(/<text>([^<]+)<\/text>/)?.[1];
    if (!date || !text) continue;
    for (const m of text.matchAll(/\b(consideration|text(?: of [a-z ]+)?|text as [a-z ]+)?:?\s*CR\s+([HS])(\d+)/gi)) {
      const ref = { chamber: m[2].toUpperCase() as "H" | "S", page: Number(m[3]), date: date.slice(0, 10), kind: /consideration/i.test(m[1] ?? "") ? "consideration" : "text" };
      if (!out.some(o => o.chamber === ref.chamber && o.page === ref.page)) out.push(ref);
    }
  }
  return out.sort((a, b) => (a.kind === "consideration" ? 0 : 1) - (b.kind === "consideration" ? 0 : 1) || b.date.localeCompare(a.date)).slice(0, max);
}
export const crLinkUrl = (date: string, chamber: "H" | "S", page: number) =>
  `https://www.govinfo.gov/link/crec/${crVolume(Number(date.slice(0, 4)))}/${chamber}/${page}?link-type=html`;

export type FloorSpeech = { speaker: string; name: string; text: string };

/**
 * Who said what on the floor. The Record starts each speaker's remarks "  Ms. BALDWIN. " or "  Mr. BOST of Illinois. ".
 * The presiding officer, the clerk and the Speaker pro tempore are procedure, not argument, and are dropped.
 */
export function parseFloorSpeeches(html: string, perSpeaker = 2600, closing = 1400): { title: string; date: string | null; chamber: string | null; speeches: FloorSpeech[]; text: string; budget: string | null } {
  const text = decode((html.match(/<pre>([\s\S]*?)<\/pre>/i)?.[1] ?? html).replace(/<[^>]+>/g, "")).replace(/\r/g, "");
  const date = text.match(/\((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), ([A-Z][a-z]+ \d{1,2}, \d{4})\)/)?.[1] ?? null;
  const chamber = text.match(/\n\[(Senate|House)\]\n/)?.[1] ?? null;
  const by = new Map<string, FloorSpeech>();
  const re = /\n {2}(M[rs]s?\.|Miss) ([A-Z][A-Za-z'’ -]*?[A-Z]{2,}[A-Z'’ -]*?)(?: of ([A-Z][a-z]+(?: [A-Z][a-z]+)?))?\. /g;
  const marks: Array<{ at: number; end: number; key: string; speaker: string; name: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const surname = m[2].trim().split(/\s+/).map(w => w[0] + w.slice(1).toLowerCase()).join(" ");
    const name = m[3] ? `${surname} of ${m[3]}` : surname;
    marks.push({ at: m.index, end: m.index + m[0].length, key: name, speaker: `${m[1]} ${name}`, name });
  }
  // Procedure lines end a speaker's turn.
  const stops = [...text.matchAll(/\n {2}The (?:PRESIDING OFFICER|SPEAKER pro tempore|SPEAKER|CHAIR|ACTING CHAIR|Acting CHAIR|CLERK|ACTING PRESIDENT pro tempore|PRESIDENT pro tempore|VICE PRESIDENT)[^.]*\. |\n {2}The (?:result was announced|yeas and nays|question (?:is|was)|clerk will|(?:senior |assistant |legislative |bill )*clerk (?:read|called)|vote was taken|following Senators?|motion was)|\n\s*\[Rollcall Vote|\n\s*\[Roll No\./g)].map(x => x.index!);
  marks.forEach((k, i) => {
    const nextMark = marks[i + 1]?.at ?? text.length, nextStop = stops.find(s => s > k.end) ?? text.length;
    const said = text.slice(k.end, Math.min(nextMark, nextStop)).replace(/\s+/g, " ").trim();
    if (said.split(" ").length < 25 || /^The following Senators? (?:is|are) necessarily absent/.test(said)) return; // "I yield back", motions, absences and requests are not arguments
    const cur = by.get(k.key) ?? { speaker: k.speaker, name: k.name, text: "" };
    cur.text = `${cur.text} ${said}`.trim();
    by.set(k.key, cur);
  });
  // A floor manager speaks many times. The opening and the closing carry the argument, so keep both ends.
  for (const sp of by.values()) if (sp.text.length > perSpeaker + closing + 40)
    sp.text = `${sp.text.slice(0, perSpeaker).replace(/\s+\S*$/, "")} […] ${sp.text.slice(-closing).replace(/^\S*\s+/, "")}`;
  const title = text.split("\n").map(l => l.trim()).filter(l => /^[A-Z][A-Z0-9 ,.'’&;:()`\-]{12,}$/.test(l)).slice(0, 6).join(" ").slice(0, 300);
  // A Congressional Budget Office estimate printed in the Record: its sentences with figures (people, dollars, years).
  const flat = text.replace(/\s+/g, " ");
  const cboAt = flat.search(/Congressional Budget Office Cost Estimate|CBO estimates that enacting|Congressional Budget Office,?\s+(?:Washington|U\.S\. Congress)/i);
  const budget = cboAt < 0 ? null : [...new Set(flat.slice(cboAt, cboAt + 14000).split(/(?<=[.])\s+(?=[A-Z])/)
    .filter(x => x.length < 380 && /\bCBO\b|\baverage\b|\bretirees\b|\bbudget\b/i.test(x) && /\$\s?\d|\b\d[\d,.]*\s?(?:million|billion|percent)\b|\babout \d[\d,]+/.test(x)))].slice(0, 10).join(" ").slice(0, 2600) || null;
  return { title, date, chamber, speeches: [...by.values()], text, budget };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };

/** The bill's own record of what Congress has done with it, newest first: the votes, the dates, where it stands. */
export function statusDoc(billStatusXml: string, url: string, max = 10): SourceDoc | null {
  const seen = new Set<string>(), rows: Array<{ date: string; text: string }> = [];
  const block = billStatusXml.match(/<actions>([\s\S]*?)<\/actions>/)?.[1] ?? "";
  for (const item of block.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const date = item[1].match(/<actionDate>([^<]+)<\/actionDate>/)?.[1]?.slice(0, 10), text = decode(item[1].match(/<text>([^<]+)<\/text>/)?.[1] ?? "").trim();
    if (!date || !text || seen.has(`${date}${text}`)) continue;
    seen.add(`${date}${text}`); rows.push({ date, text });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => b.date.localeCompare(a.date));
  // Votes and floor steps first: they are what a reader needs to know about "right now".
  const key = (t: string) => /vote|passed|agreed to|rejected|not invoked|failed|veto|became public law|signed by president|motion to proceed|cloture/i.test(t) ? 0 : 1;
  const pick = [...rows.filter(r => key(r.text) === 0).slice(0, 7), ...rows.filter(r => key(r.text) === 1).slice(0, 3)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, max);
  return { id: "STATUS", kind: "status", label: SOURCE_LABELS.status, url, text: pick.map(r => `${longDate(r.date)}: ${r.text}`).join("\n") };
}

/** Does this piece of the Record concern this bill? "S.J. Res. 197", "H.R. 7008", "H. R. 7008" all count. */
export function recordMentionsBill(recordText: string, billType: string, number: number): boolean {
  const forms: Record<string, string> = { hr: "H\\.\\s?R\\.", s: "S\\.", hjres: "H\\.\\s?J\\.\\s?Res\\.", sjres: "S\\.\\s?J\\.\\s?Res\\.", hres: "H\\.\\s?Res\\.", sres: "S\\.\\s?Res\\.", hconres: "H\\.\\s?Con\\.\\s?Res\\.", sconres: "S\\.\\s?Con\\.\\s?Res\\." };
  const f = forms[billType.toLowerCase()];
  return !!f && new RegExp(`${f}\\s?${number}\\b`, "i").test(recordText);
}

export function floorDoc(id: string, url: string, r: ReturnType<typeof parseFloorSpeeches>, maxSpeakers = 10): SourceDoc {
  const title = r.chamber === "Senate" ? "Sen." : "Rep.";
  const text = [...r.speeches.slice(0, maxSpeakers).map(s => `${title} ${s.name} said: ${s.text}`),
    ...(r.budget ? [`Congressional Budget Office estimate printed in the Record: ${r.budget}`] : [])].join("\n");
  return { id, kind: "floor", label: `Floor debate, Congressional Record${r.date ? `, ${r.date}` : ""}${r.chamber ? ` (${r.chamber})` : ""}`, url, text };
}
