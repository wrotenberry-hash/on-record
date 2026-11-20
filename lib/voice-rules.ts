/**
 * "Your record" rules (first built as "Your voice", 17 Nov 2026; renamed and widened 18 Nov 2026, the owner's point 5).
 * Pure; tested in tests/voice.test.mjs and tests/record.test.mjs.
 *
 * The page puts a reader's own answer on a bill beside what happened to the bill and how each of their legislators
 * voted on it. The rules that live here:
 *   1. which of a bill's recorded votes is shown for a chamber (`meaningfulVote`);
 *   2. how a member's part in that vote is worded, and whether it is marked as the same as the reader's answer
 *      (`memberVoteLine`, `recordMemberLine`, `txMemberLine`): only a vote on the bill itself is ever compared;
 *   3. what happened to the bill, in plain words with its date (`billOutcome`, `txBillOutcome`);
 *   4. what is said about the reader's district (`districtView`): a total only through `shownTotals`, so only from
 *      25 counted residents, mail-verified first, and a group under 5 by its size only;
 *   5. where the list ends (`recordPage`, `recordEndLine`).
 * No score, share or percentage is made here. The same wording is used for every member and party. The one count per
 * legislator is in lib/agreement.ts (`sameWayCount`).
 */
import { positionLine, voteKind } from "./federal/vote-kinds.ts";
import { floorVoteFromRollCall } from "./federal/depth-parse.ts";
import { groupLine, shownTotals, type ScopeTotals } from "./constituent/rules.ts";
import { scopeWords } from "./constituent/proof.ts";
import { txMeaningfulVote, type TxMeaningfulKind } from "./flow/votes.ts";
import type { TxStage } from "./texas/parse.ts";

/** A recorded vote on a bill. `kind` may be given when the caller already knows it (Texas motions); otherwise it is read from the question. */
export type BillVote = { id: string; chamber: string; question: string; title?: string | null; result?: string | null; votedAt: number;
  rollNumber?: number | null; yea?: number | null; nay?: number | null; kind?: string | null };
export type ReaderAnswer = "support" | "oppose" | "unsure";

const kindOf = (v: BillVote) => v.kind ?? voteKind(v.question, v.title);

/** A vote on whether the chamber takes the bill up at all: starting debate, ending debate, or bringing it out of committee. */
function takeUpVote(v: BillVote) {
  if (kindOf(v) !== "procedural") return null;
  const f = floorVoteFromRollCall({ id: v.id, chamber: v.chamber, rollNumber: v.rollNumber ?? 0, votedAt: v.votedAt, question: v.question, title: v.title, result: v.result, yea: v.yea ?? 0, nay: v.nay ?? 0 });
  return f && f.kind !== "passage" && f.kind !== "veto_override" ? f : null;
}

export type Meaningful = {
  vote: BillVote;
  /** "passage": the chamber's vote on the bill itself. "stopped": no such vote, and the latest vote on taking it up failed. */
  role: "passage" | "stopped";
  /** For "stopped": which step it was, and the plain line for what the chamber did ("Senate voted 47–52 not to take it up"). */
  step?: "debate" | "end_debate" | "committee"; label?: string; meaning?: string;
};

/**
 * The most meaningful recorded vote on a bill in one chamber.
 *   1. The final vote on passing it (the latest vote on the bill itself, which includes agreeing to the other chamber's
 *      version, a conference report and a veto override).
 *   2. Otherwise the latest vote that decided its fate: the most recent vote on taking the bill up (starting debate,
 *      ending debate, bringing it out of committee), when that vote failed. If the latest such vote carried, the bill
 *      moved on and nothing has decided it yet.
 *   3. Never an amendment, a nomination or a routine procedural step (rules, tabling, recommitting, the journal).
 */
export function meaningfulVote(votes: readonly BillVote[], chamber: string): Meaningful | null {
  const mine = votes.filter(v => v.chamber === chamber).sort((a, b) => b.votedAt - a.votedAt);
  const passage = mine.find(v => kindOf(v) === "passage");
  if (passage) return { vote: passage, role: "passage" };
  for (const v of mine) {
    const f = takeUpVote(v);
    if (!f) continue;
    if (f.passed) return null;
    return { vote: v, role: "stopped", step: f.kind === "proceed" ? "debate" : f.kind === "discharge" ? "committee" : "end_debate", label: f.label, meaning: f.meaning };
  }
  return null;
}

/** Same as the reader, different, or no mark. Only Support or Oppose against a Yes or No on passing the bill is compared. */
export function matchMark(answer: ReaderAnswer, position: string | null | undefined, role: Meaningful["role"] | null | undefined): "same" | "different" | null {
  if (role !== "passage" || (answer !== "support" && answer !== "oppose") || (position !== "Yea" && position !== "Nay")) return null;
  return (answer === "support") === (position === "Yea") ? "same" : "different";
}
export const MARK_LABEL = { same: "Same as you", different: "Different from you" } as const;

const STEP_WORDS = { debate: "starting debate on it", end_debate: "ending debate so it could move ahead", committee: "bringing it out of committee" } as const;

export type MemberLine = { state: "voted" | "not_yet" | "not_in_office"; text: string; mark: "same" | "different" | null; note: string | null };
/**
 * One member's row for one bill. `position` is the member's normalised position in the meaningful vote (Yea, Nay, Present,
 * Not Voting), or null when the member is not listed in it. `date` is that vote's date as the page shows dates.
 */
export function memberVoteLine(m: Meaningful | null, position: string | null | undefined, answer: ReaderAnswer, date: string): MemberLine {
  if (!m) return { state: "not_yet", text: "Has not voted on it yet", mark: null, note: null };
  if (!position) return { state: "not_in_office", text: "Not in office for that vote", mark: null, note: null };
  if (m.role === "passage") return { state: "voted", text: `${positionLine(position, "passage")}, ${date}`, mark: matchMark(answer, position, "passage"), note: null };
  const p = position.toLowerCase();
  const text = p === "yea" || p === "nay" ? `Voted ${p === "yea" ? "yes" : "no"} on ${STEP_WORDS[m.step ?? "end_debate"]}` : positionLine(position, "procedural");
  return { state: "voted", text: `${text}, ${date}`, mark: null,
    note: `${m.label ?? "The step failed"}. ${m.meaning ?? ""} This was a vote on a step, not on the bill itself, so it is not compared with your answer.`.replace(/\s+/g, " ").trim() };
}

/** The threshold wording (owner, 17 Nov 2026). */
export const DISTRICT_THRESHOLD_MESSAGE = "Not enough constituents yet — share this bill.";
export const DISTRICT_OFF_MESSAGE = "District totals are not switched on yet, so there is nothing to show here. Your answers stay private.";
export const DISTRICT_UNKNOWN_MESSAGE = "We do not know your district yet. Find your legislators to see your district's view.";

/** Said on a state bill to a reader whose saved place is in another state: they have no district on it. Names no state. */
export const DISTRICT_OUTSIDE_MESSAGE = "Your saved place is outside this bill's state, so you have no district on it. The bill's page shows the state's totals.";
export type DistrictView = { kind: "off" | "unknown" | "outside" | "below" | "total"; text: string;
  /** Only for "total": how many counted residents answered, and one line per group, mail-verified first. */
  voters?: number; groups?: string[] };
/**
 * What the page says about the reader's district for one bill. Every total goes through `shownTotals`: it is shown
 * only when verification is on, the district is known and at least 25 counted residents answered there; below that,
 * never a number. The two groups are listed apart, mail-verified first, and a group under 5 by its size only.
 */
export function districtView(input: { enabled: boolean; districtId: string | null; totals: ScopeTotals | null | undefined }): DistrictView {
  if (!input.enabled) return { kind: "off", text: DISTRICT_OFF_MESSAGE };
  if (!input.districtId) return { kind: "unknown", text: DISTRICT_UNKNOWN_MESSAGE };
  const s = shownTotals(input.totals, "district");
  if (!s.show) return { kind: "below", text: s.message };
  return { kind: "total", text: `${s.voters} counted residents of ${scopeWords(input.districtId)} answered.`, voters: s.voters, groups: s.groups.map(groupLine) };
}

/** "Support", "Oppose", "Unsure": the reader's answer as the bill page's buttons name it. */
export const ANSWER_LABEL: Record<ReaderAnswer, string> = { support: "Support", oppose: "Oppose", unsure: "Unsure" };

export type AnswerRow = { billId: string; answer: ReaderAnswer; at: number };
/** One row per bill, newest answer first. Support/Oppose rows win over a leftover Unsure row for the same bill. */
export function answeredBills(stances: ReadonlyArray<{ billId: string; stance: string; updatedAt: number }>, unsure: ReadonlyArray<{ billId: string; updatedAt: number }>): AnswerRow[] {
  const out = new Map<string, AnswerRow>();
  for (const u of unsure) out.set(u.billId, { billId: u.billId, answer: "unsure", at: u.updatedAt });
  for (const s of stances) if (s.stance === "support" || s.stance === "oppose") out.set(s.billId, { billId: s.billId, answer: s.stance, at: s.updatedAt });
  return [...out.values()].sort((a, b) => b.at - a.at);
}

/* ───────────────────────────── What happened to the bill, in plain words ───────────────────────────── */

/**
 * The outcome line for one bill: what happened, the numbers where a recorded vote has them, and the date.
 * `kind` is only for the page's markup; the words never say an outcome was good or bad.
 */
export type Outcome = { kind: "law" | "vetoed" | "passed" | "failed" | "stopped" | "waiting"; text: string };

const FAILED_RESULT = /\bnot agreed to\b|\brejected\b|\bfailed\b|\bnot invoked\b|\bnot passed\b|\bdefeated\b|\bsustained\b/i;
const OVERRIDE = /overrid|veto|objections of the president/i;
const CHAMBER: Record<string, string> = { house: "House", senate: "Senate", lower: "Texas House", upper: "Texas Senate" };
const otherChamber = (c: string) => (c === "house" ? "senate" : c === "senate" ? "house" : c === "lower" ? "upper" : "lower");

/** "Nov 4, 2026" from an official date ("2026-11-04", with or without a time) or from a time in milliseconds (the day in Washington). */
export function outcomeDay(d: string | number | null | undefined): string | null {
  if (d === null || d === undefined || d === "") return null;
  if (typeof d === "number") return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
}
const on = (day: string | null) => (day ? ` on ${day}` : "");
const tallyOf = (v: { yea?: number | null; nay?: number | null } | null | undefined) => (v && (v.yea ?? 0) + (v.nay ?? 0) > 0 ? `${v.yea ?? 0}–${v.nay ?? 0}` : null);
const newest = <T extends { votedAt: number }>(rows: T[]) => rows.sort((a, b) => b.votedAt - a.votedAt)[0] ?? null;

/** Where a bill started, from its type: H.R. and H.J.Res. start in the House, S. and S.J.Res. in the Senate. */
export function originChamber(billType: string | null | undefined): "house" | "senate" | null {
  const t = (billType ?? "").toLowerCase();
  return t.startsWith("h") ? "house" : t.startsWith("s") ? "senate" : null;
}
/** The latest vote on passing the bill in one chamber that carried. A vote to override a veto is not a passage vote here. */
const carriedPassage = (votes: readonly BillVote[], chamber: string) =>
  newest(votes.filter(v => v.chamber === chamber && kindOf(v) === "passage" && !OVERRIDE.test(v.question) && !FAILED_RESULT.test(v.result ?? "")));

/**
 * What happened to a bill in Congress. `stage` and `stageDate` are the bill's stored stage (official_bill_depth, read
 * from its official actions); `votes` are the recorded votes on file for it, which supply the numbers.
 *
 *   law             "Became law on Nov 4, 2026."
 *   vetoed          "Vetoed by the President on Nov 4, 2026."
 *   president       "Passed the House 392–18 and the Senate 51–49. Still waiting: it went to the President on …"
 *   passed_second   "Passed the House 392–18 and the Senate 51–49, the second of them on … Still waiting to be sent to the President."
 *   resolving       "Passed the House and the Senate in different versions. Still waiting: …"
 *   passed_first    "Passed the House 392–18 on Nov 4, 2026. Still waiting in the Senate."
 *   failed          "Failed in the Senate 47–52 on Nov 4, 2026."
 *   not_taken_up, debate_blocked   "Stopped for now on Nov 3, 2026: the Senate voted 47–52 not to end debate. …"
 *   committee       "Still waiting in committee in the House, where it was sent on … No vote on passing it has been held."
 *   introduced      "Still waiting. It was introduced in the House on … and no committee has acted on it."
 * A number appears only when a recorded vote on file has it; a chamber that passed a bill without one is named without a number.
 */
export function billOutcome(i: { stage: string | null | undefined; stageDate: string | null | undefined; billType: string | null | undefined; votes: readonly BillVote[] }): Outcome {
  const origin = originChamber(i.billType), day = outcomeDay(i.stageDate);
  const pass: Record<string, BillVote | null> = { house: carriedPassage(i.votes, "house"), senate: carriedPassage(i.votes, "senate") };
  const named = (c: string) => `the ${CHAMBER[c]}${tallyOf(pass[c]) ? ` ${tallyOf(pass[c])}` : ""}`;
  const first = origin ?? "house", both = `Passed ${named(first)} and ${named(otherChamber(first))}`;
  const failed = newest(i.votes.filter(v => { const f = takeUpOrPassage(v); return !!f && f.kind === "passage" && !f.passed; }));
  const stopped = newest((["house", "senate"] as const).flatMap(c => { const m = meaningfulVote(i.votes, c); return m && m.role === "stopped" ? [{ ...m, votedAt: m.vote.votedAt }] : []; }));
  const failedText = () => (failed ? `Failed in the ${CHAMBER[failed.chamber] ?? "chamber"}${tallyOf(failed) ? ` ${tallyOf(failed)}` : ""}${on(outcomeDay(failed.votedAt))}${/suspend the rules|2\/3|two-thirds/i.test(`${failed.question} ${failed.result ?? ""}`) ? " (two-thirds needed)" : ""}.`
    : `Failed a vote on passing it${on(day)}.`);
  const stoppedText = (fallback: string) => (stopped ? `Stopped for now${on(outcomeDay(stopped.vote.votedAt))}: ${(stopped.label ?? fallback).replace(/^(House|Senate)\b/, "the $1")}. ${stopped.meaning ?? ""}`.trim()
    : `Stopped for now${on(day)}: ${fallback}.`);
  switch (i.stage) {
    case "law": return { kind: "law", text: `Became law${on(day)}.${pass.house || pass.senate ? ` ${both}.` : ""}` };
    case "vetoed": {
      const o = newest(i.votes.filter(v => OVERRIDE.test(v.question))), f = o ? takeUpOrPassage(o, true) : null;
      return { kind: "vetoed", text: `Vetoed by the President${on(day)}.${f ? ` ${f.label}.` : ""}` };
    }
    case "president": return { kind: "passed", text: `${both}. Still waiting: it went to the President${on(day)} and has not been signed or vetoed.` };
    case "resolving": return { kind: "passed", text: `${both} in different versions. Still waiting: the two chambers have to agree on one final version.${day ? ` The latest step was on ${day}.` : ""}` };
    case "passed_second": return { kind: "passed", text: `${both}${day ? `, the second of them on ${day}` : ""}. Still waiting to be sent to the President.` };
    case "passed_first": {
      const c = pass.house && !pass.senate ? "house" : pass.senate && !pass.house ? "senate" : origin;
      if (!c) return { kind: "passed", text: `Passed one chamber${on(day)}. Still waiting in the other.` };
      return { kind: "passed", text: `Passed ${named(c)}${on(pass[c] ? outcomeDay(pass[c]!.votedAt) : day)}. Still waiting in the ${CHAMBER[otherChamber(c)]}.` };
    }
    case "failed": return { kind: "failed", text: failedText() };
    case "not_taken_up": return { kind: "stopped", text: stoppedText("a vote to take it up failed") };
    case "debate_blocked": return { kind: "stopped", text: stoppedText("a vote to end debate failed") };
    case "committee": return { kind: "waiting", text: `Still waiting in committee${origin ? ` in the ${CHAMBER[origin]}` : ""}${day ? `, where it was sent on ${day}` : ""}. No vote on passing it has been held.` };
    case "introduced": return { kind: "waiting", text: `Still waiting. It was introduced${origin ? ` in the ${CHAMBER[origin]}` : ""}${on(day)} and no committee has acted on it.` };
  }
  // No stored stage yet: say only what the recorded votes on file show.
  const c = pass.house ? "house" : pass.senate ? "senate" : null;
  if (pass.house && pass.senate) return { kind: "passed", text: `${both}. Nothing later is on record here yet.` };
  if (c) return { kind: "passed", text: `Passed ${named(c)}${on(outcomeDay(pass[c]!.votedAt))}. Nothing later is on record here yet.` };
  if (failed) return { kind: "failed", text: failedText() };
  if (stopped) return { kind: "stopped", text: stoppedText("a vote on a step failed") };
  return { kind: "waiting", text: "Still waiting. No vote on passing it is on record here yet." };
}
/** A vote on passing the bill that failed, a failed or carried vote on taking it up, or (when asked) a veto override. */
function takeUpOrPassage(v: BillVote, override = false) {
  const f = floorVoteFromRollCall({ id: v.id, chamber: v.chamber, rollNumber: v.rollNumber ?? 0, votedAt: v.votedAt, question: v.question, title: v.title, result: v.result, yea: v.yea ?? 0, nay: v.nay ?? 0 });
  return f && (override || f.kind !== "veto_override") ? f : null;
}

/** Whether a chamber has passed the bill, as far as its stored stage says. Used to tell "has not voted yet" from "passed without a recorded vote". */
export function chamberPassed(stage: string | null | undefined, billType: string | null | undefined, chamber: string): boolean {
  if (stage === "passed_second" || stage === "resolving" || stage === "president" || stage === "law" || stage === "vetoed") return true;
  return stage === "passed_first" && originChamber(billType) === chamber;
}

/**
 * One member's row on the record page. The same as `memberVoteLine`, with one more honest case: the member's chamber
 * passed the bill and no recorded vote on passing it is on file, so there is no vote by name to show.
 */
export type RecordLine = Omit<MemberLine, "state"> & { state: MemberLine["state"] | "not_recorded" };
export function recordMemberLine(m: Meaningful | null, position: string | null | undefined, answer: ReaderAnswer, date: string, passedHere: { passed: boolean; chamber: string }): RecordLine {
  if (!m && passedHere.passed) return { state: "not_recorded", text: `No vote by name: the ${CHAMBER[passedHere.chamber] ?? "chamber"} passed it without a recorded vote on file`, mark: null, note: null };
  return memberVoteLine(m, position, answer, date);
}

/**
 * A bill that failed has no "yet" (20 Nov 2026: readers now answer on settled bills). A member whose chamber never
 * voted on a failed bill did not vote on it, and the row says so; nothing else about the row changes.
 */
export function settledMemberLine<T extends RecordLine>(line: T, outcome: Outcome["kind"], chamber: string): T {
  return line.state === "not_yet" && outcome === "failed" ? { ...line, text: `No vote: the bill failed before the ${CHAMBER[chamber] ?? "chamber"} voted on it` } : line;
}

/* ───────────────────────────── Texas bills ───────────────────────────── */

export type TxRecordVote = { id: string; chamber: string | null; motion: string; date: string; result: string; yes?: number | null; no?: number | null; tallyOk?: boolean };
export type TxRecordAction = { date: string; chamber: string | null; classification: readonly string[] | null };

const PASSAGE_KINDS: readonly TxMeaningfulKind[] = ["pass", "final_version", "other_chamber"];
const txCarried = (result: string) => /pass|adopt|agreed/i.test(result) && !/fail|not |lost|reject/i.test(result);
/** The latest recorded vote on passing a Texas bill in one chamber: third reading or final passage, the final version, or the other chamber's changes. */
export function txPassageVote(votes: readonly TxRecordVote[], chamber: string): TxRecordVote | null {
  return [...votes].filter(v => v.chamber === chamber && PASSAGE_KINDS.includes(txMeaningfulVote(v.motion) as TxMeaningfulKind)).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}
/** The vote shown for a Texas chamber: the passage vote, else the latest vote that moved it to its final reading (shown, never compared). */
export function txShownVote(votes: readonly TxRecordVote[], chamber: string): { vote: TxRecordVote; role: "passage" | "advance" } | null {
  const p = txPassageVote(votes, chamber);
  if (p) return { vote: p, role: "passage" };
  const a = [...votes].filter(v => v.chamber === chamber && txMeaningfulVote(v.motion) === "advance").sort((x, y) => y.date.localeCompare(x.date))[0];
  return a ? { vote: a, role: "advance" } : null;
}

/**
 * What happened to a Texas bill, from its stored stage (tx_bills.stage), its official actions (for the dates) and the
 * recorded votes on file (for the numbers, only when the stored count matched the listed members).
 */
export function txBillOutcome(i: { stage: string; chamber: string | null; actions: readonly TxRecordAction[]; votes: readonly TxRecordVote[] }): Outcome {
  const has = (a: TxRecordAction, ...cls: string[]) => cls.some(c => (a.classification ?? []).includes(c));
  const dayOf = (...cls: string[]) => outcomeDay([...i.actions].filter(a => has(a, ...cls)).sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null);
  const origin = i.chamber === "upper" || i.chamber === "lower" ? i.chamber : null, first = origin ?? "lower";
  const passedOn = (c: string) => outcomeDay([...i.actions].filter(a => has(a, "passage") && a.chamber === c).sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null);
  const named = (c: string) => { const v = txPassageVote(i.votes, c), t = v && txCarried(v.result) && v.tallyOk !== false ? tallyOf({ yea: v.yes, nay: v.no }) : null; return `the ${CHAMBER[c]}${t ? ` ${t}` : ""}`; };
  const both = `Passed ${named(first)} and ${named(otherChamber(first))}`;
  switch (i.stage as TxStage) {
    case "law": return { kind: "law", text: `Became law${on(dayOf("became-law", "executive-signature"))}.` };
    case "vetoed": return { kind: "vetoed", text: `Vetoed by the Governor${on(dayOf("executive-veto", "veto"))}.` };
    case "governor": return { kind: "passed", text: `${both}. Still waiting: it went to the Governor${on(dayOf("executive-receipt"))} and has not been signed or vetoed.` };
    case "passed_both": return { kind: "passed", text: `${both}. Still waiting to be sent to the Governor.` };
    case "passed_first": {
      const done = (["lower", "upper"] as const).filter(c => passedOn(c)), c = done.length === 1 ? done[0] : origin;
      if (!c) return { kind: "passed", text: "Passed one chamber. Still waiting in the other." };
      return { kind: "passed", text: `Passed ${named(c)}${on(passedOn(c))}. Still waiting in the ${CHAMBER[otherChamber(c)]}.` };
    }
    case "failed": return { kind: "failed", text: `Failed a vote${on(dayOf("failure"))}.` };
    case "committee": return { kind: "waiting", text: `Still waiting in committee${origin ? ` in the ${CHAMBER[origin]}` : ""}${dayOf("referral-committee") ? `, where it was sent on ${dayOf("referral-committee")}` : ""}. No vote on passing it has been held.` };
    default: return { kind: "waiting", text: `Still waiting. It was filed${origin ? ` in the ${CHAMBER[origin]}` : ""}${on(dayOf("filing"))} and no committee has acted on it.` };
  }
}

/** Whether a Texas chamber has passed the bill, from its official actions. */
export function txChamberPassed(actions: readonly TxRecordAction[], chamber: string): boolean {
  return actions.some(a => (a.classification ?? []).includes("passage") && a.chamber === chamber);
}

/**
 * One Texas legislator's row. `option` is the official record's word for that member in the vote shown (yes, no,
 * absent, not voting, excused), or null when the member is not listed in it. Texas chambers decide many bills by voice
 * vote, which lists no member: the row then says so and implies nothing.
 */
export function txMemberLine(shown: { vote: TxRecordVote; role: "passage" | "advance" } | null, option: string | null | undefined, answer: ReaderAnswer, passedHere: { passed: boolean; chamber: string }): RecordLine {
  if (!shown) return passedHere.passed
    ? { state: "not_recorded", text: `No vote by name: the ${CHAMBER[passedHere.chamber] ?? "chamber"} passed it without a recorded vote on file`, mark: null, note: null }
    : { state: "not_yet", text: "Has not voted on it yet", mark: null, note: null };
  const day = outcomeDay(shown.vote.date) ?? shown.vote.date, o = (option ?? "").toLowerCase();
  if (!o) return { state: "not_recorded", text: `Not listed by name in the recorded vote of ${day}`, mark: null, note: null };
  const position = o === "yes" ? "Yea" : o === "no" ? "Nay" : o === "present" ? "Present" : "Not Voting";
  if (shown.role === "passage") return { state: "voted", text: `${positionLine(position, "passage")}, ${day}`, mark: matchMark(answer, position, "passage"), note: null };
  const text = position === "Yea" || position === "Nay" ? `Voted ${position === "Yea" ? "yes" : "no"} on moving it to a final vote` : positionLine(position, "procedural");
  return { state: "voted", text: `${text}, ${day}`, mark: null, note: "This was the vote before the final one, so it is not compared with your answer." };
}

/* ───────────────────────────── Where the list ends ───────────────────────────── */

/** Bills shown on one screen of the record page. */
export const RECORD_PAGE_SIZE = 20;
/** The slice for one screen: `page` starts at 1; anything out of range goes to the nearest real screen. */
export function recordPage(total: number, page: unknown, size = RECORD_PAGE_SIZE): { page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(total / size)), n = Math.floor(Number(page));
  const p = Number.isFinite(n) ? Math.min(pages, Math.max(1, n)) : 1;
  return { page: p, pages, from: (p - 1) * size, to: Math.min(total, p * size) };
}
/** The line that ends the list: every screen says where it stops, and the last one says that is all. */
export function recordEndLine(total: number, r: { page: number; pages: number; from: number; to: number }): string {
  if (!total) return "";
  if (r.pages === 1) return total === 1 ? "That is the one bill you have answered." : `That is all ${total} bills you have answered.`;
  if (r.page === r.pages) return `That is all ${total}. These were bills ${r.from + 1} to ${r.to}, your earliest answers.`;
  return `These are bills ${r.from + 1} to ${r.to} of the ${total} you have answered, newest first.`;
}
