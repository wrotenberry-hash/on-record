/**
 * Texas coverage rules for the trial: how many seats have a member on file, how the committee list and the bill
 * list are read a few pages at a time across runs, which session's bills to load, and whether the site is ready
 * for the session. Pure (imports only ./parse.ts and ./calendar.ts); tested in tests/texas-coverage.test.mjs.
 *
 * Shapes follow the Open States v3 API as published (openapi.json and the api-v3 source, read 17 Nov 2026): every
 * list answers { results, pagination: { page, max_page, total_items } }; a page past the end answers 404; people are
 * "current members only"; committees are ordered by name and take chamber=upper|lower|legislature; bills take
 * sort=updated_asc and updated_since (inclusive). None of it has been run against the live API from this build.
 */
import { TX_SESSIONS, type TxSession } from "./parse.ts";
import { daysBetween, txSessionLabel, txSessionState } from "./calendar.ts";

/* ---------------------------------------------------------------- Seats --- */

/** Texas Constitution, Art. III, Sec. 2: "The Senate shall consist of thirty-one members. The House of Representatives shall consist of 150 members." */
export const TX_SEATS = { upper: 31, lower: 150 } as const;
export const TX_SEATS_TOTAL = TX_SEATS.upper + TX_SEATS.lower;

export type SeatCoverage = {
  senators: number; representatives: number; expected: { senators: number; representatives: number; total: number };
  /** Seats with at least one member on file. */
  filled: number;
  /** Seats with no member in the source's list. The source lists people, not seats, so it cannot say why. */
  notInSource: number; missing: { upper: string[]; lower: string[] };
  /** Districts with more than one current member on file, or a district label outside 1..N (both mean the source needs a look). */
  doubled: string[]; unexpected: string[];
};
/** Seats filled, from the current members on file (one row per person: chamber and district). */
export function txSeatCoverage(people: Array<{ chamber: string; district: string }>): SeatCoverage {
  const seen = { upper: new Map<string, number>(), lower: new Map<string, number>() }, unexpected: string[] = [];
  for (const p of people) {
    const ch = p.chamber === "upper" || p.chamber === "lower" ? p.chamber : null, n = Number(String(p.district).trim());
    if (!ch || !Number.isInteger(n) || n < 1 || n > TX_SEATS[ch]) { unexpected.push(`${p.chamber}-${p.district}`); continue; }
    seen[ch].set(String(n), (seen[ch].get(String(n)) ?? 0) + 1);
  }
  const missing = (ch: "upper" | "lower") => Array.from({ length: TX_SEATS[ch] }, (_, i) => String(i + 1)).filter(d => !seen[ch].has(d));
  const doubled = (["upper", "lower"] as const).flatMap(ch => [...seen[ch]].filter(([, n]) => n > 1).map(([d]) => `${ch}-${d}`));
  const senators = seen.upper.size, representatives = seen.lower.size, m = { upper: missing("upper"), lower: missing("lower") };
  return { senators, representatives, expected: { senators: TX_SEATS.upper, representatives: TX_SEATS.lower, total: TX_SEATS_TOTAL }, filled: senators + representatives,
    notInSource: m.upper.length + m.lower.length, missing: m, doubled, unexpected };
}
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/**
 * The reader-facing line. It never says "vacant": Open States lists the people it believes hold a seat now, so a
 * seat that is missing may be empty or may simply not be updated yet.
 */
export function seatLine(c: SeatCoverage): string {
  if (c.filled === 0) return "The list of Texas legislators has not loaded yet.";
  if (c.notInSource === 0) return `All ${c.expected.total} seats have a member on file: ${c.senators} senators and ${c.representatives} representatives.`;
  const where = [c.missing.upper.length ? `Senate district${c.missing.upper.length > 1 ? "s" : ""} ${list(c.missing.upper)}` : "", c.missing.lower.length ? `House district${c.missing.lower.length > 1 ? "s" : ""} ${list(c.missing.lower)}` : ""].filter(Boolean);
  const named = c.notInSource <= 12 ? ` (${where.join("; ")})` : "";
  return `${c.filled} of ${c.expected.total} seats have a member on file: ${c.senators} of ${c.expected.senators} senators and ${c.representatives} of ${c.expected.representatives} representatives. `
    + `${c.notInSource} ${c.notInSource === 1 ? "seat is" : "seats are"} not in the source's list${named}. The list does not say whether a missing seat is empty or just not updated yet.`;
}

/** What one page of Open States /people held, by kind, so the run can say why a record was not stored. */
export function peoplePageKinds(body: unknown): { listed: number; legislators: number; other: number; noDistrict: number; total: number | null } {
  const d = body as { results?: Array<{ id?: string; name?: string; current_role?: { org_classification?: string; district?: unknown } | null }>; pagination?: { total_items?: number } } | null;
  const rows = Array.isArray(d?.results) ? d!.results : [];
  let legislators = 0, other = 0, noDistrict = 0;
  for (const p of rows) {
    const c = p?.current_role?.org_classification;
    if (c !== "upper" && c !== "lower") other++; else if (p?.current_role?.district == null || !p?.id || !p?.name) noDistrict++; else legislators++;
  }
  return { listed: rows.length, legislators, other, noDistrict, total: typeof d?.pagination?.total_items === "number" ? d.pagination.total_items : null };
}

const DAY = 86400e3;
/**
 * How often to re-read the member list: weekly, but daily from the day before a regular session convenes until 30
 * days after, because that is when newly elected members take their seats.
 */
export function peopleRefreshMs(today: string, sessions: TxSession[] = TX_SESSIONS): number {
  const near = sessions.some(s => s.regular && daysBetween(s.start, today) >= -1 && daysBetween(s.start, today) <= 30);
  return near ? DAY : 7 * DAY;
}

/* ---------------------------------------------------- Sessions at the source --- */

export type SourceSession = { identifier: string; name: string; classification: string | null; start: string | null; end: string | null };
/** Open States /jurisdictions/tx?include=legislative_sessions */
export function parseOpenStatesSessions(body: unknown): SourceSession[] {
  const d = body as { legislative_sessions?: Array<{ identifier?: unknown; name?: unknown; classification?: unknown; start_date?: unknown; end_date?: unknown }> } | null;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return (Array.isArray(d?.legislative_sessions) ? d!.legislative_sessions : []).flatMap(x => {
    const id = s(x?.identifier);
    return id ? [{ identifier: id, name: s(x?.name) ?? id, classification: s(x?.classification), start: s(x?.start_date)?.slice(0, 10) ?? null, end: s(x?.end_date)?.slice(0, 10) ?? null }] : [];
  });
}

export type SessionPlanItem = {
  /** The id bills are stored under (TX_SESSIONS id, or the source's own id for a session not entered yet). */
  id: string; name: string;
  /** The identifier to ask the source for; null when the source's list was read and does not have this session. */
  sourceId: string | null;
  /** False for a session the source lists that is not in TX_SESSIONS yet (for example a called session). */
  known: boolean;
};
/**
 * Which sessions to load bills for on a date, most important first: the session readers care about now, the one
 * before it, and any newer session the source lists that the site does not know yet (so a called session is loaded
 * and reported instead of being missed). `source` is null when the source's session list has not been read.
 */
export function planSessions(today: string, source: SourceSession[] | null, sessions: TxSession[] = TX_SESSIONS): SessionPlanItem[] {
  const st = txSessionState(today, sessions), norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (source && !source.length) source = null; // an empty list means it was not read, not that the source has no sessions
  const find = (s: TxSession): string | null => {
    if (!source) return s.id;
    return (source.find(x => x.identifier === s.id) ?? source.find(x => norm(x.name) === norm(s.name)))?.identifier ?? null;
  };
  const plan: SessionPlanItem[] = st.ingestOrder.map(id => { const s = sessions.find(x => x.id === id)!; return { id, name: s.name, sourceId: find(s), known: true }; });
  const newest = Math.max(...sessions.map(s => Number(s.id.slice(0, 2))).filter(Number.isFinite));
  const claimed = new Set(plan.map(p => p.sourceId)), knownIds = new Set(sessions.map(s => s.id));
  const extra = (source ?? []).filter(x => /^\d{2,3}$/.test(x.identifier) && !knownIds.has(x.identifier) && !claimed.has(x.identifier) && Number(x.identifier.slice(0, 2)) >= newest)
    .sort((a, b) => b.identifier.padEnd(3, "0").localeCompare(a.identifier.padEnd(3, "0")));
  // A newer session the site does not know goes first: it is what the Legislature is working on.
  return [...extra.map(x => ({ id: x.identifier, name: txSessionLabel(x.identifier, sessions), sourceId: x.identifier, known: false })), ...plan];
}

/* ------------------------------------------------------ Committees, a few pages a run --- */

export const COMMITTEE_CHAMBERS = ["upper", "lower", "legislature"] as const;
export type CommitteeChamber = typeof COMMITTEE_CHAMBERS[number];
export type CommitteeWalk = { startedAt: number; chamber: CommitteeChamber; page: number; stored: number };
export const startCommitteeWalk = (now: number): CommitteeWalk => ({ startedAt: now, chamber: "upper", page: 1, stored: 0 });
export function readCommitteeWalk(raw: string | null): CommitteeWalk | null {
  try {
    const w = raw ? JSON.parse(raw) as Partial<CommitteeWalk> : null;
    return w && typeof w.startedAt === "number" && COMMITTEE_CHAMBERS.includes(w.chamber as CommitteeChamber) && Number.isInteger(w.page) && w.page! >= 1
      ? { startedAt: w.startedAt, chamber: w.chamber as CommitteeChamber, page: w.page!, stored: Number(w.stored) || 0 } : null;
  } catch { return null; }
}
/**
 * After one page of committees is stored: the next page of the same chamber, else page 1 of the next chamber, else
 * done. `pastEnd` is a 404 for a page past the end (the list got shorter while it was being read).
 */
export function nextCommitteeStep(w: CommitteeWalk, page: { count: number; maxPage: number; pastEnd?: boolean }): CommitteeWalk | "done" {
  const stored = w.stored + page.count;
  if (!page.pastEnd && w.page < page.maxPage && page.count > 0) return { ...w, page: w.page + 1, stored };
  const next = COMMITTEE_CHAMBERS[COMMITTEE_CHAMBERS.indexOf(w.chamber) + 1];
  return next ? { ...w, chamber: next, page: 1, stored } : "done";
}
/** How many committee requests a run may spend, leaving the rest of the request budget for events and bills. */
export const committeeRequestCap = (budgetLeft: number) => Math.max(budgetLeft >= 2 ? 1 : 0, Math.min(3, budgetLeft - 5));

/* ------------------------------------------------------------ Bills, a few pages a run --- */

/**
 * Where the bill reader is for one session. Bills are read oldest-update first (sort=updated_asc) from `since`, so
 * every page moves the watermark forward and the next run carries on from it. `page` is above 1 only when a whole
 * page shares one second with the watermark.
 */
export type BillCursor = { since: string | null; page: number };
/** An Open States timestamp as "YYYY-MM-DDTHH:MM:SS" in UTC, the form updated_since takes. */
export function osSecond(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(v.trim()) ? v.trim() : `${v.trim().replace(" ", "T")}Z`);
  return Number.isFinite(t) ? new Date(Math.floor(t / 1000) * 1000).toISOString().slice(0, 19) : null;
}
/** The updated_at of every bill on a page of Open States /bills. */
export function billUpdatedAts(body: unknown): { count: number; updated: string[] } {
  const rows = (body as { results?: Array<{ updated_at?: unknown }> } | null)?.results;
  const arr = Array.isArray(rows) ? rows : [];
  return { count: arr.length, updated: arr.flatMap(b => { const s = osSecond(b?.updated_at); return s ? [s] : []; }) };
}
export function readBillCursor(since: string | null, page: string | null): BillCursor {
  const p = Number(page);
  return { since: since && osSecond(since) ? osSecond(since) : null, page: Number.isInteger(p) && p >= 1 ? p : 1 };
}
/**
 * After one page of bills is stored. Returns the cursor to save, whether the reader has reached the newest bill,
 * and how many pages were still waiting behind this one.
 */
export function advanceBillCursor(cur: BillCursor, page: { count: number; updated: string[]; maxPage: number }, runStartedIso: string): { cursor: BillCursor; caughtUp: boolean; remainingPages: number } {
  const remainingPages = Math.max(0, page.maxPage - cur.page), last = cur.page >= page.maxPage || page.count === 0;
  const newest = page.updated.length ? page.updated.reduce((a, b) => (a > b ? a : b)) : null;
  const run = osSecond(runStartedIso) ?? runStartedIso.slice(0, 19);
  if (page.count === 0) return { cursor: { since: cur.since ?? run, page: 1 }, caughtUp: true, remainingPages: 0 };
  // The source did not send updated_at: walk the pages, and start from this run's time once the end is reached.
  if (!newest) return last ? { cursor: { since: run, page: 1 }, caughtUp: true, remainingPages: 0 } : { cursor: { since: cur.since, page: cur.page + 1 }, caughtUp: false, remainingPages };
  if (last) {
    // Everything up to `newest` is stored. Step one second past it when that second is already over, so the same bills are not read again.
    const after = new Date(Date.parse(`${newest}Z`) + 1000).toISOString().slice(0, 19);
    return { cursor: { since: after <= run ? after : newest, page: 1 }, caughtUp: true, remainingPages: 0 };
  }
  // No progress in time (a whole page inside the watermark's second): take the next page instead of the same one again.
  if (cur.since && newest <= cur.since) return { cursor: { since: cur.since, page: cur.page + 1 }, caughtUp: false, remainingPages };
  return { cursor: { since: newest, page: 1 }, caughtUp: false, remainingPages };
}

/* ------------------------------------------------------------- LegiScan --- */

export type LegiscanSession = { session_id?: number; year_start?: number; special?: number; session_name?: string; session_title?: string };
/** The LegiScan session for one of ours: same first year, regular or called, and for a called session the same number. Null when LegiScan does not list it. */
export function matchLegiscanSession(list: LegiscanSession[], s: TxSession): LegiscanSession | null {
  const year = s.start.slice(0, 4), ord = s.id.length === 3 ? Number(s.id.slice(2)) : 0;
  return list.find(x => !!x?.session_id && String(x.year_start) === year
    && (s.regular ? !x.special : !!x.special && new RegExp(`\\b${ord}(st|nd|rd|th)\\b|called session ${ord}`, "i").test(`${x.session_name ?? ""} ${x.session_title ?? ""}`))) ?? null;
}

/* ------------------------------------------------------------ Readiness --- */

export type ReadinessInput = {
  today: string; openStates: boolean; legiscan: boolean; billsBySession: Record<string, number>; newestActionDate: string | null;
  /** The source's session list, when it has been read. */
  sourceSessions: SourceSession[] | null;
  /** Pages of bills still waiting for each session, from the last run that read that session. */
  backlogPages: Record<string, number>;
  lastRun: { status: string; startedAt: string } | null; nowMs: number;
};
export type Readiness = { readyForSession: boolean; session: string; sessionName: string; reasons: string[]; notes: string[] };
/**
 * Is bill coverage ready for the session readers care about (the one in progress, else the one coming up)? Ready
 * means: a feed is switched on, the source lists that session, bills for it are stored, the reader is not far
 * behind, and the last update worked. `reasons` says in plain words what is missing.
 */
export function txReadiness(i: ReadinessInput, sessions: TxSession[] = TX_SESSIONS): Readiness {
  const st = txSessionState(i.today, sessions), f = st.focus, reasons: string[] = [], notes: string[] = [];
  const plan = planSessions(i.today, i.sourceSessions, sessions), item = plan.find(p => p.id === f.id);
  if (!i.openStates && !i.legiscan) reasons.push("No Texas feed is switched on: the Open States key (OPENSTATES_API_KEY) is not set.");
  else if (!i.openStates) notes.push("The Open States key is not set, so bills come from LegiScan only: titles and status, without votes.");
  if (i.openStates && !i.legiscan) notes.push("The LegiScan key (LEGISCAN_API_KEY) is not set. It is optional: with it, every bill of the session is listed in one request while Open States fills in the details.");
  if (i.openStates && i.sourceSessions && item && !item.sourceId) reasons.push(`Open States does not list the ${f.name} yet, so it has no bills to give for it.`);
  if (i.openStates && !i.sourceSessions) notes.push("The source's list of sessions has not been read yet (it is read once a day).");
  const stored = i.billsBySession[f.id] ?? 0;
  if (stored === 0) reasons.push(`No bills are stored for the ${f.name} yet.`);
  const behind = i.backlogPages[f.id] ?? 0;
  if (behind > 0) (behind > 40 ? reasons : notes).push(`Bills for the ${f.name} are still loading: about ${behind} more pages of 20 bills are waiting.`);
  if (st.inSession && stored > 0 && (!i.newestActionDate || daysBetween(i.newestActionDate, i.today) > 7)) reasons.push(`The Legislature is in session, but the newest bill action on file is ${i.newestActionDate ? `from ${i.newestActionDate}` : "missing"}.`);
  if (!i.lastRun) reasons.push("The Texas update has never run.");
  else if (i.lastRun.status === "FAILED") reasons.push("The last Texas update failed.");
  else if (i.nowMs - Date.parse(i.lastRun.startedAt) > 2 * DAY) reasons.push("The Texas update has not run in the last two days.");
  for (const p of plan.filter(x => !x.known)) notes.push(`The source lists a session the site has no dates for yet: ${p.name} (${p.id}). Its bills are loaded; its dates need adding to TX_SESSIONS.`);
  return { readyForSession: reasons.length === 0, session: f.id, sessionName: f.name, reasons, notes };
}

/* ------------------------------------------------- What the page says is covered --- */

export type CoverageView = {
  /** The session whose bills the page shows: the focus session when it has bills, else the last one that does. */
  shown: TxSession | null; shownCount: number;
  /** One plain sentence about what is covered today, from the data. */
  line: string;
};
const year = (s: TxSession) => s.start.slice(0, 4);
export function txCoverageView(today: string, billsBySession: Record<string, number>, sessions: TxSession[] = TX_SESSIONS): CoverageView {
  const st = txSessionState(today, sessions), n = (s: TxSession | null) => (s ? billsBySession[s.id] ?? 0 : 0);
  const withBills = sessions.filter(s => s.start <= today && n(s) > 0).sort((a, b) => b.start.localeCompare(a.start))[0] ?? null;
  if (st.inSession) {
    if (n(st.current) > 0) return { shown: st.current, shownCount: n(st.current), line: `The Legislature is in session. Bills appear here as they are filed and as they move.` };
    return { shown: withBills, shownCount: n(withBills), line: withBills
      ? `The Legislature is in session, but this session's bills have not loaded here yet; bills from the ${withBills.name} are shown.`
      : "The Legislature is in session, but its bills have not loaded here yet." };
  }
  if (st.upcoming && n(st.upcoming) > 0) return { shown: st.upcoming, shownCount: n(st.upcoming), line: `The Legislature is not in session. Bills filed ahead of the ${year(st.upcoming)} session appear here as they are filed.` };
  if (withBills) return { shown: withBills, shownCount: n(withBills), line: st.upcoming
    ? `The Legislature is not in session. Bills filed ahead of the ${year(st.upcoming)} session have not loaded here yet; the last session's bills are shown.`
    : "The Legislature is not in session; the last session's bills are shown." };
  return { shown: null, shownCount: 0, line: "The Legislature is not in session. No Texas bills have loaded here yet." };
}
