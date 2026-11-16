import { changesExistingLaw, committeeReportCitations, committeeReportDoc, disapprovedRule, federalRegisterDoc, federalRegisterSearchUrl, frAgencies,
  parseCommitteeReport, parseUsCodeSection, pickFederalRegisterRule, reportPackage, reportUrl, usCodeCites, usCodeUrl, type FrDoc, type SourceDoc } from "@/lib/analysis/sources";
import type { BillStatus } from "@/lib/analysis/billtext";
import type { SourceContext } from "@/lib/analysis/checker";

const USER_AGENT = "OnRecord/0.2 (+https://on-record-wrotenberry.vercel.app)";

async function fetchText(url: string, timeoutMs = 20_000): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store", redirect: "follow" });
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

export type Gathered = { docs: SourceDoc[]; context: SourceContext; notes: string[] };

/**
 * Owner instruction, 16 Nov 2026: gather every official source the summary may use, each with an id the model cites.
 * Any source that cannot be fetched is left out and noted; nothing else stands in for it.
 */
export async function gatherSources(input: { title: string; billType: string; sponsorName: string | null; billStatusXml: string; status: BillStatus; billText: string }): Promise<Gathered> {
  const docs: SourceDoc[] = [], notes: string[] = [], agencies: string[] = [];
  const allowedFor: string[] = [], allowedAgainst: string[] = [];
  const chamberTitle = /^s/.test(input.billType) ? "Sen." : "Rep.";
  if (input.sponsorName) allowedFor.push(`${chamberTitle} ${input.sponsorName}, the sponsor`);

  if (input.status.crsSummary) docs.push({ id: "CRS", kind: "crs", label: `CRS summary (Congress.gov)${input.status.crsSummaryLabel ? `, ${input.status.crsSummaryLabel}` : ""}`,
    url: "https://www.congress.gov/", text: input.status.crsSummary.slice(0, 6000) });

  // The rule a disapproval resolution would block, from the Federal Register.
  const cra = disapprovedRule(input.title);
  if (cra) {
    if (cra.agency) agencies.push(cra.agency, ...cra.agency.split(/\s+of the\s+/));
    const json = await fetchText(federalRegisterSearchUrl(cra.rule));
    let rule: FrDoc | null = null;
    try { rule = json ? pickFederalRegisterRule((JSON.parse(json) as { results?: FrDoc[] }).results ?? [], cra.rule) : null; } catch { rule = null; }
    if (rule) {
      docs.push(federalRegisterDoc(rule));
      agencies.push(...frAgencies(rule));
      const issuer = cra.agency?.split(/\s+of the\s+/)[0] ?? frAgencies(rule)[0];
      if (issuer) allowedAgainst.push(`the ${issuer.replace(/^the\s+/i, "")}, which issued the rule`);
    } else notes.push(`The Federal Register record for "${cra.rule}" could not be found.`);
  }

  // Committee reports: purpose, background, CBO estimate, minority or dissenting views.
  for (const citation of committeeReportCitations(input.billStatusXml).slice(0, 1)) {
    const pkg = reportPackage(citation);
    const html = pkg ? await fetchText(reportUrl(pkg), 30_000) : null;
    if (!pkg || !html) { notes.push(`${citation} could not be read.`); continue; }
    const r = parseCommitteeReport(html);
    docs.push(committeeReportDoc(citation, reportUrl(pkg), r));
    const committee = r.committee ? `${r.chamber ? `${r.chamber} ` : ""}${r.committee}` : null;
    if (committee) {
      agencies.push(committee, r.committee!);
      if (r.purpose) allowedFor.push(`the ${committee} (majority, ${citation})`);
      if (r.minority) allowedAgainst.push(`the ${committee} minority (minority views, ${citation})`);
    }
  }

  // CBO: the listing's descriptions; the full estimate when a committee report prints it (above).
  if (input.status.cbo.length) docs.push({ id: "CBO", kind: "cbo", label: `CBO cost estimate${input.status.cbo.length > 1 ? "s" : ""}`, url: input.status.cbo[0].url,
    text: input.status.cbo.map(e => `${e.pubDate}: ${e.title}. ${e.description}`).join(" ") });

  // Current law the bill amends (U.S. Code, govinfo), at most three sections.
  for (const c of usCodeCites(input.billText)) {
    const html = await fetchText(usCodeUrl(c.title, c.section));
    const doc = html ? parseUsCodeSection(html, c.title, c.section) : null;
    if (doc) docs.push(doc); else notes.push(`${c.title} U.S.C. ${c.section} could not be read.`);
  }

  const needsBackground = changesExistingLaw(input.title, input.billText) && docs.some(d => d.kind === "federal_register" || d.kind === "us_code" || d.kind === "committee_report" || d.kind === "crs");
  return { docs, notes, context: { title: input.title, docs: docs.map(d => ({ id: d.id, text: d.text })), agencies: [...new Set(agencies)], allowedFor, allowedAgainst, needsBackground } };
}

/** The sources block of the model's input. */
export function sourcesBlock(g: Gathered): string {
  const list = g.docs.map(d => `[${d.id}] ${d.label}\n${d.text}`).join("\n\n");
  return [
    "OFFICIAL SOURCES (cite by the id in brackets; use nothing else):", list || "(none beyond the bill text)",
    g.notes.length ? `Not available: ${g.notes.join(" ")}` : "",
    `Background required: ${g.context.needsBackground ? "yes (the bill changes or blocks an existing rule or law)" : "no"}.`,
    `Who may be credited with the case FOR (use exactly one of these per argument): ${g.context.allowedFor.length ? g.context.allowedFor.map(x => `"${x}"`).join("; ") : "nobody in the record; leave caseFor empty"}.`,
    `Who may be credited with the case AGAINST: ${g.context.allowedAgainst.length ? g.context.allowedAgainst.map(x => `"${x}"`).join("; ") : "nobody in the record; leave caseAgainst empty"}.`,
  ].filter(Boolean).join("\n\n");
}

/** Log lines carrying each source, for the editor's review from the runtime log (1,500 characters a line). */
export function sourcePacketLines(label: string, g: Gathered, size = 1500): string[] {
  const out: string[] = [];
  for (const d of g.docs) {
    const t = `${d.label} <${d.url}> ${d.text}`.slice(0, 16000), parts = Math.max(1, Math.ceil(t.length / size));
    for (let k = 0; k < parts; k++) out.push(`REVIEW_PACKET ${label} | SOURCE ${d.id} | part ${k + 1}/${parts} | ${t.slice(k * size, (k + 1) * size)}`);
  }
  out.push(`REVIEW_PACKET ${label} | CONTEXT | part 1/1 | ${JSON.stringify({ agencies: g.context.agencies, allowedFor: g.context.allowedFor, allowedAgainst: g.context.allowedAgainst, needsBackground: g.context.needsBackground, notes: g.notes })}`.slice(0, 1700));
  return out;
}
