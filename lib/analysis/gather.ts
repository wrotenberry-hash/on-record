import { committeeReportCitations, committeeReportDoc, crLinkUrl, crPageItems, crPageRefs, disapprovedRule, statusDoc, federalRegisterDoc, federalRegisterSearchUrl, floorDoc, floorWeight, frAgencies,
  frFullTextUrl, parseCommitteeReport, parseFloorSpeeches, parseFrPreamble, parseUsCodeSection, pickFederalRegisterRule, pickFloor, reportPackage, reportUrl, usCodeCites, usCodeUrl,
  type FrDoc, type SourceDoc } from "@/lib/analysis/sources";
import type { BillStatus } from "@/lib/analysis/billtext";
import type { SourceContext } from "@/lib/analysis/checker";
import { primersFor, primerSourceText, type Primer } from "@/lib/analysis/primers";
import { BRAND } from "@/lib/brand";

const USER_AGENT = `${BRAND.userAgentName}/0.2 (+https://on-record-wrotenberry.vercel.app)`;

async function fetchText(url: string, timeoutMs = 20_000): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store", redirect: "follow" });
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

/** The same, with the address the request ended at: a Congressional Record page link redirects to one item on that page. */
async function fetchPage(url: string, timeoutMs = 20_000): Promise<{ url: string; text: string } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store", redirect: "follow" });
    return res.ok ? { url: res.url || url, text: await res.text() } : null;
  } catch { return null; }
}

export type Gathered = { docs: SourceDoc[]; context: SourceContext; notes: string[]; primers: Primer[] };

/**
 * Owner instruction, 16 Nov 2026: gather every official source the summary may use, each with an id the model cites.
 * Any source that cannot be fetched is left out and noted; nothing else stands in for it.
 */
export async function gatherSources(input: { title: string; billType: string; number?: number; sponsorName: string | null; billStatusXml: string; status: BillStatus; billText: string }): Promise<Gathered> {
  const docs: SourceDoc[] = [], notes: string[] = [], agencies: string[] = [];
  const speakers: Array<{ name: string; text: string }> = [];
  const allowedFor: string[] = [], allowedAgainst: string[] = [];
  const chamberTitle = /^s/.test(input.billType) ? "Sen." : "Rep.";
  if (input.sponsorName) allowedFor.push(`${chamberTitle} ${input.sponsorName}, the sponsor`);

  if (input.status.crsSummary) docs.push({ id: "CRS", kind: "crs", label: `CRS summary (Congress.gov)${input.status.crsSummaryLabel ? `, ${input.status.crsSummaryLabel}` : ""}`,
    url: "https://www.congress.gov/", text: input.status.crsSummary.slice(0, 6000) });

  // What Congress has done with the bill so far: votes, dates, where it stands (the bill status record).
  const status = statusDoc(input.billStatusXml, "https://www.congress.gov/");
  if (status) docs.push(status);

  // The rule a disapproval resolution would block, from the Federal Register.
  const cra = disapprovedRule(input.title);
  if (cra) {
    if (cra.agency) agencies.push(cra.agency, ...cra.agency.split(/\s+of the\s+/));
    const json = await fetchText(federalRegisterSearchUrl(cra.rule));
    let rule: FrDoc | null = null;
    try { rule = json ? pickFederalRegisterRule((JSON.parse(json) as { results?: FrDoc[] }).results ?? [], cra.rule) : null; } catch { rule = null; }
    if (rule) {
      const doc = federalRegisterDoc(rule);
      // The agency's own reasons and its list of the main changes, from the rule's preamble (govinfo).
      const full = await fetchText(frFullTextUrl(rule.publication_date, rule.document_number), 40_000);
      const pre = full ? parseFrPreamble(full) : null;
      if (pre?.why) doc.text += `\nWhy the agency says it made the rule (preamble, executive summary): ${pre.why}`;
      if (pre?.major) doc.text += `\nThe rule's main changes, as the agency lists them (preamble, summary of major provisions): ${pre.major}`;
      if (pre?.impact) doc.text += `\nThe agency's own estimates of the rule's effects (regulatory impact analysis): ${pre.impact}`;
      if (pre?.consumer) doc.text += `\nDollar amounts stated in the rule: ${pre.consumer}`;
      if (pre?.effective) doc.text += `\nThe rule took effect on ${pre.effective}.`;
      if (pre?.usesHealthCareGov) doc.text += "\nThe rule's text refers to the Federally-facilitated Exchanges' website as HealthCare.gov.";
      if (!pre) notes.push("The rule's full Federal Register text could not be read; only its short official summary was used.");
      docs.push(doc);
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

  // What named members said on the floor (Congressional Record, govinfo): the reasons and the stakes, for and against.
  // 19 Nov 2026: a page link lands on one item of the page, not always the one about this bill, so every item on the
  // page is tried and the one that is the debate on this bill is kept. Up to four page references are looked at and
  // the two fullest debates are given to the writer (a later page holding only the roll call no longer crowds one out).
  if (input.number) {
    const number = input.number, floorDeadline = Date.now() + 75_000;
    const found: Array<{ url: string; weight: number; rec: ReturnType<typeof parseFloorSpeeches>; date: string }> = [];
    for (const ref of crPageRefs(input.billStatusXml, 4)) {
      const first = Date.now() < floorDeadline ? await fetchPage(crLinkUrl(ref.date, ref.chamber, ref.page), 30_000) : null;
      let best: (typeof found)[number] | null = null;
      const weigh = (url: string, html: string) => {
        const rec = parseFloorSpeeches(html), weight = floorWeight(rec, input.billType, number);
        if (weight > (best?.weight ?? 0)) best = { url, weight, rec, date: ref.date };
        return rec;
      };
      if (first) {
        const rec = weigh(first.url, first.text);
        // The item the link chose is used as it is only when it opens with this bill; otherwise the page's other items are read too.
        const opensWithBill = floorWeight({ text: rec.text.slice(0, 3000), speeches: rec.speeches }, input.billType, number) > 0;
        if (!opensWithBill) for (const url of crPageItems(first.url)) {
          if (Date.now() > floorDeadline) break;
          const html = await fetchText(url, 15_000);
          if (html) weigh(url, html);
        }
      }
      if (best) found.push(best); else notes.push(`No floor statements were found at Congressional Record ${ref.chamber}${ref.page} (${ref.date}).`);
    }
    for (const [i, f] of pickFloor(found).entries()) {
      const doc = floorDoc(i ? `FLOOR${i + 1}` : "FLOOR", f.url, f.rec);
      docs.push(doc);
      const t = f.rec.chamber === "Senate" ? "Sen." : "Rep.";
      for (const sp of f.rec.speeches.slice(0, 10)) {
        speakers.push({ name: sp.name, text: sp.text });
        const who = `${t} ${sp.name} (floor statement, ${f.rec.date ?? f.date})`;
        allowedFor.push(who); allowedAgainst.push(who);
      }
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

  // Reviewed primers that apply: the topic primer becomes a source ("PRIMER"), so related summaries explain the subject the same way.
  const primers = primersFor({ title: input.title, text: input.billText, actions: status?.text ?? "" });
  const topic = primerSourceText(primers);
  if (topic) docs.push({ id: "PRIMER", kind: "primer", label: `Reviewed primer: ${primers.filter(p => p.kind === "topic").map(p => p.title).join("; ")}`, url: primers.find(p => p.kind === "topic")!.sources[0].url, text: topic });

  return { docs, notes, context: { title: input.title, docs: docs.map(d => ({ id: d.id, text: d.text })), agencies: [...new Set(agencies)], allowedFor, allowedAgainst, needsBackground: false, structure: true, cancelsRule: !!cra, speakers }, primers };
}

/** The sources block of the model's input. */
export function sourcesBlock(g: Gathered): string {
  const list = g.docs.map(d => `[${d.id}] ${d.label}\n${d.text}`).join("\n\n");
  return [
    "OFFICIAL SOURCES (cite by the id in brackets; use nothing else):", list || "(none beyond the bill text)",
    g.notes.length ? `Not available: ${g.notes.join(" ")}` : "",
    g.primers.some(p => p.kind === "topic") ? "A reviewed PRIMER on this subject is among the sources. Build \"How it works today\" on it and do not contradict it; add what current law or the current rule says on the exact points this bill touches." : "",
    `Who may be credited with a reason FOR the bill (use one of these, worded as given, and only for a reason that person or body actually gave in the source you cite; a floor speaker belongs on the side they spoke for): ${g.context.allowedFor.length ? g.context.allowedFor.map(x => `"${x}"`).join("; ") : "nobody in the record; leave caseFor empty"}.`,
    `Who may be credited with a reason AGAINST the bill (same rule): ${g.context.allowedAgainst.length ? g.context.allowedAgainst.map(x => `"${x}"`).join("; ") : "nobody in the record; leave caseAgainst empty"}.`,
    "If the sources hold no stated reason for a side, leave that side empty. Never invent one.",
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
