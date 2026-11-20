/**
 * Answers on bills that are already settled (owner, 20 Nov 2026: "Readers answer on every bill, at every stage, and
 * every answer counts the same way"). Pure: no database, no network.
 *
 * A bill is settled when it became law, failed, or was vetoed (and, by the same reasoning, when its Congress or
 * session ended without it becoming law). The question changes; nothing else does. The answer is stored in the same
 * table, counted by the same rule (`voteCounts` in ./rules.ts), in the same tiers, and shown from the same 25 voters.
 * Settled-bill opinion and pending-bill opinion are never added into one number (lib/office/rules.ts keeps them in
 * two sections).
 */
export type Settled = "law" | "not_law";

/** The stored stages that settle a bill, for Congress and for Texas alike (lib/changes/window.ts adds an ended Congress or session). */
export function settledFromStage(stage: string | null | undefined): Settled | null {
  return stage === "law" ? "law" : stage === "vetoed" || stage === "failed" ? "not_law" : null;
}

/** Owner's wording, 20 Nov 2026. */
export const SETTLED_QUESTION: Record<Settled, string> = { law: "Do you agree with this law?", not_law: "Would you have supported this bill?" };

/**
 * Whether answers are reaching a legislator today.
 *   "live":      counting is on and the office of one of the reader's own legislators has signed in.
 *   "no_office": counting is on, and no office of the reader's legislators has signed in yet.
 *   "off":       counting is not on, so nothing is added to any total yet.
 * Owner, 20 Nov 2026: "Until counting is on and a legislator's office has signed in, wording says answers 'will be
 * included' in what legislators see, never that they are being seen now."
 */
export type Delivery = "live" | "no_office" | "off";
export function deliveryOf(i: { countingOn: boolean; officeSignedIn: boolean }): Delivery {
  return !i.countingOn ? "off" : i.officeSignedIn ? "live" : "no_office";
}

const CANNOT_CHANGE = "This is settled, so your answer can't change it.";
/** The one line under a settled bill's question. "live" is the owner's sentence, word for word. */
export const SETTLED_LINE: Record<Delivery, string> = {
  live: `${CANNOT_CHANGE} It tells your legislators what their district thinks of it, and lets you see how often they vote the way you would.`,
  no_office: `${CANNOT_CHANGE} It will be included in what your legislators see of their district's view once their office signs in, and it lets you see how often they vote the way you would.`,
  off: `${CANNOT_CHANGE} Once counting is on, counted answers will be included in what your legislators see of their district's view. Today it lets you see how often they vote the way you would.`,
};

/** The question above Support / Oppose / Unsure: the pending-bill question as it is, or the settled one with its line. */
export function billQuestion(settled: Settled | null | undefined, pending: { question: string; plain: boolean }, delivery: Delivery): { question: string; plain: boolean; line: string | null } {
  // A settled question does not carry the headline, so the official title is printed beside it rather than one tap away.
  return settled ? { question: SETTLED_QUESTION[settled], plain: false, line: SETTLED_LINE[delivery] } : { ...pending, line: null };
}

/** Said in place of a "same as you" mark when the reader answered Unsure. */
export const UNSURE_NOT_COMPARED = "You answered Unsure, so their votes are not compared with your answer.";
/** The heading over the reader's own legislators' votes, shown after any answer on a bill that has had a vote. */
export const YOUR_LEGISLATORS_VOTED = "How your legislators voted";
