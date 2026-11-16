import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { txBillActions, txBills, txBillSponsors, txBillVersions, txEvents, txMemberVotes, txPeople, txVotes } from "@/db/schema";
import { currentTxSession, TX_SESSIONS } from "@/lib/texas/parse";

/** Round H reads over the Texas tables. Official data only. */
export async function txOverview(now = Date.now()) {
  const db = getDb(), today = new Date(now).toISOString().slice(0, 10), weekAgo = new Date(now - 7 * 86400e3).toISOString().slice(0, 10);
  const { session, inSession } = currentTxSession(today);
  const upcoming = TX_SESSIONS.filter(s => s.start > today).sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
  const focus = upcoming && !inSession ? upcoming : session;
  const [counts, moving, events] = await Promise.all([
    db.select({ stage: txBills.stage, n: sql<number>`count(*)` }).from(txBills).where(eq(txBills.session, focus.id)).groupBy(txBills.stage),
    db.select().from(txBills).where(and(inArray(txBills.session, [focus.id, session.id]), gte(txBills.latestActionDate, weekAgo))).orderBy(desc(txBills.latestActionDate)).limit(30),
    db.select().from(txEvents).where(gte(txEvents.start, today)).orderBy(asc(txEvents.start)).limit(20),
  ]);
  return { session, inSession, upcoming, focus, counts: Object.fromEntries(counts.map(c => [c.stage, Number(c.n)])), total: counts.reduce((s, c) => s + Number(c.n), 0), moving, events };
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
