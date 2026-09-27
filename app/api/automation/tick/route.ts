import { and, desc, eq, isNull, like } from "drizzle-orm";
import { getDb } from "@/db";
import { automationRuns, machineResearchDrafts, representations } from "@/db/schema";
import { runDiscovery } from "@/app/api/editor/discover/route";
import { processOneCandidate } from "@/app/api/editor/intake/route";
import { runMachineResearch } from "@/app/api/editor/cases/[id]/draft-research/route";
import { tickAuthorized } from "@/lib/tick-auth";
import { runMonitoring, type MonitoringOutcome } from "@/lib/monitoring-runtime";

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
  try {
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
    return Response.json({ status: "COMPLETE", slot, via, candidateId: result.id,
      representationId, captureStatus: result.status, captureAttempts: attempts, researchStatus, monitoring: await monitorAfterRun() });
  } catch (caught) {
    const error = (caught instanceof Error ? caught.message : "Job failed").slice(0, 400);
    await db.update(automationRuns).set({ status: "FAILED", finishedAt: Date.now(), error })
      .where(eq(automationRuns.id, id));
    return Response.json({ status: "FAILED", slot, error, monitoring: await monitorAfterRun() }, { status: 502 });
  }
}

/** Exception-only monitoring runs after the ledger row is final. A monitoring fault never changes the run's result. */
async function monitorAfterRun(): Promise<MonitoringOutcome | { evaluated: false; error: string }> {
  try { return await runMonitoring(); }
  catch (error) { return { evaluated: false, error: (error instanceof Error ? error.message : "monitoring failed").slice(0, 200) }; }
}
