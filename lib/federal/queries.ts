import { READER_S } from "@/lib/analysis/publish-gate";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBillCosponsors, officialSponsorshipFetches } from "@/db/schema";
import { billCategories, categoryMappings, ingestRuns, issueCategories, officialBillSubjects, officialBills, officialMemberVotes, officialPoliticians,
  officialRollCalls, userFollows } from "@/db/schema";
import { LAWMAKING_TYPES } from "@/lib/federal/parse";
import { billRowsFor } from "@/lib/bill-row-store";

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
  const rows = await getDb().select({ rollCallId: officialRollCalls.id, chamber: officialRollCalls.chamber, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question,
    title: officialRollCalls.title, result: officialRollCalls.result, documentLabel: officialRollCalls.documentLabel, billId: officialRollCalls.billId,
    yea: officialRollCalls.yea, nay: officialRollCalls.nay, sourceUrl: officialRollCalls.sourceUrl, retrievedAt: officialRollCalls.retrievedAt,
    position: officialMemberVotes.position, rawPosition: officialMemberVotes.rawPosition, billTitle: officialBills.title,
    // The bill's one-line Analysis headline (visible summaries only) and its first issue, for "what the bill would do" beside the vote.
    headline: sql<string | null>`(select s.headline from analysis_bill_summaries s where s.bill_id = ${officialRollCalls.billId} and ${READER_S} order by s.created_at desc limit 1)`,
    issueSlug: sql<string | null>`(select bc.category_slug from bill_categories bc join issue_categories ic on ic.slug = bc.category_slug where bc.bill_id = ${officialRollCalls.billId} order by ic.sort_order limit 1)`,
    issueName: sql<string | null>`(select ic.name from bill_categories bc join issue_categories ic on ic.slug = bc.category_slug where bc.bill_id = ${officialRollCalls.billId} order by ic.sort_order limit 1)`,
    // Round A integrity check: a roll call whose member votes do not add up to the official totals is shown as under review.
    tallyBad: sql<number>`exists (select 1 from official_tally_checks t where t.roll_call_id = ${officialRollCalls.id} and t.ok = 0)` })
    .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId))
    .leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId))
    .where(eq(officialMemberVotes.politicianId, politicianId)).orderBy(desc(officialRollCalls.votedAt)).limit(limit);
  // 20 Nov 2026: each vote on a bill carries the bill as a vote row shows it (lib/bill-row.ts): headline or official title, one sentence, number.
  const texts = await billRowsFor(rows.map(r => ({ billId: r.billId, title: r.billTitle ?? (r.billId ? null : r.title) })));
  return rows.map(r => ({ ...r, row: r.billId ? texts.get(r.billId) ?? null : null }));
}

/** Bills in On Record's record that the member sponsored or cosponsored (withdrawn cosponsorships shown as such). */
export async function sponsorships(politicianId: string) {
  const db = getDb();
  const headline = sql<string | null>`(select s.headline from analysis_bill_summaries s where s.bill_id = ${officialBills.id} and ${READER_S} order by s.created_at desc limit 1)`;
  const [sponsored, cosponsored] = await Promise.all([
    db.select({ id: officialBills.id, billType: officialBills.billType, number: officialBills.number, title: officialBills.title, introducedAt: officialBills.introducedAt, headline })
      .from(officialBills).where(eq(officialBills.sponsorId, politicianId)).orderBy(desc(officialBills.introducedAt)).limit(50),
    db.select({ id: officialBills.id, billType: officialBills.billType, number: officialBills.number, title: officialBills.title, introducedAt: officialBills.introducedAt, headline,
      sponsorshipDate: officialBillCosponsors.sponsorshipDate, original: officialBillCosponsors.original, withdrawnDate: officialBillCosponsors.withdrawnDate })
      .from(officialBillCosponsors).innerJoin(officialBills, eq(officialBills.id, officialBillCosponsors.billId))
      .where(eq(officialBillCosponsors.politicianId, politicianId)).orderBy(desc(officialBillCosponsors.sponsorshipDate)).limit(100),
  ]);
  return { sponsored, cosponsored };
}

/** Counts only, for the health probe. */
export async function sponsorshipCounts() {
  const db = getDb();
  const [rows, fetched, failed] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(officialBillCosponsors).get(),
    db.select({ n: sql<number>`count(*)` }).from(officialSponsorshipFetches).where(eq(officialSponsorshipFetches.ok, 1)).get(),
    db.select({ n: sql<number>`count(*)` }).from(officialSponsorshipFetches).where(eq(officialSponsorshipFetches.ok, 0)).get(),
  ]);
  return { cosponsorRows: Number(rows?.n ?? 0), billsRead: Number(fetched?.n ?? 0), billsNotFound: Number(failed?.n ?? 0) };
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
    latestActionText: officialBills.latestActionText, latestActionAt: officialBills.latestActionAt, policyArea: officialBills.policyArea, method: billCategories.method })
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
    db.select({ slug: issueCategories.slug, name: issueCategories.name, method: billCategories.method }).from(billCategories).innerJoin(issueCategories, eq(issueCategories.slug, billCategories.categorySlug))
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

/** Complete bills that no rule sorted into an issue, counted by Congress.gov policy area. Counts only, for the health probe. */
export async function uncategorisedPolicyAreas() {
  const rows = await getDb().select({ area: officialBills.policyArea, n: sql<number>`count(*)` }).from(officialBills)
    .where(and(eq(officialBills.detailStatus, "complete"), sql`not exists (select 1 from bill_categories bc where bc.bill_id = ${officialBills.id})`))
    .groupBy(officialBills.policyArea).orderBy(sql`count(*) desc`).limit(20);
  return rows.map(r => ({ policyArea: r.area ?? "(none)", bills: Number(r.n) }));
}
