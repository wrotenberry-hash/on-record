import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { txBillActions, txBills, txBillSponsors, txBillVersions, txCommitteeMembers, txCommittees, txEvents, txMemberVotes, txPeople, txVotes } from "@/db/schema";
import { isCommitteeChair } from "@/lib/texas/parse";
import { addDays, txSessionState, txToday } from "@/lib/texas/calendar";
import { txCoverageView, txSeatCoverage } from "@/lib/texas/coverage";

/**
 * Round H reads over the Texas tables. Official data only. The session shown follows the data: the session in
 * progress or coming up when its bills are on file, else the last session that has bills (lib/texas/coverage.ts).
 */
export async function txOverview(now = Date.now()) {
  const db = getDb(), today = txToday(now), weekAgo = addDays(today, -7);
  const st = txSessionState(today), { current: session, inSession, upcoming } = st;
  const bySession = await db.select({ session: txBills.session, n: sql<number>`count(*)`, newest: sql<string | null>`max(${txBills.latestActionDate})` }).from(txBills).groupBy(txBills.session);
  const coverage = txCoverageView(today, Object.fromEntries(bySession.map(s => [s.session, Number(s.n)])));
  const focus = coverage.shown ?? st.focus, ids = [...new Set([focus.id, st.focus.id, session.id])];
  const [counts, moving, events, people] = await Promise.all([
    db.select({ stage: txBills.stage, n: sql<number>`count(*)` }).from(txBills).where(eq(txBills.session, focus.id)).groupBy(txBills.stage),
    db.select().from(txBills).where(and(inArray(txBills.session, ids), gte(txBills.latestActionDate, weekAgo))).orderBy(desc(txBills.latestActionDate)).limit(30),
    db.select().from(txEvents).where(gte(txEvents.start, today)).orderBy(asc(txEvents.start)).limit(20),
    db.select({ chamber: txPeople.chamber, district: txPeople.district, party: txPeople.party }).from(txPeople).where(eq(txPeople.isCurrent, 1)),
  ]);
  const parties = (ch: string) => { const m = new Map<string, number>(); for (const p of people) if (p.chamber === ch) m.set(p.party || "Unknown", (m.get(p.party || "Unknown") ?? 0) + 1);
    return [...m].map(([party, n]) => ({ party, n })).sort((a, b) => b.n - a.n || a.party.localeCompare(b.party)); };
  return { today, session, inSession, upcoming, focus, counts: Object.fromEntries(counts.map(c => [c.stage, Number(c.n)])), total: counts.reduce((s, c) => s + Number(c.n), 0), moving, events,
    coverage, newestAction: bySession.find(s => s.session === focus.id)?.newest ?? null, seats: txSeatCoverage(people), parties: { upper: parties("upper"), lower: parties("lower") } };
}

/** Texas committees by chamber, with how many members are listed for each (0 when the source lists none). */
export async function txCommitteesByChamber() {
  const db = getDb();
  const [rows, members] = await Promise.all([
    db.select({ id: txCommittees.id, name: txCommittees.name, chamber: txCommittees.chamber, retrievedAt: txCommittees.retrievedAt }).from(txCommittees).orderBy(asc(txCommittees.name)),
    db.select({ committeeId: txCommitteeMembers.committeeId, n: sql<number>`count(*)` }).from(txCommitteeMembers).groupBy(txCommitteeMembers.committeeId),
  ]);
  const chairs = await db.select({ committeeId: txCommitteeMembers.committeeId, name: txCommitteeMembers.name, personId: txCommitteeMembers.personId, role: txCommitteeMembers.role }).from(txCommitteeMembers)
    .where(sql`lower(${txCommitteeMembers.role}) like 'chair%'`);
  const count = new Map(members.map(m => [m.committeeId, Number(m.n)])), chair = new Map(chairs.filter(c => isCommitteeChair(c.role)).map(c => [c.committeeId, c]));
  const of = (ch: string | null) => rows.filter(r => (r.chamber ?? null) === ch).map(r => ({ id: r.id, name: r.name, members: count.get(r.id) ?? 0, chair: chair.get(r.id) ?? null }));
  const groups = [{ key: "upper", label: "Texas Senate committees", committees: of("upper") }, { key: "lower", label: "Texas House committees", committees: of("lower") },
    { key: "legislature", label: "Joint committees (House and Senate together)", committees: of("legislature") }, { key: "other", label: "Other committees", committees: of(null) }];
  return { total: rows.length, groups, retrievedAt: rows.reduce((m, r) => Math.max(m, r.retrievedAt), 0) || null };
}

/** The committees a member sits on, by the member's Open States id. */
export async function txPersonCommittees(personId: string) {
  return getDb().select({ id: txCommittees.id, name: txCommittees.name, chamber: txCommittees.chamber, role: txCommitteeMembers.role }).from(txCommitteeMembers)
    .innerJoin(txCommittees, eq(txCommittees.id, txCommitteeMembers.committeeId)).where(eq(txCommitteeMembers.personId, personId)).orderBy(asc(txCommittees.name));
}

export async function txBill(id: string) {
  const db = getDb();
  const bill = await db.select().from(txBills).where(eq(txBills.id, id)).get();
  if (!bill) return null;
  const [actions, sponsors, versions, votes] = await Promise.all([
    db.select().from(txBillActions).where(eq(txBillActions.billId, id)).orderBy(asc(txBillActions.seq)),
    db.select().from(txBillSponsors).where(eq(txBillSponsors.billId, id)),
    db.select().from(txBillVersions).where(eq(txBillVersions.billId, id)),
    db.select().from(txVotes).where(eq(txVotes.billId, id)).orderBy(desc(txVotes.date)),
  ]);
  return { bill, actions, sponsors, versions, votes };
}

export async function txPerson(id: string) {
  const db = getDb();
  const person = await db.select().from(txPeople).where(eq(txPeople.id, id)).get();
  if (!person) return null;
  const votes = await db.select({ voteId: txVotes.id, motion: txVotes.motion, date: txVotes.date, result: txVotes.result, option: txMemberVotes.option, billId: txBills.id,
    identifier: txBills.identifier, title: txBills.title, tallyOk: txVotes.tallyOk })
    .from(txMemberVotes).innerJoin(txVotes, eq(txVotes.id, txMemberVotes.voteId)).innerJoin(txBills, eq(txBills.id, txVotes.billId))
    .where(eq(txMemberVotes.personId, id)).orderBy(desc(txVotes.date)).limit(40);
  const sponsored = await db.select({ id: txBills.id, identifier: txBills.identifier, title: txBills.title, stage: txBills.stage, primary: txBillSponsors.primary })
    .from(txBillSponsors).innerJoin(txBills, eq(txBills.id, txBillSponsors.billId)).where(eq(txBillSponsors.personId, id)).orderBy(desc(txBills.latestActionDate)).limit(30);
  return { person, votes, sponsored };
}

/** The reader's state senator and state representative from their saved districts ("TX-SD-14", "TX-HD-49"). */
export async function txLegislatorsFor(stateUpper: string | null, stateLower: string | null) {
  const db = getDb(), n = (d: string | null) => d?.split("-").pop() ?? null;
  const [senator, rep] = await Promise.all([
    stateUpper ? db.select().from(txPeople).where(and(eq(txPeople.chamber, "upper"), eq(txPeople.district, n(stateUpper)!), eq(txPeople.isCurrent, 1))).get() : null,
    stateLower ? db.select().from(txPeople).where(and(eq(txPeople.chamber, "lower"), eq(txPeople.district, n(stateLower)!), eq(txPeople.isCurrent, 1))).get() : null,
  ]);
  return { senator: senator ?? null, representative: rep ?? null };
}

/** Yes and No by party for Texas votes (from the listed member votes joined to people). */
export async function txVoteParties(voteIds: string[]) {
  if (!voteIds.length) return new Map<string, Record<string, Record<string, number>>>();
  const rows = await getDb().select({ id: txMemberVotes.voteId, option: txMemberVotes.option, party: txPeople.party, n: sql<number>`count(*)` })
    .from(txMemberVotes).leftJoin(txPeople, eq(txPeople.id, txMemberVotes.personId)).where(inArray(txMemberVotes.voteId, voteIds))
    .groupBy(txMemberVotes.voteId, txMemberVotes.option, txPeople.party);
  const out = new Map<string, Record<string, Record<string, number>>>();
  for (const r of rows) {
    const pos = r.option === "yes" ? "Yea" : r.option === "no" ? "Nay" : r.option;
    const p = (r.party ?? "").toLowerCase().startsWith("dem") ? "D" : (r.party ?? "").toLowerCase().startsWith("rep") ? "R" : r.party ? "Other" : "Other";
    const e = out.get(r.id) ?? {}; (e[pos] ??= {})[p] = ((e[pos] ?? {})[p] ?? 0) + Number(r.n); out.set(r.id, e);
  }
  return out;
}
