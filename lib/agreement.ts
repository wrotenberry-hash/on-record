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
