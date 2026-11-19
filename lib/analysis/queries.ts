import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { cleanSummaryText } from "@/lib/analysis/unrepair";
import { getDb } from "@/db";
import { readerVisible } from "@/lib/analysis/publish-gate";
import { heldBillIds } from "@/lib/analysis/reader-holds";
import { analysisBillSummaries, analysisChecks, analysisReaderTests, analysisSummaryDetails, analysisSummaryStructure, analysisReviewQueue, ingestRuns, officialBills, officialCostEstimates, officialMemberVotes, officialPoliticians } from "@/db/schema";

/**
 * The summary shown on a bill page. Readers see only a visible summary; the
 * signed-in editor (private preview) also sees a held one, labelled as held.
 */
export async function summaryForBill(billId: string, includeHeld: boolean) {
  const db = getDb();
  const rows = await db.select().from(analysisBillSummaries).where(and(eq(analysisBillSummaries.billId, billId),
    includeHeld ? inArray(analysisBillSummaries.status, ["visible", "held"]) : readerVisible()))
    .orderBy(desc(analysisBillSummaries.createdAt)).limit(1);
  const summary = rows[0];
  if (!summary) return null;
  const [checks, queue, details, structure] = await Promise.all([
    db.select().from(analysisChecks).where(eq(analysisChecks.summaryId, summary.id)).orderBy(desc(analysisChecks.attempt)),
    db.select().from(analysisReviewQueue).where(eq(analysisReviewQueue.summaryId, summary.id)).get(),
    db.select().from(analysisSummaryDetails).where(eq(analysisSummaryDetails.summaryId, summary.id)).get(),
    db.select().from(analysisSummaryStructure).where(eq(analysisSummaryStructure.summaryId, summary.id)).get(),
  ]);
  // b5 parts belong to the summary only when written by the same generator run.
  const out = { summary, checks, queue: queue ?? null, details: details && details.promptVersion === summary.promptVersion ? details : null,
    structure: structure && structure.promptVersion === summary.promptVersion ? structure : null };
  // 18 Nov: an explanation the repair step attached to the wrong word is never shown, whatever is stored (lib/analysis/unrepair.ts).
  cleanSummaryText(out.summary, out.details, out.structure);
  return out;
}

export async function costEstimates(billId: string) {
  return getDb().select().from(officialCostEstimates).where(eq(officialCostEstimates.billId, billId)).orderBy(desc(officialCostEstimates.pubDate));
}

/** How the viewer's followed members voted on this bill's roll calls. */
export async function followedVotes(rollCallIds: string[], followed: Set<string>) {
  if (!rollCallIds.length || !followed.size) return [];
  return getDb().select({ rollCallId: officialMemberVotes.rollCallId, position: officialMemberVotes.position, rawPosition: officialMemberVotes.rawPosition,
    id: officialPoliticians.id, fullName: officialPoliticians.fullName, party: officialPoliticians.party, state: officialPoliticians.state,
    chamber: officialPoliticians.chamber, district: officialPoliticians.district })
    .from(officialMemberVotes).innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId))
    .where(and(inArray(officialMemberVotes.rollCallId, rollCallIds), inArray(officialMemberVotes.politicianId, [...followed])));
}

/** The editor's review list: open items first, then the latest decisions. */
export async function reviewQueue() {
  const db = getDb();
  return db.select({ q: analysisReviewQueue, s: analysisBillSummaries, billTitle: officialBills.title, billType: officialBills.billType, number: officialBills.number })
    .from(analysisReviewQueue).innerJoin(analysisBillSummaries, eq(analysisBillSummaries.id, analysisReviewQueue.summaryId))
    .innerJoin(officialBills, eq(officialBills.id, analysisBillSummaries.billId))
    .orderBy(sql`${analysisReviewQueue.status} <> 'open'`, desc(analysisReviewQueue.createdAt)).limit(60);
}

export async function allSummaries() {
  const db = getDb();
  return db.select({ s: analysisBillSummaries, billTitle: officialBills.title, billType: officialBills.billType, number: officialBills.number,
    reason: analysisReviewQueue.reason, queueStatus: analysisReviewQueue.status,
    grade: sql<number | null>`(select json_extract(metrics, '$.readingGrade') from analysis_checks c where c.summary_id = ${analysisBillSummaries.id} order by attempt desc limit 1)`,
    words: sql<number | null>`(select json_extract(metrics, '$.totalWords') from analysis_checks c where c.summary_id = ${analysisBillSummaries.id} order by attempt desc limit 1)` })
    .from(analysisBillSummaries).innerJoin(officialBills, eq(officialBills.id, analysisBillSummaries.billId))
    .leftJoin(analysisReviewQueue, eq(analysisReviewQueue.summaryId, analysisBillSummaries.id))
    .orderBy(desc(analysisBillSummaries.createdAt)).limit(100);
}

/** Counts and spend for the health probe and the editor page. No bill text or summary text. */
export async function analysisCounts() {
  const db = getDb();
  const [byStatus, open, spend, last, approved] = await Promise.all([
    db.select({ status: analysisBillSummaries.status, n: sql<number>`count(*)`, usd: sql<number>`coalesce(sum(${analysisBillSummaries.costUsd}), 0)` })
      .from(analysisBillSummaries).groupBy(analysisBillSummaries.status),
    db.select({ n: sql<number>`count(*)` }).from(analysisReviewQueue).where(eq(analysisReviewQueue.status, "open")).get(),
    db.select({ usd: sql<number>`coalesce(sum(cost_usd), 0)`, calls: sql<number>`count(*)` }).from(sql`model_calls`).where(sql`purpose = 'analysis'`).get(),
    db.select().from(ingestRuns).where(eq(ingestRuns.job, "analysis")).orderBy(desc(ingestRuns.startedAt)).limit(1).get(),
    // Approved by the editor: a held summary the editor released, or a visible one the editor has reviewed.
    db.select({ n: sql<number>`count(*)` }).from(analysisBillSummaries).where(sql`${analysisBillSummaries.status} = 'visible' and ${analysisBillSummaries.reviewedAt} is not null`).get(),
  ]);
  // One line per summary for the probe: order, category, status, checker result and cost. No bill text, no summary text.
  const each = await db.select({ sequence: analysisBillSummaries.sequence, status: analysisBillSummaries.status, checkPassed: analysisBillSummaries.checkPassed,
    attempts: analysisBillSummaries.attempts, confidence: analysisBillSummaries.confidence, costUsd: analysisBillSummaries.costUsd,
    inputTokens: analysisBillSummaries.inputTokens, outputTokens: analysisBillSummaries.outputTokens,
    category: sql<string | null>`(select bc.category_slug from bill_categories bc join issue_categories ic on ic.slug = bc.category_slug where bc.bill_id = ${analysisBillSummaries.billId} order by ic.sort_order limit 1)`,
    queue: analysisReviewQueue.reason })
    .from(analysisBillSummaries).leftJoin(analysisReviewQueue, eq(analysisReviewQueue.summaryId, analysisBillSummaries.id))
    .orderBy(analysisBillSummaries.sequence).limit(50);
  const count = (s: string) => Number(byStatus.find(r => r.status === s)?.n ?? 0);
  // Numbers only on the probe: the reasons quote reader answers, so they stay on the editor's Summary quality page.
  const readerTest = await readerTestStats().then(({ recentFailReasons, ...numbers }) => { void recentFailReasons; return numbers; }).catch(() => null);
  const detail = (last?.detail ?? {}) as { stoppedBy?: string | null; made?: unknown[] };
  return { summaries: byStatus.reduce((n, r) => n + Number(r.n), 0), written: byStatus.reduce((n, r) => n + Number(r.n), 0), editorApproved: Number(approved?.n ?? 0), visible: count("visible"), held: count("held"), rejected: count("rejected"),
    openReviews: Number(open?.n ?? 0), summaryCostUsd: Math.round(byStatus.reduce((n, r) => n + Number(r.usd), 0) * 10000) / 10000,
    analysisCallsUsd: Math.round(Number(spend?.usd ?? 0) * 10000) / 10000, analysisCalls: Number(spend?.calls ?? 0),
    each: each.map(e => ({ ...e, checkPassed: e.checkPassed === 1, costUsd: Math.round(e.costUsd * 10000) / 10000 })),
    // 19 Nov: summaries hidden from readers by the gate after a reading against their sources (count only; the list and the reasons are in lib/analysis/reader-holds.ts).
    hiddenAfterReading: heldBillIds().length,
    readerTest, coverage90d: await coverage90d().catch(() => null),
    lastRun: last ? { status: last.status, startedAt: new Date(last.startedAt).toISOString(), made: Array.isArray(detail.made) ? detail.made.length : 0, stoppedBy: detail.stoppedBy ?? null,
      error: last.error ? last.error.replace(/https?:\/\/\S+/g, "[url]").slice(0, 160) : null } : null };
}

/**
 * The owner's coverage bar (17 Nov): every federal bill with a roll-call vote in the last 90 days has a summary that
 * passes the full standard. "Passing" = written, passed the written rules and the average-reader test, and not held.
 */
export async function coverage90d(now = Date.now()) {
  const since = now - 90 * 86_400_000;
  const rows = await getDb().all<{ id: string; status: string | null; passed: number | null; complete: number; n: number }>(sql`
    select b.id as id, s.status as status, s.check_passed as passed, (b.detail_status = 'complete') as complete, count(*) as n
    from official_bills b left join analysis_bill_summaries s on s.bill_id = b.id
    where b.bill_type in ('hr', 's', 'hjres', 'sjres') and exists (select 1 from official_roll_calls r where r.bill_id = b.id and r.voted_at >= ${since})
    group by b.id, s.status, s.check_passed, (b.detail_status = 'complete')`);
  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((n, r) => n + Number(r.n), 0);
  // 19 Nov: a summary hidden after a reading against its sources (lib/analysis/reader-holds.ts) is not on show, so it counts as held here.
  const hidden = new Set(heldBillIds()), shown = (r: (typeof rows)[number]) => r.status === "visible" && Number(r.passed) === 1 && !hidden.has(r.id);
  const bills = sum(() => true), passing = sum(shown), held = sum(r => r.status === "held" || (r.status === "visible" && hidden.has(r.id))), rejected = sum(r => r.status === "rejected");
  return { bills, passing, held, rejected, notWritten: sum(r => r.status === null), recordNotComplete: sum(r => r.status === null && !Number(r.complete)),
    coveredPct: bills ? Math.round((passing / bills) * 1000) / 10 : null };
}

/**
 * The average-reader test in numbers (owner instruction, 17 Nov): how many tests ran, the share that passed first
 * time, the share of summaries that passed in the end, and what the test adds to each summary's cost.
 */
export async function readerTestStats() {
  const db = getDb();
  const rows = await db.select({ summaryId: analysisReaderTests.summaryId, attempt: analysisReaderTests.attempt, passed: analysisReaderTests.passed, costUsd: analysisReaderTests.costUsd,
    reasons: analysisReaderTests.reasons, promptVersion: analysisReaderTests.promptVersion, at: analysisReaderTests.at }).from(analysisReaderTests).orderBy(desc(analysisReaderTests.at)).limit(500);
  if (!rows.length) return { tests: 0, summariesTested: 0, passedFirstTry: 0, passedInTheEnd: 0, firstTryPassRate: null, finalPassRate: null, costUsd: 0, addedCostPerSummaryUsd: null, recentFailReasons: [] as string[] };
  const bySummary = new Map<string, typeof rows>();
  for (const r of rows) bySummary.set(r.summaryId, [...(bySummary.get(r.summaryId) ?? []), r]);
  let first = 0, final = 0;
  for (const list of bySummary.values()) {
    const latestVersion = list[0].promptVersion, cur = list.filter(r => r.promptVersion === latestVersion).sort((a, b) => a.at - b.at);
    if (cur[0]?.passed === 1) first++;
    if (cur.at(-1)?.passed === 1) final++;
  }
  const cost = rows.reduce((n, r) => n + r.costUsd, 0), n = bySummary.size;
  return { tests: rows.length, summariesTested: n, passedFirstTry: first, passedInTheEnd: final, firstTryPassRate: Math.round((first / n) * 100) / 100, finalPassRate: Math.round((final / n) * 100) / 100,
    costUsd: Math.round(cost * 10000) / 10000, addedCostPerSummaryUsd: Math.round((cost / n) * 10000) / 10000,
    // Reasons only (no summary text): what readers got wrong or did not understand, most recent first.
    recentFailReasons: rows.filter(r => r.passed !== 1).flatMap(r => r.reasons).slice(0, 6).map(x => x.slice(0, 200)) };
}
