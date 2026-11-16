/**
 * What kind of vote a roll call was, so a procedural vote is never shown as a
 * vote "for" or "against" the bill itself (owner requirement, Round 2). Pure;
 * tested in tests/trial.test.mjs.
 *
 *   passage     the chamber's vote on the measure itself (incl. suspension, concurring, conference reports, veto overrides)
 *   procedural  how or whether the chamber proceeds: cloture, motions to proceed, table, recommit, refer, discharge,
 *               ordering the previous question, and House rules ("Providing for consideration of ...")
 *   amendment   a vote on a proposed change
 *   nomination  a vote to confirm a nominee
 *   other       anything else (shown with its official wording only)
 */
export type VoteKind = "passage" | "procedural" | "amendment" | "nomination" | "other";

const PROCEDURAL = /cloture|motion to proceed|motion to table|to table|recommit|motion to refer|discharge|previous question|adjourn|approving the journal|motion to instruct|point of order|quorum/i;
const PASSAGE = /^on (passage|motion to suspend the rules and (pass|agree|concur)|motion to concur|(agreeing to )?the conference report|overriding the veto|passage, objections of the president|the (joint|concurrent) resolution|agreeing to the resolution|the resolution|the bill)/i;

/** The kind of vote. A House rule (a resolution "providing for consideration" of other bills) is procedural even on adoption. */
export function voteKind(question: string, title?: string | null): VoteKind {
  const q = question.trim();
  if (/^on (the )?nomination/i.test(q)) return "nomination";
  if (PROCEDURAL.test(q)) return "procedural";
  if (/amendment/i.test(q) && !/senate amendments?/i.test(q)) return "amendment";
  if (PASSAGE.test(q)) return title && /providing for (the )?consideration of/i.test(title) ? "procedural" : "passage";
  return "other";
}

export const KIND_LABEL: Record<VoteKind, string> = { passage: "Vote on the bill", procedural: "Procedural vote", amendment: "Vote on an amendment", nomination: "Nomination vote", other: "Recorded vote" };

/**
 * One plain line for how a member voted, worded so a procedural vote never reads as
 * support for or opposition to the bill. Position is the normalised Yea, Nay,
 * Present or Not Voting.
 */
export function positionLine(position: string, kind: VoteKind): string {
  const p = position.toLowerCase();
  if (p === "not voting") return "Did not vote";
  if (p === "present") return "Voted present";
  const yes = p === "yea";
  switch (kind) {
    case "passage": return yes ? "Voted yes on passing it" : "Voted no on passing it";
    case "procedural": return yes ? "Voted yes on a procedural step (not a vote on the bill itself)" : "Voted no on a procedural step (not a vote on the bill itself)";
    case "amendment": return yes ? "Voted yes on the amendment" : "Voted no on the amendment";
    case "nomination": return yes ? "Voted to confirm" : "Voted not to confirm";
    default: return yes ? "Voted yes" : "Voted no";
  }
}

/**
 * Round C: what a Yes and a No meant on this question, in plain words. Built only
 * from the official question and title; worded the same way whichever side won.
 */
export function yesNoMeaning(question: string, title?: string | null): { yes: string; no: string } {
  const q = question.toLowerCase(), t = title ?? "";
  if (/^on (the )?nomination/.test(q)) return { yes: "Confirm the nominee", no: "Do not confirm the nominee" };
  if (/cloture/.test(q)) return { yes: "End debate so the Senate can move toward a final vote (procedural)", no: "Keep debate going for now (procedural)" };
  if (/motion to proceed/.test(q)) return { yes: "Start debating the measure (procedural)", no: "Do not start debate now (procedural)" };
  if (/recommit/.test(q)) return { yes: "Send the bill back to committee (procedural)", no: "Keep the bill on the floor for a final vote (procedural)" };
  if (/table/.test(q)) return { yes: "Set the motion or amendment aside (procedural)", no: "Keep it alive for a vote (procedural)" };
  if (/previous question/.test(q)) return { yes: "End debate on the rule and vote on it now (procedural)", no: "Keep debate open, which can allow changes to the rule (procedural)" };
  if (/overrid|objections of the president/.test(q)) return { yes: "Make the bill law despite the veto (needs two-thirds)", no: "Let the veto stand" };
  if (/conference report/.test(q)) return { yes: "Approve the final House-Senate compromise version", no: "Reject the compromise version" };
  if (/concur/.test(q)) return { yes: "Accept the other chamber's version", no: "Do not accept the other chamber's version" };
  if (/amendment/.test(q) && !/senate amendments?/.test(q)) return { yes: "Add the amendment to the bill", no: "Leave the bill without the amendment" };
  if (/providing for (the )?consideration of/i.test(t)) return { yes: "Approve the debate rules for the bills named (procedural)", no: "Reject those debate rules (procedural)" };
  if (/suspend the rules/.test(q)) return { yes: "Pass it under fast-track rules (needs two-thirds)", no: "Do not pass it under fast-track rules" };
  if (/passage|the bill|the resolution|joint resolution|concurrent resolution/.test(q)) return { yes: "Pass it", no: "Do not pass it" };
  if (/quorum/.test(q)) return { yes: "Present for the count", no: "Not counted present" };
  return { yes: "Yes on the question as worded", no: "No on the question as worded" };
}
