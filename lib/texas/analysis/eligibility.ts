/**
 * Which Texas bills may be summarised (owner instruction, 17 Nov 2026: "Only summarize bills that get a committee
 * hearing, a vote, or that a user follows").
 *
 * A bill is eligible when at least one of these is true, and never otherwise:
 *   - hearing:  it is on a committee hearing agenda (tx_events), or its actions show a public hearing;
 *   - vote:     it has a recorded vote (tx_votes), or its actions show a floor decision or a committee's vote;
 *   - followed: at least one reader follows it (bill_follows, where a Texas follow carries the tx_bills id).
 * Order: bills with a hearing or vote, most recent first; then bills that are only followed, most followers first.
 *
 * Pure: no database, no network. Tested in tests/texas-summaries.test.mjs. The action wording is Texas Legislature
 * Online's own (the feed copies it); the patterns were written from the real action list of 89R S.B. 4.
 */

export type EligAction = { date: string; description: string; chamber?: string | null; classification?: readonly string[] | null };
export type EligBill = { id: string; identifier: string;
  actions: readonly EligAction[];
  /** Recorded votes on the bill (the record lists how each member voted). */
  votes: ReadonlyArray<{ date: string; motion?: string | null }>;
  /** Committee hearing agendas that list the bill, by the hearing's date. */
  hearings: ReadonlyArray<{ date: string; name?: string | null }>;
  /** How many readers follow the bill. */
  followers: number };

export type EligReason = { kind: "hearing" | "vote" | "followed"; date: string | null; detail: string };
export type Eligibility = { eligible: boolean; reasons: EligReason[];
  /** The date of the most recent hearing or vote (a scheduled hearing may be in the future); null when the bill is only followed. */
  activityDate: string | null; followers: number };

/** "Scheduled for public hearing on . . .", "Considered in public hearing", "Testimony taken in committee". A formal meeting or work session is not a hearing. */
export const HEARING_ACTION = /\b(?:scheduled|posted|set) for (?:a )?public hearing\b|\bconsidered in public hearing\b|\bpublic hearing held\b|\btestimony taken\b/i;

/**
 * A decision by a chamber: "Passed", "Passed to 3rd reading", "Passed to engrossment as amended", "Failed to pass",
 * "Adopted", "Record vote", "Vote recorded in Journal", "Senate concurs in House amendment(s)", "House adopts
 * conference committee report". Reports of the other chamber's action ("House passage as amended reported") and
 * procedural steps ("Rules suspended", "Read 2nd time") are not decisions on the bill.
 */
export const FLOOR_DECISION = /^(?:passed\b|failed to pass\b|failed of passage\b|adopted\b|failed of adoption\b|record vote\b|nonrecord vote\b|vote recorded in journal\b|(?:house|senate) (?:concurs|refuses to concur|adopts conf(?:erence)?\.? comm(?:ittee)?\.? report)\b)/i;
/** A committee's vote: "Reported favorably w/o amendment(s)", "Reported favorably as substituted", "Vote taken in committee", "Failed to receive affirmative vote in comm." */
export const COMMITTEE_VOTE = /^(?:reported (?:favorably|unfavorably)\b|vote taken in committee\b|failed to receive affirmative vote\b)/i;
const DECISION_CLASSES = new Set(["passage", "failure", "committee-passage", "committee-passage-favorable", "committee-passage-unfavorable", "committee-failure", "veto-override-passage", "veto-override-failure"]);

const later = (a: string | null, b: string | null) => (a && b ? (a >= b ? a : b) : a ?? b);

export function txEligibility(b: EligBill): Eligibility {
  const reasons: EligReason[] = [];
  let hearing: EligReason | null = null, vote: EligReason | null = null;
  const keep = (cur: EligReason | null, next: EligReason) => (!cur || (next.date ?? "") > (cur.date ?? "") ? next : cur);
  for (const h of b.hearings) if (h.date) hearing = keep(hearing, { kind: "hearing", date: h.date.slice(0, 10), detail: `On a committee hearing agenda${h.name ? `: ${h.name}` : ""}` });
  for (const v of b.votes) if (v.date) vote = keep(vote, { kind: "vote", date: v.date.slice(0, 10), detail: `Recorded vote${v.motion ? `: ${v.motion}` : ""}` });
  for (const a of b.actions) {
    const d = a.description.trim(), date = a.date?.slice(0, 10) ?? null;
    if (HEARING_ACTION.test(d)) hearing = keep(hearing, { kind: "hearing", date, detail: `Action: ${d}` });
    else if (FLOOR_DECISION.test(d) || COMMITTEE_VOTE.test(d) || (a.classification ?? []).some(c => DECISION_CLASSES.has(c)))
      vote = keep(vote, { kind: "vote", date, detail: `${COMMITTEE_VOTE.test(d) ? "Committee vote" : "Decision"}: ${d}` });
  }
  if (hearing) reasons.push(hearing);
  if (vote) reasons.push(vote);
  // What a reader follows is the reader's own: the stored reason never says how many follow the bill, and it is for the editor's record only.
  if (b.followers > 0) reasons.push({ kind: "followed", date: null, detail: "Followed by at least one reader" });
  return { eligible: reasons.length > 0, reasons, activityDate: later(hearing?.date ?? null, vote?.date ?? null), followers: Math.max(0, b.followers) };
}

/**
 * The writing order. Bills with a hearing or a vote come first, most recent first; bills that are only followed come
 * after, most followers first. A bill with no hearing, no vote and no follower is not in the result at all.
 */
export function orderEligible<T extends EligBill>(bills: readonly T[]): Array<{ bill: T; eligibility: Eligibility }> {
  const rows = bills.map(bill => ({ bill, eligibility: txEligibility(bill) })).filter(r => r.eligibility.eligible);
  return rows.sort((a, b) => {
    const x = a.eligibility, y = b.eligibility;
    if (!!x.activityDate !== !!y.activityDate) return x.activityDate ? -1 : 1;
    if (x.activityDate && y.activityDate && x.activityDate !== y.activityDate) return x.activityDate > y.activityDate ? -1 : 1;
    return y.followers - x.followers || a.bill.id.localeCompare(b.bill.id);
  });
}

/** One line for the record of why a summary was written. */
export function eligibilityLine(e: Eligibility): string {
  return e.reasons.map(r => `${r.kind}${r.date ? ` ${r.date}` : ""} (${r.detail})`).join("; ") || "not eligible";
}
