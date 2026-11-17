/**
 * "Your voice" rules (test-ready build, 17 Nov 2026). Pure; tested in tests/voice.test.mjs.
 *
 * The page puts a reader's own answer on a bill beside how each of their legislators voted on it. Three rules live here:
 *   1. which of a bill's recorded votes is shown for a chamber (`meaningfulVote`);
 *   2. how a member's part in that vote is worded, and whether it is marked as the same as the reader's answer
 *      (`memberVoteLine`): only a vote on the bill itself is ever compared with an answer;
 *   3. what is said about the reader's district (`districtView`): a total only from MIN_SHOWN counted answers.
 * No score, share or percentage is made here. The same wording is used for every member and party.
 */
import { positionLine, voteKind } from "./federal/vote-kinds.ts";
import { floorVoteFromRollCall } from "./federal/depth-parse.ts";
import { MIN_SHOWN, totalsLine } from "./verify/rules.ts";

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
export const DISTRICT_THRESHOLD_MESSAGE = `Not enough verified answers from your district yet. Totals show once ${MIN_SHOWN} verified people have answered.`;
export const DISTRICT_OFF_MESSAGE = "District totals are not switched on yet, so there is nothing to show here. Your answers stay private.";
export const DISTRICT_UNKNOWN_MESSAGE = "We do not know your district yet. Add your street address to see your district's view.";

export type DistrictView = { kind: "off" | "unknown" | "below" | "total"; text: string };
/**
 * What the page says about the reader's district for one bill. A total is shown only when verification is on, the district
 * is known and at least MIN_SHOWN counted answers exist there; below that, never a number.
 */
export function districtView(input: { enabled: boolean; districtId: string | null; totals: { support: number; oppose: number } | null | undefined }): DistrictView {
  if (!input.enabled) return { kind: "off", text: DISTRICT_OFF_MESSAGE };
  if (!input.districtId) return { kind: "unknown", text: DISTRICT_UNKNOWN_MESSAGE };
  const n = (input.totals?.support ?? 0) + (input.totals?.oppose ?? 0);
  if (n < MIN_SHOWN) return { kind: "below", text: DISTRICT_THRESHOLD_MESSAGE };
  return { kind: "total", text: totalsLine(`Verified people in ${input.districtId}`, input.totals) };
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
