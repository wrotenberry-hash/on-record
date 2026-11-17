import { and, desc, eq, lt, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ingestRuns, txSessionStats, txBillActions, txBills, txBillSponsors, txBillVersions, txCommitteeMembers, txCommittees, txEvents, txMemberVotes, txPeople, txVotes } from "@/db/schema";
import { chunked, getCursor, setCursor } from "@/lib/federal/ingest";
import { LEGISCAN_BASE, legiscanStage, OPENSTATES_BASE, parseLegiscanMasterList, parseOpenStatesBills, parseOpenStatesCommitteePage, parseOpenStatesEvents,
  parseOpenStatesPeople, tloBillUrl, txBillId, txStage, txTallyMismatch, TX_SESSIONS, type TxBill } from "@/lib/texas/parse";
import { tloSessionCode, txCalendar, txSessionState, txToday } from "@/lib/texas/calendar";
import { advanceBillCursor, billUpdatedAts, committeeRequestCap, matchLegiscanSession, nextCommitteeStep, parseOpenStatesSessions, peoplePageKinds, peopleRefreshMs, planSessions,
  readBillCursor, readCommitteeWalk, seatLine, startCommitteeWalk, txReadiness, txSeatCoverage, type LegiscanSession, type SourceSession } from "@/lib/texas/coverage";

/**
 * Round H: Texas Legislature ingestion. Open States v3 (OPENSTATES_API_KEY) is
 * the primary feed; LegiScan (LEGISCAN_API_KEY) fills in bills and status when
 * Open States is missing or failing; every bill links to Texas Legislature
 * Online as the source of record. No model calls. Requests per run are capped
 * (TEXAS_MAX_REQUESTS_PER_RUN, default 12) to respect the free API limits.
 */
type Db = ReturnType<typeof getDb>;
const UA = "OnRecord/0.2 (+https://on-record-wrotenberry.vercel.app)";
const DAY = 86400e3, WEEK = 7 * DAY;
const base = () => process.env.OPENSTATES_BASE?.trim() || OPENSTATES_BASE;
const lsBase = () => process.env.LEGISCAN_BASE?.trim() || LEGISCAN_BASE;

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
  let mismatches = 0;
  for (const v of b.votes) {
    const bad = txTallyMismatch(v); if (bad) mismatches++;
    await db.insert(txVotes).values({ id: v.id, billId: id, motion: v.motion, date: v.date, result: v.result, chamber: v.chamber, counts: v.counts, tallyOk: bad ? 0 : 1, retrievedAt: now })
      .onConflictDoUpdate({ target: txVotes.id, set: { motion: v.motion, result: v.result, counts: v.counts, tallyOk: bad ? 0 : 1, retrievedAt: now } });
    await db.delete(txMemberVotes).where(eq(txMemberVotes.voteId, v.id));
    if (v.votes.length) await chunked(v.votes, 100, part => db.insert(txMemberVotes).values(part.map(x => ({ voteId: v.id, personId: x.personId, name: x.name || "Unknown", option: x.option }))).onConflictDoNothing());
  }
  return { stage, votes: b.votes.length, mismatches };
}

/** The source's own list of Texas sessions, kept in a cursor (read once a day). Null until it has been read. */
async function sourceSessions(db: Db): Promise<{ at: number; sessions: SourceSession[] } | null> {
  try { const v = JSON.parse(await getCursor(db, "tx:source-sessions") ?? "null") as { at?: number; sessions?: SourceSession[] } | null;
    return v && typeof v.at === "number" && Array.isArray(v.sessions) && v.sessions.length ? { at: v.at, sessions: v.sessions } : null; } catch { return null; }
}

/**
 * Open States: the source's session list daily; people weekly (daily around the start of a regular session);
 * committees weekly, a few pages a run; upcoming events each run; then bills, oldest update first from a saved
 * watermark, so each run carries on where the last one stopped.
 */
async function viaOpenStates(db: Db, deadline: number, budget: { left: number }) {
  const c = texasConfig(), h = { "X-API-KEY": c.osKey }, now = Date.now(), out: Record<string, unknown> = {};
  let limited = false;
  const call = async (path: string) => { if (limited || budget.left <= 0 || Date.now() > deadline - 8000) return null; budget.left--; const r = await getJson(`${base()}${path}`, h); if (r.status === 429) { limited = true; out.rateLimited = true; } return r; };
  const today = txToday(now);
  // Sessions: which ones the source lists, so a session it does not have yet (or one the site does not know) is reported, not missed.
  let listed = await sourceSessions(db);
  if (now - (listed?.at ?? 0) > DAY) {
    const r = await call(`/jurisdictions/tx?include=legislative_sessions`);
    const found = r?.body ? parseOpenStatesSessions(r.body) : [];
    if (found.length) { listed = { at: now, sessions: found }; await setCursor(db, "tx:source-sessions", JSON.stringify(listed)); }
    out.sourceSessions = found.length;
  }
  if (Date.now() - Number(await getCursor(db, "tx:people") ?? 0) > peopleRefreshMs(today)) {
    let page = 1, max = 1, people = 0, failed = false;
    const kinds = { listed: 0, legislators: 0, other: 0, noDistrict: 0, total: null as number | null };
    do { const r = await call(`/people?jurisdiction=tx&per_page=50&page=${page}`); if (!r?.body) { failed = true; break; }
      const p = parseOpenStatesPeople(r.body); max = p.maxPage;
      if (p.people.length) await db.insert(txPeople).values(p.people.map(x => ({ ...x, isCurrent: 1, sourceUrl: `${OPENSTATES_BASE}/people?jurisdiction=tx`, retrievedAt: now })))
        .onConflictDoUpdate({ target: txPeople.id, set: { name: sql`excluded.name`, party: sql`excluded.party`, chamber: sql`excluded.chamber`, district: sql`excluded.district`, title: sql`excluded.title`, isCurrent: 1, retrievedAt: now } });
      people += p.people.length; page++;
      const k = peoplePageKinds(r.body); kinds.listed += k.listed; kinds.legislators += k.legislators; kinds.other += k.other; kinds.noDistrict += k.noDistrict; kinds.total = k.total ?? kinds.total;
    } while (page <= max);
    // Only when every page was read (and it looks like a real list) are members missing from it marked as no longer serving.
    const complete = !failed && people >= 100;
    if (complete) await db.update(txPeople).set({ isCurrent: 0 }).where(and(eq(txPeople.isCurrent, 1), lt(txPeople.retrievedAt, now)));
    if (complete) await setCursor(db, "tx:people", String(now));
    await setCursor(db, "tx:people:stats", JSON.stringify({ at: now, complete, pagesRead: page - 1, pages: max, ...kinds, stored: people }));
    out.people = people; out.peopleComplete = complete;
  }
  // Committees: every page of each chamber (Senate, House, joint), at most a few requests a run; the place is saved between runs.
  let walk = readCommitteeWalk(await getCursor(db, "tx:committees:walk"));
  if (!walk && Date.now() - Number(await getCursor(db, "tx:committees") ?? 0) > WEEK) walk = startCommitteeWalk(now);
  if (walk) {
    let left = committeeRequestCap(budget.left), stored = 0, finished = false;
    while (walk && left-- > 0) {
      const r = await call(`/committees?jurisdiction=tx&classification=committee&chamber=${walk.chamber}&include=memberships&per_page=20&page=${walk.page}`);
      if (!r) break;
      const pastEnd = !r.body && r.status === 404 && walk.page > 1;
      if (!r.body && !pastEnd) { out.committeesRefused = r.status; break; }
      const pg = parseOpenStatesCommitteePage(r.body, walk.chamber);
      for (const cm of pg.committees) {
        await db.insert(txCommittees).values({ id: cm.id, name: cm.name, chamber: cm.chamber, retrievedAt: now }).onConflictDoUpdate({ target: txCommittees.id, set: { name: cm.name, chamber: cm.chamber, retrievedAt: now } });
        await db.delete(txCommitteeMembers).where(eq(txCommitteeMembers.committeeId, cm.id));
        if (cm.members.length) await chunked(cm.members, 50, part => db.insert(txCommitteeMembers).values(part.map(m => ({ committeeId: cm.id, name: m.name, personId: m.personId, role: m.role }))).onConflictDoNothing());
      }
      stored += pg.committees.length;
      const next = nextCommitteeStep(walk, { count: pg.committees.length, maxPage: pg.maxPage, pastEnd });
      if (next === "done") {
        // The whole list was read: committees that were not in it are gone from the source, so they go from here too.
        const startedAt = walk.startedAt, total = walk.stored + pg.committees.length;
        if (total > 0) {
          await db.delete(txCommittees).where(lt(txCommittees.retrievedAt, startedAt));
          const keep = (await db.select({ id: txCommittees.id }).from(txCommittees)).map(x => x.id);
          if (keep.length) await db.delete(txCommitteeMembers).where(notInArray(txCommitteeMembers.committeeId, keep));
        }
        await setCursor(db, "tx:committees", String(now)); await setCursor(db, "tx:committees:walk", "");
        walk = null; finished = true; out.committeesTotal = total;
      } else { walk = next; await setCursor(db, "tx:committees:walk", JSON.stringify(walk)); }
    }
    out.committees = stored; out.committeesDone = finished;
  }
  const ev = await call(`/events?jurisdiction=tx&after=${today}&per_page=20`);
  const events = ev?.body ? parseOpenStatesEvents(ev.body) : [];
  if (events.length) await db.insert(txEvents).values(events.map(e => ({ ...e, retrievedAt: now }))).onConflictDoUpdate({ target: txEvents.id, set: { name: sql`excluded.name`, start: sql`excluded.start`, location: sql`excluded.location`, bills: sql`excluded.bills`, retrievedAt: now } });
  out.events = events.length;
  // Bills: the session readers care about first (the one in progress, else the upcoming one: prefiling for the 90th opened on 9 Nov 2026), then the one before it.
  const plan = planSessions(today, listed?.sessions ?? null), runIso = new Date(now).toISOString();
  let bills = 0, votes = 0, mismatches = 0, refused = 0;
  const backlog: Record<string, number> = {}, notAtSource: string[] = [];
  for (const s of plan) {
    if (!s.sourceId) { notAtSource.push(s.id); continue; }
    const key = `tx:bills:${s.id}`;
    let cur = readBillCursor(await getCursor(db, key), await getCursor(db, `${key}:page`));
    for (;;) {
      const r = await call(`/bills?jurisdiction=tx&session=${encodeURIComponent(s.sourceId)}&sort=updated_asc&include=actions&include=votes&include=sponsorships&include=versions&per_page=20&page=${cur.page}${cur.since ? `&updated_since=${encodeURIComponent(cur.since)}` : ""}`);
      if (!r) break;
      if (!r.body) {
        // A page past the end means the list changed under the saved page: start that second again from page 1.
        if (r.status === 404 && cur.page > 1) { cur = { since: cur.since, page: 1 }; await setCursor(db, `${key}:page`, "1"); }
        if (r.status !== 429) refused++;
        break;
      }
      const parsed = parseOpenStatesBills(r.body), seen = billUpdatedAts(r.body);
      for (const b of parsed.bills) { const x = await storeBill(db, { ...b, session: s.id }, now); bills++; votes += x.votes; mismatches += x.mismatches; }
      const step = advanceBillCursor(cur, { count: seen.count, updated: seen.updated, maxPage: parsed.maxPage }, runIso);
      cur = step.cursor; backlog[s.id] = step.remainingPages;
      if (cur.since) await setCursor(db, key, cur.since);
      await setCursor(db, `${key}:page`, String(cur.page));
      await setCursor(db, `${key}:backlog`, JSON.stringify({ at: now, pages: step.remainingPages, caughtUp: step.caughtUp }));
      if (step.caughtUp) break;
    }
  }
  return { ...out, sessions: plan.map(s => s.id), notAtSource, unknownSessions: plan.filter(s => !s.known).map(s => s.id), backlog, bills, votes, mismatches, refused };
}

/**
 * LegiScan: bill numbers, titles and status (no votes) for the session readers care about now, when Open States is
 * unavailable, refuses, does not list that session yet, or is still far behind on it. One request for the session
 * list and one for the whole bill list. A session LegiScan does not list is reported, never filed under another one.
 */
async function viaLegiscan(db: Db) {
  const c = texasConfig(), now = Date.now(), focus = txSessionState(txToday(now)).focus;
  const sl = await getJson(`${lsBase()}/?key=${encodeURIComponent(c.lsKey)}&op=getSessionList&state=TX`, {});
  const sessions = (sl.body as { sessions?: LegiscanSession[] } | null)?.sessions;
  if (!Array.isArray(sessions)) return { ok: false, error: `LegiScan session list ${sl.status}` };
  const target = matchLegiscanSession(sessions, focus), session = focus;
  if (!target?.session_id) return { ok: false, error: `LegiScan does not list the ${focus.name} yet`, session: focus.id };
  const ml = await getJson(`${lsBase()}/?key=${encodeURIComponent(c.lsKey)}&op=getMasterList&id=${target.session_id}`, {});
  const list = parseLegiscanMasterList(ml.body);
  // One read of what is already stored, then batches: a regular session has thousands of bills.
  const have = new Map((await db.select({ id: txBills.id, feed: txBills.feed, date: txBills.latestActionDate, stage: txBills.stage }).from(txBills).where(eq(txBills.session, session.id))).map(r => [r.id, r]));
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
  return { ok: true, legiscanBills: list.length, written: rows.length, session: session.id };
}

/** Round I: Texas session statistics by stage from LegiScan master lists (one request per session), weekly. */
async function legiscanHistory(db: Db) {
  const c = texasConfig(), now = Date.now();
  if (!c.legiscan || now - Number(await getCursor(db, "tx:history") ?? 0) < WEEK) return { skipped: true };
  const sl = await getJson(`${lsBase()}/?key=${encodeURIComponent(c.lsKey)}&op=getSessionList&state=TX`, {});
  const sessions = (sl.body as { sessions?: LegiscanSession[] } | null)?.sessions ?? [];
  let stored = 0;
  for (const s of TX_SESSIONS.filter(x => x.start <= txToday(now))) {
    const match = matchLegiscanSession(sessions, s);
    if (!match?.session_id) continue;
    const ml = await getJson(`${lsBase()}/?key=${encodeURIComponent(c.lsKey)}&op=getMasterList&id=${match.session_id}`, {});
    const list = parseLegiscanMasterList(ml.body);
    if (!list.length) continue;
    const counts: Record<string, number> = {};
    for (const b of list) { const st = legiscanStage(b.status); counts[st] = (counts[st] ?? 0) + 1; }
    await db.insert(txSessionStats).values({ session: s.id, counts, source: `LegiScan master list, session ${match.session_id}`, retrievedAt: now })
      .onConflictDoUpdate({ target: txSessionStats.session, set: { counts, source: `LegiScan master list, session ${match.session_id}`, retrievedAt: now } });
    stored++;
  }
  await setCursor(db, "tx:history", String(now));
  return { sessions: stored };
}

export async function runTexasIngest({ budgetMs = 60_000 }: { budgetMs?: number } = {}) {
  const c = texasConfig();
  if (!c.openStates && !c.legiscan) return { ok: true, skipped: "OPENSTATES_API_KEY and LEGISCAN_API_KEY are not set" };
  const db = getDb(), started = Date.now(), deadline = started + budgetMs, id = crypto.randomUUID();
  await db.insert(ingestRuns).values({ id, job: "texas", status: "RUNNING", startedAt: started, detail: {} });
  let detail: Record<string, unknown> = {}, ok = true, error: string | null = null;
  try {
    if (c.openStates) detail = await viaOpenStates(db, deadline, { left: c.maxRequests });
    // LegiScan fills the gap when Open States is off, refused a request, does not list the session yet, or is far behind on it.
    const focus = txSessionState(txToday(started)).focus.id;
    const gap = !c.openStates || (detail.refused as number) > 0 || ((detail.notAtSource as string[] | undefined) ?? []).includes(focus) || (((detail.backlog as Record<string, number> | undefined) ?? {})[focus] ?? 0) > 0;
    if (c.legiscan && gap) detail.legiscan = await viaLegiscan(db);
    if (c.legiscan) detail.history = await legiscanHistory(db);
  } catch (e) { ok = false; error = (e instanceof Error ? e.message : String(e)).slice(0, 300); }
  await db.update(ingestRuns).set({ status: ok ? "COMPLETE" : "FAILED", finishedAt: Date.now(), detail, error }).where(eq(ingestRuns.id, id));
  return { ok, ...(error ? { error } : {}), ...detail };
}

/** Counts only, for the health probe: members by chamber against the seats, committees by chamber, bills by session, and whether bill coverage is ready for the session. */
export async function texasCounts(now = Date.now()) {
  const db = getDb(), c = texasConfig(), today = txToday(now), st = txSessionState(today), json = <T,>(v: string | null): T | null => { try { return v ? JSON.parse(v) as T : null; } catch { return null; } };
  const count = async (q: Promise<{ n: number } | undefined>) => Number((await q)?.n ?? 0);
  const [seatRows, bills, votes, badVotes, events, last, bySession, cmte, cmteMembers, newestAction, newestBill, listed, peopleStats, cmteAt, cmteWalk] = await Promise.all([
    db.select({ chamber: txPeople.chamber, district: txPeople.district }).from(txPeople).where(eq(txPeople.isCurrent, 1)),
    count(db.select({ n: sql<number>`count(*)` }).from(txBills).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(txVotes).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(txVotes).where(eq(txVotes.tallyOk, 0)).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(txEvents).where(sql`${txEvents.start} >= ${today}`).get()),
    db.select().from(ingestRuns).where(eq(ingestRuns.job, "texas")).orderBy(desc(ingestRuns.startedAt)).limit(1).get(),
    db.select({ session: txBills.session, n: sql<number>`count(*)`, newest: sql<string | null>`max(${txBills.latestActionDate})` }).from(txBills).groupBy(txBills.session),
    db.select({ chamber: txCommittees.chamber, n: sql<number>`count(*)` }).from(txCommittees).groupBy(txCommittees.chamber),
    db.select({ members: sql<number>`count(*)`, committees: sql<number>`count(distinct ${txCommitteeMembers.committeeId})` }).from(txCommitteeMembers).get(),
    db.select({ d: sql<string | null>`max(${txBillActions.date})` }).from(txBillActions).get(),
    db.select({ d: sql<string | null>`max(${txBills.latestActionDate})` }).from(txBills).get(),
    sourceSessions(db), getCursor(db, "tx:people:stats"), getCursor(db, "tx:committees"), getCursor(db, "tx:committees:walk"),
  ]);
  const seats = txSeatCoverage(seatRows), billsBySession = Object.fromEntries(bySession.map(s => [s.session, Number(s.n)]));
  const newestBillAction = [newestAction?.d, newestBill?.d].filter((d): d is string => !!d).sort().pop() ?? null;
  const plan = planSessions(today, listed?.sessions ?? null), backlogPages: Record<string, number> = {};
  for (const p of plan) { const b = json<{ pages?: number }>(await getCursor(db, `tx:bills:${p.id}:backlog`)); if (b && typeof b.pages === "number") backlogPages[p.id] = b.pages; }
  const lastRun = last ? { status: last.status, startedAt: new Date(last.startedAt).toISOString(), error: last.error?.slice(0, 160) ?? null } : null;
  const ready = txReadiness({ today, openStates: c.openStates, legiscan: c.legiscan, billsBySession, newestActionDate: bySession.find(s => s.session === st.focus.id)?.newest ?? null,
    sourceSessions: listed?.sessions ?? null, backlogPages, lastRun, nowMs: now });
  const byChamber = (ch: string | null) => Number(cmte.find(x => x.chamber === ch)?.n ?? 0), cal = txCalendar(today);
  return { openStatesConfigured: c.openStates, legiscanConfigured: c.legiscan,
    people: seatRows.length,
    members: { senators: seats.senators, representatives: seats.representatives, seatsExpected: seats.expected, seatsNotInSource: seats.notInSource, missingDistricts: seats.notInSource <= 20 ? seats.missing : "more than 20 (the list has not fully loaded)",
      seatsFilled: seats.filled, doubled: seats.doubled, unexpected: seats.unexpected, line: seatLine(seats), lastList: json<Record<string, unknown>>(peopleStats) },
    committees: { total: cmte.reduce((n, x) => n + Number(x.n), 0), senate: byChamber("upper"), house: byChamber("lower"), joint: byChamber("legislature"), chamberUnknown: byChamber(null),
      memberships: Number(cmteMembers?.members ?? 0), committeesWithMembers: Number(cmteMembers?.committees ?? 0),
      lastFullRead: Number(cmteAt) > 0 ? new Date(Number(cmteAt)).toISOString() : null, readInProgress: readCommitteeWalk(cmteWalk) },
    bills, billsBySession, newestBillAction, votes, tallyMismatches: badVotes, upcomingEvents: events,
    session: { today, current: st.current.id, inSession: st.inSession, upcoming: st.upcoming?.id ?? null, focus: st.focus.id, daysUntilUpcoming: st.daysUntilUpcoming },
    sourceSessions: listed ? { readAt: new Date(listed.at).toISOString(), identifiers: listed.sessions.map(s => s.identifier), loading: plan.map(p => ({ id: p.id, atSource: p.sourceId, known: p.known })) } : null,
    billBacklogPages: backlogPages, readyForSession: ready.readyForSession, readyFor: ready.sessionName, notReadyReasons: ready.reasons, notes: ready.notes,
    calendar: { session: cal.session?.id ?? null, dates: cal.rows.length, next: cal.next ? { date: cal.next.date, label: cal.next.label, daysAway: cal.next.daysAway } : null },
    lastRun };
}
