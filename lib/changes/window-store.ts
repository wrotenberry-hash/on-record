/**
 * "Can this bill still be changed?": the facts, read from tables that already exist, handed to the rules in
 * ./window.ts (owner, 20 Nov 2026). No table of its own, no model calls.
 *
 *   billWindow(billKey)      one bill, federal ("119-hr-2102") or Texas ("tx-90-hb1"); null when nothing can be said.
 *   openWindowBills(limit)   federal bills that can still be changed and are in committee, out of committee or on the
 *                            floor: those with a confirmed meeting first (soonest first), then by most recent action.
 *
 * Relative imports only, and the database handle can be passed in, so tests/window.test.mjs runs these against a
 * temporary database built from the migrations.
 */
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { officialBillActions, officialBillCommittees, officialBillDepth, officialBills, officialCommittees, officialFloorSchedule, officialRollCalls, txBillActions, txBills, txEvents } from "../../db/schema.ts";
import { floorVoteFromRollCall, floorVoteOf, weekOf } from "../federal/depth-parse.ts";
import { meetingBillIds, meetingNamesBill } from "../federal/meetings-parse.ts";
import { TX_RULES, txToday } from "../texas/calendar.ts";
import { TX_SESSIONS, txEventBillIds } from "../texas/parse.ts";
import type { Db } from "../verify/residence-store.ts";
import { confirmationHolds, houseEventUrl, SENATE_HEARINGS_URL, type Confirmation } from "./hearing-check.ts";
import { confirmedHearings, eventIdOf, meetingsAhead } from "./hearing-store.ts";
import type { BillSystem, BillWindow, WindowPlace } from "./types.ts";
import { federalWindow, texasWindow, type Chamber, type FederalStage, type MeetingFact, type TexasStage } from "./window.ts";

const handle = async (db?: Db): Promise<Db> => db ?? (await import("@/db")).getDb();
const FEDERAL_ID = /^\d{2,3}-[a-z]+-\d+$/;
const FEDERAL_STAGES = new Set<string>(["introduced", "committee", "passed_first", "passed_second", "resolving", "president", "law", "vetoed", "failed", "not_taken_up", "debate_blocked"]);
const TEXAS_STAGES = new Set<string>(["filed", "committee", "passed_first", "passed_both", "governor", "law", "vetoed", "failed"]);

/** What every bill of one request shares: the meetings still ahead and the confirmations on file. */
type Shared = { meetings: Awaited<ReturnType<typeof meetingsAhead>>; confirmed: Map<string, Confirmation> };
async function shared(db: Db, now: number): Promise<Shared> {
  const [meetings, confirmed] = await Promise.all([meetingsAhead(db, now), confirmedHearings(now, db)]);
  return { meetings, confirmed };
}

function meetingFacts(billId: string, s: Shared, now: number): MeetingFact[] {
  return s.meetings.filter(m => meetingBillIds(m).includes(billId)).map(m => ({
    type: m.meetingType, title: m.title, status: m.status, startsAt: m.startsAt,
    confirmed: confirmationHolds(s.confirmed.get(m.id), m, now), named: meetingNamesBill(m, billId) ?? "record", url: m.url,
    calendarUrl: m.chamber === "house" ? houseEventUrl(eventIdOf(m.id)) : m.chamber === "senate" ? SENATE_HEARINGS_URL : null,
    calendarLabel: m.chamber === "house" ? "The House committee calendar" : m.chamber === "senate" ? "The Senate's schedule of committee meetings" : null,
  }));
}

async function federal(db: Db, id: string, now: number, s: Shared): Promise<BillWindow | null> {
  const bill = await db.select({ id: officialBills.id, congress: officialBills.congress, billType: officialBills.billType, congressUrl: officialBills.congressUrl,
    stage: officialBillDepth.stage, stageDate: officialBillDepth.stageDate })
    .from(officialBills).leftJoin(officialBillDepth, eq(officialBillDepth.billId, officialBills.id)).where(eq(officialBills.id, id)).get();
  if (!bill || !bill.stage || !FEDERAL_STAGES.has(bill.stage)) return null;
  const stage = bill.stage as FederalStage;
  const [committees, floor] = await Promise.all([
    db.select({ committeeId: officialBillCommittees.committeeId, referredAt: officialBillCommittees.referredAt, reportedAt: officialBillCommittees.reportedAt, name: officialCommittees.name })
      .from(officialBillCommittees).leftJoin(officialCommittees, eq(officialCommittees.id, officialBillCommittees.committeeId)).where(eq(officialBillCommittees.billId, id)),
    db.select({ chamber: officialFloorSchedule.chamber, sourceUrl: officialFloorSchedule.sourceUrl }).from(officialFloorSchedule)
      .where(and(eq(officialFloorSchedule.billId, id), gte(officialFloorSchedule.weekOf, weekOf(now)))),
  ]);
  // For a bill stopped by a floor vote, the chamber of the latest floor vote that failed.
  let stalledIn: Chamber | null = null;
  if (stage === "failed" || stage === "not_taken_up" || stage === "debate_blocked") {
    const actions = await db.select({ text: officialBillActions.text, actionDate: officialBillActions.actionDate, chamber: officialBillActions.chamber })
      .from(officialBillActions).where(eq(officialBillActions.billId, id)).orderBy(desc(officialBillActions.seq)).limit(60);
    for (const a of actions) {
      const v = floorVoteOf({ text: a.text, actionDate: a.actionDate, chamber: a.chamber === "house" || a.chamber === "senate" ? a.chamber : null });
      if (v && !v.passed) { stalledIn = v.chamber; break; }
    }
  }
  // 20 Nov 2026: a bill one chamber passed, where the other chamber then voted not to take it up or not to end debate.
  // The stored stage does not change for such a vote, so the latest floor vote on file after that stage is read here:
  // if it failed, the bill is stalled there; a later vote that carried clears it.
  let blocked: { chamber: Chamber; date: string; what: "take_up" | "end_debate" | "end_debate_take_up" } | null = null;
  if (stage === "passed_first") {
    const rolls = await db.select({ id: officialRollCalls.id, chamber: officialRollCalls.chamber, rollNumber: officialRollCalls.rollNumber, votedAt: officialRollCalls.votedAt,
      question: officialRollCalls.question, title: officialRollCalls.title, result: officialRollCalls.result, yea: officialRollCalls.yea, nay: officialRollCalls.nay })
      .from(officialRollCalls).where(eq(officialRollCalls.billId, id));
    const votes = rolls.map(r => floorVoteFromRollCall(r)).filter((v): v is NonNullable<typeof v> => !!v && (v.chamber === "house" || v.chamber === "senate"))
      .filter(v => ["proceed", "cloture", "cloture_proceed"].includes(v.kind) && (!bill.stageDate || v.date >= bill.stageDate.slice(0, 10)))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.rollNumber ?? 0) - (b.rollNumber ?? 0));
    const last = votes[votes.length - 1];
    if (last && !last.passed) blocked = { chamber: last.chamber as Chamber, date: last.date, what: last.kind === "proceed" ? "take_up" : last.kind === "cloture" ? "end_debate" : "end_debate_take_up" };
  }
  return federalWindow({ stage, stageDate: bill.stageDate, congress: bill.congress, billType: bill.billType, blocked,
    // Full committees only: "HSII" is a committee, "HSII24" one of its subcommittees. The first letter is the chamber.
    committees: committees.filter(c => /^[HSJ][A-Z]{3}$/.test(c.committeeId)).map(c => ({ name: c.name, chamber: c.committeeId[0] === "H" ? "house" : c.committeeId[0] === "S" ? "senate" : "joint", referredAt: c.referredAt, reportedAt: c.reportedAt })),
    meetings: meetingFacts(id, s, now),
    floorChambers: [...new Set(floor.map(f => f.chamber))].filter((c): c is Chamber => c === "house" || c === "senate"), floorUrl: floor[0]?.sourceUrl ?? null,
    stalledIn, actionsUrl: `${bill.congressUrl.replace(/\/+$/, "")}/all-actions`, now });
}

async function texas(db: Db, id: string, now: number): Promise<BillWindow | null> {
  const bill = await db.select().from(txBills).where(eq(txBills.id, id)).get();
  if (!bill || !TEXAS_STAGES.has(bill.stage)) return null;
  const today = txToday(now), session = TX_SESSIONS.find(x => x.id === bill.session) ?? null;
  const [actions, events] = await Promise.all([
    db.select().from(txBillActions).where(eq(txBillActions.billId, id)).orderBy(asc(txBillActions.seq)),
    db.select({ bills: txEvents.bills, start: txEvents.start }).from(txEvents).where(gte(txEvents.start, today)).orderBy(asc(txEvents.start)).limit(200),
  ]);
  const has = (a: { classification: unknown }, c: string) => Array.isArray(a.classification) && a.classification.includes(c);
  // The committee the bill was last sent to, from its "Referred to …" history line (as lib/texas/queries.ts reads it).
  const referral = [...actions].reverse().find(a => has(a, "referral-committee") || /^referred to /i.test(a.description));
  const name = referral?.description.replace(/^referred to\s+/i, "").trim();
  const passage = actions.find(a => has(a, "passage") && (a.chamber === "upper" || a.chamber === "lower"));
  return texasWindow({ stage: bill.stage as TexasStage, session, today, origin: bill.chamber === "upper" || bill.chamber === "lower" ? bill.chamber : null,
    committee: referral && name ? { name, chamber: referral.chamber } : null,
    reportedOut: !!referral && actions.some(a => a.seq > referral.seq && (has(a, "committee-passage") || has(a, "committee-passage-favorable"))),
    passedFirst: passage ? { chamber: passage.chamber, date: passage.date } : null,
    eventListed: events.some(e => txEventBillIds(e.bills, e.start).includes(bill.id)),
    tloUrl: bill.tloUrl, sessionSource: { label: `When a regular session opens: ${TX_RULES.convene.cite}`, url: TX_RULES.convene.sourceUrl } });
}

/**
 * What a bill page says about the window: where the bill is, whether it can still be changed, and the hearing line.
 * `billKey` is a federal bill id (official_bills, "119-hr-2102") or a Texas bill id (tx_bills, "tx-90-hb1"). Null when
 * the bill is not on file or its stage has not been read; the page then shows nothing.
 */
export async function billWindow(billKey: string, now = Date.now(), db?: Db): Promise<BillWindow | null> {
  const d = await handle(db);
  if (billKey.startsWith("tx-")) return texas(d, billKey, now);
  if (!FEDERAL_ID.test(billKey)) return null;
  return federal(d, billKey, now, await shared(d, now));
}

export type OpenWindowBill = { billKey: string; system: BillSystem; place: WindowPlace; hearingAt: string | null };
const OPEN_PLACES = new Set<WindowPlace>(["committee", "hearing_scheduled", "out_of_committee", "floor"]);

/**
 * Federal bills whose window is open and that are in committee (with or without a hearing scheduled), out of committee
 * or on the floor. Bills with a confirmed meeting come first, soonest meeting first; then the most recent action.
 * Looks at bills named by upcoming meetings, bills on this week's floor schedule, and the most recently acted-on bills
 * that have not passed a chamber.
 */
export async function openWindowBills(limit = 20, now = Date.now(), db?: Db): Promise<OpenWindowBill[]> {
  const d = await handle(db), s = await shared(d, now), want = Math.max(0, limit);
  if (!want) return [];
  const early = ["introduced", "committee"];
  const named = [...new Set(s.meetings.flatMap(m => meetingBillIds(m)))].slice(0, 300);
  const floor = (await d.select({ billId: officialFloorSchedule.billId }).from(officialFloorSchedule).where(gte(officialFloorSchedule.weekOf, weekOf(now)))).map(f => f.billId).filter((b): b is string => !!b);
  const pick = { id: officialBills.id, latestActionAt: officialBills.latestActionAt };
  const first = [...new Set([...named, ...floor])], rows: Array<{ id: string; latestActionAt: string | null }> = [];
  for (let i = 0; i < first.length; i += 100) rows.push(...await d.select(pick).from(officialBills).innerJoin(officialBillDepth, eq(officialBillDepth.billId, officialBills.id))
    .where(and(inArray(officialBills.id, first.slice(i, i + 100)), inArray(officialBillDepth.stage, early))));
  const recent = await d.select(pick).from(officialBills).innerJoin(officialBillDepth, eq(officialBillDepth.billId, officialBills.id))
    .where(inArray(officialBillDepth.stage, early)).orderBy(desc(officialBills.latestActionAt)).limit(Math.max(30, want * 3));
  const candidates = [...rows, ...recent].filter((b, i, a) => a.findIndex(x => x.id === b.id) === i);
  const out: Array<OpenWindowBill & { latestActionAt: string | null }> = [];
  for (const b of candidates) {
    const w = await federal(d, b.id, now, s);
    if (w && w.state === "open" && OPEN_PLACES.has(w.place)) out.push({ billKey: b.id, system: "federal", place: w.place, hearingAt: w.hearingAt, latestActionAt: b.latestActionAt });
  }
  out.sort((a, b) => (a.hearingAt && b.hearingAt ? a.hearingAt.localeCompare(b.hearingAt) : a.hearingAt ? -1 : b.hearingAt ? 1 : 0) || (b.latestActionAt ?? "").localeCompare(a.latestActionAt ?? ""));
  // After every bill still in its first chamber: bills one chamber has passed and the other can still change. They
  // come last (the owner asked for bills in committee first), and they are the ones with two versions to compare.
  if (out.length < want) {
    const passed = await d.select(pick).from(officialBills).innerJoin(officialBillDepth, eq(officialBillDepth.billId, officialBills.id))
      .where(eq(officialBillDepth.stage, "passed_first")).orderBy(desc(officialBills.latestActionAt)).limit(Math.max(20, want * 2));
    const later: typeof out = [];
    for (const b of passed) {
      if (out.length + later.length >= want) break;
      const w = await federal(d, b.id, now, s);
      if (w && w.state === "open" && w.place === "other_chamber") later.push({ billKey: b.id, system: "federal", place: w.place, hearingAt: w.hearingAt, latestActionAt: b.latestActionAt });
    }
    out.push(...later);
  }
  return out.slice(0, want).map(({ billKey, system, place, hearingAt }) => ({ billKey, system, place, hearingAt }));
}
