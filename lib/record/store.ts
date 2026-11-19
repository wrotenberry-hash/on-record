/**
 * "Your record" (owner, 18 Nov 2026, point 5): the database side. Every function takes the database handle and reads
 * no request and no secret, so tests/record.test.mjs runs these same functions against a temporary database built
 * from the real migrations. The wording and the counting rules are pure: lib/voice-rules.ts and lib/agreement.ts.
 *
 * What it reads is the reader's own answers (voice_votes, for federal and Texas bills alike), the official record, and
 * the anonymous totals for the reader's own districts. It writes nothing except the one-time copy of earlier answers
 * that every page already makes (`importLegacy`). Nothing here reads another person's answer.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { officialBillDepth, officialBills, officialMemberVotes, officialPoliticians, officialRollCalls, txBillActions, txBills, txMemberVotes, txPeople, txVotes, voiceVotes } from "../../db/schema.ts";
import type { Db } from "../verify/residence-store.ts";
import { importLegacy, totalsForScope } from "../constituent/store.ts";
import type { ScopeTotals } from "../constituent/rules.ts";
import { voteKind } from "../federal/vote-kinds.ts";
import { txMeaningfulVote } from "../flow/votes.ts";
import { sameWayCount, sameWayLine, type MemberVote, type SameWay } from "../agreement.ts";
import { billOutcome, chamberPassed, DISTRICT_OUTSIDE_MESSAGE, districtView, meaningfulVote, outcomeDay, recordMemberLine, txBillOutcome, txChamberPassed, txMemberLine, txShownVote,
  type BillVote, type DistrictView, type Outcome, type ReaderAnswer, type RecordLine, type TxRecordAction, type TxRecordVote } from "../voice-rules.ts";

/** The most answers read for one reader. The page shows them a screen at a time (RECORD_PAGE_SIZE). */
export const RECORD_MAX = 500;

/** Where the reader lives, as district ids only ("TX", "TX-37", "TX-SD-14", "TX-HD-49"). */
export type RecordPlace = { state: string; congressional: string | null; stateUpper: string | null; stateLower: string | null };
export type RecordMember = { id: string; name: string; role: string; href: string; level: "federal" | "state"; chamber: "senate" | "house" | "upper" | "lower" };
export type RecordMemberRow = { member: RecordMember; line: RecordLine; sourceUrl: string | null };
export type RecordBill = {
  billKey: string; level: "federal" | "state"; href: string; billType: string | null; number: number | null; identifier: string | null; officialTitle: string;
  answer: ReaderAnswer; at: number; outcome: Outcome; members: RecordMemberRow[]; districts: Array<{ scope: string | null; view: DistrictView }>;
};
export type RecordCount = { member: RecordMember; count: SameWay; line: string };
export type ReaderRecord = { bills: RecordBill[]; members: RecordMember[]; counts: RecordCount[];
  /** How many bills the reader has answered in all; `bills` holds at most RECORD_MAX of them. */
  answered: number };

/**
 * The reader's own legislators, always in this order: the two U.S. senators (by last name), the U.S. representative,
 * the state senator, the state representative. The order never depends on a count or a party. State legislators
 * come from the one state table the site holds (Texas).
 */
export async function readerMembers(db: Db, place: RecordPlace | null): Promise<RecordMember[]> {
  if (!place) return [];
  const st = place.state.toUpperCase();
  const fed = await db.select().from(officialPoliticians).where(and(eq(officialPoliticians.state, st), eq(officialPoliticians.isCurrent, 1)));
  const n = place.congressional?.split("-")[1];
  const rep = n ? fed.find(p => p.chamber === "house" && (n === "AL" ? !p.district : p.district === Number(n))) ?? null : null;
  const out: RecordMember[] = [
    ...fed.filter(p => p.chamber === "senate").sort((a, b) => a.lastName.localeCompare(b.lastName)).map(p => ({ id: p.id, name: p.fullName, role: `U.S. Senator, ${p.state}`, href: `/politicians/${p.id}`, level: "federal" as const, chamber: "senate" as const })),
    ...(rep ? [{ id: rep.id, name: rep.fullName, role: `U.S. Representative, ${rep.state}${rep.district ? `-${rep.district}` : " at large"}`, href: `/politicians/${rep.id}`, level: "federal" as const, chamber: "house" as const }] : []),
  ];
  for (const [scope, chamber, title] of [[place.stateUpper, "upper", "Senator"], [place.stateLower, "lower", "Representative"]] as const) {
    const m = /^TX-(?:SD|HD)-(\w+)$/.exec(scope ?? "");
    if (!m) continue;
    const p = await db.select().from(txPeople).where(and(eq(txPeople.chamber, chamber), eq(txPeople.district, m[1]), eq(txPeople.isCurrent, 1))).get();
    if (p) out.push({ id: p.id, name: p.name, role: `Texas State ${title}, District ${p.district}`, href: `/texas/members/${encodeURIComponent(p.id)}`, level: "state", chamber });
  }
  return out;
}

const ms = (date: string) => { const t = Date.parse(date); return Number.isFinite(t) ? t : 0; };

/**
 * Everything on the record page for one reader: each bill they answered (newest first) with its outcome, how each of
 * their legislators voted on it and their district's line; then one count per legislator, in the legislators' own order.
 */
export async function recordFor(db: Db, userId: string | null, input: { place: RecordPlace | null; verificationOn: boolean }): Promise<ReaderRecord> {
  if (!userId) return { bills: [], members: [], counts: [], answered: 0 };
  await importLegacy(db, userId).catch(() => null);
  const [answers, total, members] = await Promise.all([
    db.select({ billKey: voiceVotes.billKey, answer: voiceVotes.answer, at: voiceVotes.updatedAt }).from(voiceVotes).where(eq(voiceVotes.userId, userId)).orderBy(desc(voiceVotes.updatedAt)).limit(RECORD_MAX),
    db.select({ n: sql<number>`count(*)` }).from(voiceVotes).where(eq(voiceVotes.userId, userId)).get(),
    readerMembers(db, input.place),
  ]);
  if (!answers.length) return { bills: [], members, counts: members.map(member => ({ member, count: { same: 0, compared: 0 }, line: sameWayLine({ same: 0, compared: 0 }) })), answered: 0 };
  const keys = answers.map(a => a.billKey), place = input.place;
  const fedMembers = members.filter(m => m.level === "federal"), stateMembers = members.filter(m => m.level === "state");

  /* Federal bills: the stored stage, the recorded votes, and the reader's members' positions in them. */
  const fedBills = await db.select({ id: officialBills.id, billType: officialBills.billType, number: officialBills.number, title: officialBills.title, stage: officialBillDepth.stage, stageDate: officialBillDepth.stageDate })
    .from(officialBills).leftJoin(officialBillDepth, eq(officialBillDepth.billId, officialBills.id)).where(inArray(officialBills.id, keys));
  const fedIds = fedBills.map(b => b.id);
  const rolls = fedIds.length ? await db.select({ id: officialRollCalls.id, billId: officialRollCalls.billId, chamber: officialRollCalls.chamber, question: officialRollCalls.question, title: officialRollCalls.title,
    result: officialRollCalls.result, votedAt: officialRollCalls.votedAt, rollNumber: officialRollCalls.rollNumber, yea: officialRollCalls.yea, nay: officialRollCalls.nay, sourceUrl: officialRollCalls.sourceUrl })
    .from(officialRollCalls).where(inArray(officialRollCalls.billId, fedIds)) : [];
  const positions = rolls.length && fedMembers.length ? await db.select({ rollCallId: officialMemberVotes.rollCallId, politicianId: officialMemberVotes.politicianId, position: officialMemberVotes.position })
    .from(officialMemberVotes).where(and(inArray(officialMemberVotes.rollCallId, rolls.map(r => r.id)), inArray(officialMemberVotes.politicianId, fedMembers.map(m => m.id)))) : [];
  const fedById = new Map(fedBills.map(b => [b.id, b]));
  const votesOf = (billId: string): Array<BillVote & { sourceUrl: string }> => rolls.filter(r => r.billId === billId).map(r => ({ ...r, title: r.title ?? fedById.get(billId)?.title ?? null }));

  /* Texas bills: the stored stage, the official actions (for dates), the recorded votes, and the members listed in them. */
  const txBillRows = await db.select({ id: txBills.id, identifier: txBills.identifier, title: txBills.title, chamber: txBills.chamber, stage: txBills.stage, tloUrl: txBills.tloUrl }).from(txBills).where(inArray(txBills.id, keys));
  const txIds = txBillRows.map(b => b.id);
  const [txActs, txVoteRows] = txIds.length ? await Promise.all([
    db.select({ billId: txBillActions.billId, date: txBillActions.date, chamber: txBillActions.chamber, classification: txBillActions.classification }).from(txBillActions).where(inArray(txBillActions.billId, txIds)),
    db.select({ id: txVotes.id, billId: txVotes.billId, motion: txVotes.motion, date: txVotes.date, result: txVotes.result, chamber: txVotes.chamber, counts: txVotes.counts, tallyOk: txVotes.tallyOk }).from(txVotes).where(inArray(txVotes.billId, txIds)),
  ]) : [[], []];
  const txOptions = txVoteRows.length && stateMembers.length ? await db.select({ voteId: txMemberVotes.voteId, personId: txMemberVotes.personId, option: txMemberVotes.option })
    .from(txMemberVotes).where(and(inArray(txMemberVotes.voteId, txVoteRows.map(v => v.id)), inArray(txMemberVotes.personId, stateMembers.map(m => m.id)))) : [];
  const txById = new Map(txBillRows.map(b => [b.id, b]));
  const txVotesOf = (billId: string): TxRecordVote[] => txVoteRows.filter(v => v.billId === billId).map(v => { const c = (v.counts ?? null) as Record<string, number> | null;
    return { id: v.id, chamber: v.chamber, motion: v.motion, date: v.date, result: v.result, yes: c?.yes ?? null, no: c?.no ?? null, tallyOk: v.tallyOk === 1 }; });
  const txActionsOf = (billId: string): TxRecordAction[] => txActs.filter(a => a.billId === billId).map(a => ({ date: a.date, chamber: a.chamber, classification: (a.classification ?? null) as string[] | null }));

  /* The anonymous totals for the reader's own districts. Read only when counting is switched on. */
  const none = new Map<string, ScopeTotals>();
  const stateScopes = [place?.stateUpper, place?.stateLower].filter((s): s is string => !!s);
  const [fedTotals, ...stateTotals] = await Promise.all([
    input.verificationOn && place?.congressional && fedIds.length ? totalsForScope(db, place.congressional, fedIds).catch(() => none) : none,
    ...stateScopes.map(s => (input.verificationOn && txIds.length ? totalsForScope(db, s, txIds).catch(() => none) : none)),
  ]);

  const bills = answers.flatMap((a): RecordBill[] => {
    const answer = a.answer as ReaderAnswer, fed = fedById.get(a.billKey), tx = txById.get(a.billKey);
    if (fed) {
      const votes = votesOf(fed.id);
      const rows = fedMembers.map(member => {
        const m = meaningfulVote(votes, member.chamber);
        const position = m ? positions.find(p => p.rollCallId === m.vote.id && p.politicianId === member.id)?.position ?? null : null;
        return { member, line: recordMemberLine(m, position, answer, m ? outcomeDay(m.vote.votedAt) ?? "" : "", { passed: chamberPassed(fed.stage, fed.billType, member.chamber), chamber: member.chamber }),
          sourceUrl: m ? votes.find(v => v.id === m.vote.id)?.sourceUrl ?? null : null };
      });
      return [{ billKey: fed.id, level: "federal", href: `/bills/${fed.id}`, billType: fed.billType, number: fed.number, identifier: null, officialTitle: fed.title, answer, at: a.at,
        outcome: billOutcome({ stage: fed.stage, stageDate: fed.stageDate, billType: fed.billType, votes }), members: rows,
        districts: [{ scope: place?.congressional ?? null, view: districtView({ enabled: input.verificationOn, districtId: place?.congressional ?? null, totals: fedTotals.get(fed.id) }) }] }];
    }
    if (tx) {
      const votes = txVotesOf(tx.id), actions = txActionsOf(tx.id);
      const rows = stateMembers.map(member => {
        const shown = txShownVote(votes, member.chamber);
        const option = shown ? txOptions.find(o => o.voteId === shown.vote.id && o.personId === member.id)?.option ?? null : null;
        return { member, line: txMemberLine(shown, option, answer, { passed: txChamberPassed(actions, member.chamber), chamber: member.chamber }), sourceUrl: shown ? tx.tloUrl : null };
      });
      // The one state table the site holds is Texas: a reader whose place is in another state has no district on these bills.
      const districts: RecordBill["districts"] = place && place.state.toUpperCase() !== "TX" ? [{ scope: null, view: { kind: "outside", text: DISTRICT_OUTSIDE_MESSAGE } }]
        : stateScopes.length ? stateScopes.map((scope, i) => ({ scope, view: districtView({ enabled: input.verificationOn, districtId: scope, totals: stateTotals[i]?.get(tx.id) }) }))
        : [{ scope: null, view: districtView({ enabled: input.verificationOn, districtId: null, totals: null }) }];
      return [{ billKey: tx.id, level: "state", href: `/texas/bills/${encodeURIComponent(tx.id)}`, billType: null, number: null, identifier: tx.identifier, officialTitle: tx.title, answer, at: a.at,
        outcome: txBillOutcome({ stage: tx.stage, chamber: tx.chamber, actions, votes }), members: rows, districts }];
    }
    return []; // a bill the site no longer holds
  });

  /* One count per legislator, from every answer read, in the legislators' own order. */
  const mine = new Map(answers.map(a => [a.billKey, a.answer]));
  const rollById = new Map(rolls.map(r => [r.id, r])), txVoteById = new Map(txVoteRows.map(v => [v.id, v]));
  const counts = members.map((member): RecordCount => {
    const votes: MemberVote[] = member.level === "federal"
      ? positions.filter(p => p.politicianId === member.id).flatMap(p => { const r = rollById.get(p.rollCallId);
        return r?.billId ? [{ billId: r.billId, position: p.position, kind: voteKind(r.question, r.title ?? fedById.get(r.billId)?.title), votedAt: r.votedAt }] : []; })
      : txOptions.filter(o => o.personId === member.id).flatMap(o => { const v = txVoteById.get(o.voteId);
        if (!v || v.chamber !== member.chamber) return [];
        const kind = txMeaningfulVote(v.motion);
        return [{ billId: v.billId, position: o.option === "yes" ? "Yea" : o.option === "no" ? "Nay" : "Not Voting", kind: kind === "pass" || kind === "final_version" || kind === "other_chamber" ? "passage" : "other", votedAt: ms(v.date) }]; });
    const count = sameWayCount(mine, votes);
    return { member, count, line: sameWayLine(count) };
  });
  return { bills, members, counts, answered: Number(total?.n ?? answers.length) };
}
