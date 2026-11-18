import { and, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBills, officialMemberVotes, officialRollCalls } from "@/db/schema";
import { READER_S } from "@/lib/analysis/publish-gate";
import { federalLegislators, type Legislator } from "@/lib/federal/legislators";
import type { Location } from "@/lib/location";
import { scopeTotals } from "@/lib/verify/store";
import { answeredBills, districtView, meaningfulVote, memberVoteLine, type AnswerRow, type BillVote, type DistrictView, type MemberLine } from "@/lib/voice-rules";

/**
 * "Your voice": the reader's own answers beside their legislators' votes on the same bills and their district's
 * counted total. OPINION content: read only for that reader (lib/opinions.ts). Rules are in lib/voice-rules.ts.
 *
 * Federal bills only: Texas bill pages have no Support / Oppose yet (opinion_user_votes points at federal bills),
 * so there are no Texas answers to list. The rules already take Texas votes when that arrives.
 */
const shortDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

export type VoiceMemberRow = { member: Legislator; line: MemberLine; sourceUrl: string | null };
export type VoiceBill = AnswerRow & { billType: string; number: number; officialTitle: string; headline: string | null; members: VoiceMemberRow[]; district: DistrictView };

/** The reader's two senators and representative from their saved place; empty when no place is saved. */
export async function readerLegislators(loc: Location | null): Promise<Legislator[]> {
  if (!loc) return [];
  const f = await federalLegislators(loc.state, loc.congressional);
  return [...f.senators, ...(f.representative ? [f.representative] : [])];
}

export async function voiceFor(userId: string | null, input: { members: Legislator[]; verificationEnabled: boolean; districtId: string | null }): Promise<VoiceBill[]> {
  if (!userId) return [];
  const db = getDb();
  const mine = await import("@/lib/opinions").then(m => m.answersOf(userId));
  const answers = answeredBills(mine.filter(a => a.answer !== "unsure").map(a => ({ billId: a.billId, stance: a.answer, updatedAt: a.at })), mine.filter(a => a.answer === "unsure").map(a => ({ billId: a.billId, updatedAt: a.at })));
  if (!answers.length) return [];
  const billIds = answers.map(a => a.billId);
  const [bills, rolls, totals] = await Promise.all([
    // The Analysis headline only when a summary is visible to readers (lib/analysis/publish-gate.ts).
    db.select({ id: officialBills.id, billType: officialBills.billType, number: officialBills.number, title: officialBills.title,
      headline: sql<string | null>`(select s.headline from analysis_bill_summaries s where s.bill_id = ${officialBills.id} and ${READER_S} order by s.created_at desc limit 1)` })
      .from(officialBills).where(inArray(officialBills.id, billIds)),
    db.select({ id: officialRollCalls.id, billId: officialRollCalls.billId, chamber: officialRollCalls.chamber, question: officialRollCalls.question, title: officialRollCalls.title,
      result: officialRollCalls.result, votedAt: officialRollCalls.votedAt, rollNumber: officialRollCalls.rollNumber, yea: officialRollCalls.yea, nay: officialRollCalls.nay, sourceUrl: officialRollCalls.sourceUrl })
      .from(officialRollCalls).where(inArray(officialRollCalls.billId, billIds)),
    input.verificationEnabled && input.districtId ? scopeTotals(input.districtId, billIds).catch(() => []) : [],
  ]);
  const billById = new Map(bills.map(b => [b.id, b]));
  const votesOf = (billId: string): BillVote[] => rolls.filter(r => r.billId === billId).map(r => ({ ...r, title: r.title ?? billById.get(billId)?.title ?? null }));
  // The one vote that matters per bill and chamber, then how each of the reader's members voted in it.
  const chambers = [...new Set(input.members.map(m => m.chamber))];
  const picked = new Map<string, ReturnType<typeof meaningfulVote>>();
  for (const id of billIds) for (const c of chambers) picked.set(`${id}|${c}`, meaningfulVote(votesOf(id), c));
  const rollIds = [...new Set([...picked.values()].filter((m): m is NonNullable<typeof m> => !!m).map(m => m.vote.id))];
  const positions = rollIds.length && input.members.length ? await db.select({ rollCallId: officialMemberVotes.rollCallId, politicianId: officialMemberVotes.politicianId, position: officialMemberVotes.position })
    .from(officialMemberVotes).where(and(inArray(officialMemberVotes.rollCallId, rollIds), inArray(officialMemberVotes.politicianId, input.members.map(m => m.id)))) : [];
  const sourceOf = new Map(rolls.map(r => [r.id, r.sourceUrl]));
  return answers.flatMap(a => {
    const bill = billById.get(a.billId);
    if (!bill) return [];
    const members = input.members.map(member => {
      const m = picked.get(`${a.billId}|${member.chamber}`) ?? null;
      const position = m ? positions.find(p => p.rollCallId === m.vote.id && p.politicianId === member.id)?.position ?? null : null;
      return { member, line: memberVoteLine(m, position, a.answer, m ? shortDay(m.vote.votedAt) : ""), sourceUrl: m ? sourceOf.get(m.vote.id) ?? null : null };
    });
    const t = totals.find(x => x.billId === a.billId && x.tierGroup === "district") ?? null;
    return [{ ...a, billType: bill.billType, number: bill.number, officialTitle: bill.title, headline: bill.headline, members,
      district: districtView({ enabled: input.verificationEnabled, districtId: input.districtId, totals: t }) }];
  });
}
