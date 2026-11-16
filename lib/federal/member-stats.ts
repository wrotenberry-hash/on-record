import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { officialMemberVotes, officialPoliticians, officialRollCalls } from "@/db/schema";
import { partyCode } from "@/lib/federal/bill-depth";
import { rate, sharedAgreement, withPartyMajority } from "@/lib/federal/member-stats-rules";
import { voteKind } from "@/lib/federal/vote-kinds";

/** Missed votes and votes with own party's majority for one member (Official, computed; method on the page). */
export async function memberStats(politicianId: string) {
  const db = getDb();
  const p = await db.select({ party: officialPoliticians.party }).from(officialPoliticians).where(eq(officialPoliticians.id, politicianId)).get();
  if (!p) return null;
  const mine = await db.select({ id: officialMemberVotes.rollCallId, position: officialMemberVotes.position }).from(officialMemberVotes).where(eq(officialMemberVotes.politicianId, politicianId));
  const missed = mine.filter(v => v.position === "Not Voting").length;
  const voted = mine.filter(v => v.position === "Yea" || v.position === "Nay");
  const code = partyCode(p.party);
  let withParty = 0, counted = 0;
  if (voted.length) {
    const ids = voted.map(v => v.id);
    const party = await db.select({ id: officialMemberVotes.rollCallId, position: officialMemberVotes.position, party: officialPoliticians.party, n: sql<number>`count(*)` })
      .from(officialMemberVotes).innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId))
      .where(and(inArray(officialMemberVotes.rollCallId, ids), inArray(officialMemberVotes.position, ["Yea", "Nay"]))).groupBy(officialMemberVotes.rollCallId, officialMemberVotes.position, officialPoliticians.party);
    const tally = new Map<string, { Yea?: number; Nay?: number }>();
    for (const r of party) if (partyCode(r.party) === code) { const t = tally.get(r.id) ?? {}; t[r.position as "Yea" | "Nay"] = (t[r.position as "Yea" | "Nay"] ?? 0) + Number(r.n); tally.set(r.id, t); }
    for (const v of voted) { const w = withPartyMajority(v.position as "Yea" | "Nay", tally.get(v.id) ?? {}); if (w === null) continue; counted++; if (w) withParty++; }
  }
  return { rollCalls: mine.length, missed, missedRate: rate(missed, mine.length), withParty, partyCounted: counted, withPartyRate: rate(withParty, counted), party: p.party };
}

/** Shared votes of two members, overall and by issue (each roll call's bill's first issue). */
export async function compareMembers(a: string, b: string) {
  const db = getDb();
  const load = async (id: string) => new Map((await db.select({ r: officialMemberVotes.rollCallId, p: officialMemberVotes.position }).from(officialMemberVotes).where(eq(officialMemberVotes.politicianId, id))).map(x => [x.r, x.p]));
  const [va, vb] = await Promise.all([load(a), load(b)]);
  const all = sharedAgreement(va, vb);
  if (!all.rows.length) return { ...all, byIssue: [], kinds: { passage: { same: 0, total: 0 } }, details: [] };
  const rolls = await db.select({ id: officialRollCalls.id, question: officialRollCalls.question, title: officialRollCalls.title, billId: officialRollCalls.billId, votedAt: officialRollCalls.votedAt,
    issue: sql<string | null>`(select ic.name from bill_categories bc join issue_categories ic on ic.slug = bc.category_slug where bc.bill_id = ${officialRollCalls.billId} order by ic.sort_order limit 1)` })
    .from(officialRollCalls).where(inArray(officialRollCalls.id, all.rows.map(r => r.rollCallId)));
  const byId = new Map(rolls.map(r => [r.id, r]));
  const issues = new Map<string, { same: number; total: number }>();
  const passage = { same: 0, total: 0 };
  for (const r of all.rows) {
    const rc = byId.get(r.rollCallId); if (!rc) continue;
    const k = rc.issue ?? "Not sorted into an issue";
    const e = issues.get(k) ?? { same: 0, total: 0 }; e.total++; if (r.same) e.same++; issues.set(k, e);
    if (voteKind(rc.question, rc.title) === "passage") { passage.total++; if (r.same) passage.same++; }
  }
  const details = all.rows.map(r => ({ ...r, ...byId.get(r.rollCallId)!, a: va.get(r.rollCallId)!, b: vb.get(r.rollCallId)! })).sort((x, y) => y.votedAt - x.votedAt).slice(0, 40);
  return { ...all, byIssue: [...issues].map(([issue, v]) => ({ issue, ...v })).sort((x, y) => y.total - x.total), kinds: { passage }, details };
}
