import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { txSessionStats } from "@/db/schema";
import { getCursor, setCursor } from "@/lib/federal/ingest";
import { BRAND } from "@/lib/brand";
import { LEGISCAN_BASE, parseLegiscanMasterList } from "@/lib/texas/parse";
import { matchLegiscanSession, type LegiscanSession } from "@/lib/texas/coverage";
import { figureFromList, figuresFromLegiscan, figuresFromStats, historyPlan, mergeFigures, parseTloBillList, parseTloLegislativeStatistics, readStoredCounts, rowSourceLine,
  TLO_STATS_PATH, tloListPath, TX_HISTORY_SESSIONS, type FigureKey, type HistoryTask, type TxFigures, type TxStoredCounts } from "@/lib/texas/history-parse";

/**
 * Owner's point 6: earlier Texas sessions (2021–2025) for the dashboard. Reads the official pages on Texas Legislature
 * Online first (one statistics page for every session, then each session's signed and unsigned lists), and LegiScan's
 * bill lists only for what the official pages do not give, when LEGISCAN_API_KEY is set. One row per session in
 * tx_session_stats. A counted figure never replaces an official one. Requests are few, paced and identified; a
 * refusal or a rate limit stops the run and is reported, never retried in a loop. Past sessions are read once.
 */
type Db = ReturnType<typeof getDb>;
const UA = `${BRAND.userAgentName}/0.2 (+https://on-record-wrotenberry.vercel.app)`;
const tloBase = () => process.env.TX_TLO_BASE?.trim() || "https://capitol.texas.gov";
const lsBase = () => process.env.LEGISCAN_BASE?.trim() || LEGISCAN_BASE;
const PAUSE_MS = 1500;

async function getText(url: string, timeoutMs: number) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/json" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    return { status: res.status, text: res.ok ? await res.text() : "" };
  } catch { return { status: 0, text: "" }; }
}

async function loadFigures(db: Db) {
  const rows = await db.select().from(txSessionStats).where(inArray(txSessionStats.session, TX_HISTORY_SESSIONS.map(s => s.id)));
  const headings: Record<string, string> = {};
  for (const r of rows) { const h = (r.counts as Partial<TxStoredCounts> | null)?.heading; if (typeof h === "string") headings[r.session] = h; }
  return { byId: Object.fromEntries(rows.map(r => [r.session, readStoredCounts(r.counts, r.source, r.retrievedAt)])) as Record<string, TxFigures>, headings };
}

async function saveFigures(db: Db, session: string, figures: TxFigures, heading: string | undefined, now: number) {
  const counts: TxStoredCounts = { v: 2, figures, ...(heading ? { heading } : {}) };
  const source = rowSourceLine(figures);
  await db.insert(txSessionStats).values({ session, counts, source, retrievedAt: now })
    .onConflictDoUpdate({ target: txSessionStats.session, set: { counts, source, retrievedAt: now } });
}

export type TexasHistoryRun = { ok: boolean; requests: number; stored: string[]; kept: Partial<Record<string, FigureKey[]>>; problems: string[]; stoppedBy?: string; left: number };

export async function runTexasHistory({ budgetMs = 30_000, requestBudget = 4 }: { budgetMs?: number; requestBudget?: number } = {}): Promise<TexasHistoryRun> {
  const db = getDb(), started = Date.now(), deadline = started + budgetMs, lsKey = process.env.LEGISCAN_API_KEY?.trim() || "";
  const { byId, headings } = await loadFigures(db);
  const out: TexasHistoryRun = { ok: true, requests: 0, stored: [], kept: {}, problems: [], left: 0 };
  const touched = new Set<string>();
  const apply = (session: string, incoming: TxFigures) => {
    const m = mergeFigures(byId[session] ?? {}, incoming);
    if (m.kept.length) out.kept[session] = [...(out.kept[session] ?? []), ...m.kept];
    if (m.changed.length) { byId[session] = m.figures; touched.add(session); }
  };
  let lsSessions: LegiscanSession[] | null = null;
  const fetchOne = async (url: string, timeoutMs: number) => {
    if (out.requests > 0) await new Promise(r => setTimeout(r, PAUSE_MS));
    out.requests++;
    return getText(url, Math.max(5_000, Math.min(timeoutMs, deadline - Date.now())));
  };
  // The plan is worked out again after each step (the statistics page decides which lists are needed); a task is tried once per run.
  const tried = new Set<string>();
  for (;;) {
    const task: HistoryTask | undefined = historyPlan(byId, Date.now(), { legiscan: !!lsKey }).find(t => !tried.has(JSON.stringify(t)));
    if (!task) break;
    tried.add(JSON.stringify(task));
    if (out.requests >= requestBudget) { out.stoppedBy = "request budget"; break; }
    if (Date.now() > deadline - 8_000) { out.stoppedBy = "time budget"; break; }
    if (task.kind === "stats") {
      const url = `${tloBase()}${TLO_STATS_PATH}`, r = await fetchOne(url, 30_000);
      if (r.status !== 200) { out.ok = false; out.stoppedBy = `Texas Legislature Online answered ${r.status || "nothing"} for the statistics page`; break; }
      const page = parseTloLegislativeStatistics(r.text), readAt = Date.now();
      if (!page.sessions.length) { out.ok = false; out.stoppedBy = "the statistics page had no session tables (its layout may have changed)"; break; }
      for (const s of TX_HISTORY_SESSIONS) {
        const t = page.sessions.find(x => x.id === s.id);
        if (!t) { out.problems.push(`${s.name}: not on the statistics page`); continue; }
        if (t.problem) { out.problems.push(`${s.name}: ${t.problem}`); continue; }
        headings[s.id] = t.heading;
        apply(s.id, figuresFromStats(t, url, readAt));
      }
    } else if (task.kind === "list") {
      const s = TX_HISTORY_SESSIONS.find(x => x.id === task.session)!, url = `${tloBase()}${tloListPath(s.tlo, task.list)}`, r = await fetchOne(url, 60_000);
      if (r.status !== 200) { out.ok = false; out.stoppedBy = `Texas Legislature Online answered ${r.status || "nothing"} for ${s.name}, ${task.list}`; break; }
      const list = parseTloBillList(r.text);
      if (list.problem) { out.problems.push(`${s.name}, ${list.title || task.list}: ${list.problem}`); continue; }
      apply(s.id, figureFromList(list, task.list === "signedbygov" ? "signed" : "withoutSignature", url, Date.now()));
    } else {
      const s = TX_HISTORY_SESSIONS.find(x => x.id === task.session)!;
      if (!lsSessions) {
        const r = await fetchOne(`${lsBase()}/?key=${encodeURIComponent(lsKey)}&op=getSessionList&state=TX`, 25_000);
        const list = r.status === 200 ? (JSON.parse(r.text || "null") as { sessions?: LegiscanSession[] } | null)?.sessions : null;
        if (!Array.isArray(list)) { out.stoppedBy = `LegiScan session list answered ${r.status || "nothing"}`; break; }
        lsSessions = list;
        if (out.requests >= requestBudget) { out.stoppedBy = "request budget"; break; }
      }
      const match = matchLegiscanSession(lsSessions, { id: s.id, tlo: s.tlo, name: s.name, start: `${s.year}-01-01`, end: null, regular: s.regular });
      if (!match?.session_id) { out.problems.push(`${s.name}: LegiScan does not list it`); continue; }
      const r = await fetchOne(`${lsBase()}/?key=${encodeURIComponent(lsKey)}&op=getMasterList&id=${match.session_id}`, 40_000);
      if (r.status !== 200) { out.stoppedBy = `LegiScan answered ${r.status || "nothing"} for ${s.name}`; break; }
      let body: unknown = null; try { body = JSON.parse(r.text); } catch { /* reported below */ }
      const f = figuresFromLegiscan(parseLegiscanMasterList(body), match.session_id, Date.now());
      if (!Object.keys(f).length) { out.problems.push(`${s.name}: LegiScan's list had no House or Senate bills`); continue; }
      apply(s.id, f);
    }
  }
  out.left = historyPlan(byId, Date.now(), { legiscan: !!lsKey }).length;
  for (const id of touched) { await saveFigures(db, id, byId[id], headings[id], Date.now()); out.stored.push(id); }
  await setCursor(db, "tx:history:lastRun", JSON.stringify({ at: started, ...out })).catch(() => null);
  return out;
}

/** The last run, for the page and the health probe. */
export async function lastTexasHistoryRun(db = getDb()): Promise<(TexasHistoryRun & { at: number }) | null> {
  try { return JSON.parse(await getCursor(db, "tx:history:lastRun") ?? "null"); } catch { return null; }
}
