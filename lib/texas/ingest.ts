import { and, desc, eq, gte, inArray, like, lt, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ingestCursors, ingestRuns, txSessionStats, txBillActions, txBills, txBillSponsors, txBillVersions, txCommitteeMembers, txCommittees, txEvents, txMemberVotes, txPeople, txVotes } from "@/db/schema";
import { chunked, getCursor, setCursor } from "@/lib/federal/ingest";
import { LEGISCAN_BASE, legiscanMasterListSession, legiscanStage, legiscanVoteRows, OPENSTATES_BASE, parseLegiscanBill, parseLegiscanMasterList, parseLegiscanRollCall, parseLegiscanSessionPeople,
  parseOpenStatesBills, parseOpenStatesCommitteePage, parseOpenStatesEventPage, parseOpenStatesPeople, tloBillUrl, txBillId, txEventSession, txStage, txTallyMismatch, TX_SESSIONS,
  type LegiscanPerson, type TxBill, type TxSession, type TxVote } from "@/lib/texas/parse";
import { BRAND } from "@/lib/brand";
import { parseOpenStatesContacts } from "@/lib/contact-parse";
import { upsertContacts } from "@/lib/contacts";
import { tloSessionCode, txCalendar, txSessionState, txToday } from "@/lib/texas/calendar";
import { runTexasHistory } from "@/lib/texas/history";
import { advanceSessionBills, billRequest, billUpdatedAts, committeeRequestCap, committeeWalkDue, eventsDue, matchLegiscanSession, needsFresh, nextCommitteeStep, nextEventStep,
  parseOpenStatesSessions, peoplePageKinds, peopleRefreshMs, planSessions, readCommitteeWalk, readEventWalk, readSessionBills, seatLine, startCommitteeWalk, txReadiness, txSeatCoverage,
  waitingPages, type LegiscanSession, type SessionPlanItem, type SourceSession } from "@/lib/texas/coverage";
import { chainDecision, clearLimitForStart, mayRequest, mayStart, paceWaitMs, readBudget, readLock, txChainSettings, type ChainDecision, type StartKind, type StoppedBy, type TxBudget,
  type TxChainSettings } from "@/lib/texas/chain";
import { compareLastAction, matchTloCode, parseTloCommitteeList, parseTloHistory, parseTloMemberList, pickSpotCheck, tallyChecks, TLO, tloHearingUrl, type LastActionCheck, type TloCode } from "@/lib/texas/tlo";

/**
 * Texas Legislature ingestion. Open States v3 (OPENSTATES_API_KEY) is the primary feed; LegiScan (LEGISCAN_API_KEY)
 * fills in bills and recorded votes Open States does not have; every bill links to Texas Legislature Online, the
 * source of record, and a few bills a day are checked against it. No model calls.
 *
 * 17 Nov 2026: one loader, two ways in. The scheduled update calls runTexasIngest (a short run, at most
 * TEXAS_MAX_REQUESTS_PER_RUN requests); the back-to-back chain (app/api/automation/texas) calls runTexasLink for up to
 * four minutes at a time. Both share one lock (never two at once), one daily request budget and one pace
 * (lib/texas/chain.ts), and stop cleanly on a 429.
 */
type Db = ReturnType<typeof getDb>;
const UA = `${BRAND.userAgentName}/0.3 (+https://on-record-wrotenberry.vercel.app)`;
const DAY = 86400e3, WEEK = 7 * DAY;
const base = () => process.env.OPENSTATES_BASE?.trim() || OPENSTATES_BASE;
const lsBase = () => process.env.LEGISCAN_BASE?.trim() || LEGISCAN_BASE;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const json = <T,>(v: string | null): T | null => { try { return v ? JSON.parse(v) as T : null; } catch { return null; } };

export function texasConfig() {
  const os = process.env.OPENSTATES_API_KEY?.trim() || "", ls = process.env.LEGISCAN_API_KEY?.trim() || "";
  const max = Number(process.env.TEXAS_MAX_REQUESTS_PER_RUN ?? "12");
  return { openStates: !!os, legiscan: !!ls, osKey: os, lsKey: ls, maxRequests: Number.isFinite(max) && max > 0 ? Math.min(max, 60) : 12 };
}

async function getJson(url: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(25_000), cache: "no-store" });
    return { status: res.status, body: res.ok ? await res.json().catch(() => null) : null };
  } catch { return { status: 0, body: null }; }
}

/* ------------------------------------------------------------ One run's state --- */

type Run = {
  db: Db; started: number; deadline: number; s: TxChainSettings; b: TxBudget; runCap: number; runUsed: number; startUsed: number;
  stoppedBy: StoppedBy | null; out: Record<string, unknown>;
};
const saveBudget = (r: Run) => setCursor(r.db, "tx:budget", JSON.stringify(r.b));

/** One Open States request, inside the budget and the pace. Null when it may not go out (the reason is kept in stoppedBy). */
async function osCall(r: Run, path: string) {
  if (r.stoppedBy) return null;
  const wait = paceWaitMs(r.b.lastAt, Date.now(), r.s.perMinute);
  const ok = mayRequest(r.b, r.s, { runUsed: r.runUsed, runCap: r.runCap, startUsed: r.startUsed, now: Date.now(), deadline: r.deadline, waitMs: wait });
  if (!ok.ok) { r.stoppedBy = ok.reason; return null; }
  if (wait) await sleep(wait);
  r.runUsed++; r.startUsed++; r.b.used++; r.b.lastAt = Date.now();
  await saveBudget(r);
  const res = await getJson(`${base()}${path}`, { "X-API-KEY": texasConfig().osKey });
  if (res.status === 429) {
    // Stop cleanly and say so; nothing is retried until the next day or the next scheduled start (chain.ts mayStart).
    r.b.limitedAt = Date.now(); r.stoppedBy = "rate limited"; r.out.rateLimited = path.split("?")[0];
    await saveBudget(r);
  }
  return res;
}
/** LegiScan: its own small daily budget (TEXAS_LEGISCAN_DAILY). */
async function lsCall(r: Run, query: string) {
  if (r.b.legiscan >= r.s.legiscanDaily || Date.now() > r.deadline - 8000) return null;
  r.b.legiscan++; await saveBudget(r);
  return getJson(`${lsBase()}/?key=${encodeURIComponent(texasConfig().lsKey)}&${query}`, {});
}

/* -------------------------------------------------------------------- Lock --- */

const LOCK = "tx:lock";
/** Taken in one statement: the row is written only when the lock is free, expired, or reserved for this chain. */
async function takeLock(db: Db, owner: string, chain: string, leaseMs: number) {
  const now = Date.now(), value = JSON.stringify({ owner, chain, until: now + leaseMs });
  const cur = sql`${ingestCursors.value}`;
  await db.insert(ingestCursors).values({ key: LOCK, value, updatedAt: now }).onConflictDoUpdate({ target: ingestCursors.key, set: { value, updatedAt: now },
    setWhere: sql`case when json_valid(${cur}) then (coalesce(json_extract(${cur}, '$.until'), 0) < ${now} or json_extract(${cur}, '$.chain') = ${chain}) else 1 end` });
  return readLock(await getCursor(db, LOCK))?.owner === owner;
}
/** Free the lock, or keep it a little while for the next link of the same chain. */
async function releaseLock(db: Db, owner: string, keepFor: { chain: string; ms: number } | null) {
  const value = keepFor ? JSON.stringify({ owner: `reserved:${keepFor.chain}`, chain: keepFor.chain, until: Date.now() + keepFor.ms }) : "";
  await db.update(ingestCursors).set({ value, updatedAt: Date.now() })
    .where(and(eq(ingestCursors.key, LOCK), sql`json_valid(${ingestCursors.value}) and json_extract(${ingestCursors.value}, '$.owner') = ${owner}`));
}

/* ------------------------------------------------------------------- Bills --- */

async function storeBill(db: Db, b: TxBill, now: number) {
  const s = TX_SESSIONS.find(x => x.id === b.session);
  const id = txBillId(b.session, b.identifier), stage = txStage(b.actions);
  const row = { id, openstatesId: b.id, session: b.session, identifier: b.identifier, title: b.title || b.identifier, chamber: b.chamber, classification: b.classification, subjects: b.subjects, stage,
    firstActionDate: b.firstActionDate, latestActionDate: b.latestActionDate, latestActionDescription: b.latestActionDescription, tloUrl: tloBillUrl(s?.tlo ?? tloSessionCode(b.session), b.identifier),
    openstatesUrl: b.openstatesUrl, feed: "openstates" as const, sourceUrl: `${OPENSTATES_BASE}/bills/${encodeURIComponent(b.id)}`, retrievedAt: now };
  await db.insert(txBills).values(row).onConflictDoUpdate({ target: txBills.id, set: { ...row } });
  await db.delete(txBillActions).where(eq(txBillActions.billId, id));
  if (b.actions.length) await chunked(b.actions, 50, part => db.insert(txBillActions).values(part.map((a, i) => ({ billId: id, seq: a.order ?? i, date: a.date, description: a.description, chamber: a.chamber, classification: a.classification }))).onConflictDoNothing());
  await db.delete(txBillSponsors).where(eq(txBillSponsors.billId, id));
  if (b.sponsors.length) await db.insert(txBillSponsors).values(b.sponsors.map(x => ({ billId: id, name: x.name, personId: x.personId, primary: x.primary ? 1 : 0 }))).onConflictDoNothing();
  await db.delete(txBillVersions).where(eq(txBillVersions.billId, id));
  if (b.versions.length) await db.insert(txBillVersions).values(b.versions.map(v => ({ billId: id, note: v.note || "Version", date: v.date, url: v.url }))).onConflictDoNothing();
  // Once Open States has recorded votes for a bill, the LegiScan stand-ins for it go, so no vote is shown twice.
  if (b.votes.length) {
    const old = (await db.select({ id: txVotes.id }).from(txVotes).where(and(eq(txVotes.billId, id), like(txVotes.id, "legiscan-%")))).map(x => x.id);
    if (old.length) { await db.delete(txMemberVotes).where(inArray(txMemberVotes.voteId, old)); await db.delete(txVotes).where(inArray(txVotes.id, old)); }
  }
  let mismatches = 0;
  for (const v of b.votes) mismatches += (await storeVote(db, id, v, now)) ? 1 : 0;
  return { stage, votes: b.votes.length, mismatches };
}
/** Returns true when the counts disagree with the member list (stored as tally_ok = 0). */
async function storeVote(db: Db, billId: string, v: TxVote, now: number) {
  const bad = txTallyMismatch(v);
  await db.insert(txVotes).values({ id: v.id, billId, motion: v.motion, date: v.date, result: v.result, chamber: v.chamber, counts: v.counts, tallyOk: bad ? 0 : 1, retrievedAt: now })
    .onConflictDoUpdate({ target: txVotes.id, set: { motion: v.motion, result: v.result, counts: v.counts, tallyOk: bad ? 0 : 1, retrievedAt: now } });
  await db.delete(txMemberVotes).where(eq(txMemberVotes.voteId, v.id));
  if (v.votes.length) await chunked(v.votes, 100, part => db.insert(txMemberVotes).values(part.map(x => ({ voteId: v.id, personId: x.personId, name: x.name || "Unknown", option: x.option }))).onConflictDoNothing());
  return !!bad;
}

/** The source's own list of Texas sessions, kept in a cursor (read once a day). Null until it has been read. */
async function sourceSessions(db: Db): Promise<{ at: number; sessions: SourceSession[] } | null> {
  const v = json<{ at?: number; sessions?: SourceSession[] }>(await getCursor(db, "tx:source-sessions"));
  return v && typeof v.at === "number" && Array.isArray(v.sessions) && v.sessions.length ? { at: v.at, sessions: v.sessions } : null;
}
const billsKey = (id: string) => `tx:bills2:${id}`;

/**
 * Bills for one session, newest update first (coverage.ts advanceSessionBills). While a long pass is under way, a short
 * pass for bills updated since it began goes first, so new filings never wait behind it.
 */
async function loadSessionBills(r: Run, p: SessionPlanItem) {
  const key = billsKey(p.id), now = Date.now();
  let st = readSessionBills(await getCursor(r.db, key)), bills = 0, votes = 0, mismatches = 0, refused = 0, mainDone = false;
  for (const mode of (needsFresh(st) ? ["fresh", "main"] : ["main"]) as Array<"fresh" | "main">) {
    for (;;) {
      const q = billRequest(st, mode);
      const res = await osCall(r, `/bills?jurisdiction=tx&session=${encodeURIComponent(p.sourceId!)}&sort=updated_desc&include=actions&include=votes&include=sponsorships&include=versions&per_page=20&page=${q.page}${q.since ? `&updated_since=${encodeURIComponent(q.since)}` : ""}`);
      if (!res) break;
      let step;
      if (!res.body) {
        // A page past the end (the list got shorter while it was read) ends that pass: everything before it was read.
        if (!(res.status === 404 && q.page > 1)) { if (res.status !== 429) refused++; break; }
        step = advanceSessionBills(st, mode, { count: 0, updated: [], maxPage: q.page, total: null });
      } else {
        const parsed = parseOpenStatesBills(res.body), seen = billUpdatedAts(res.body);
        for (const b of parsed.bills) { const x = await storeBill(r.db, { ...b, session: p.id }, now); bills++; votes += x.votes; mismatches += x.mismatches; }
        const total = (res.body as { pagination?: { total_items?: unknown } }).pagination?.total_items;
        step = advanceSessionBills(st, mode, { count: seen.count, updated: seen.updated, maxPage: parsed.maxPage, total: typeof total === "number" ? total : null });
      }
      st = step.state;
      await setCursor(r.db, key, JSON.stringify(st));
      // Kept in the shape txReadiness reads (pages of 20 still waiting).
      await setCursor(r.db, `tx:bills:${p.id}:backlog`, JSON.stringify({ at: Date.now(), pages: waitingPages(st.waiting), caughtUp: st.main.page === 1, waiting: st.waiting ?? 0 }));
      if (step.done) { if (mode === "main") mainDone = true; break; }
    }
    if (r.stoppedBy) break;
  }
  return { bills, votes, mismatches, refused, waiting: st.waiting ?? 0, caughtUp: mainDone };
}

/* ---------------------------------------------------------- Open States steps --- */

async function readSessions(r: Run) {
  let listed = await sourceSessions(r.db);
  if (Date.now() - (listed?.at ?? 0) > DAY) {
    const res = await osCall(r, `/jurisdictions/tx?include=legislative_sessions`);
    const found = res?.body ? parseOpenStatesSessions(res.body) : [];
    if (found.length) { listed = { at: Date.now(), sessions: found }; await setCursor(r.db, "tx:source-sessions", JSON.stringify(listed)); }
    r.out.sourceSessions = found.length;
  }
  return listed;
}

async function readPeople(r: Run, today: string) {
  const db = r.db, now = Date.now();
  // The same request asks for each member's offices and links, which feed legislator_contacts.
  if (!(Date.now() - Number(await getCursor(db, "tx:people") ?? 0) > peopleRefreshMs(today) || !(await getCursor(db, "tx:contacts")))) return;
  let page = 1, max = 1, people = 0, contacts = 0, failed = false;
  const kinds = { listed: 0, legislators: 0, other: 0, noDistrict: 0, total: null as number | null };
  do { let res = await osCall(r, `/people?jurisdiction=tx&include=offices&include=links&per_page=50&page=${page}`);
    if (res && !res.body && (res.status === 400 || res.status === 422)) { r.out.contactsNote = `Open States answered ${res.status} to include=offices; members read without contact details`; res = await osCall(r, `/people?jurisdiction=tx&per_page=50&page=${page}`); }
    if (!res?.body) { failed = true; break; }
    const p = parseOpenStatesPeople(res.body); max = p.maxPage;
    try { contacts += await upsertContacts(db, "texas", parseOpenStatesContacts(res.body), `${OPENSTATES_BASE}/people?jurisdiction=tx&include=offices&include=links`, now); } catch { r.out.contactsFailed = true; }
    if (p.people.length) await db.insert(txPeople).values(p.people.map(x => ({ ...x, isCurrent: 1, sourceUrl: `${OPENSTATES_BASE}/people?jurisdiction=tx`, retrievedAt: now })))
      .onConflictDoUpdate({ target: txPeople.id, set: { name: sql`excluded.name`, party: sql`excluded.party`, chamber: sql`excluded.chamber`, district: sql`excluded.district`, title: sql`excluded.title`, isCurrent: 1, retrievedAt: now } });
    people += p.people.length; page++;
    const k = peoplePageKinds(res.body); kinds.listed += k.listed; kinds.legislators += k.legislators; kinds.other += k.other; kinds.noDistrict += k.noDistrict; kinds.total = k.total ?? kinds.total;
  } while (page <= max);
  // Only when every page was read (and it looks like a real list) are members missing from it marked as no longer serving.
  const complete = !failed && people >= 100;
  if (complete) await db.update(txPeople).set({ isCurrent: 0 }).where(and(eq(txPeople.isCurrent, 1), lt(txPeople.retrievedAt, now)));
  if (complete) { await setCursor(db, "tx:people", String(now)); if (!r.out.contactsNote && !r.out.contactsFailed) await setCursor(db, "tx:contacts", String(now)); }
  await setCursor(db, "tx:people:stats", JSON.stringify({ at: now, complete, pagesRead: page - 1, pages: max, ...kinds, stored: people }));
  r.out.people = people; r.out.contacts = contacts; r.out.peopleComplete = complete;
}

/** Committees with their chamber and members: every page of the Senate's, the House's and the joint list. Returns true while a walk is under way. */
async function readCommittees(r: Run, cap: number) {
  const db = r.db;
  let walk = readCommitteeWalk(await getCursor(db, "tx:committees:walk"));
  const counts = await db.select({ n: sql<number>`count(*)`, unknown: sql<number>`coalesce(sum(case when ${txCommittees.chamber} is null then 1 else 0 end), 0)` }).from(txCommittees).get();
  const due = committeeWalkDue({ walking: !!walk, lastFullRead: Number(await getCursor(db, "tx:committees") ?? 0), stored: Number(counts?.n ?? 0), chamberUnknown: Number(counts?.unknown ?? 0), now: Date.now() });
  if (!due) return false;
  if (!walk) walk = startCommitteeWalk(Date.now());
  let left = cap, stored = 0;
  while (walk && left-- > 0) {
    const res = await osCall(r, `/committees?jurisdiction=tx&classification=committee&chamber=${walk.chamber}&include=memberships&per_page=20&page=${walk.page}`);
    if (!res) break;
    const pastEnd = !res.body && res.status === 404 && walk.page > 1;
    if (!res.body && !pastEnd) { r.out.committeesRefused = res.status; break; }
    const pg = parseOpenStatesCommitteePage(res.body, walk.chamber), now = Date.now();
    for (const cm of pg.committees) {
      await db.insert(txCommittees).values({ id: cm.id, name: cm.name, chamber: cm.chamber, retrievedAt: now }).onConflictDoUpdate({ target: txCommittees.id, set: { name: cm.name, chamber: cm.chamber, retrievedAt: now } });
      await db.delete(txCommitteeMembers).where(eq(txCommitteeMembers.committeeId, cm.id));
      if (cm.members.length) await chunked(cm.members, 50, part => db.insert(txCommitteeMembers).values(part.map(m => ({ committeeId: cm.id, name: m.name, personId: m.personId, role: m.role }))).onConflictDoNothing());
    }
    stored += pg.committees.length;
    const next = nextCommitteeStep(walk, { count: pg.committees.length, maxPage: pg.maxPage, pastEnd });
    if (next === "done") {
      // The whole list was read: committees that were not in it (including the first build's rows with no chamber) go.
      const total = walk.stored + pg.committees.length;
      if (total > 0) {
        await db.delete(txCommittees).where(lt(txCommittees.retrievedAt, walk.startedAt));
        const keep = (await db.select({ id: txCommittees.id }).from(txCommittees)).map(x => x.id);
        if (keep.length) await db.delete(txCommitteeMembers).where(notInArray(txCommitteeMembers.committeeId, keep));
      }
      await setCursor(db, "tx:committees", String(Date.now())); await setCursor(db, "tx:committees:walk", "");
      walk = null; r.out.committeesTotal = total;
    } else { walk = next; await setCursor(db, "tx:committees:walk", JSON.stringify(walk)); }
  }
  r.out.committees = stored;
  return !!walk;
}

/** Upcoming hearings and floor events, every page, each with the bills on its agenda (tx_events.bills, numbers like "HB 1"). Returns true while a walk is under way. */
async function readEvents(r: Run, today: string) {
  const db = r.db;
  let walk = readEventWalk(await getCursor(db, "tx:events:walk"));
  if (!eventsDue(walk, Number(await getCursor(db, "tx:events") ?? 0), Date.now())) return false;
  if (!walk) walk = { startedAt: Date.now(), page: 1, stored: 0 };
  const codes = json<{ committees?: Record<string, TloCode[]> }>(await getCursor(db, "tx:tlo:codes"))?.committees ?? {};
  let stored = 0, withBills = 0;
  while (walk) {
    const res = await osCall(r, `/events?jurisdiction=tx&after=${today}&include=agenda&include=participants&include=sources&include=links&per_page=20&page=${walk.page}`);
    if (!res) break;
    const pastEnd = !res.body && res.status === 404 && walk.page > 1;
    if (!res.body && !pastEnd) { r.out.eventsRefused = res.status; break; }
    const pg = parseOpenStatesEventPage(res.body), now = Date.now();
    if (pg.cancelled.length) await db.delete(txEvents).where(inArray(txEvents.id, pg.cancelled));
    if (pg.events.length) await db.insert(txEvents).values(pg.events.map(e => {
      const session = txEventSession(e.start), list = e.chamber ? codes[e.chamber] ?? [] : [];
      const tlo = tloHearingUrl({ sourceUrl: e.sourceUrl, sessionId: session?.id ?? null, chamber: e.chamber, committeeCode: e.committee ? matchTloCode(e.committee, list) : null });
      return { id: e.id, name: e.name, start: e.start, location: e.location, classification: e.classification, bills: e.bills, url: tlo?.url ?? e.url, retrievedAt: now };
    })).onConflictDoUpdate({ target: txEvents.id, set: { name: sql`excluded.name`, start: sql`excluded.start`, location: sql`excluded.location`, classification: sql`excluded.classification`, bills: sql`excluded.bills`, url: sql`excluded.url`, retrievedAt: now } });
    stored += pg.events.length; withBills += pg.events.filter(e => e.bills.length).length;
    const next = nextEventStep(walk, { count: pg.events.length, maxPage: pg.maxPage, pastEnd });
    if (next === "done") {
      // Every page was read: upcoming events no longer listed were moved or cancelled.
      await db.delete(txEvents).where(and(gte(txEvents.start, today), lt(txEvents.retrievedAt, walk.startedAt)));
      await setCursor(db, "tx:events", String(Date.now())); await setCursor(db, "tx:events:walk", "");
      walk = null;
    } else { walk = next; await setCursor(db, "tx:events:walk", JSON.stringify(walk)); }
  }
  r.out.events = stored; r.out.eventsWithBills = withBills;
  return !!walk;
}

/* --------------------------------------------------------------- LegiScan --- */

async function legiscanSessions(r: Run): Promise<LegiscanSession[] | null> {
  const cached = json<{ at: number; sessions: LegiscanSession[] }>(await getCursor(r.db, "tx:legiscan:sessions"));
  if (cached && Date.now() - cached.at < DAY && Array.isArray(cached.sessions)) return cached.sessions;
  const sl = await lsCall(r, "op=getSessionList&state=TX");
  const sessions = (sl?.body as { sessions?: LegiscanSession[] } | null)?.sessions;
  if (!Array.isArray(sessions)) return null;
  await setCursor(r.db, "tx:legiscan:sessions", JSON.stringify({ at: Date.now(), sessions }));
  return sessions;
}
/** One session's LegiScan master list (bill numbers to LegiScan bill ids are kept a day). Null unless it is the session asked for. */
async function legiscanMasterList(r: Run, session: TxSession, lsSession: number) {
  const ml = await lsCall(r, `op=getMasterList&id=${lsSession}`);
  if (!ml?.body || legiscanMasterListSession(ml.body) !== lsSession) return null;
  const list = parseLegiscanMasterList(ml.body);
  await setCursor(r.db, `tx:legiscan:ids:${session.id}`, JSON.stringify({ at: Date.now(), lsSession, ids: Object.fromEntries(list.filter(b => b.billId).map(b => [b.number, b.billId])) }));
  return list;
}

/**
 * LegiScan: bill numbers, titles and status (no votes) for the session readers care about now, when Open States is
 * unavailable, refuses, does not list that session yet, or is still far behind on it. Every six hours at most. A
 * session LegiScan does not list is reported, never filed under another one.
 */
async function viaLegiscan(r: Run) {
  const db = r.db, now = Date.now(), focus = txSessionState(txToday(now)).focus;
  if (now - Number(await getCursor(db, "tx:legiscan:list") ?? 0) < 6 * 3600e3) return { skipped: "read in the last six hours" };
  const sessions = await legiscanSessions(r);
  if (!sessions) return { ok: false, error: "LegiScan session list unavailable" };
  const target = matchLegiscanSession(sessions, focus), session = focus;
  if (!target?.session_id) return { ok: false, error: `LegiScan does not list the ${focus.name} yet`, session: focus.id };
  const list = await legiscanMasterList(r, session, target.session_id);
  if (!list) return { ok: false, error: "LegiScan master list unavailable or for another session" };
  const have = new Map((await db.select({ id: txBills.id, feed: txBills.feed, date: txBills.latestActionDate, stage: txBills.stage }).from(txBills).where(eq(txBills.session, session.id))).map(x => [x.id, x]));
  const rows = list.flatMap(b => {
    const id = txBillId(session.id, b.number), e = have.get(id), stage = legiscanStage(b.status);
    if (e?.feed === "openstates") return []; // Open States rows carry votes; LegiScan only fills gaps
    if (e && e.date === b.lastActionDate && e.stage === stage) return []; // nothing new
    return [{ id, session: session.id, identifier: b.number, title: b.title || b.number, stage, latestActionDate: b.lastActionDate, latestActionDescription: b.lastAction,
      tloUrl: tloBillUrl(session.tlo, b.number), feed: "legiscan" as const, sourceUrl: b.url ?? `${LEGISCAN_BASE}`, retrievedAt: now }];
  });
  await chunked(rows, 100, part => db.insert(txBills).values(part).onConflictDoUpdate({ target: txBills.id, set: { title: sql`excluded.title`, stage: sql`excluded.stage`,
    latestActionDate: sql`excluded.latest_action_date`, latestActionDescription: sql`excluded.latest_action_description`, sourceUrl: sql`excluded.source_url`, retrievedAt: now },
    setWhere: eq(txBills.feed, "legiscan") }));
  await setCursor(db, "tx:legiscan:list", String(now));
  return { ok: true, legiscanBills: list.length, written: rows.length, session: session.id };
}

const VOTED_STAGES = ["passed_first", "passed_both", "governor", "law", "vetoed", "failed"];
/**
 * Recorded votes from LegiScan for bills that passed or failed a vote but have none from Open States: getBill (is it
 * the same bill and session?) then getRollCall for each roll call, inside TEXAS_LEGISCAN_DAILY. A bill is checked
 * again after a week.
 */
async function legiscanVotes(r: Run, plan: SessionPlanItem[]) {
  const db = r.db;
  const checked = json<Record<string, number>>(await getCursor(db, "tx:legiscan:votes:checked")) ?? {};
  let bills = 0, votes = 0, mismatches = 0, skipped = 0, sessions: LegiscanSession[] | null = null;
  for (const p of plan) {
    const ts = TX_SESSIONS.find(s => s.id === p.id);
    if (!ts) continue;
    const candidates = (await db.select({ id: txBills.id, identifier: txBills.identifier }).from(txBills)
      .where(and(eq(txBills.session, p.id), eq(txBills.feed, "openstates"), inArray(txBills.stage, VOTED_STAGES), sql`not exists (select 1 from ${txVotes} where ${txVotes.billId} = ${txBills.id})`))
      .orderBy(desc(txBills.latestActionDate)).limit(40)).filter(c => (checked[c.id] ?? 0) <= Date.now() - WEEK);
    if (!candidates.length) continue;
    sessions ??= await legiscanSessions(r);
    const lsSession = sessions ? matchLegiscanSession(sessions, ts)?.session_id : undefined;
    if (!lsSession) continue;
    let ids = json<{ at: number; lsSession: number; ids: Record<string, number> }>(await getCursor(db, `tx:legiscan:ids:${p.id}`));
    if (!ids || ids.lsSession !== lsSession || Date.now() - ids.at > DAY) {
      const list = await legiscanMasterList(r, ts, lsSession);
      if (!list) continue;
      ids = { at: Date.now(), lsSession, ids: Object.fromEntries(list.filter(b => b.billId).map(b => [b.number, b.billId!])) };
    }
    let people: LegiscanPerson[] | null = json<{ at: number; people: LegiscanPerson[] }>(await getCursor(db, `tx:legiscan:people:${lsSession}`))?.people ?? null;
    const members = await db.select({ id: txPeople.id, chamber: txPeople.chamber, district: txPeople.district }).from(txPeople).where(eq(txPeople.isCurrent, 1));
    let out = false;
    for (const c of candidates) {
      const lsBill = ids.ids[c.identifier];
      if (!lsBill) { skipped++; continue; }
      if (!people) {
        const sp = await lsCall(r, `op=getSessionPeople&id=${lsSession}`);
        if (!sp) { out = true; break; }
        people = parseLegiscanSessionPeople(sp.body);
        await setCursor(db, `tx:legiscan:people:${lsSession}`, JSON.stringify({ at: Date.now(), people }));
      }
      const gb = await lsCall(r, `op=getBill&id=${lsBill}`);
      if (!gb) { out = true; break; }
      const bill = parseLegiscanBill(gb.body);
      if (!bill || bill.sessionId !== lsSession) { skipped++; checked[c.id] = Date.now(); continue; } // never filed under the wrong session
      let complete = true;
      for (const rc of bill.rollCalls) {
        const res = await lsCall(r, `op=getRollCall&id=${rc.rollCallId}`);
        if (!res) { complete = false; break; }
        const parsed = parseLegiscanRollCall(res.body);
        const rows = parsed ? legiscanVoteRows(parsed, bill, { sessionId: lsSession, number: c.identifier, siteBillId: c.id }, people, members) : null;
        if (!rows) continue;
        mismatches += (await storeVote(db, c.id, rows.vote, Date.now())) ? 1 : 0; votes++;
      }
      bills++;
      if (!complete) { out = true; break; }
      checked[c.id] = Date.now();
    }
    if (out) break;
  }
  // Keep the checked list short: only the last two weeks.
  await setCursor(db, "tx:legiscan:votes:checked", JSON.stringify(Object.fromEntries(Object.entries(checked).filter(([, t]) => t > Date.now() - 2 * WEEK))));
  return { ok: true, bills, votes, mismatches, skipped };
}

/* ------------------------------------------------- Texas Legislature Online --- */

async function tloGet(url: string) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(20_000), cache: "no-store" });
    return { status: res.status, html: res.status === 200 ? await res.text() : "" };
  } catch { return { status: 0, html: "" }; }
}
/** TLO's member and committee codes (for member pages and hearing links), weekly: four pages, three seconds apart. */
async function tloCodes(r: Run) {
  const db = r.db, have = json<{ at: number }>(await getCursor(db, "tx:tlo:codes"));
  if (have && Date.now() - have.at < WEEK) return null;
  const out = { at: Date.now(), members: {} as Record<string, TloCode[]>, committees: {} as Record<string, TloCode[]> };
  for (const [ch, c] of [["upper", "S"], ["lower", "H"]] as const) {
    if (Date.now() > r.deadline - 20_000) return null;
    const m = await tloGet(`${TLO}/Members/Members.aspx?Chamber=${c}`); await sleep(3000);
    const k = await tloGet(`${TLO}/Committees/CommitteesMbrs.aspx?Chamber=${c}`); await sleep(3000);
    r.b.tlo += 2;
    out.members[ch] = parseTloMemberList(m.html); out.committees[ch] = parseTloCommitteeList(k.html);
  }
  await saveBudget(r);
  if (!out.members.lower.length && !out.committees.lower.length) return { refused: true };
  await setCursor(db, "tx:tlo:codes", JSON.stringify(out));
  return { members: out.members.lower.length + out.members.upper.length, committees: out.committees.lower.length + out.committees.upper.length };
}
/**
 * The daily spot check: a few bills' History.aspx pages on TLO against the last action stored from the feed. Counts
 * go to the health probe ("tx:tlo:check"). Off with TEXAS_TLO_CHECK=off.
 */
async function tloSpotCheck(r: Run, plan: SessionPlanItem[]) {
  const db = r.db, day = txToday(Date.now()), prev = json<{ day?: string; history?: unknown[] }>(await getCursor(db, "tx:tlo:check"));
  if (!r.s.tloCheck || r.s.tloBills < 1 || prev?.day === day) return null;
  const rows = await db.select({ id: txBills.id, date: txBills.latestActionDate, description: txBills.latestActionDescription, tloUrl: txBills.tloUrl })
    .from(txBills).where(and(inArray(txBills.session, plan.map(p => p.id)), eq(txBills.feed, "openstates"))).orderBy(desc(txBills.latestActionDate)).limit(r.s.tloBills * 6);
  if (!rows.length) return null;
  const pick = pickSpotCheck(rows, day, r.s.tloBills), results: LastActionCheck[] = [], samples: unknown[] = [];
  let failed = 0;
  for (const b of pick) {
    if (Date.now() > r.deadline - 15_000) break;
    const res = await tloGet(b.tloUrl); r.b.tlo++;
    await sleep(3000);
    if (res.status !== 200 && !(res.status >= 300 && res.status < 400)) { failed++; continue; }
    const h = parseTloHistory(res.html), c = compareLastAction({ date: b.date, description: b.description }, h);
    results.push(c);
    samples.push({ bill: b.id, result: c, stored: { date: b.date, text: b.description }, tlo: h.lastAction, url: b.tloUrl });
  }
  await saveBudget(r);
  if (!results.length) { if (failed) r.out.tloRefused = true; return { failed }; }
  const counts = { ...tallyChecks(results), failed };
  const history = [...(Array.isArray(prev?.history) ? prev!.history : []), { day, ...counts }].slice(-14);
  await setCursor(db, "tx:tlo:check", JSON.stringify({ day, at: Date.now(), ...counts, samples, history }));
  return counts;
}

/* ---------------------------------------------------------------- One link --- */

/** LegiScan (when its key is set) and the TLO spot check. LegiScan fills bills when Open States is off, refused, does not list the session, or is behind on it. */
async function sideSources(r: Run, plan: SessionPlanItem[], today: string) {
  const c = texasConfig(), focus = txSessionState(today).focus.id;
  if (c.legiscan) {
    const behind = readSessionBills(await getCursor(r.db, billsKey(focus))).waiting ?? 1;
    const atSource = plan.find(p => p.id === focus)?.sourceId;
    if (!c.openStates || r.stoppedBy === "rate limited" || !atSource || behind > 0) r.out.legiscan = await viaLegiscan(r);
    if (c.openStates) r.out.legiscanVotes = await legiscanVotes(r, plan);
  }
  // Past sessions for the dashboard (17 Nov): Texas Legislature Online's own statistics pages, a few requests a run, no key
  // needed. It also does the LegiScan step when that key is set, and never lets a counted figure replace an official one.
  if (Date.now() < r.deadline - 60_000) r.out.historyStats = await runTexasHistory({ budgetMs: Math.min(40_000, r.deadline - Date.now() - 30_000), requestBudget: 4 })
    .catch(e => ({ ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 200) }));
  if (r.s.tloCheck && Date.now() < r.deadline - 40_000) {
    r.out.tloCodes = await tloCodes(r);
    r.out.tloCheck = await tloSpotCheck(r, plan);
  }
}

export type TexasLinkResult = { status: "COMPLETE" | "PARTIAL" | "FAILED" | "SKIPPED"; stoppedBy: StoppedBy; requests: number; usedToday: number; daily: number; startUsed: number;
  bills: number; waiting: Record<string, number>; workLeft: boolean; decision: ChainDecision; detail: Record<string, unknown>; error?: string };

/**
 * One run of the Texas loader: up to `budgetMs`, at most `runCap` Open States requests, inside the day's budget.
 * Order: the source's session list (daily), members (weekly), committees (when due), upcoming events (every six
 * hours), then bills session by session (the 2027 session first, then the one before), then LegiScan and the TLO
 * spot check. Returns whether work is left and whether the chain should go on.
 */
export async function runTexasLink(o: { budgetMs: number; runCap?: number; kind: StartKind; link?: number; chain?: string; startUsed?: number }): Promise<TexasLinkResult> {
  const c = texasConfig(), s = txChainSettings(), link = o.link ?? 1, chain = o.chain || crypto.randomUUID();
  const empty = (stoppedBy: StoppedBy, detail: Record<string, unknown>): TexasLinkResult =>
    ({ status: "SKIPPED", stoppedBy, requests: 0, usedToday: 0, daily: s.dailyRequests, startUsed: o.startUsed ?? 0, bills: 0, waiting: {}, workLeft: false,
      decision: chainDecision({ link, maxLinks: s.maxLinks, stoppedBy, workLeft: false, dailyLeft: 0, startLeft: 0 }), detail });
  if (!c.openStates && !c.legiscan) return empty("no key", { skipped: "OPENSTATES_API_KEY and LEGISCAN_API_KEY are not set" });
  const db = getDb(), started = Date.now(), owner = crypto.randomUUID();
  if (!(await takeLock(db, owner, chain, o.budgetMs + 60_000))) return empty("busy", { skipped: "another Texas load is running" });
  const r: Run = { db, started, deadline: started + o.budgetMs, s, b: readBudget(await getCursor(db, "tx:budget"), started), runCap: o.runCap ?? 100_000, runUsed: 0, startUsed: o.startUsed ?? 0, stoppedBy: null, out: {} };
  const id = crypto.randomUUID();
  await db.insert(ingestRuns).values({ id, job: "texas", status: "RUNNING", startedAt: started, detail: { link, kind: o.kind } });
  let error: string | null = null, bills = 0, workLeft = false;
  const waiting: Record<string, number> = {};
  try {
    const allowed = mayStart(r.b, s, o.kind, started);
    if (!allowed.ok) { r.stoppedBy = r.b.limitedAt ? "rate limited" : "daily budget"; r.out.notStarted = allowed.reason; }
    else if (r.b.limitedAt) { r.b = clearLimitForStart(r.b, o.kind); await saveBudget(r); }
    const today = txToday(started);
    let plan = planSessions(today, (await sourceSessions(db))?.sessions ?? null);
    if (c.openStates && !r.stoppedBy) {
      const listed = await readSessions(r);
      plan = planSessions(today, listed?.sessions ?? null);
      await readPeople(r, today);
      // Committees get a bounded share of a short run; a chain link may walk them all.
      const cmteLeft = await readCommittees(r, o.runCap ? committeeRequestCap(o.runCap - r.runUsed) : 12);
      const eventsLeft = await readEvents(r, today);
      // LegiScan and the TLO check go before bills: bills can fill every link while a backlog lasts, and these are daily and small.
      await sideSources(r, plan, today);
      let votes = 0, mismatches = 0, refused = 0;
      const notAtSource: string[] = [];
      for (const p of plan) {
        if (!p.sourceId) { notAtSource.push(p.id); continue; }
        if (r.stoppedBy) { workLeft = true; break; }
        const x = await loadSessionBills(r, p);
        bills += x.bills; votes += x.votes; mismatches += x.mismatches; refused += x.refused; waiting[p.id] = x.waiting;
        if (!x.caughtUp) workLeft = true;
      }
      // Sessions not reached this time keep their saved place; report what each was waiting on.
      for (const p of plan) if (p.sourceId && !(p.id in waiting)) waiting[p.id] = readSessionBills(await getCursor(db, billsKey(p.id))).waiting ?? 0;
      workLeft = workLeft || cmteLeft || eventsLeft;
      Object.assign(r.out, { sessions: plan.map(p => p.id), notAtSource, unknownSessions: plan.filter(p => !p.known).map(p => p.id), bills, votes, mismatches, refused,
        backlog: Object.fromEntries(Object.entries(waiting).map(([k, v]) => [k, waitingPages(v)])) });
    }
    else await sideSources(r, plan, today);
  } catch (e) { error = (e instanceof Error ? e.message : String(e)).slice(0, 300); }
  const stoppedBy: StoppedBy = error ? "error" : r.stoppedBy ?? (workLeft ? "time" : "nothing left");
  const decision = chainDecision({ link, maxLinks: s.maxLinks, stoppedBy, workLeft, dailyLeft: s.dailyRequests - r.b.used, startLeft: s.perStart - r.startUsed });
  const status = error ? "FAILED" : r.out.notStarted ? "SKIPPED" : workLeft ? "PARTIAL" : "COMPLETE";
  await db.update(ingestRuns).set({ status: status === "SKIPPED" ? "COMPLETE" : status, finishedAt: Date.now(), detail: { link, kind: o.kind, stoppedBy, requests: r.runUsed, ...r.out }, error }).where(eq(ingestRuns.id, id));
  await releaseLock(db, owner, decision.next ? { chain, ms: 90_000 } : null).catch(() => null);
  return { status, stoppedBy, requests: r.runUsed, usedToday: r.b.used, daily: s.dailyRequests, startUsed: r.startUsed, bills, waiting, workLeft, decision, detail: { chain, ...r.out }, ...(error ? { error } : {}) };
}

/** The scheduled update's short run (TEXAS_MAX_REQUESTS_PER_RUN requests). The back-to-back chain does the rest. */
export async function runTexasIngest({ budgetMs = 60_000 }: { budgetMs?: number } = {}) {
  const c = texasConfig();
  if (!c.openStates && !c.legiscan) return { ok: true, skipped: "OPENSTATES_API_KEY and LEGISCAN_API_KEY are not set" };
  const run = await runTexasLink({ budgetMs, runCap: c.maxRequests, kind: "scheduled" });
  // `continues`, `chain` and `startUsed` let the scheduled update hand over to link 2 of this same chain (the lock is kept for it).
  return { ok: run.status !== "FAILED", ...(run.error ? { error: run.error } : {}), stoppedBy: run.stoppedBy, requests: run.requests, usedToday: run.usedToday, ...run.detail,
    continues: run.decision.next, chain: String(run.detail.chain ?? ""), startUsed: run.startUsed };
}

/* ------------------------------------------------------------------- Probe --- */

/** The plain one-line state of a session's bills: "2027 bills: 1,240 stored, about 300 waiting." */
export function billsStateLine(year: string, stored: number, waiting: number | null, caughtUp: boolean) {
  const n = (x: number) => x.toLocaleString("en-US");
  if (stored === 0 && !waiting) return `${year} bills: none stored yet.`;
  if (waiting && waiting > 0) return `${year} bills: ${n(stored)} stored, about ${n(waiting)} waiting.`;
  return `${year} bills: ${n(stored)} stored${caughtUp ? ", up to date with the source" : ""}.`;
}

/** Counts only, for the health probe: members by chamber against the seats, committees by chamber, bills by session, hearings, the request budget, the TLO check, and readiness. */
export async function texasCounts(now = Date.now()) {
  const db = getDb(), c = texasConfig(), s = txChainSettings(), today = txToday(now), st = txSessionState(today);
  const count = async (q: Promise<{ n: number } | undefined>) => Number((await q)?.n ?? 0);
  const [seatRows, bills, votes, legiscanVoteCount, badVotes, events, hearingsWithBills, last, bySession, cmte, cmteMembers, newestAction, newestBill, listed, peopleStats, cmteAt, cmteWalk, budgetRaw, tloRaw, eventsAt, lockRaw] = await Promise.all([
    db.select({ chamber: txPeople.chamber, district: txPeople.district }).from(txPeople).where(eq(txPeople.isCurrent, 1)),
    count(db.select({ n: sql<number>`count(*)` }).from(txBills).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(txVotes).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(txVotes).where(like(txVotes.id, "legiscan-%")).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(txVotes).where(eq(txVotes.tallyOk, 0)).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(txEvents).where(sql`${txEvents.start} >= ${today}`).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(txEvents).where(sql`${txEvents.start} >= ${today} and json_array_length(coalesce(${txEvents.bills}, '[]')) > 0`).get()),
    db.select().from(ingestRuns).where(eq(ingestRuns.job, "texas")).orderBy(desc(ingestRuns.startedAt)).limit(1).get(),
    db.select({ session: txBills.session, n: sql<number>`count(*)`, newest: sql<string | null>`max(${txBills.latestActionDate})`, newestFiling: sql<string | null>`max(${txBills.firstActionDate})` }).from(txBills).groupBy(txBills.session),
    db.select({ chamber: txCommittees.chamber, n: sql<number>`count(*)` }).from(txCommittees).groupBy(txCommittees.chamber),
    db.select({ members: sql<number>`count(*)`, committees: sql<number>`count(distinct ${txCommitteeMembers.committeeId})` }).from(txCommitteeMembers).get(),
    db.select({ d: sql<string | null>`max(${txBillActions.date})` }).from(txBillActions).get(),
    db.select({ d: sql<string | null>`max(${txBills.latestActionDate})` }).from(txBills).get(),
    sourceSessions(db), getCursor(db, "tx:people:stats"), getCursor(db, "tx:committees"), getCursor(db, "tx:committees:walk"), getCursor(db, "tx:budget"), getCursor(db, "tx:tlo:check"),
    getCursor(db, "tx:events"), getCursor(db, LOCK),
  ]);
  const seats = txSeatCoverage(seatRows), billsBySession = Object.fromEntries(bySession.map(x => [x.session, Number(x.n)]));
  const newestBillAction = [newestAction?.d, newestBill?.d].filter((d): d is string => !!d).sort().pop() ?? null;
  const plan = planSessions(today, listed?.sessions ?? null), backlogPages: Record<string, number> = {}, loading: Record<string, { stored: number; waiting: number | null; newestFiling: string | null; newestAction: string | null; passUnderWay: boolean; everythingUpTo: string | null; line: string }> = {};
  for (const p of plan) {
    const sb = readSessionBills(await getCursor(db, billsKey(p.id)));
    const b = json<{ pages?: number }>(await getCursor(db, `tx:bills:${p.id}:backlog`));
    if (b && typeof b.pages === "number") backlogPages[p.id] = b.pages;
    const row = bySession.find(x => x.session === p.id), stored = Number(row?.n ?? 0);
    loading[p.id] = { stored, waiting: sb.waiting, newestFiling: row?.newestFiling ?? null, newestAction: row?.newest ?? null, passUnderWay: sb.main.page > 1, everythingUpTo: sb.mark,
      line: billsStateLine(((ts?: TxSession) => ts ? (ts.regular ? ts.start.slice(0, 4) : ts.name) : p.name)(TX_SESSIONS.find(x => x.id === p.id)), stored, sb.waiting, sb.main.page === 1 && !!sb.mark) };
  }
  const lastRun = last ? { status: last.status, startedAt: new Date(last.startedAt).toISOString(), error: last.error?.slice(0, 160) ?? null, detail: last.detail ?? null } : null;
  const ready = txReadiness({ today, openStates: c.openStates, legiscan: c.legiscan, billsBySession, newestActionDate: bySession.find(x => x.session === st.focus.id)?.newest ?? null,
    sourceSessions: listed?.sessions ?? null, backlogPages, lastRun, nowMs: now });
  const byChamber = (ch: string | null) => Number(cmte.find(x => x.chamber === ch)?.n ?? 0), cal = txCalendar(today);
  const budget = readBudget(budgetRaw, now), tlo = json<Record<string, unknown>>(tloRaw), lock = readLock(lockRaw);
  return { openStatesConfigured: c.openStates, legiscanConfigured: c.legiscan,
    line: loading[st.focus.id]?.line ?? null,
    people: seatRows.length,
    members: { senators: seats.senators, representatives: seats.representatives, seatsExpected: seats.expected, seatsNotInSource: seats.notInSource, missingDistricts: seats.notInSource <= 20 ? seats.missing : "more than 20 (the list has not fully loaded)",
      seatsFilled: seats.filled, doubled: seats.doubled, unexpected: seats.unexpected, line: seatLine(seats), lastList: json<Record<string, unknown>>(peopleStats) },
    committees: { total: cmte.reduce((n, x) => n + Number(x.n), 0), senate: byChamber("upper"), house: byChamber("lower"), joint: byChamber("legislature"), chamberUnknown: byChamber(null),
      memberships: Number(cmteMembers?.members ?? 0), committeesWithMembers: Number(cmteMembers?.committees ?? 0),
      lastFullRead: Number(cmteAt) > 0 ? new Date(Number(cmteAt)).toISOString() : null, readInProgress: readCommitteeWalk(cmteWalk) },
    bills, billsBySession, billLoading: loading, newestBillAction, votes, votesFromLegiscan: legiscanVoteCount, tallyMismatches: badVotes,
    upcomingEvents: events, hearingsUpcoming: { total: events, withBills: hearingsWithBills, lastFullRead: Number(eventsAt) > 0 ? new Date(Number(eventsAt)).toISOString() : null },
    requestBudget: { day: budget.day, openStatesUsed: budget.used, openStatesDaily: s.dailyRequests, perMinute: s.perMinute, perStart: s.perStart, legiscanUsed: budget.legiscan, legiscanDaily: s.legiscanDaily,
      tloPagesRead: budget.tlo, rateLimitedAt: budget.limitedAt ? new Date(budget.limitedAt).toISOString() : null, running: !!lock && lock.until > now },
    tloCheck: !s.tloCheck ? "switched off (TEXAS_TLO_CHECK=off)" : tlo ? { day: tlo.day, checked: tlo.checked, agree: tlo.agree, sameDayOtherAction: tlo.sameDayOtherAction, mismatches: tlo.mismatches,
      feedBehind: tlo.feedBehind, feedAhead: tlo.feedAhead, notOnTlo: tlo.notOnTlo, failed: tlo.failed, samples: tlo.samples, history: tlo.history } : "not run yet",
    session: { today, current: st.current.id, inSession: st.inSession, upcoming: st.upcoming?.id ?? null, focus: st.focus.id, daysUntilUpcoming: st.daysUntilUpcoming },
    sourceSessions: listed ? { readAt: new Date(listed.at).toISOString(), identifiers: listed.sessions.map(x => x.identifier), loading: plan.map(p => ({ id: p.id, atSource: p.sourceId, known: p.known })) } : null,
    billBacklogPages: backlogPages, readyForSession: ready.readyForSession, readyFor: ready.sessionName, notReadyReasons: ready.reasons, notes: ready.notes,
    calendar: { session: cal.session?.id ?? null, dates: cal.rows.length, next: cal.next ? { date: cal.next.date, label: cal.next.label, daysAway: cal.next.daysAway } : null },
    lastRun };
}
