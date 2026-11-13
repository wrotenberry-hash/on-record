/**
 * Bill text and status from govinfo.gov, keyless. Pure parsers, no relative
 * imports, so the tests import this file directly.
 *
 * BILLSTATUS (bulk XML) carries the text versions, the CBO cost estimates and
 * the Congressional Research Service summary for one bill. The text itself is
 * the GPO "pre" HTML rendering of each version.
 */
export const GOVINFO = process.env.GOVINFO_BASE?.trim() || "https://www.govinfo.gov";

export function billStatusUrl(congress: number, billType: string, number: number) {
  return `${GOVINFO}/bulkdata/BILLSTATUS/${congress}/${billType}/BILLSTATUS-${congress}${billType}${number}.xml`;
}

export type TextVersion = { label: string; date: string; packageId: string; code: string; htmlUrl: string };
export type CostEstimate = { pubDate: string; title: string; url: string; description: string };
export type BillStatus = { title: string | null; versions: TextVersion[]; cbo: CostEstimate[]; crsSummary: string | null; crsSummaryLabel: string | null };

function decode(s: string) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
function block(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : null;
}
function items(xml: string): string[] {
  // Top-level <item> children only: formats carry nested <item> elements.
  const out: string[] = []; let depth = 0, start = -1;
  const re = /<(\/?)item>/g; let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (!m[1]) { if (depth === 0) start = m.index + m[0].length; depth++; }
    else { depth--; if (depth === 0 && start >= 0) { out.push(xml.slice(start, m.index)); start = -1; } }
  }
  return out;
}
function tag(xml: string, name: string) { const v = block(xml, name); return v === null ? null : decode(v).trim(); }

/** "BILLS-119hr2102eh" from any govinfo URL for that package. */
export function packageFromUrl(url: string): string | null { return url.match(/BILLS-\d+[a-z]+\d+[a-z]+/)?.[0] ?? null; }
export function htmlUrlForPackage(pkg: string) { return `${GOVINFO}/content/pkg/${pkg}/html/${pkg}.htm`; }

export function parseBillStatus(xml: string): BillStatus {
  if (!/<billStatus>/.test(xml)) throw Error("Not a BILLSTATUS document");
  const bill = block(xml, "bill") ?? xml;
  const versions: TextVersion[] = [];
  for (const it of items(block(bill, "textVersions") ?? "")) {
    const url = it.match(/<url>([^<]+)<\/url>/)?.[1];
    const pkg = url ? packageFromUrl(url) : null;
    if (!pkg) continue;
    versions.push({ label: tag(it, "type") ?? "Text", date: (tag(it, "date") ?? "").slice(0, 10), packageId: pkg,
      code: pkg.match(/\d([a-z]+)$/)?.[1] ?? "", htmlUrl: htmlUrlForPackage(pkg) });
  }
  versions.sort((a, b) => b.date.localeCompare(a.date));
  const cbo: CostEstimate[] = items(block(bill, "cboCostEstimates") ?? "").map(it => ({ pubDate: (tag(it, "pubDate") ?? "").slice(0, 10),
    title: tag(it, "title") ?? "CBO cost estimate", url: tag(it, "url") ?? "", description: tag(it, "description") ?? "" }))
    .filter(c => /^https:\/\/www\.cbo\.gov\//.test(c.url)).sort((a, b) => b.pubDate.localeCompare(a.pubDate));
  // Newest CRS summary: the last <summary> block, by update order.
  const summaries = [...(block(bill, "summaries") ?? "").matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map(m => m[1]);
  const latest = summaries.at(-1);
  const crsHtml = latest ? tag(latest, "text") : null;
  const crsSummary = crsHtml ? crsHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : null;
  const titles = block(bill, "titles");
  const title = tag(bill.slice(0, titles ? bill.indexOf("<titles>") : undefined), "title");
  return { title, versions, cbo, crsSummary: crsSummary || null, crsSummaryLabel: latest ? tag(latest, "actionDesc") : null };
}

export type Section = { num: string; heading: string };
export type BillText = { text: string; sections: Section[]; chars: number };

/** GPO "pre" HTML to plain text with its section headings. */
export function parseBillTextHtml(html: string): BillText {
  const pre = html.match(/<pre>([\s\S]*?)<\/pre>/i)?.[1] ?? html;
  const text = decode(pre.replace(/<[^>]+>/g, "")).replace(/<\/?DOC>/g, "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const sections: Section[] = [], seen = new Set<string>();
  const re = /^\s*(?:SEC\.|SECTION)\s+(\d+[A-Za-z]?)\.\s+([^\n]*(?:\n(?!\s*\n)[^\n]*){0,2})/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (seen.has(m[1])) continue; // a section number restated inside an amendment keeps its first heading
    seen.add(m[1]);
    sections.push({ num: m[1], heading: m[2].replace(/\s+/g, " ").replace(/\.$/, "").trim().slice(0, 160) });
  }
  return { text, sections, chars: text.length };
}

/** The model reads at most this much bill text; longer bills are labelled as read in part. */
export const MAX_TEXT_CHARS = 40_000;
