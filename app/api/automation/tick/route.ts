import { and, desc, eq, isNull, like } from "drizzle-orm";
import { getDb } from "@/db";
import { automationRuns, machineResearchDrafts, representations } from "@/db/schema";
import { runDiscovery } from "@/app/api/editor/discover/route";
import { processOneCandidate, requeueBudgetFailures } from "@/app/api/editor/intake/route";
import { runMachineResearch } from "@/app/api/editor/cases/[id]/draft-research/route";
import { tickAuthorized } from "@/lib/tick-auth";
import { archiveOldCases, intakePauseState, runMonitoring, runRhythm, type MonitoringOutcome, type RhythmOutcome } from "@/lib/monitoring-runtime";
import { runFederalIngest, type IngestSummary } from "@/lib/federal/ingest";
import { runAnalysisBatch, type AnalysisRun } from "@/lib/analysis/generate";
import { runClassifyBatch, type ClassifyRun } from "@/lib/analysis/classify";
import { sendSummariesReadyIfDue } from "@/lib/analysis/report";
import { intakeAllowed } from "@/lib/monitoring";
import { sendEmail } from "@/lib/monitoring-runtime";
import { sendTrialOpenIfDue } from "@/lib/trial";
import { runDigests } from "@/lib/digest";
import { isDigestDay } from "@/lib/digest-format";
import { verificationConfig } from "@/lib/verify/config";
import { purgeVerificationData, recomputeAll } from "@/lib/verify/store";

// Discovery, one capture and one bilateral research draft run in sequence and
// can take minutes. 300 s is the Fluid Compute ceiling on the Hobby plan.
export const maxDuration = 300;
const MAX_CAPTURE_ATTEMPTS = 3;
export const dynamic = "force-dynamic";

/** Vercel Cron calls the job with GET and the CRON_SECRET bearer. */
export async function GET(request: Request) { return runTick(request); }

/** A manual or external scheduler POSTs with the AUTOMATION_TICK_SECRET bearer. */
export async function POST(request: Request) { return runTick(request); }

/** The token grants this narrow job only: scan, capture one lead, research one claim. */
async function runTick(request: Request) {
  const via = await tickAuthorized(request.headers.get("authorization"),
    { cronSecret: process.env.CRON_SECRET, tickSecret: process.env.AUTOMATION_TICK_SECRET });
  if (!via) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const now = Date.now(), slot = new Date(now).toISOString().slice(0, 13), day = slot.slice(0, 10);
  const db = getDb();
  // Owner decision 2026-11-16: waiting cases older than 14 days are archived (never deleted) on every
  // run, before the backlog check, so the pause lifts on its own. The editor can restore any of them.
  const archived = await archiveOldCases(now).catch(() => null);
  // Round J: totals move as new accounts pass 24 hours; old rate rows and sign-up hashes are purged.
  if (verificationConfig().enabled) await recomputeAll(now).then(() => purgeVerificationData(now)).catch(() => null);
  // Outside the intake hour (once a day, STATEMENT_INTAKE_HOURS_UTC, default 13) the run does only the
  // model-free federal update, bill summaries within their own caps, and monitoring. It writes no
  // ledger row, so it does not count toward the daily intake limit or the failure alerts.
  if (!intakeAllowed(now, process.env.STATEMENT_INTAKE_HOURS_UTC)) {
    const federal = await federalStep();
    const analysis = await analysisStep(now);
    const summariesEmail = await sendSummariesReadyIfDue();
    // Monday's 19:00 run sends the weekly "how your members voted" email (no new cron).
    const digest = isDigestDay(now) ? await runDigests(now).catch(error => ({ error: (error instanceof Error ? error.message : "digest failed").slice(0, 200) })) : null;
    return Response.json({ status: "INTAKE_SKIPPED_OFF_HOUR", slot, via, archived, federal, analysis, summariesEmail, digest, monitoring: await monitorAfterRun() });
  }
  // Owner decision 2026-11-15: no new statements while the review backlog is at or above
  // INTAKE_PAUSE_BACKLOG (default 20). The run still drafts research for one waiting case,
  // which makes the backlog quicker to review, then gives bill summaries the time left.
  // Like the off-hour run it writes no ledger row; intake resumes on its own below the line.
  const pause = await intakePauseState().catch(() => null);
  if (pause?.paused) {
    const federal = await federalStep();
    const research = await researchOneWaitingCase().catch(error => ({ status: "FAILED", error: (error instanceof Error ? error.message : "research failed").slice(0, 200) }));
    const analysis = await analysisStep(now);
    const summariesEmail = await sendSummariesReadyIfDue();
    return Response.json({ status: "INTAKE_PAUSED_BACKLOG", slot, via, archived, waiting: pause.waiting, threshold: pause.threshold, federal, research, analysis, summariesEmail, monitoring: await monitorAfterRun() });
  }
  const today = await db.select({ id: automationRuns.id }).from(automationRuns)
    .where(eq(automationRuns.day, day)).limit(6);
  // Cap model-bearing invocations even if an external scheduler retries or runs hourly.
  const configured = Number(process.env.AUTOMATION_DAILY_LIMIT ?? "2");
  const dailyLimit = Number.isSafeInteger(configured) ? Math.max(1, Math.min(configured, 5)) : 2;
  if (today.length >= dailyLimit) return Response.json({ status: "DAILY_LIMIT", day, dailyLimit });
  const id = crypto.randomUUID();
  const claimed = await db.insert(automationRuns).values({ id, slot, day, status: "RUNNING", startedAt: now })
    .onConflictDoNothing().returning({ id: automationRuns.id });
  if (!claimed.length) return Response.json({ status: "ALREADY_RUNNING_OR_COMPLETE", slot });
  // The federal official record uses no model calls, so it runs first and on its own, even when the OpenAI budget is exhausted.
  const federal = await federalStep();
  try {
    const requeued = await requeueBudgetFailures();
    const discovered = await runDiscovery();
    if (!discovered.ok) throw Error(`Source discovery returned ${discovered.status}`);
    // A lead can fail to fetch (blocked host, redirect, thin page) or yield no
    // claim. Move on to the next lead rather than lose the slot; each attempt is
    // one page fetch and at most one extraction call, so three is a modest cap.
    let result: { id?: string; status?: string; caseIds?: string[]; error?: string; message?: string } = {};
    let captured: Response | undefined;
    const attempts: string[] = [];
    for (let attempt = 0; attempt < MAX_CAPTURE_ATTEMPTS; attempt++) {
      captured = await processOneCandidate({}, "scheduled-worker");
      result = await captured.json();
      attempts.push(`${result.status ?? (captured.ok ? "NONE" : "ERROR")}${result.error ? `: ${result.error.slice(0, 120)}` : ""}`);
      if (!captured.ok) throw Error(`Capture: ${result.error ?? captured.status}`);
      if (!result.id || result.status === "CAPTURED") break; // captured, or the queue is empty
    }
    // Keep what the capture step established even if research fails afterwards.
    await db.update(automationRuns).set({ candidateId: result.id, captureStatus: result.id ? (result.status ?? "NONE") : "NO_QUEUED_LEAD",
      error: result.status === "CAPTURED" ? null : attempts.join(" | ").slice(0, 400) }).where(eq(automationRuns.id, id));
    const pending = await db.select({ id: representations.id }).from(representations)
      .leftJoin(machineResearchDrafts, eq(machineResearchDrafts.representationId, representations.id))
      .where(and(eq(representations.status, "CANDIDATE"), isNull(machineResearchDrafts.representationId),
        like(representations.context, "AI-extracted. Suggested pre-research%")))
      .orderBy(desc(representations.extractedAt)).limit(1).get();
    const representationId = pending?.id;
    let researchStatus = "NO_NEW_CLAIM";
    if (representationId) {
      const researched = await runMachineResearch(representationId);
      const draft = await researched.json() as { status?: string; error?: string };
      // The daily research budget is shared with the editor. Reaching it is a
      // bounded, expected outcome, not a failure of the job.
      if (researched.status === 429) researchStatus = "DAILY_RESEARCH_LIMIT";
      else if (!researched.ok) throw Error(`Research: ${draft.error ?? researched.status}`);
      else researchStatus = draft.status ?? "COMPLETE";
    }
    await db.update(automationRuns).set({ status: "COMPLETE", finishedAt: Date.now(), representationId, researchStatus })
      .where(eq(automationRuns.id, id));
    return Response.json({ status: "COMPLETE", slot, via, federal, requeued, candidateId: result.id,
      representationId, captureStatus: result.status, captureAttempts: attempts, researchStatus, monitoring: await monitorAfterRun() });
  } catch (caught) {
    const error = (caught instanceof Error ? caught.message : "Job failed").slice(0, 400);
    await db.update(automationRuns).set({ status: "FAILED", finishedAt: Date.now(), error })
      .where(eq(automationRuns.id, id));
    return Response.json({ status: "FAILED", slot, error, federal, monitoring: await monitorAfterRun() }, { status: 502 });
  }
}

/** One private research draft for the most recently captured waiting case without one. Never publishes anything. */
async function researchOneWaitingCase(): Promise<{ status: string; representationId?: string; error?: string }> {
  const pending = await getDb().select({ id: representations.id }).from(representations)
    .leftJoin(machineResearchDrafts, eq(machineResearchDrafts.representationId, representations.id))
    .where(and(eq(representations.status, "CANDIDATE"), isNull(machineResearchDrafts.representationId),
      like(representations.context, "AI-extracted. Suggested pre-research%")))
    .orderBy(desc(representations.extractedAt)).limit(1).get();
  if (!pending) return { status: "NO_CASE_NEEDS_RESEARCH" };
  const researched = await runMachineResearch(pending.id);
  const draft = await researched.json() as { status?: string; error?: string };
  if (researched.status === 429) return { status: "DAILY_RESEARCH_LIMIT", representationId: pending.id };
  if (!researched.ok) return { status: "FAILED", representationId: pending.id, error: (draft.error ?? String(researched.status)).slice(0, 200) };
  return { status: draft.status ?? "COMPLETE", representationId: pending.id };
}

async function federalStep(): Promise<IngestSummary | { status: "FAILED"; error: string }> {
  try { return await runFederalIngest({ budgetMs: 120_000, trigger: "scheduled" }); }
  catch (error) { return { status: "FAILED", error: (error instanceof Error ? error.message : "federal ingestion failed").slice(0, 200) }; }
}

/**
 * Bill summaries get what is left of the 300 s, less 40 s for monitoring and the
 * nudge (the batch stops starting new summaries 45 s before its deadline and
 * each model call is capped to the time left). Their own caps bound spend.
 */
async function analysisStep(startedAt: number): Promise<(AnalysisRun | { status: "FAILED"; error: string }) & { classify?: ClassifyRun | { status: "FAILED"; error: string }; changes?: unknown }> {
  const budgetMs = 300_000 - (Date.now() - startedAt) - 40_000;
  if (budgetMs < 50_000) return { status: "FAILED", error: "no time left in this run" };
  let analysis: AnalysisRun | { status: "FAILED"; error: string };
  try { analysis = await runAnalysisBatch({ budgetMs, trigger: "scheduled" }); }
  catch (error) { analysis = { status: "FAILED", error: (error instanceof Error ? error.message : "analysis failed").slice(0, 200) }; }
  // Issue suggestions for unsorted bills use whatever time is left; never after a billing refusal (AI work stops).
  const refused = /billing or usage limit/i.test(("error" in analysis && analysis.error) || "");
  const left = 300_000 - (Date.now() - startedAt) - 40_000;
  if (refused || left < 30_000) return analysis;
  let classify: ClassifyRun | { status: "FAILED"; error: string };
  try { classify = await runClassifyBatch({ budgetMs: left }); }
  catch (error) { classify = { status: "FAILED", error: (error instanceof Error ? error.message : "classify failed").slice(0, 200) }; }
  // Round A: "what changed" between text versions, within the same monthly summary cap.
  const left2 = 300_000 - (Date.now() - startedAt) - 40_000;
  if (left2 < 40_000 || /billing/i.test(("error" in classify && classify.error) || "")) return { ...analysis, classify };
  const { runChangesBatch } = await import("@/lib/analysis/changes");
  const changes = await runChangesBatch({ budgetMs: left2 }).catch(error => ({ status: "FAILED" as const, error: (error instanceof Error ? error.message : "changes failed").slice(0, 200) }));
  return { ...analysis, classify, changes };
}

/**
 * After the ledger row is final: exception-only monitoring, then the daily
 * review email. Both run whether the job succeeded or failed (a case from the
 * backlog is reviewable even on a day intake broke). A fault in either never
 * changes the run's result.
 */
async function monitorAfterRun(): Promise<{ alerts: MonitoringOutcome | { evaluated: false; error: string }; rhythm: RhythmOutcome | { error: string }; trial: unknown }> {
  let alerts: MonitoringOutcome | { evaluated: false; error: string }, rhythm: RhythmOutcome | { error: string };
  try { alerts = await runMonitoring(); }
  catch (error) { alerts = { evaluated: false, error: (error instanceof Error ? error.message : "monitoring failed").slice(0, 200) }; }
  try { rhythm = await runRhythm(); }
  catch (error) { rhythm = { error: (error instanceof Error ? error.message : "rhythm failed").slice(0, 200) }; }
  // The invite-only trial opens on its own once OpenAI calls succeed; say so once, by email.
  const trial = await sendTrialOpenIfDue(sendEmail);
  return { alerts, rhythm, trial };
}
