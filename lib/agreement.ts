/**
 * A reader's own agreement with a member, per issue (Round 3). Pure; tested in
 * tests/trial.test.mjs. It is computed only from the reader's own Support or
 * Oppose answers and the member's votes on the bill itself: procedural votes,
 * amendments and nominations never count, and Present or Not Voting is neither
 * agreement nor disagreement. It is the reader's private comparison, not a
 * rating of the member by On Record.
 */
export type Stance = "support" | "oppose";
export type MemberVote = { billId: string; position: string; kind: string; votedAt: number };
export type AgreementRow = { issueSlug: string; agreed: number; differed: number; bills: Array<{ billId: string; agreed: boolean; position: string; votedAt: number }> };

/** The member's latest vote on passing each bill. */
export function latestPassageVotes(votes: readonly MemberVote[]): Map<string, MemberVote> {
  const out = new Map<string, MemberVote>();
  for (const v of votes) {
    if (v.kind !== "passage" || !["Yea", "Nay"].includes(v.position)) continue;
    const prev = out.get(v.billId);
    if (!prev || v.votedAt > prev.votedAt) out.set(v.billId, v);
  }
  return out;
}

export function agreementByIssue(stances: ReadonlyMap<string, Stance>, votes: readonly MemberVote[], issuesOf: (billId: string) => readonly string[]): AgreementRow[] {
  const passage = latestPassageVotes(votes), rows = new Map<string, AgreementRow>();
  for (const [billId, stance] of stances) {
    const v = passage.get(billId);
    if (!v) continue;
    const agreed = (stance === "support") === (v.position === "Yea");
    for (const slug of issuesOf(billId).length ? issuesOf(billId) : ["unsorted"]) {
      const row = rows.get(slug) ?? { issueSlug: slug, agreed: 0, differed: 0, bills: [] };
      if (agreed) row.agreed++; else row.differed++;
      row.bills.push({ billId, agreed, position: v.position, votedAt: v.votedAt });
      rows.set(slug, row);
    }
  }
  return [...rows.values()].sort((a, b) => (b.agreed + b.differed) - (a.agreed + a.differed));
}

/** "Agreed on 2 of 3 bills": the reader's own words for it, never a percentage grade. */
export function agreementLine(row: Pick<AgreementRow, "agreed" | "differed">) {
  const total = row.agreed + row.differed;
  return `Agreed on ${row.agreed} of ${total} bill${total === 1 ? "" : "s"}`;
}

/* ───────────── "Your record": one plain count per legislator (owner, 18 Nov 2026, point 5) ───────────── */

export type SameWay = { same: number; compared: number };
/**
 * How often one legislator voted the way the reader answered: the reader's Support or Oppose answers against that
 * legislator's latest Yes or No vote on passing each bill (`latestPassageVotes`, the rule the member page already uses).
 * Left out, always: procedural votes, amendments and nominations; bills with no recorded vote by that legislator;
 * Present and Not Voting; and every Unsure answer. It is a count of the reader's own answers. It is never turned into
 * a percentage, a rank or an order, and it says nothing about the legislator beyond those bills.
 */
export function sameWayCount(answers: ReadonlyMap<string, string>, votes: readonly MemberVote[]): SameWay {
  const passage = latestPassageVotes(votes);
  let same = 0, compared = 0;
  for (const [billId, answer] of answers) {
    if (answer !== "support" && answer !== "oppose") continue; // Unsure is never compared
    const v = passage.get(billId);
    if (!v) continue;
    compared++;
    if ((answer === "support") === (v.position === "Yea")) same++;
  }
  return { same, compared };
}

/** "Voted the way you did on 4 of 6 bills." With nothing to compare it says so, never "0 of 0". */
export function sameWayLine(c: SameWay): string {
  if (!c.compared) return "No bills to compare yet.";
  return `Voted the way you did on ${c.same} of ${c.compared} bill${c.compared === 1 ? "" : "s"}.`;
}
/** Said beside every count, every time. */
export const OWN_COMPARISON = "Your own comparison, not a grade or score of the legislator.";
/** What the count leaves out, in the reader's words. */
export const COMPARISON_LEFT_OUT = "Only votes on passing a bill are counted, and only bills where you answered Support or Oppose. Left out: votes on procedure and on amendments, bills that passed or stopped without a recorded vote, votes where the legislator was absent or voted present, and your Unsure answers.";
