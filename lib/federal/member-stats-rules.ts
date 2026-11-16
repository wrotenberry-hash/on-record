/**
 * Round C member statistics, same method for every member and party. Pure; tested in tests/depth.test.mjs.
 *
 * Missed votes: roll calls in On Record's copy of the record where the member is listed "Not Voting",
 *   out of all roll calls listing the member.
 * With own party's majority: on roll calls where the member voted Yea or Nay and their party's Yea and Nay
 *   counts were not tied, the share where the member voted the way most of their party did.
 *   Members of a party with fewer than 2 other voting members on a roll call are left out of that roll call.
 */
export type PosCount = { Yea?: number; Nay?: number };

export function partyMajority(c: PosCount): "Yea" | "Nay" | null {
  const y = c.Yea ?? 0, n = c.Nay ?? 0;
  return y === n ? null : y > n ? "Yea" : "Nay";
}

/** The party majority with the member's own vote removed, so a member is compared with the rest of their party. */
export function withPartyMajority(member: "Yea" | "Nay", party: PosCount): boolean | null {
  const others = { Yea: (party.Yea ?? 0) - (member === "Yea" ? 1 : 0), Nay: (party.Nay ?? 0) - (member === "Nay" ? 1 : 0) };
  if (others.Yea + others.Nay < 2) return null;
  const m = partyMajority(others);
  return m === null ? null : m === member;
}

export function rate(n: number, d: number) { return d ? Math.round((1000 * n) / d) / 10 : null; }

/** Two members' shared votes: both voted Yea or Nay on the same roll call. */
export function sharedAgreement(a: Map<string, string>, b: Map<string, string>) {
  let same = 0, different = 0;
  const rows: Array<{ rollCallId: string; same: boolean }> = [];
  for (const [id, pa] of a) {
    const pb = b.get(id);
    if (!pb || !["Yea", "Nay"].includes(pa) || !["Yea", "Nay"].includes(pb)) continue;
    const s = pa === pb; if (s) same++; else different++;
    rows.push({ rollCallId: id, same: s });
  }
  return { same, different, total: same + different, rows };
}
