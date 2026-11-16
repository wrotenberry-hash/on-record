import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { alertEvents, analysisBillSummaries, analysisChecks, analysisReviewQueue, analysisSummaryVersions, officialBills } from "@/db/schema";
import { billLabel } from "@/components/federal/badges";
import { recordSent, sendEmail, SITE_URL } from "@/lib/monitoring-runtime";
import { CHECKPOINT_SUMMARIES, formatSummariesEmail, summariesEmailDue, type SummaryForEmail } from "@/lib/analysis/report-format";
import { parseBillTextHtml } from "@/lib/analysis/billtext";
import { citedSection } from "@/lib/analysis/checker";
import { PROMPT_VERSION } from "@/lib/analysis/generate";

const USER_AGENT = "OnRecord/0.2 (+https://on-record-wrotenberry.vercel.app)";

/** The opening words of each cited section, from the same govinfo text the summary was written from. Best-effort. */
async function excerptsFor(textUrl: string, cites: string[]): Promise<Record<string, string>> {
  try {
    const res = await fetch(textUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!res.ok) return {};
    const { sections } = parseBillTextHtml(await res.text());
    const out: Record<string, string> = {};
    for (const cite of new Set(cites)) {
      const n = citedSection(cite);
      const s = n ? sections.find(x => x.num.toUpperCase() === n) : null;
      if (s?.text) out[cite] = s.text.length > 320 ? `${s.text.slice(0, 317).replace(/\s+\S*$/, "")}…` : s.text;
    }
    return out;
  } catch { return {}; }
}

async function emailRows(where: ReturnType<typeof inArray> | undefined, limit: number): Promise<SummaryForEmail[]> {
  const db = getDb();
  const base = db.select({ s: analysisBillSummaries, title: officialBills.title, billType: officialBills.billType, number: officialBills.number,
    queue: analysisReviewQueue.reason,
    category: sql<string | null>`(select bc.category_slug from bill_categories bc join issue_categories ic on ic.slug = bc.category_slug where bc.bill_id = ${analysisBillSummaries.billId} order by ic.sort_order limit 1)`,
    previousCost: sql<number | null>`(select v.cost_usd from analysis_summary_versions v where v.summary_id = ${analysisBillSummaries.id} order by v.replaced_at desc limit 1)` })
    .from(analysisBillSummaries).innerJoin(officialBills, eq(officialBills.id, analysisBillSummaries.billId))
    .leftJoin(analysisReviewQueue, eq(analysisReviewQueue.summaryId, analysisBillSummaries.id));
  const rows = await (where ? base.where(where) : base).orderBy(analysisBillSummaries.sequence).limit(limit);
  const out: SummaryForEmail[] = [];
  for (const r of rows) {
    const last = await db.select().from(analysisChecks).where(eq(analysisChecks.summaryId, r.s.id)).orderBy(desc(analysisChecks.attempt)).limit(1).get();
    const excerpts = await excerptsFor(r.s.textUrl, [...r.s.whatItDoes, ...r.s.whoItAffects].map(p => p.section));
    out.push({ label: billLabel(r.billType, r.number), title: r.title, billId: r.s.billId, category: r.category, headline: r.s.headline, whatItDoes: r.s.whatItDoes,
      whoItAffects: r.s.whoItAffects, whatChangesForYou: r.s.whatChangesForYou, caseFor: r.s.caseFor, caseAgainst: r.s.caseAgainst, unknowns: r.s.unknowns,
      confidence: r.s.confidence, confidenceReason: r.s.confidenceReason, status: r.s.status, queue: r.queue ?? null, checkPassed: r.s.checkPassed === 1,
      attempts: r.s.attempts, failures: last?.failures ?? [], warnings: last?.warnings ?? [], readingGrade: last?.metrics.readingGrade ?? null,
      totalWords: last?.metrics.totalWords ?? null, costUsd: r.s.costUsd, truncated: r.s.truncated === 1, excerpts, textUrl: r.s.textUrl,
      previousCostUsd: r.previousCost === null ? null : Number(r.previousCost) });
  }
  return out;
}

/** Runtime half of the checkpoint email (see lib/analysis/report-format.ts for the rule and the text). */
export async function firstSummaries(limit = CHECKPOINT_SUMMARIES): Promise<SummaryForEmail[]> {
  return emailRows(undefined, limit);
}

/** After a summary batch: send the checkpoint email if it is due. Never throws into the run. */
export async function sendSummariesReadyIfDue(): Promise<{ sent: boolean; reason: string }> {
  try {
    const db = getDb();
    const [count, before] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(analysisBillSummaries).get().then(r => Number(r?.n ?? 0)),
      db.select({ n: sql<number>`count(*)` }).from(alertEvents).where(eq(alertEvents.kind, "SUMMARIES_READY")).get().then(r => Number(r?.n ?? 0) > 0),
    ]);
    const revised = await sendSummariesRevisedIfDue();
    if (!summariesEmailDue(count, before)) return { sent: revised.sent, reason: revised.sent ? revised.reason : before ? "already sent" : `${count} of ${CHECKPOINT_SUMMARIES} summaries so far` };
    const rows = await firstSummaries();
    const mail = formatSummariesEmail(rows, SITE_URL);
    const delivery = await sendEmail(mail.subject, mail.text);
    if (!delivery.ok) return { sent: false, reason: delivery.error };
    await recordSent({ kind: "SUMMARIES_READY", subject: mail.subject, detail: `${rows.length} summaries emailed` }, process.env.ALERT_TO_EMAIL?.trim() || "owner");
    return { sent: true, reason: `${rows.length} summaries emailed` };
  } catch (error) { return { sent: false, reason: (error instanceof Error ? error.message : "report failed").slice(0, 200) }; }
}

/**
 * When the generator is improved and earlier summaries have all been rewritten,
 * one email carries the rewritten ones (once per generator version) so they can be
 * reviewed again against the bill text.
 */
export async function sendSummariesRevisedIfDue(): Promise<{ sent: boolean; reason: string }> {
  try {
    const db = getDb();
    const marker = `prompt ${PROMPT_VERSION}`;
    const already = await db.select({ id: alertEvents.id }).from(alertEvents).where(and(eq(alertEvents.kind, "SUMMARIES_REVISED"), like(alertEvents.detail, `${marker}%`))).limit(1).get();
    if (already) return { sent: false, reason: "revised summaries already emailed" };
    const stale = await db.select({ n: sql<number>`count(*)` }).from(analysisBillSummaries)
      .where(and(sql`${analysisBillSummaries.promptVersion} <> ${PROMPT_VERSION}`, sql`${analysisBillSummaries.status} <> 'rejected'`)).get();
    if (Number(stale?.n ?? 0) > 0) return { sent: false, reason: "rewrites still pending" };
    const ids = (await db.select({ id: analysisSummaryVersions.summaryId }).from(analysisSummaryVersions).groupBy(analysisSummaryVersions.summaryId)).map(r => r.id);
    if (!ids.length) return { sent: false, reason: "nothing rewritten" };
    const rows = await emailRows(inArray(analysisBillSummaries.id, ids), 20);
    const mail = formatSummariesEmail(rows, SITE_URL, { revised: true, promptVersion: PROMPT_VERSION });
    const delivery = await sendEmail(mail.subject, mail.text);
    if (!delivery.ok) return { sent: false, reason: delivery.error };
    await recordSent({ kind: "SUMMARIES_REVISED", subject: mail.subject, detail: `${marker}: ${rows.length} rewritten summaries emailed` }, process.env.ALERT_TO_EMAIL?.trim() || "owner");
    return { sent: true, reason: `${rows.length} rewritten summaries emailed` };
  } catch (error) { return { sent: false, reason: (error instanceof Error ? error.message : "revised report failed").slice(0, 200) }; }
}

/**
 * Round 1 strict review without email (owner go-ahead 16 Nov 2026). After a run writes or rewrites
 * summaries, each one is written to the function's own log beside the full text of the bill sections
 * it cites, in lines of at most 1,500 characters (the log reader cuts longer lines) that start "REVIEW_PACKET <bill label>". The reviewer
 * reads them through the owner's Vercel account (runtime logs). No endpoint, no token, nothing public.
 */
export function packetLines(label: string, kind: string, text: string, size = 1500): string[] {
  const parts = Math.max(1, Math.ceil(text.length / size));
  return Array.from({ length: parts }, (_, k) => `REVIEW_PACKET ${label} | ${kind} | part ${k + 1}/${parts} | ${text.slice(k * size, (k + 1) * size)}`);
}
export async function logReviewPackets(billIds: string[], budgetMs = 30_000): Promise<{ logged: number; lines: number }> {
  if (!billIds.length) return { logged: 0, lines: 0 };
  const deadline = Date.now() + budgetMs;
  let logged = 0, lines = 0;
  try {
    const rows = await emailRows(inArray(analysisBillSummaries.billId, billIds.slice(0, 12)), 12);
    for (const r of rows) {
      if (Date.now() > deadline) break;
      const { excerpts, textUrl, ...summary } = r; void excerpts;
      const out = packetLines(r.label, "SUMMARY", JSON.stringify({ ...summary, promptVersion: PROMPT_VERSION }));
      try {
        if (!textUrl) throw new Error("no bill text address");
        const res = await fetch(textUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
        if (!res.ok) throw new Error(`bill text ${res.status}`);
        const parsed = parseBillTextHtml(await res.text());
        out.push(...packetLines(r.label, "HEADINGS", `${parsed.chars} chars; ${parsed.sections.map(x => `Sec. ${x.num}. ${x.heading}`.slice(0, 90)).join(" || ")}`.slice(0, 1400)));
        for (const cite of new Set([...r.whatItDoes, ...r.whoItAffects].map(p => p.section))) {
          const n = citedSection(cite), sec = n ? parsed.sections.find(x => x.num.toUpperCase() === n) : null;
          out.push(...packetLines(r.label, `CITED ${cite}`, sec?.text ? `[${sec.text.length} chars] ${sec.text.slice(0, 16000)}` : "NOT FOUND IN THE BILL TEXT"));
        }
      } catch (e) { out.push(...packetLines(r.label, "TEXT_ERROR", (e instanceof Error ? e.message : "fetch failed").slice(0, 200))); }
      for (const l of out) console.log(l);
      logged++; lines += out.length;
    }
  } catch (e) { console.log(`REVIEW_PACKET error | ${(e instanceof Error ? e.message : "failed").slice(0, 200)}`); }
  console.log(`REVIEW_PACKET done | ${logged} summaries | ${lines} lines`);
  return { logged, lines };
}
