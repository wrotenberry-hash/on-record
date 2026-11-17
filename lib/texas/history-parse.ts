/**
 * Texas session history (owner's point 6: the dashboard, with the 2021–2025 sessions backfilled). Pure: imports only
 * ./calendar.ts and ./parse.ts, so tests/texas-dashboard*.test.mjs load it without a bundler.
 *
 * Where the figures come from, in order of preference:
 *  1. Official. Texas Legislature Online (capitol.texas.gov, the source of record) publishes one "Legislative
 *     Statistics" page with bills filed, passed and vetoed for every session, and for each session the lists "Bills
 *     Signed by the Governor" and "Bills Filed Without the Governor's Signature". Read from this machine on
 *     17 Nov 2026; the samples in tests/fixtures/tx-history/ are trimmed copies of those pages.
 *  2. Counted. LegiScan's bill list for a session (behind LEGISCAN_API_KEY), counted by status.
 * A counted figure never replaces an official one (`mergeFigures`). No figure is typed into this file: every number
 * the dashboard shows is read from a page at run time and stored with that page's address and the time it was read.
 */
import { TX_RULES, tloSessionCode, txSessionLabel, type TxRule } from "./calendar.ts";
import { TX_SESSIONS } from "./parse.ts";

/* ------------------------------------------------------------- Sessions --- */

export type TxHistorySession = { id: string; tlo: string; legislature: number; called: number; regular: boolean; year: number; name: string };
/**
 * The sessions the dashboard compares: the 87th, 88th and 89th Legislatures (2021–2025), regular and called, and the
 * 90th. Site ids follow TX_SESSIONS ("89" regular, "891" first called session); the called sessions of the 87th and
 * 88th are not in TX_SESSIONS yet, so they are listed here. Years from TLO's own session list ("87(1) - 2021"), read
 * 17 Nov 2026.
 */
const HISTORY_IDS: Array<[string, number]> = [
  ["90", 2027], ["892", 2025], ["891", 2025], ["89", 2025], ["884", 2023], ["883", 2023], ["882", 2023], ["881", 2023], ["88", 2023],
  ["873", 2021], ["872", 2021], ["871", 2021], ["87", 2021],
];
export const TX_HISTORY_SESSIONS: TxHistorySession[] = HISTORY_IDS.map(([id, year]) => {
  const legislature = Number(id.slice(0, 2)), called = id.length === 3 ? Number(id.slice(2)) : 0;
  return { id, tlo: TX_SESSIONS.find(s => s.id === id)?.tlo ?? tloSessionCode(id), legislature, called, regular: called === 0, year, name: txSessionLabel(id) };
});
/** Session ids TX_SESSIONS (lib/texas/parse.ts) does not list yet; reported to the lead. */
export const MISSING_FROM_TX_SESSIONS = TX_HISTORY_SESSIONS.filter(s => !TX_SESSIONS.some(t => t.id === s.id)).map(s => s.id);

/** Plain words for the kind of session. */
export const sessionKind = (s: { regular: boolean }) => (s.regular ? "Regular session" : "Called (special) session");

/** The Legislature in office in a year: the 87th was elected for 2021–2022. */
export const legislatureForYear = (year: number) => 87 + Math.floor((year - 2021) / 2);

/** "90th Regular Session - 2027", "88th Legislature - 4th Called Session - 2023", "85 Legislature - 1st Called Session 2017" → session id. */
export function tloHeadingToSession(heading: string): { id: string; legislature: number; called: number; year: number | null } | null {
  const h = heading.replace(/\s+/g, " ").trim();
  const m = /^(\d{2})(?:st|nd|rd|th)?\b(?: Legislature)?[\s,-]*(?:(\d)(?:st|nd|rd|th) Called Session|Regular Session)\b[\s,-]*(\d{4})?/i.exec(h);
  if (!m) return null;
  const legislature = Number(m[1]), called = m[2] ? Number(m[2]) : 0;
  return { id: called ? `${legislature}${called}` : String(legislature), legislature, called, year: m[3] ? Number(m[3]) : null };
}

/* --------------------------------------------------------- HTML helpers --- */

const decode = (s: string) => s.replace(/&nbsp;|&#xA0;|&#160;/gi, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'");
const text = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
/** "1,047" → 1047; "n/a", "" or anything else → null. */
export function readCount(cell: string): number | null {
  const t = text(cell).replace(/,/g, "");
  return /^\d+$/.test(t) ? Number(t) : null;
}
/** "Report Date: 11/17/2026" → "2026-11-17". */
function reportDate(html: string): string | null {
  const m = /Report Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(html);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

/* ------------------------------------------- TLO: Legislative Statistics --- */

export const BILL_TYPES = ["HB", "HCR", "HJR", "HR", "SB", "SCR", "SJR", "SR"] as const;
export type BillType = (typeof BILL_TYPES)[number];
type StatRow = Partial<Record<BillType | "billsTotal" | "total", number | null>>;
export type TloStatSession = { heading: string; id: string; legislature: number; called: number; year: number | null;
  introduced: StatRow | null; passed: StatRow | null; vetoed: StatRow | null; problem: string | null };

/**
 * Texas Legislature Online, Reports → Legislative Statistics (Report.aspx?ID=legislativestatistics): one table per
 * session, headed by the session's name, with the rows Introduced, Passed and Vetoed and a column for each kind of
 * measure plus "Total HB & SB" and "Total". A table whose House and Senate bill columns do not add up to its own
 * "Total HB & SB" is kept with a problem noted and is not stored.
 */
export function parseTloLegislativeStatistics(html: string): { reportDate: string | null; sessions: TloStatSession[] } {
  const sessions: TloStatSession[] = [];
  for (const table of html.split(/<table\b/i).slice(1)) {
    const body = table.split(/<\/table>/i)[0];
    const rows = body.split(/<tr\b/i).slice(1).map(r => r.split(/<\/tr>/i)[0]);
    const heading = rows.length ? text(/<th\b[^>]*colspan[^>]*>([\s\S]*?)<\/th>/i.exec(rows[0])?.[1] ?? "") : "";
    const where = heading ? tloHeadingToSession(heading) : null;
    if (!where) continue;
    const headRow = rows.find(r => /<th\b[^>]*>\s*Status\s*<\/th>/i.test(r));
    const cols = headRow ? [...headRow.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m => text(m[1])) : [];
    const key = (c: string): BillType | "billsTotal" | "total" | null => (BILL_TYPES as readonly string[]).includes(c) ? (c as BillType) : /^total hb (&|and) sb$/i.test(c) ? "billsTotal" : /^total$/i.test(c) ? "total" : null;
    const read = (label: RegExp): StatRow | null => {
      const r = rows.find(x => label.test(text(/<td\b[^>]*>([\s\S]*?)<\/td>/i.exec(x)?.[1] ?? "")));
      if (!r) return null;
      const cells = [...r.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
      const out: StatRow = {};
      cols.forEach((c, i) => { const k = key(c); if (k && i > 0) out[k] = readCount(cells[i] ?? ""); });
      return out;
    };
    const introduced = read(/^introduced$/i), passed = read(/^passed$/i), vetoed = read(/^vetoed$/i);
    const adds = (r: StatRow | null) => !r || r.billsTotal == null || r.HB == null || r.SB == null || r.HB + r.SB === r.billsTotal;
    const problem = !cols.includes("HB") || !cols.includes("SB") ? "the table has no House bill or Senate bill column"
      : !introduced ? "the table has no Introduced row"
      : !adds(introduced) || !adds(passed) || !adds(vetoed) ? "House and Senate bills do not add up to the table's own total" : null;
    sessions.push({ heading, ...where, introduced, passed, vetoed, problem });
  }
  return { reportDate: reportDate(html), sessions };
}

/* ----------------------------------------------- TLO: lists of bills --- */

export type TloBillList = { title: string; reportDate: string | null; stated: number | null; noneStatement: boolean; bills: string[]; byType: Partial<Record<BillType, number>>; problem: string | null };
/**
 * A TLO bill-list report (Report.aspx?LegSess=89R&ID=signedbygov, …&ID=filedwogovsign, …&ID=vetoedbygov): "Number of
 * Bills: 1,155" and one History.aspx link per measure, or a sentence saying there are none. Concurrent resolutions
 * appear on the signed list too (the Governor signs them), so callers count House and Senate bills by type.
 */
export function parseTloBillList(html: string): TloBillList {
  const title = text(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(html)?.[1] ?? /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const statedRaw = /Number of Bills:\s*([\d,]+)/i.exec(html)?.[1];
  const stated = statedRaw ? Number(statedRaw.replace(/,/g, "")) : null;
  const noneStatement = /has not (filed|signed|vetoed) any bills|no bills (were )?found|there are no bills/i.test(text(html));
  const bills = [...new Set([...html.matchAll(/History\.aspx\?LegSess=\w+&(?:amp;)?Bill=([A-Z]+)\s*(\d+)/g)].map(m => `${m[1]} ${Number(m[2])}`))];
  const byType: Partial<Record<BillType, number>> = {};
  for (const b of bills) { const t = b.split(" ")[0] as BillType; if ((BILL_TYPES as readonly string[]).includes(t)) byType[t] = (byType[t] ?? 0) + 1; }
  const problem = stated === null && !noneStatement ? "the page has neither a count of bills nor a sentence saying there are none"
    : stated !== null && stated !== bills.length ? `the page says ${stated} bills but lists ${bills.length}`
    : noneStatement && bills.length ? "the page says there are none but lists bills" : null;
  return { title, reportDate: reportDate(html), stated: noneStatement && stated === null ? 0 : stated, noneStatement, bills, byType, problem };
}

/* ------------------------------------------------------- Stored figures --- */

export const FIGURE_KEYS = ["filed", "filedHouse", "filedSenate", "passedOrigin", "passedBoth", "passedBothHouseBills", "passedBothSenateBills",
  "signed", "withoutSignature", "becameLaw", "vetoed", "jrFiled", "jrPassed"] as const;
export type FigureKey = (typeof FIGURE_KEYS)[number];
/** One number with where it came from. "official": copied from a government page; "counted": counted by the site from a feed. */
export type TxFigure = { n: number; basis: "official" | "counted"; source: string; url: string; readAt: number };
export type TxFigures = Partial<Record<FigureKey, TxFigure>>;
/** What `tx_session_stats.counts` holds for a session written by lib/texas/history.ts. */
export type TxStoredCounts = { v: 2; figures: TxFigures; heading?: string; notes?: string[] };

export const FIGURE_LABEL: Record<FigureKey, string> = {
  filed: "Bills filed", filedHouse: "House bills filed", filedSenate: "Senate bills filed",
  passedOrigin: "Passed the chamber where it was filed", passedBoth: "Passed both chambers and went to the Governor",
  passedBothHouseBills: "House bills that passed both chambers", passedBothSenateBills: "Senate bills that passed both chambers",
  signed: "Signed by the Governor", withoutSignature: "Became law without the Governor's signature", becameLaw: "Became law",
  vetoed: "Vetoed by the Governor", jrFiled: "Proposed constitutional amendments filed", jrPassed: "Proposed constitutional amendments sent to voters",
};

const isFigure = (v: unknown): v is TxFigure => !!v && typeof v === "object" && Number.isFinite((v as TxFigure).n) && ((v as TxFigure).basis === "official" || (v as TxFigure).basis === "counted")
  && typeof (v as TxFigure).source === "string" && typeof (v as TxFigure).url === "string" && Number.isFinite((v as TxFigure).readAt);

/**
 * Figures from a stored row. A row in this module's format is read as is. A row in the older format that
 * lib/texas/ingest.ts `legiscanHistory` writes (a plain count of bills by stage, from LegiScan) is read as counted
 * figures; it never counts as official.
 */
export function readStoredCounts(counts: unknown, rowSource: string, retrievedAt: number): TxFigures {
  if (counts && typeof counts === "object" && (counts as TxStoredCounts).v === 2) {
    const f = (counts as TxStoredCounts).figures ?? {}, out: TxFigures = {};
    for (const k of FIGURE_KEYS) if (isFigure(f[k])) out[k] = f[k];
    return out;
  }
  if (!counts || typeof counts !== "object") return {};
  const c = counts as Record<string, unknown>, n = (k: string) => (typeof c[k] === "number" && Number.isFinite(c[k]) ? (c[k] as number) : 0);
  const total = Object.keys(c).reduce((s, k) => s + n(k), 0);
  if (!total) return {};
  const fig = (v: number): TxFigure => ({ n: v, basis: "counted", source: `${rowSource} (counted by status)`, url: "https://api.legiscan.com/", readAt: retrievedAt });
  // legiscanStage: governor = enrolled, law = passed, vetoed, passed_first = engrossed. Passing both chambers reaches the Governor.
  return { filed: fig(total), passedBoth: fig(n("governor") + n("law") + n("vetoed")), becameLaw: fig(n("law")), vetoed: fig(n("vetoed")),
    passedOrigin: fig(n("passed_first") + n("governor") + n("law") + n("vetoed")) };
}

/**
 * Join stored figures with new ones. An official figure is never replaced by a counted one; an official figure
 * replaces anything; a counted one replaces a counted one. `kept` names the figures that were protected.
 */
export function mergeFigures(existing: TxFigures, incoming: TxFigures): { figures: TxFigures; kept: FigureKey[]; changed: FigureKey[] } {
  const figures: TxFigures = { ...existing }, kept: FigureKey[] = [], changed: FigureKey[] = [];
  for (const k of FIGURE_KEYS) {
    const now = incoming[k], was = existing[k];
    if (!now) continue;
    if (was?.basis === "official" && now.basis === "counted") { kept.push(k); continue; }
    if (!was || was.n !== now.n || was.source !== now.source || was.basis !== now.basis) changed.push(k);
    figures[k] = now;
  }
  return { figures, kept, changed };
}

/** The `source` column for a row: which kinds of source its figures came from, in words. */
export function rowSourceLine(f: TxFigures): string {
  const sources = [...new Set(FIGURE_KEYS.flatMap(k => (f[k] ? [`${f[k]!.source}${f[k]!.basis === "counted" ? " (counted)" : ""}`] : [])))];
  return sources.join("; ") || "nothing read yet";
}

export const TLO_STATS_PATH = "/Reports/Report.aspx?ID=legislativestatistics";
export const tloListPath = (tlo: string, id: "signedbygov" | "filedwogovsign" | "vetoedbygov") => `/Reports/Report.aspx?LegSess=${encodeURIComponent(tlo)}&ID=${id}`;
const STATS_SOURCE = "Texas Legislature Online, Legislative Statistics";

/**
 * Official figures for one session from its table on the Legislative Statistics page. House bills (HB) and Senate
 * bills (SB) are the measures that can become law; joint resolutions (HJR, SJR) propose amendments to the Texas
 * Constitution, which go to the voters, not the Governor; simple and concurrent resolutions are left out. When no
 * bill passed both chambers, the page itself shows that none could be signed or become law unsigned.
 */
export function figuresFromStats(s: TloStatSession, url: string, readAt: number): TxFigures {
  if (s.problem || !s.introduced) return {};
  const fig = (n: number | null | undefined, source = STATS_SOURCE): TxFigure | undefined => (typeof n === "number" ? { n, basis: "official", source, url, readAt } : undefined);
  const sum = (...v: Array<number | null | undefined>) => (v.every(x => typeof x === "number") ? (v as number[]).reduce((a, b) => a + b, 0) : null);
  const out: TxFigures = {
    filed: fig(s.introduced.billsTotal ?? sum(s.introduced.HB, s.introduced.SB)), filedHouse: fig(s.introduced.HB), filedSenate: fig(s.introduced.SB),
    passedBoth: fig(s.passed?.billsTotal ?? sum(s.passed?.HB, s.passed?.SB)), passedBothHouseBills: fig(s.passed?.HB), passedBothSenateBills: fig(s.passed?.SB),
    vetoed: fig(s.vetoed?.billsTotal ?? sum(s.vetoed?.HB, s.vetoed?.SB)),
    jrFiled: fig(sum(s.introduced.HJR, s.introduced.SJR)), jrPassed: fig(sum(s.passed?.HJR, s.passed?.SJR)),
  };
  if (out.passedBoth?.n === 0) {
    out.signed = fig(0, `${STATS_SOURCE} (no bill passed both chambers)`);
    out.withoutSignature = fig(0, `${STATS_SOURCE} (no bill passed both chambers)`);
  }
  for (const k of FIGURE_KEYS) if (!out[k]) delete out[k];
  return out;
}

/** Official figure from a signed or unsigned list: House and Senate bills on it. Null when the page cannot be trusted. */
export function figureFromList(list: TloBillList, key: "signed" | "withoutSignature" | "vetoed", url: string, readAt: number): TxFigures {
  if (list.problem) return {};
  const label = key === "signed" ? "Bills Signed by the Governor" : key === "withoutSignature" ? "Bills Filed Without the Governor's Signature" : "Bills Vetoed by the Governor";
  return { [key]: { n: (list.byType.HB ?? 0) + (list.byType.SB ?? 0), basis: "official", source: `Texas Legislature Online, ${label}`, url, readAt } };
}

/** LegiScan status codes: 1 introduced, 2 engrossed (passed the first chamber), 3 enrolled (passed both), 4 passed (law), 5 vetoed, 6 failed. */
export function figuresFromLegiscan(list: Array<{ number: string; status: number | null }>, sessionId: number, readAt: number): TxFigures {
  const bills = list.filter(b => /^(HB|SB)\s*\d+$/i.test(b.number.trim()));
  if (!bills.length) return {};
  const count = (codes: number[]) => bills.filter(b => b.status !== null && codes.includes(b.status)).length;
  const fig = (n: number): TxFigure => ({ n, basis: "counted", source: `LegiScan bill list, session ${sessionId}`, url: "https://api.legiscan.com/", readAt });
  return { filed: fig(bills.length), passedOrigin: fig(count([2, 3, 4, 5])), passedBoth: fig(count([3, 4, 5])), becameLaw: fig(count([4])), vetoed: fig(count([5])) };
}

/* ------------------------------------------------------------- Planning --- */

export type HistoryTask = { kind: "stats" } | { kind: "list"; session: string; list: "signedbygov" | "filedwogovsign" } | { kind: "legiscan"; session: string };
const WEEK = 7 * 86400e3;
/**
 * A figure is final when it was read in a later calendar year than the session met: by then the session has ended
 * and the Governor's time to act on its bills has run out. Until then it is read again once a week.
 */
export const isFinal = (f: TxFigure | undefined, s: TxHistorySession) => !!f && new Date(f.readAt).getUTCFullYear() > s.year;
const stale = (f: TxFigure | undefined, s: TxHistorySession, now: number) => !f || (!isFinal(f, s) && now - f.readAt >= WEEK);

/**
 * What to read next, most useful first: the statistics page (one request covers every session), then the signed
 * and unsigned lists for each session that sent bills to the Governor (newest session first), then LegiScan for the
 * one count the official pages do not give (bills that passed the chamber where they were filed). Past sessions are
 * read once; open ones once a week.
 */
export function historyPlan(byId: Record<string, TxFigures>, now: number, opts: { legiscan: boolean; sessions?: TxHistorySession[] }): HistoryTask[] {
  const sessions = opts.sessions ?? TX_HISTORY_SESSIONS, tasks: HistoryTask[] = [];
  if (sessions.some(s => { const f = byId[s.id] ?? {}; return !f.filed || f.filed.basis !== "official" || stale(f.filed, s, now); })) tasks.push({ kind: "stats" });
  for (const s of sessions) {
    const f = byId[s.id] ?? {};
    if (!f.passedBoth || f.passedBoth.basis !== "official" || f.passedBoth.n === 0) continue;
    if (f.signed?.basis !== "official" || stale(f.signed, s, now)) tasks.push({ kind: "list", session: s.id, list: "signedbygov" });
    if (f.withoutSignature?.basis !== "official" || stale(f.withoutSignature, s, now)) tasks.push({ kind: "list", session: s.id, list: "filedwogovsign" });
  }
  if (opts.legiscan) for (const s of sessions) { const f = byId[s.id] ?? {}; if (stale(f.passedOrigin, s, now)) tasks.push({ kind: "legiscan", session: s.id }); }
  return tasks;
}

/* ---------------------------------------------------------- For the page --- */

export type FigureCell = { key: FigureKey; label: string; n: number | null; basis: "official" | "counted" | "sum" | null; source: string | null; url: string | null; readAt: number | null; missing: string | null };
/**
 * One cell of the history table. "Became law" is the signed bills plus the bills that became law unsigned when both
 * official lists have been read (marked "sum"), else a counted figure, else not loaded.
 */
export function figureCell(f: TxFigures, key: FigureKey): FigureCell {
  const label = FIGURE_LABEL[key];
  if (key === "becameLaw" && f.signed?.basis === "official" && f.withoutSignature?.basis === "official")
    return { key, label, n: f.signed.n + f.withoutSignature.n, basis: "sum", source: `${f.signed.source} plus ${f.withoutSignature.source}`, url: f.signed.url, readAt: Math.min(f.signed.readAt, f.withoutSignature.readAt), missing: null };
  const x = f[key];
  if (x) return { key, label, n: x.n, basis: x.basis, source: x.source, url: x.url, readAt: x.readAt, missing: null };
  const missing = key === "passedOrigin" ? "Not on the official statistics page; loads from LegiScan once its key is set" : "Not loaded yet";
  return { key, label, n: null, basis: null, source: null, url: null, readAt: null, missing };
}

/**
 * Do the official figures add up? Bills that passed both chambers were either signed, allowed to become law unsigned,
 * or vetoed. A gap while a session is open means the Governor is still acting; a gap after that is shown as a
 * difference between official pages, never silently corrected.
 */
export function officialGap(f: TxFigures): number | null {
  const p = f.passedBoth, s = f.signed, w = f.withoutSignature, v = f.vetoed;
  if (![p, s, w, v].every(x => x?.basis === "official")) return null;
  return p!.n - (s!.n + w!.n + v!.n);
}

/* ------------------------------------------------ The session on file --- */

export const isTxBill = (identifier: string) => /^(HB|SB)\s*\d+$/i.test(identifier.trim());
type StageRow = { identifier?: string; chamber: string | null; stage: string; n: number };
/**
 * Bills on file for a session (Open States), by how far they got, House and Senate bills only. A House bill that
 * passed one chamber passed the House; any bill that passed both chambers passed each. A bill that failed a vote is
 * counted at none of these, because the record kept for it does not say where it failed.
 */
export function chamberPassage(rows: StageRow[]) {
  const past = (s: string) => ["passed_both", "governor", "law", "vetoed"].includes(s), one = (s: string) => s === "passed_first";
  let filed = 0, passedHouse = 0, passedSenate = 0, passedBoth = 0, law = 0, vetoed = 0, governor = 0;
  for (const r of rows) {
    if (r.identifier !== undefined && !isTxBill(r.identifier)) continue;
    const n = Number(r.n); filed += n;
    if (past(r.stage)) { passedHouse += n; passedSenate += n; passedBoth += n; }
    else if (one(r.stage)) { if (r.chamber === "lower") passedHouse += n; if (r.chamber === "upper") passedSenate += n; }
    if (r.stage === "governor") governor += n;
    if (r.stage === "law") law += n;
    if (r.stage === "vetoed") vetoed += n;
  }
  return { filed, passedHouse, passedSenate, passedBoth, awaitingGovernor: governor, law, vetoed };
}

/** The bills the site holds for a session against the official count of bills filed (the Congress page's "check against Congress.gov's own totals"). */
export function reconcileFiled(held: number, official: TxFigure | undefined): { held: number; official: number | null; complete: boolean; line: string } {
  if (!official || official.basis !== "official") return { held, official: null, complete: false, line: `${held.toLocaleString("en-US")} bills on file; the official count is not loaded yet.` };
  const complete = held >= official.n;
  return { held, official: official.n, complete, line: `${held.toLocaleString("en-US")} of ${official.n.toLocaleString("en-US")} bills filed are on file${complete ? " (complete)" : " (still loading)"}.` };
}

/* -------------------------------------------------------- Texas facts --- */

/** Rules a reader needs to read the dashboard, each quoted from an official page with the date it was read. */
export const TX_DASH_RULES: Record<"convene" | "length" | "specialCall" | "specialLength", TxRule> = {
  convene: TX_RULES.convene,
  length: TX_RULES.length,
  specialCall: { id: "specialCall", cite: "Texas Constitution, Art. IV, Sec. 8(a)",
    quote: "Governor may, on extraordinary occasions, convene the Legislature in special session",
    sourceLabel: "Texas Constitution, Art. IV, Sec. 8(a), as printed in H.J.R. 192 (2025) on Texas Legislature Online",
    sourceUrl: "https://capitol.texas.gov/tlodocs/89R/billtext/html/HJ00192I.htm", readOn: "2026-11-17" },
  specialLength: { id: "specialLength", cite: "Texas Constitution, Art. III, Sec. 40",
    quote: "no such session shall be of longer duration than thirty days",
    sourceLabel: "Texas Constitution, Art. III, Sec. 40, as printed in H.J.R. 60 (2021) on Texas Legislature Online (the current words are the ones the resolution shows struck through)",
    sourceUrl: "https://capitol.texas.gov/tlodocs/87R/billtext/html/HJ00060I.htm", readOn: "2026-11-17" },
};
