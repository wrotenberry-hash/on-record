import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { databaseSettings } from "@/db/settings";
import { alertEvents, automationRuns, intakeCandidates, publications, representations, reviews, sourceCaptures } from "@/db/schema";
import { LAUNCH_TARGET } from "@/lib/monitoring";
import { monitoringConfigured, pickDailyCase } from "@/lib/monitoring-runtime";

export const dynamic = "force-dynamic";

/** Hostname only, never the token. Lets an operator confirm every deploy uses the same database. */
function databaseHost(): string | null {
  try { const { url, source } = databaseSettings(); return source === "local" ? null : new URL(url).hostname; } catch { return "unparseable"; }
}

/** Status words from the newest ledger row. No candidate, representation or error text. */
async function lastRun() {
  try {
    const row = await getDb().select({ slot: automationRuns.slot, status: automationRuns.status, captureStatus: automationRuns.captureStatus,
      researchStatus: automationRuns.researchStatus, startedAt: automationRuns.startedAt, finishedAt: automationRuns.finishedAt,
      error: automationRuns.error })
      .from(automationRuns).orderBy(desc(automationRuns.startedAt)).limit(1).get();
    if (!row) return null;
    // Error text is status words and generic fetch/extraction messages; strip anything URL-shaped defensively.
    const note = row.error ? row.error.replace(/https?:\/\/\S+/g, "[url]").slice(0, 300) : null;
    return { ...row, error: note, hadError: row.status === "FAILED" };
  } catch { return "unavailable" as const; }
}

/**
 * Counts only, for the weekly report (docs/INTAKE_STRATEGY.md "Readiness
 * measures"). No speaker, quote or URL leaves this probe.
 */
async function throughput() {
  try {
    const db = getDb(), now = Date.now(), week = now - 7 * 24 * 3600 * 1000;
    const count = (q: Promise<{ n: number } | undefined>) => q.then(r => Number(r?.n ?? 0));
    const [published, publishedWeek, reviewsWeek, approvedWeek, rejectedWeek, capturesWeek, runsWeek, failedWeek, leadsFailedWeek, leadsBlockedWeek, rejectedReps, waiting] = await Promise.all([
      count(db.select({ n: sql<number>`count(*)` }).from(publications).get()),
      count(db.select({ n: sql<number>`count(*)` }).from(publications).where(gte(publications.publishedAt, week)).get()),
      count(db.select({ n: sql<number>`count(*)` }).from(reviews).where(gte(reviews.createdAt, week)).get()),
      count(db.select({ n: sql<number>`count(*)` }).from(reviews).where(and(gte(reviews.createdAt, week), eq(reviews.decision, "APPROVED"))).get()),
      count(db.select({ n: sql<number>`count(*)` }).from(reviews).where(and(gte(reviews.createdAt, week), eq(reviews.decision, "REJECTED"))).get()),
      count(db.select({ n: sql<number>`count(*)` }).from(sourceCaptures).where(gte(sourceCaptures.capturedAt, week)).get()),
      count(db.select({ n: sql<number>`count(*)` }).from(automationRuns).where(gte(automationRuns.startedAt, week)).get()),
      count(db.select({ n: sql<number>`count(*)` }).from(automationRuns).where(and(gte(automationRuns.startedAt, week), eq(automationRuns.status, "FAILED"))).get()),
      count(db.select({ n: sql<number>`count(*)` }).from(intakeCandidates).where(and(gte(intakeCandidates.completedAt, week), eq(intakeCandidates.status, "FAILED"))).get()),
      count(db.select({ n: sql<number>`count(*)` }).from(intakeCandidates).where(and(gte(intakeCandidates.completedAt, week), eq(intakeCandidates.status, "FAILED"), sql`${intakeCandidates.error} like '%403%'`)).get()),
      count(db.select({ n: sql<number>`count(*)` }).from(representations).where(eq(representations.status, "REJECTED")).get()),
      pickDailyCase().then(x => x.waitingCount),
    ]);
    return { publishedTotal: published, launchTarget: LAUNCH_TARGET, casesWaiting: waiting, representationsRejectedTotal: rejectedReps,
      last7d: { published: publishedWeek, reviews: reviewsWeek, reviewsApproved: approvedWeek, reviewsRejected: rejectedWeek, captures: capturesWeek,
        runs: runsWeek, runsFailed: failedWeek, leadsFailed: leadsFailedWeek, leadsBlocked403: leadsBlockedWeek } };
  } catch { return "unavailable" as const; }
}

async function rhythm() {
  try {
    const rows = await getDb().select({ kind: alertEvents.kind, last: sql<number>`max(${alertEvents.sentAt})` }).from(alertEvents)
      .where(sql`${alertEvents.kind} in ('DAILY_CASE', 'DAILY_NUDGE')`).groupBy(alertEvents.kind);
    const at = (k: string) => { const r = rows.find(x => x.kind === k); return r ? new Date(Number(r.last)).toISOString() : null; };
    return { lastCaseEmail: at("DAILY_CASE"), lastNudge: at("DAILY_NUDGE") };
  } catch { return "unavailable" as const; }
}

async function lastAlert() {
  try {
    const row = await getDb().select({ kind: alertEvents.kind, sentAt: alertEvents.sentAt }).from(alertEvents).orderBy(desc(alertEvents.sentAt)).limit(1).get();
    return row ?? null;
  } catch { return "unavailable" as const; }
}

/**
 * Anonymous reachability probe for the scheduler path. It reports only whether
 * the request reached the app, which secrets are provisioned, which database is
 * in use and the status words (plus generic error notes) of the last scheduled run. It never reveals a
 * secret, a captured statement, or spends model budget.
 */
export async function GET() {
  const tick = Boolean(process.env.AUTOMATION_TICK_SECRET?.trim()), cron = Boolean(process.env.CRON_SECRET?.trim());
  return Response.json({ service: "on-record", status: "reachable", tickSecretConfigured: tick, cronSecretConfigured: cron,
    openaiKeyConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()), editorAllowlistConfigured: Boolean((process.env.EDITOR_EMAILS ?? process.env.EDITOR_USER_IDS ?? "").trim()),
    database: databaseSettings().source, databaseHost: databaseHost(), lastRun: await lastRun(),
    monitoring: { resendConfigured: monitoringConfigured().resend, spendSource: monitoringConfigured().spendSource, keyExpires: monitoringConfigured().keyExpires, lastAlert: await lastAlert() },
    rhythm: await rhythm(), throughput: await throughput(),
    time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } });
}
