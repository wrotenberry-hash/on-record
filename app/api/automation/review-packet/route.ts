import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisBillSummaries, analysisChecks, analysisReviewQueue, analysisSummaryVersions, officialBills } from "@/db/schema";
import { billLabel } from "@/components/federal/badges";
import { parseBillTextHtml } from "@/lib/analysis/billtext";
import { citedSection } from "@/lib/analysis/checker";

export const dynamic = "force-dynamic";

/**
 * Round 1 strict review (owner go-ahead 16 Nov 2026). With owner emails off, this is how the
 * reviewer reads each summary beside the bill sections it cites. Read-only and private: it
 * answers only to a long random token whose SHA-256 is below (the token itself is in no file
 * in this repository and in no environment variable). A wrong or missing token gets a 404.
 * Rotate by replacing the hash.
 */
const TOKEN_SHA256 = "dc609c224621c1054134cc97ae912b1956616d975853dfe31472a05e68b41b80";
const NOT_FOUND = () => new Response("Not found", { status: 404 });
async function authorised(t: string | null) {
  if (!t || t.length !== 64) return false;
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
  const hex = Array.from(d, b => b.toString(16).padStart(2, "0")).join("");
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ TOKEN_SHA256.charCodeAt(i);
  return diff === 0;
}
const HEAD = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!(await authorised(url.searchParams.get("t")))) return NOT_FOUND();
  const db = getDb();
  const rows = await db.select({ s: analysisBillSummaries, title: officialBills.title, billType: officialBills.billType, number: officialBills.number, sponsorId: officialBills.sponsorId,
    queue: analysisReviewQueue.reason, queueStatus: analysisReviewQueue.status,
    category: sql<string | null>`(select bc.category_slug from bill_categories bc where bc.bill_id = ${analysisBillSummaries.billId} limit 1)`,
    lastVote: sql<number | null>`(select max(r.voted_at) from official_roll_calls r where r.bill_id = ${analysisBillSummaries.billId})` })
    .from(analysisBillSummaries).innerJoin(officialBills, eq(officialBills.id, analysisBillSummaries.billId)).leftJoin(analysisReviewQueue, eq(analysisReviewQueue.summaryId, analysisBillSummaries.id))
    .orderBy(asc(analysisBillSummaries.sequence));
  const iRaw = url.searchParams.get("i");
  if (iRaw === null) {
    const list = [];
    for (const [i, r] of rows.entries()) {
      const last = await db.select().from(analysisChecks).where(eq(analysisChecks.summaryId, r.s.id)).orderBy(desc(analysisChecks.attempt)).limit(1).get();
      list.push({ i, label: billLabel(r.billType, r.number), billId: r.s.billId, title: r.title.slice(0, 120), category: r.category, status: r.s.status, queue: r.queue, queueStatus: r.queueStatus, checkPassed: r.s.checkPassed === 1,
        attempts: r.s.attempts, confidence: r.s.confidence, promptVersion: r.s.promptVersion, model: r.s.model, truncated: r.s.truncated === 1, textVersion: r.s.textVersionLabel, textChars: r.s.textChars,
        costUsd: r.s.costUsd, inputTokens: r.s.inputTokens, outputTokens: r.s.outputTokens, readingGrade: last?.metrics.readingGrade ?? null, totalWords: last?.metrics.totalWords ?? null,
        forWords: last?.metrics.forWords ?? null, againstWords: last?.metrics.againstWords ?? null, failures: last?.failures ?? [], warnings: last?.warnings ?? [], lastVote: r.lastVote ? new Date(Number(r.lastVote)).toISOString().slice(0, 10) : null,
        createdAt: new Date(r.s.createdAt).toISOString() });
    }
    const total = list.reduce((a, x) => a + x.costUsd, 0);
    return Response.json({ count: list.length, totalCostUsd: Math.round(total * 10000) / 10000, costPerSummaryUsd: list.length ? Math.round((total / list.length) * 10000) / 10000 : null, summaries: list }, { headers: HEAD });
  }
  const r = rows[Number(iRaw)];
  if (!r) return NOT_FOUND();
  const s = r.s, checks = await db.select().from(analysisChecks).where(eq(analysisChecks.summaryId, s.id)).orderBy(asc(analysisChecks.attempt));
  const versions = await db.select({ promptVersion: analysisSummaryVersions.promptVersion, checkPassed: analysisSummaryVersions.checkPassed, replacedAt: analysisSummaryVersions.replacedAt, content: analysisSummaryVersions.content })
    .from(analysisSummaryVersions).where(eq(analysisSummaryVersions.summaryId, s.id)).orderBy(desc(analysisSummaryVersions.replacedAt)).limit(2);
  let bill: unknown = { error: "not fetched" };
  try {
    const res = await fetch(s.textUrl, { headers: { "User-Agent": "OnRecord/0.2 (+https://on-record-wrotenberry.vercel.app)" }, signal: AbortSignal.timeout(25_000), cache: "no-store" });
    if (!res.ok) throw new Error(`bill text ${res.status}`);
    const parsed = parseBillTextHtml(await res.text());
    const cap = Math.min(20000, Math.max(1500, Number(url.searchParams.get("cap")) || 6000));
    const cited = [...new Set([...s.whatItDoes, ...s.whoItAffects].map(p => p.section))];
    const full = url.searchParams.get("all") === "1";
    bill = { chars: parsed.chars, sectionCount: parsed.sections.length, headings: parsed.sections.map(x => `Sec. ${x.num}. ${x.heading}`.slice(0, 120)),
      cited: cited.map(c => { const n = citedSection(c), sec = n ? parsed.sections.find(x => x.num.toUpperCase() === n) : null; return { cite: c, found: !!sec, heading: sec?.heading ?? null, chars: sec?.text?.length ?? 0, text: sec?.text ? sec.text.slice(0, cap) : null }; }),
      ...(full ? { sections: parsed.sections.map(x => ({ num: x.num, heading: x.heading, text: (x.text ?? "").slice(0, cap) })) } : {}),
      opening: parsed.text.slice(0, 1500) };
  } catch (e) { bill = { error: (e instanceof Error ? e.message : "fetch failed").slice(0, 200) }; }
  return Response.json({ i: Number(iRaw), label: billLabel(r.billType, r.number), billId: s.billId, officialTitle: r.title, category: r.category, sponsorId: r.sponsorId, status: s.status, queue: r.queue, promptVersion: s.promptVersion, model: s.model,
    textVersion: s.textVersionLabel, textUrl: s.textUrl, truncated: s.truncated === 1, costUsd: s.costUsd, attempts: s.attempts, confidence: s.confidence, confidenceReason: s.confidenceReason,
    summary: { headline: s.headline, whatItDoes: s.whatItDoes, whoItAffects: s.whoItAffects, whatChangesForYou: s.whatChangesForYou, caseFor: s.caseFor, caseAgainst: s.caseAgainst, unknowns: s.unknowns },
    checks: checks.map(c => ({ attempt: c.attempt, passed: c.passed === 1, failures: c.failures, warnings: c.warnings, metrics: c.metrics })), earlierVersions: versions, bill }, { headers: HEAD });
}
