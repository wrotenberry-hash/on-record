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

export type SourceKind = "bill_text" | "crs" | "cbo" | "committee_report" | "federal_register" | "us_code";
export type SourceDoc = { id: string; kind: SourceKind; label: string; url: string; text: string };

export const SOURCE_LABELS: Record<SourceKind, string> = {
  bill_text: "Bill text", crs: "CRS summary (Congress.gov)", cbo: "CBO cost estimate", committee_report: "Committee report",
  federal_register: "The rule (Federal Register)", us_code: "Current law (U.S. Code)",
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
