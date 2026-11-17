/**
 * Gather the official sources for one Texas bill (owner instruction, 17 Nov 2026). Every request goes to an official
 * host (sources.ts, OFFICIAL_HOSTS), is paced, and is made once: a refusal or a rate limit from a host ends the use
 * of that host for the run and is reported; it is never retried. A source that cannot be read is left out and
 * noted; nothing else stands in for it.
 *
 * The fetcher is passed in, so the tests run this against saved documents with no network. Requests for one bill:
 * the Text page, the bill text, the committee analysis, the fiscal note, the House Research Organization analysis
 * (only when the bill reached the House floor) and at most two sections of current law: seven at most.
 */
import type { Primer } from "../../analysis/primers.ts";
import { decodeBody, fiscalNoteText, hroAnalysisUrl, hroText, htmlToLines, isOfficialUrl, parseBillAnalysis, parseFiscalNote, parseHroAnalysis, parseStatuteSection, parseTloBillText, parseTloTextPage,
  pickDocs, reachedHouseFloor, statusText, statuteCites, statuteUrl, tloTextPageUrl, versionCodeOf, type TloVersionRow, type TxActionRow, type TxBillText, type TxFiscalNote, type TxVoteRow } from "./sources.ts";
import type { TxSide, TxSourceId } from "./standard.ts";

export type FetchResult = { status: number; contentType?: string; bytes?: Uint8Array; error?: string };
/** status 0 = the connection itself failed or was refused. Never throws. */
export type Fetcher = (url: string, timeoutMs?: number) => Promise<FetchResult>;

export type TxSourceKind = "bill_analysis" | "hro" | "fiscal_note" | "status" | "statute" | "primer";
export type TxSourceDoc = { id: TxSourceId; kind: TxSourceKind; label: string; url: string; date: string | null; text: string };

export type TxBillInput = { id: string; identifier: string; tloSession: string; sessionName: string; title: string; tloUrl: string;
  latestActionDate?: string | null; latestActionDescription?: string | null;
  actions: readonly TxActionRow[]; votes: readonly TxVoteRow[];
  /** Text versions the feed listed (tx_bill_versions), used only when the TLO Text page cannot be read. */
  versions: ReadonlyArray<{ note: string; date: string | null; url: string | null }> };

export type TxGathered = {
  text: TxBillText & { url: string; versionLabel: string; versionCode: string; date: string | null };
  docs: TxSourceDoc[]; sides: TxSide[]; notes: string[]; agencies: string[]; primers: Primer[]; fiscal: (TxFiscalNote & { url: string; describes: string }) | null;
  /** Everything a page's source list needs: title, address and date. */
  sourceList: Array<{ label: string; url: string; date: string | null }>;
  requests: number };

export type GatherOutcome = { ok: true; gathered: TxGathered } | { ok: false; reason: "no_text" | "refused"; detail: string; requests: number };

const refusedStatus = (s: number) => s === 0 || s === 401 || s === 403 || s === 407 || s === 429 || s === 503;

/** The credit lines the page prints. A reason is credited to the document that printed it, never to a person the site chose. */
export const CREDIT = {
  intentSenate: "the author's statement of intent in the Senate Research Center bill analysis",
  intentHouse: (committee: string | null) => `the background and purpose in the House ${committee ? `${committee} ` : ""}Committee's bill analysis`,
  hroFor: "the House Research Organization analysis, under “Supporters say”",
  hroAgainst: "the House Research Organization analysis, under “Critics say”",
} as const;

/** Approved explainers that apply to this bill (the same matching rule as primersFor() in lib/analysis/primers.ts, on a list that is passed in). */
export function matchTxPrimers(list: readonly Primer[], ctx: { title: string; text: string; actions: string }): Primer[] {
  return list.filter(p => p.reviewed && ((p.match.title?.test(ctx.title) ?? false) || (p.match.text?.test(ctx.text) ?? false) || (p.match.actions?.test(ctx.actions) ?? false)));
}

export async function gatherTxSources(bill: TxBillInput, deps: { fetch: Fetcher; primers?: readonly Primer[]; pdfToText?: (bytes: Uint8Array) => Promise<string>; paceMs?: number; sleep?: (ms: number) => Promise<void>; maxLaw?: number }): Promise<GatherOutcome> {
  const notes: string[] = [], docs: TxSourceDoc[] = [], sides: TxSide[] = [], agencies = new Set<string>(["Legislative Budget Board", "House Research Organization", "Senate Research Center", "Texas Legislature Online"]);
  const down = new Set<string>();
  let requests = 0;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const get = async (url: string, what: string, timeoutMs = 30_000): Promise<FetchResult | null> => {
    if (!isOfficialUrl(url)) { notes.push(`${what} was not read: its address is not on an official Texas site.`); return null; }
    const host = new URL(url).hostname;
    if (down.has(host)) return null;
    if (requests && deps.paceMs) await sleep(deps.paceMs);
    requests++;
    const r = await deps.fetch(url, timeoutMs).catch((e): FetchResult => ({ status: 0, error: e instanceof Error ? e.message : "request failed" }));
    if (refusedStatus(r.status)) { down.add(host); notes.push(`${what} could not be read: ${host} refused the request${r.status ? ` (${r.status})` : ""}. It was not tried again.`); return r; }
    if (r.status !== 200 || !r.bytes?.length) { notes.push(`${what} was not found (${r.status}).`); return null; }
    return r;
  };
  const body = (r: FetchResult | null) => (r?.status === 200 && r.bytes ? decodeBody(r.bytes) : null);

  // 1. Which versions exist, and which text, analysis and fiscal note belong together.
  const listing = await get(tloTextPageUrl(bill.tloSession, bill.identifier), "The list of versions on Texas Legislature Online");
  if (listing && refusedStatus(listing.status)) return { ok: false, reason: "refused", detail: notes.at(-1)!, requests };
  let rows: TloVersionRow[] = body(listing) ? parseTloTextPage(body(listing)!) : [];
  if (!rows.some(r => r.textUrl)) {
    // The feed's own list of versions, newest last, with the analysis and fiscal note addresses TLO uses for the same version.
    rows = [...bill.versions].filter(v => v.url && isOfficialUrl(v.url) && /\/billtext\/html\//.test(v.url)).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
      .map(v => ({ version: v.note, code: versionCodeOf(v.url!), textUrl: v.url, analysisUrl: v.url!.replace("/billtext/", "/analysis/"), fiscalNoteUrl: v.url!.replace("/billtext/", "/fiscalnotes/") }));
  }
  const pick = pickDocs(rows);
  if (!pick) return { ok: false, reason: "no_text", detail: "No published text was found for this bill.", requests };

  // 2. The bill text for that version.
  const textRes = await get(pick.text.textUrl!, `The ${pick.text.version.toLowerCase()} text`, 45_000);
  if (textRes && refusedStatus(textRes.status)) return { ok: false, reason: "refused", detail: notes.at(-1)!, requests };
  const parsed = body(textRes) ? parseTloBillText(body(textRes)!) : null;
  if (!parsed || parsed.chars < 80) return { ok: false, reason: "no_text", detail: "The bill text could not be read.", requests };
  const versionDate = bill.versions.find(v => v.url === pick.text.textUrl || v.note.toLowerCase() === pick.text.version.toLowerCase())?.date ?? null;
  const text = { ...parsed, url: pick.text.textUrl!, versionLabel: pick.text.version, versionCode: pick.text.code ?? pick.text.version, date: versionDate };
  const describes = (row: TloVersionRow) => (row.version === pick.text.version ? `the ${row.version.toLowerCase()} version, the one summarised` : `the ${row.version.toLowerCase()} version, an earlier one than the text summarised`);

  // 3. The committee bill analysis: why the bill was filed (the case for) and what each part does.
  if (pick.analysis?.analysisUrl) {
    const a = body(await get(pick.analysis.analysisUrl, "The committee bill analysis"));
    const an = a ? parseBillAnalysis(a) : null;
    if (an) {
      const who = an.writer === "Senate Research Center" ? "Senate Research Center" : `House ${an.committee ? `${an.committee} ` : ""}Committee`;
      if (an.committee) agencies.add(an.committee);
      docs.push({ id: "ANALYSIS", kind: "bill_analysis", label: `Bill analysis by the ${who}, for ${describes(pick.analysis)}`, url: pick.analysis.analysisUrl, date: an.date,
        text: [`Bill analysis written by the ${who}${an.date ? `, dated ${an.date}` : ""}. It describes ${describes(pick.analysis)}.`,
          an.intent ? `${an.writer === "Senate Research Center" ? "AUTHOR'S / SPONSOR'S STATEMENT OF INTENT" : "BACKGROUND AND PURPOSE"} (why the bill was filed, in the author's or committee's words): ${an.intent}` : "",
          an.analysis ? `WHAT THE BILL DOES, as the analysis describes it:\n${an.analysis}` : "", an.effectiveDate ? `Effective date: ${an.effectiveDate}` : "",
          an.comparison ? `How the committee's version differs: ${an.comparison}` : ""].filter(Boolean).join("\n") });
      if (an.intent) sides.push({ side: "for", sourceId: "ANALYSIS", text: an.intent, attribution: an.writer === "Senate Research Center" ? CREDIT.intentSenate : CREDIT.intentHouse(an.committee) });
    } else if (a) notes.push("The committee bill analysis was not in the expected form and was left out.");
  } else notes.push("No committee bill analysis is published for this version or an earlier one.");

  // 4. The Legislative Budget Board fiscal note.
  let fiscal: TxGathered["fiscal"] = null;
  if (pick.fiscal?.fiscalNoteUrl) {
    const f = body(await get(pick.fiscal.fiscalNoteUrl, "The Legislative Budget Board fiscal note"));
    const note = f ? parseFiscalNote(f) : null;
    if (note) {
      fiscal = { ...note, url: pick.fiscal.fiscalNoteUrl, describes: pick.fiscal.version };
      docs.push({ id: "FISCAL", kind: "fiscal_note", label: `Legislative Budget Board fiscal note${note.date ? `, ${note.date}` : ""} (${pick.fiscal.version})`, url: pick.fiscal.fiscalNoteUrl, date: note.date,
        text: `${fiscalNoteText(note)}\nIt was written for ${describes(pick.fiscal)}.` });
    } else if (f) notes.push("The fiscal note was not in the expected form and was left out.");
  } else notes.push("No Legislative Budget Board fiscal note is published for this version or an earlier one.");

  // 5. The House Research Organization analysis: what supporters say and what critics say. Only for a bill that reached the House floor.
  if (reachedHouseFloor(bill.actions)) {
    const url = hroAnalysisUrl(bill.tloSession, bill.identifier);
    const r = url ? await get(url, "The House Research Organization analysis") : null;
    if (r?.status === 200 && r.bytes) {
      const pdf = /pdf/i.test(r.contentType ?? "") || (r.bytes[0] === 0x25 && r.bytes[1] === 0x50 && r.bytes[2] === 0x44 && r.bytes[3] === 0x46);
      let plain: string | null = null;
      if (!pdf) { const t = decodeBody(r.bytes); plain = /<\s*(?:html|body|p|div|table)\b/i.test(t) ? htmlToLines(t).join("\n") : t; }
      else if (deps.pdfToText) plain = await deps.pdfToText(r.bytes).catch(() => null);
      else notes.push("The House Research Organization analysis is published as a PDF, and no PDF reader is installed, so it was not read.");
      const h = plain ? parseHroAnalysis(plain) : null;
      if (h && url) {
        docs.push({ id: "HRO", kind: "hro", label: `House Research Organization bill analysis${h.date ? `, ${h.date}` : ""}`, url, date: h.date, text: hroText(h) });
        if (h.supportersSay) sides.push({ side: "for", sourceId: "HRO", attribution: CREDIT.hroFor, text: h.supportersSay });
        const against = [h.criticsSay, h.otherCriticsSay].filter(Boolean).join(" ");
        if (against) sides.push({ side: "against", sourceId: "HRO", attribution: CREDIT.hroAgainst, text: against });
      } else if (plain) notes.push("The House Research Organization analysis was not in the expected form and was left out.");
    }
  } else notes.push("The bill has not reached the House floor, so there is no House Research Organization analysis.");

  // 6. What the Legislature has done with the bill, from the database.
  const status = statusText({ identifier: bill.identifier, sessionName: bill.sessionName, title: bill.title, latestActionDate: bill.latestActionDate, latestActionDescription: bill.latestActionDescription },
    bill.actions, bill.votes, parsed.certification);
  docs.push({ id: "STATUS", kind: "status", label: "Actions and recorded votes on the bill (Texas Legislature Online is the official record)", url: bill.tloUrl, date: bill.latestActionDate ?? null, text: status });

  // 7. Current law the bill amends, at most two sections.
  for (const [i, c] of statuteCites(parsed.text, deps.maxLaw ?? 2).entries()) {
    const url = statuteUrl(c), what = `Section ${c.section} of the ${c.code}`;
    const s = url ? body(await get(url, what)) : null;
    const law = s ? parseStatuteSection(s, c.section) : null;
    if (law && url) docs.push({ id: i ? "LAW2" : "LAW", kind: "statute", label: `Current law: ${what}`, url, date: null, text: `${what}, as it reads today: ${law}` });
    else if (s) notes.push(`${what} could not be found on its page.`);
  }

  // 8. Approved Texas explainers that apply.
  const primers = matchTxPrimers(deps.primers ?? [], { title: bill.title, text: parsed.text, actions: status });
  const topic = primers.filter(p => p.kind === "topic");
  if (topic.length) docs.push({ id: "PRIMER", kind: "primer", label: `Approved explainer: ${topic.map(p => p.title).join("; ")}`, url: topic[0].sources[0]?.url ?? bill.tloUrl, date: topic[0].lawAsOf,
    text: topic.map(p => `${p.title}. ${p.bullets.join(" ")}`).join("\n") });

  const sourceList = [{ label: "This bill on Texas Legislature Online (the official record)", url: bill.tloUrl, date: bill.latestActionDate ?? null },
    { label: `Bill text: ${text.versionLabel} version, Texas Legislature Online`, url: text.url, date: text.date },
    ...docs.filter(d => d.kind !== "status").map(d => ({ label: d.label, url: d.url, date: d.date }))];
  return { ok: true, gathered: { text, docs, sides, notes, agencies: [...agencies], primers, fiscal, sourceList, requests } };
}

/** Log lines carrying each source, for the editor's review from the runtime log (1,500 characters a line), in the federal REVIEW_PACKET form. */
export function txSourcePacketLines(label: string, g: TxGathered, size = 1500): string[] {
  const out: string[] = [];
  for (const d of g.docs) {
    const t = `${d.label} <${d.url}> ${d.text}`.slice(0, 16000), parts = Math.max(1, Math.ceil(t.length / size));
    for (let k = 0; k < parts; k++) out.push(`TX_REVIEW_PACKET ${label} | SOURCE ${d.id} | part ${k + 1}/${parts} | ${t.slice(k * size, (k + 1) * size)}`);
  }
  out.push(`TX_REVIEW_PACKET ${label} | CONTEXT | part 1/1 | ${JSON.stringify({ text: { version: g.text.versionLabel, url: g.text.url, chars: g.text.chars }, allowedFor: g.sides.filter(s => s.side === "for").map(s => s.attribution),
    allowedAgainst: g.sides.filter(s => s.side === "against").map(s => s.attribution), notes: g.notes, requests: g.requests })}`.slice(0, 1700));
  return out;
}
