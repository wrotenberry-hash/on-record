import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { billCategories, categoryMappings, ingestRuns, issueCategories, officialBillSubjects, officialBills, officialMemberVotes, officialPoliticians,
  officialRollCalls, userFollows } from "@/db/schema";
import { LAWMAKING_TYPES } from "@/lib/federal/parse";

/** Read-only queries over the official record. Callers decide who may see the result (lib/viewer.ts). */

export async function listPoliticians({ q, state, chamber }: { q?: string; state?: string; chamber?: string }) {
  const where = [eq(officialPoliticians.isCurrent, 1)];
  if (q?.trim()) { const t = `%${q.trim()}%`; where.push(or(like(officialPoliticians.fullName, t), like(officialPoliticians.lastName, t))!); }
  if (state && /^[A-Z]{2}$/.test(state)) where.push(eq(officialPoliticians.state, state));
  if (chamber === "house" || chamber === "senate") where.push(eq(officialPoliticians.chamber, chamber));
  return getDb().select().from(officialPoliticians).where(and(...where))
    .orderBy(asc(officialPoliticians.state), desc(officialPoliticians.chamber), asc(officialPoliticians.district), asc(officialPoliticians.lastName)).limit(600);
}

export async function listStates() {
  return (await getDb().selectDistinct({ state: officialPoliticians.state }).from(officialPoliticians).where(eq(officialPoliticians.isCurrent, 1))
    .orderBy(asc(officialPoliticians.state))).map(r => r.state);
}

export async function getPolitician(id: string) {
  return getDb().select().from(officialPoliticians).where(eq(officialPoliticians.id, id)).get();
}

export async function recentVotes(politicianId: string, limit = 10) {
  return getDb().select({ rollCallId: officialRollCalls.id, chamber: officialRollCalls.chamber, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question,
    title: officialRollCalls.title, result: officialRollCalls.result, documentLabel: officialRollCalls.documentLabel, billId: officialRollCalls.billId,
    yea: officialRollCalls.yea, nay: officialRollCalls.nay, sourceUrl: officialRollCalls.sourceUrl, retrievedAt: officialRollCalls.retrievedAt,
    position: officialMemberVotes.position, rawPosition: officialMemberVotes.rawPosition, billTitle: officialBills.title })
    .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId))
    .leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId))
    .where(eq(officialMemberVotes.politicianId, politicianId)).orderBy(desc(officialRollCalls.votedAt)).limit(limit);
}

export async function categoriesWithCounts() {
  const counts = await getDb().select({ slug: billCategories.categorySlug, n: sql<number>`count(*)` }).from(billCategories)
    .innerJoin(officialBills, eq(officialBills.id, billCategories.billId)).where(inArray(officialBills.billType, [...LAWMAKING_TYPES])).groupBy(billCategories.categorySlug);
  const bySlug = new Map(counts.map(c => [c.slug, Number(c.n)]));
  return (await getDb().select().from(issueCategories).orderBy(asc(issueCategories.sortOrder))).map(c => ({ ...c, bills: bySlug.get(c.slug) ?? 0 }));
}

export async function getCategory(slug: string) { return getDb().select().from(issueCategories).where(eq(issueCategories.slug, slug)).get(); }

export async function billsInCategory(slug: string, limit = 30) {
  return getDb().select({ id: officialBills.id, title: officialBills.title, billType: officialBills.billType, number: officialBills.number,
    latestActionText: officialBills.latestActionText, latestActionAt: officialBills.latestActionAt, policyArea: officialBills.policyArea })
    .from(billCategories).innerJoin(officialBills, eq(officialBills.id, billCategories.billId))
    .where(and(eq(billCategories.categorySlug, slug), inArray(officialBills.billType, [...LAWMAKING_TYPES])))
    .orderBy(sql`${officialBills.latestActionAt} desc nulls last`).limit(limit);
}

export async function getBill(id: string) {
  const db = getDb();
  const bill = await db.select().from(officialBills).where(eq(officialBills.id, id)).get();
  if (!bill) return null;
  const [votes, subjects, categories, sponsor] = await Promise.all([
    db.select().from(officialRollCalls).where(eq(officialRollCalls.billId, id)).orderBy(desc(officialRollCalls.votedAt)),
    db.select({ subject: officialBillSubjects.subject }).from(officialBillSubjects).where(eq(officialBillSubjects.billId, id)),
    db.select({ slug: issueCategories.slug, name: issueCategories.name }).from(billCategories).innerJoin(issueCategories, eq(issueCategories.slug, billCategories.categorySlug))
      .where(eq(billCategories.billId, id)).orderBy(asc(issueCategories.sortOrder)),
    bill.sponsorId ? db.select().from(officialPoliticians).where(eq(officialPoliticians.id, bill.sponsorId)).get() : Promise.resolve(undefined),
  ]);
  return { bill, votes, subjects: subjects.map(s => s.subject), categories, sponsor: sponsor ?? null };
}

export async function followedIds(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  return new Set((await getDb().select({ id: userFollows.politicianId }).from(userFollows).where(eq(userFollows.userId, userId))).map(r => r.id));
}

export async function followedPoliticians(userId: string) {
  return getDb().select({ p: officialPoliticians }).from(userFollows).innerJoin(officialPoliticians, eq(officialPoliticians.id, userFollows.politicianId))
    .where(eq(userFollows.userId, userId)).orderBy(asc(officialPoliticians.lastName)).then(rows => rows.map(r => r.p));
}

export async function lastFederalRun() {
  return getDb().select().from(ingestRuns).where(eq(ingestRuns.job, "federal")).orderBy(desc(ingestRuns.startedAt)).limit(1).get();
}

/** Counts only, for the health probe. */
export async function federalCounts() {
  const db = getDb(), one = async (q: Promise<{ n: number } | undefined>) => Number((await q)?.n ?? 0);
  const [politicians, rollCalls, memberVotes, bills, billsComplete, categorized] = await Promise.all([
    one(db.select({ n: sql<number>`count(*)` }).from(officialPoliticians).where(eq(officialPoliticians.isCurrent, 1)).get()),
    one(db.select({ n: sql<number>`count(*)` }).from(officialRollCalls).get()),
    one(db.select({ n: sql<number>`count(*)` }).from(officialMemberVotes).get()),
    one(db.select({ n: sql<number>`count(*)` }).from(officialBills).get()),
    one(db.select({ n: sql<number>`count(*)` }).from(officialBills).where(eq(officialBills.detailStatus, "complete")).get()),
    one(db.select({ n: sql<number>`count(distinct ${billCategories.billId})` }).from(billCategories).get()),
  ]);
  const latestVote = await db.select({ at: officialRollCalls.votedAt }).from(officialRollCalls).orderBy(desc(officialRollCalls.votedAt)).limit(1).get();
  return { politicians, rollCalls, memberVotes, bills, billsComplete, billsCategorized: categorized, latestVoteAt: latestVote ? new Date(latestVote.at).toISOString() : null };
}

/** The editable sorting rules, shown publicly so anyone can see why a bill sits under an issue. */
export async function listMappings() {
  return getDb().select({ sourceKind: categoryMappings.sourceKind, matchKind: categoryMappings.matchKind, sourceValue: categoryMappings.sourceValue,
    note: categoryMappings.note, categoryName: issueCategories.name, sortOrder: issueCategories.sortOrder })
    .from(categoryMappings).innerJoin(issueCategories, eq(issueCategories.slug, categoryMappings.categorySlug))
    .where(eq(categoryMappings.active, 1)).orderBy(asc(issueCategories.sortOrder), asc(categoryMappings.sourceKind), asc(categoryMappings.sourceValue));
}
