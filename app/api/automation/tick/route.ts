import { and, desc, eq, isNull, like } from "drizzle-orm";
import { getDb } from "@/db";
import { automationRuns, machineResearchDrafts, representations } from "@/db/schema";
import { runDiscovery } from "@/app/api/editor/discover/route";
import { processOneCandidate } from "@/app/api/editor/intake/route";
import { runMachineResearch } from "@/app/api/editor/cases/[id]/draft-research/route";
import { tickAuthorized } from "@/lib/tick-auth";

// Discovery, one capture and one bilateral research draft run in sequence and
// can take minutes. 300 s is the Fluid Compute ceiling on the Hobby plan.
export const maxDuration = 300;
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
    const captured = await processOneCandidate({}, "scheduled-worker");
    const result = await captured.json() as { id?: string; status?: string; caseIds?: string[]; error?: string };
    if (!captured.ok) throw Error(`Capture: ${result.error ?? captured.status}`);
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
      if (!researched.ok) throw Error(`Research: ${draft.error ?? researched.status}`);
      researchStatus = draft.status ?? "COMPLETE";
    }
    await db.update(automationRuns).set({ status: "COMPLETE", finishedAt: Date.now(),
      candidateId: result.id, representationId, captureStatus: result.status, researchStatus })
      .where(eq(automationRuns.id, id));
    return Response.json({ status: "COMPLETE", slot, via, candidateId: result.id,
      representationId, captureStatus: result.status, researchStatus });
  } catch (caught) {
    const error = (caught instanceof Error ? caught.message : "Job failed").slice(0, 400);
    await db.update(automationRuns).set({ status: "FAILED", finishedAt: Date.now(), error })
      .where(eq(automationRuns.id, id));
    return Response.json({ status: "FAILED", slot, error }, { status: 502 });
  }
}
