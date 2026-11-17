import { desc, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { billFollows, txBillActions, txBills, txBillSponsors, txBillVersions, txEvents, txVotes } from "@/db/schema";
import { currentTxSession, TX_SESSIONS, txBillId } from "@/lib/texas/parse";
import type { TxCandidate } from "@/lib/texas/analysis/generate";

/**
 * The database side of eligibility. Kept apart from lib/texas/summaries.ts on purpose: that file calls the model, and
 * no file that calls the model may read a reader table (tests/trust.test.mjs). From the follows this reads one thing,
 * how many readers follow each Texas bill, never who; the number decides only whether and when a bill is written and
 * is never part of what the model is given.
 */

/**
 * Bills that might be eligible, with everything the pure rule needs. This only narrows the list for speed; whether a
 * bill is written, and the order, is decided by orderEligible() in lib/texas/analysis/eligibility.ts.
 */
export async function texasCandidates(limit = 40): Promise<TxCandidate[]> {
  const db = getDb();
  // Committee hearing agendas list bills by number only; the session is the one the hearing falls in.
  const events = await db.select({ name: txEvents.name, start: txEvents.start, bills: txEvents.bills }).from(txEvents).orderBy(desc(txEvents.start)).limit(200);
  const hearings = new Map<string, Array<{ date: string; name: string }>>();
  for (const e of events) for (const ident of (Array.isArray(e.bills) ? e.bills : []) as string[]) {
    const date = e.start.slice(0, 10), id = txBillId(currentTxSession(date).session.id, String(ident).replace(/\s+/g, " ").trim());
    hearings.set(id, [...(hearings.get(id) ?? []), { date, name: e.name }]);
  }
  const active = await db.select({ id: txBills.id }).from(txBills).where(sql`${txBills.id} in (select bill_id from tx_votes)
      or ${txBills.id} in (select bill_id from tx_bill_actions where lower(description) like '%public hearing%' or lower(description) like '%testimony taken%' or lower(description) like 'passed%'
        or lower(description) like 'failed to pass%' or lower(description) like 'adopted%' or lower(description) like 'record vote%' or lower(description) like 'reported favorably%'
        or lower(description) like 'reported unfavorably%' or lower(description) like '%concurs%' or classification like '%passage%' or classification like '%failure%')`)
    .orderBy(desc(txBills.latestActionDate)).limit(limit);
  const followed = await db.select({ id: billFollows.billId, n: sql<number>`count(*)` }).from(billFollows).where(sql`${billFollows.billId} in (select id from tx_bills)`).groupBy(billFollows.billId)
    .orderBy(desc(sql`count(*)`)).limit(Math.ceil(limit / 2));
  const followers = new Map(followed.map(f => [f.id, Number(f.n)]));
  const ids = [...new Set([...active.map(a => a.id), ...followed.map(f => f.id), ...[...hearings.keys()].slice(0, limit)])];
  if (!ids.length) return [];
  const [bills, actions, votes, versions, sponsors] = await Promise.all([
    db.select().from(txBills).where(inArray(txBills.id, ids)),
    db.select().from(txBillActions).where(inArray(txBillActions.billId, ids)).orderBy(txBillActions.billId, txBillActions.seq),
    db.select().from(txVotes).where(inArray(txVotes.billId, ids)).orderBy(txVotes.date),
    db.select().from(txBillVersions).where(inArray(txBillVersions.billId, ids)),
    db.select().from(txBillSponsors).where(inArray(txBillSponsors.billId, ids)).orderBy(desc(txBillSponsors.primary)),
  ]);
  return bills.map((b): TxCandidate => {
    const session = TX_SESSIONS.find(s => s.id === b.session);
    return { id: b.id, identifier: b.identifier, tloSession: session?.tlo ?? b.session, sessionName: session?.name ?? `session ${b.session}`, title: b.title, tloUrl: b.tloUrl,
      latestActionDate: b.latestActionDate, latestActionDescription: b.latestActionDescription,
      actions: actions.filter(a => a.billId === b.id).map(a => ({ date: a.date, description: a.description, chamber: a.chamber, classification: (a.classification as string[] | null) ?? [] })),
      votes: votes.filter(v => v.billId === b.id).map(v => ({ date: v.date, motion: v.motion, result: v.result, chamber: v.chamber, counts: (v.counts as Record<string, number> | null) ?? null, tallyOk: v.tallyOk })),
      versions: versions.filter(v => v.billId === b.id).map(v => ({ note: v.note, date: v.date, url: v.url })),
      hearings: hearings.get(b.id) ?? [], followers: followers.get(b.id) ?? 0, authors: sponsors.filter(s => s.billId === b.id).map(s => s.name) };
  });
}
