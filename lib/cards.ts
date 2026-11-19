import { READER_S } from "@/lib/analysis/publish-gate";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBills, officialMemberVotes, officialPoliticians, officialRollCalls } from "@/db/schema";
import { billLabel, memberLine } from "@/components/federal/badges";
import { KIND_LABEL, positionLine, voteKind } from "@/lib/federal/vote-kinds";
import { agreementCard, voteCard, type Card, type CardVote } from "@/lib/card-content";
import { agreementWith } from "@/lib/opinions";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";

const headlineOf = (billCol: unknown) => sql<string | null>`(select s.headline from analysis_bill_summaries s where s.bill_id = ${billCol} and ${READER_S} order by s.created_at desc limit 1)`;

/** A vote card, from the record only. Null when the member did not take part in that roll call. */
export async function voteCardFor(memberId: string, rollCallId: string): Promise<{ card: Card; member: string } | null> {
  const db = getDb();
  const row = await db.select({ p: officialPoliticians, rc: officialRollCalls, position: officialMemberVotes.position, billTitle: officialBills.title,
    billType: officialBills.billType, number: officialBills.number, headline: headlineOf(officialRollCalls.billId) })
    .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId))
    .innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId))
    .leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId))
    .where(and(eq(officialMemberVotes.politicianId, memberId), eq(officialMemberVotes.rollCallId, rollCallId))).get();
  if (!row) return null;
  const kind = voteKind(row.rc.question, row.billTitle ?? row.rc.title);
  const v: CardVote = { billLabel: row.billType && row.number ? billLabel(row.billType, row.number) : (row.rc.documentLabel ?? "Recorded vote"),
    billTitle: row.billTitle ?? row.rc.title ?? row.rc.question, headline: row.headline, voteText: positionLine(row.position, kind), kind, kindLabel: KIND_LABEL[kind],
    votedAt: row.rc.votedAt, sourceUrl: row.rc.sourceUrl };
  return { card: voteCard({ name: row.p.fullName, seat: memberLine(row.p) }, v), member: row.p.fullName };
}

/**
 * The reader's own comparison card for one member and issue: ONE count ("Voted the way I did on 4 of 6 bills"),
 * labelled as the reader's own comparison. The bills themselves are not listed on the card (one fact per card);
 * they give it its date (the most recent vote counted) and its sources. Null when there is nothing to show.
 */
export async function agreementCardFor(userId: string, memberId: string, issueSlug: string): Promise<{ card: Card; member: string } | null> {
  const db = getDb();
  const p = await db.select().from(officialPoliticians).where(eq(officialPoliticians.id, memberId)).get();
  if (!p) return null;
  const a = await agreementWith(userId, memberId);
  const row = a.rows.find(r => r.issueSlug === issueSlug);
  if (!row) return null;
  const votes = row.bills.map(b => ({ billLabel: b.billId, billTitle: b.billId, headline: null, voteText: positionLine(b.position, "passage"), kind: "passage", kindLabel: KIND_LABEL.passage, votedAt: b.votedAt,
    sourceUrl: a.votes?.find(v => v.billId === b.billId && v.votedAt === b.votedAt)?.sourceUrl ?? "" } satisfies CardVote));
  const issueName = ISSUE_CATEGORIES.find(c => c.slug === issueSlug)?.name ?? "Other bills";
  return { card: agreementCard({ name: p.fullName, seat: memberLine(p) }, issueName, row.agreed, row.differed, votes), member: p.fullName };
}
