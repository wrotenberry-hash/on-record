import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ingestRuns, txBillActions, txBills, txBillSponsors, txBillVersions, txCommitteeMembers, txCommittees, txEvents, txMemberVotes, txPeople, txVotes } from "@/db/schema";
import { chunked, getCursor, setCursor } from "@/lib/federal/ingest";
import { currentTxSession, LEGISCAN_BASE, legiscanStage, OPENSTATES_BASE, parseLegiscanMasterList, parseOpenStatesBills, parseOpenStatesCommittees, parseOpenStatesEvents,
  parseOpenStatesPeople, tloBillUrl, txBillId, txStage, txTallyMismatch, TX_SESSIONS, type TxBill } from "@/lib/texas/parse";

/**
 * Round H: Texas Legislature ingestion. Open States v3 (OPENSTATES_API_KEY) is
 * the primary feed; LegiScan (LEGISCAN_API_KEY) fills in bills and status when
 * Open States is missing or failing; every bill links to Texas Legislature
 * Online as the source of record. No model calls. Requests per run are capped
 * (TEXAS_MAX_REQUESTS_PER_RUN, default 12) to respect the free API limits.
 */
type Db = ReturnType<typeof getDb>;
const UA = "OnRecord/0.2 (+https://on-record-wrotenberry.vercel.app)";
const WEEK = 7 * 86400e3;
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
    firstActionDate: b.firstActionDate, latestActionDate: b.latestActionDate, latestActionDescription: b.latestActionDescription, tloUrl: tloBillUrl(s?.tlo ?? `${b.session}R`, b.identifier),
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

/** Open States: people weekly, committees weekly, upcoming events each run, then bills updated since the cursor (newest first). */
async function viaOpenStates(db: Db, deadline: number, budget: { left: number }) {
  const c = texasConfig(), h = { "X-API-KEY": c.osKey }, now = Date.now(), out: Record<string, unknown> = {};
  const call = async (path: string) => { if (budget.left <= 0 || Date.now() > deadline - 8000) return null; budget.left--; return getJson(`${base()}${path}`, h); };
  if (Date.now() - Number(await getCursor(db, "tx:people") ?? 0) > WEEK) {
    let page = 1, max = 1, people = 0, failed = false;
    do { const r = await call(`/people?jurisdiction=tx&per_page=50&page=${page}`); if (!r?.body) { failed = true; break; }
      const p = parseOpenStatesPeople(r.body); max = p.maxPage;
      if (page === 1) await db.update(txPeople).set({ isCurrent: 0 });
      if (p.people.length) await db.insert(txPeople).values(p.people.map(x => ({ ...x, isCurrent: 1, sourceUrl: `${OPENSTATES_BASE}/people?jurisdiction=tx`, retrievedAt: now })))
        .onConflictDoUpdate({ target: txPeople.id, set: { name: sql`excluded.name`, party: sql`excluded.party`, chamber: sql`excluded.chamber`, district: sql`excluded.district`, title: sql`excluded.title`, isCurrent: 1, retrievedAt: now } });
      people += p.people.length; page++;
    } while (page <= max);
    if (!failed) await setCursor(db, "tx:people", String(now));
    out.people = people;
  }
  if (Date.now() - Number(await getCursor(db, "tx:committees") ?? 0) > WEEK) {
    const r = await call(`/committees?jurisdiction=tx&classification=committee&include=memberships&per_page=20`);
    const list = r?.body ? parseOpenStatesCommittees(r.body) : [];
    for (const cm of list) {
      await db.insert(txCommittees).values({ id: cm.id, name: cm.name, chamber: cm.chamber, retrievedAt: now }).onConflictDoUpdate({ target: txCommittees.id, set: { name: cm.name, chamber: cm.chamber, retrievedAt: now } });
      await db.delete(txCommitteeMembers).where(eq(txCommitteeMembers.committeeId, cm.id));
      if (cm.members.length) await db.insert(txCommitteeMembers).values(cm.members.map(m => ({ committeeId: cm.id, name: m.name || "Unknown", personId: m.personId, role: m.role }))).onConflictDoNothing();
    }
    if (r?.body) await setCursor(db, "tx:committees", String(now));
    out.committees = list.length;
  }
  const today = new Date(now).toISOString().slice(0, 10);
  const ev = await call(`/events?jurisdiction=tx&after=${today}&per_page=20`);
  const events = ev?.body ? parseOpenStatesEvents(ev.body) : [];
  if (events.length) await db.insert(txEvents).values(events.map(e => ({ ...e, retrievedAt: now }))).onConflictDoUpdate({ target: txEvents.id, set: { name: sql`excluded.name`, start: sql`excluded.start`, location: sql`excluded.location`, bills: sql`excluded.bills`, retrievedAt: now } });
  out.events = events.length;
  // Bills: the current or upcoming session first (prefiling for the 90th opened in November 2026), then the session before it.
  const { session } = currentTxSession(today);
  const sessions = [...new Set([TX_SESSIONS.find(s => s.start > today)?.id, session.id].filter(Boolean) as string[])];
  let bills = 0, votes = 0, mismatches = 0, refused = 0;
  for (const s of sessions) {
    const key = `tx:bills:${s}`, since = await getCursor(db, key);
    let page = 1, newest: string | null = null, done = false;
    while (!done) {
      const r = await call(`/bills?jurisdiction=tx&session=${s}&sort=updated_desc&include=actions&include=votes&include=sponsorships&include=versions&per_page=20&page=${page}${since ? `&updated_since=${encodeURIComponent(since)}` : ""}`);
      if (!r) break;
      if (!r.body) { refused++; break; }
      const parsed = parseOpenStatesBills(r.body);
      for (const b of parsed.bills) { const x = await storeBill(db, b, now); bills++; votes += x.votes; mismatches += x.mismatches; }
      newest ??= new Date(now).toISOString().slice(0, 19);
      if (page >= parsed.maxPage || !parsed.bills.length) done = true; else page++;
    }
    if (done && newest) await setCursor(db, key, newest);
  }
  return { ...out, sessions, bills, votes, mismatches, refused };
}

/** LegiScan: bill numbers, titles and status for the current session (no votes), when Open States is unavailable. */
async function viaLegiscan(db: Db) {
  const c = texasConfig(), now = Date.now();
  const sl = await getJson(`${lsBase()}/?key=${encodeURIComponent(c.lsKey)}&op=getSessionList&state=TX`, {});
  const sessions = ((sl.body as { sessions?: Array<{ session_id?: number; year_start?: number; special?: number; session_name?: string }> } | null)?.sessions ?? []).sort((a, b) => (b.year_start ?? 0) - (a.year_start ?? 0));
  const target = sessions[0];
  if (!target?.session_id) return { ok: false, error: `LegiScan session list ${sl.status}` };
  const ml = await getJson(`${lsBase()}/?key=${encodeURIComponent(c.lsKey)}&op=getMasterList&id=${target.session_id}`, {});
  const list = parseLegiscanMasterList(ml.body);
  const session = TX_SESSIONS.find(s => s.start.slice(0, 4) === String(target.year_start) && s.regular === !target.special) ?? TX_SESSIONS[0];
  for (const b of list) {
    const id = txBillId(session.id, b.number);
    const existing = await db.select({ feed: txBills.feed }).from(txBills).where(eq(txBills.id, id)).get();
    if (existing?.feed === "openstates") continue; // Open States rows carry votes; LegiScan only fills gaps
    const row = { id, session: session.id, identifier: b.number, title: b.title || b.number, stage: legiscanStage(b.status), latestActionDate: b.lastActionDate, latestActionDescription: b.lastAction,
      tloUrl: tloBillUrl(session.tlo, b.number), feed: "legiscan" as const, sourceUrl: b.url ?? `${LEGISCAN_BASE}`, retrievedAt: now };
    await db.insert(txBills).values(row).onConflictDoUpdate({ target: txBills.id, set: row });
  }
  return { ok: true, legiscanBills: list.length, session: session.id };
}

export async function runTexasIngest({ budgetMs = 60_000 }: { budgetMs?: number } = {}) {
  const c = texasConfig();
  if (!c.openStates && !c.legiscan) return { ok: true, skipped: "OPENSTATES_API_KEY and LEGISCAN_API_KEY are not set" };
  const db = getDb(), started = Date.now(), deadline = started + budgetMs, id = crypto.randomUUID();
  await db.insert(ingestRuns).values({ id, job: "texas", status: "RUNNING", startedAt: started, detail: {} });
  let detail: Record<string, unknown> = {}, ok = true, error: string | null = null;
  try {
    if (c.openStates) detail = await viaOpenStates(db, deadline, { left: c.maxRequests });
    if (c.legiscan && (!c.openStates || (detail.refused as number) > 0)) detail.legiscan = await viaLegiscan(db);
  } catch (e) { ok = false; error = (e instanceof Error ? e.message : String(e)).slice(0, 300); }
  await db.update(ingestRuns).set({ status: ok ? "COMPLETE" : "FAILED", finishedAt: Date.now(), detail, error }).where(eq(ingestRuns.id, id));
  return { ok, ...(error ? { error } : {}), ...detail };
}

/** Counts only, for the health probe. */
export async function texasCounts() {
  const db = getDb(), c = texasConfig();
  const count = async (q: Promise<{ n: number } | undefined>) => Number((await q)?.n ?? 0);
  const [people, bills, votes, badVotes, events, last, bySession] = await Promise.all([
    count(db.select({ n: sql<number>`count(*)` }).from(txPeople).where(eq(txPeople.isCurrent, 1)).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(txBills).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(txVotes).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(txVotes).where(eq(txVotes.tallyOk, 0)).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(txEvents).where(sql`${txEvents.start} >= ${new Date().toISOString().slice(0, 10)}`).get()),
    db.select().from(ingestRuns).where(eq(ingestRuns.job, "texas")).orderBy(desc(ingestRuns.startedAt)).limit(1).get(),
    db.select({ session: txBills.session, n: sql<number>`count(*)` }).from(txBills).groupBy(txBills.session),
  ]);
  return { openStatesConfigured: c.openStates, legiscanConfigured: c.legiscan, people, bills, billsBySession: Object.fromEntries(bySession.map(s => [s.session, Number(s.n)])), votes, tallyMismatches: badVotes, upcomingEvents: events,
    lastRun: last ? { status: last.status, startedAt: new Date(last.startedAt).toISOString(), error: last.error?.slice(0, 160) ?? null } : null };
}

