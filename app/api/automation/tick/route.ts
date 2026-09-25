import { env } from "cloudflare:workers";
import { and, desc, eq, isNull, like } from "drizzle-orm";
import { getDb } from "@/db";
import { automationRuns, machineResearchDrafts, representations } from "@/db/schema";
import { runDiscovery } from "@/app/api/editor/discover/route";
import { processOneCandidate } from "@/app/api/editor/intake/route";
import { runMachineResearch } from "@/app/api/editor/cases/[id]/draft-research/route";

export const runtime = "edge";

async function sameSecret(actual: string, expected: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([actual, expected].map(x => crypto.subtle.digest("SHA-256", encoder.encode(x))));
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

/** Invoked by an external scheduler. The token grants this narrow job only. */
export async function POST(request: Request) {
  const secret = (env as unknown as { AUTOMATION_TICK_SECRET?: string }).AUTOMATION_TICK_SECRET;
  const supplied = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1] ?? "";
  if (!secret || !supplied || !await sameSecret(supplied, secret))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const now = Date.now(), slot = new Date(now).toISOString().slice(0, 13), day = slot.slice(0, 10);
  const db = getDb();
  const today = await db.select({ id: automationRuns.id }).from(automationRuns)
    .where(eq(automationRuns.day, day)).limit(6);
  // Cap model-bearing invocations even if an external scheduler retries or runs hourly.
  const configured = Number((env as unknown as { AUTOMATION_DAILY_LIMIT?: string }).AUTOMATION_DAILY_LIMIT ?? "2");
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
    return Response.json({ status: "COMPLETE", slot, candidateId: result.id,
      representationId, captureStatus: result.status, researchStatus });
  } catch (caught) {
    const error = (caught instanceof Error ? caught.message : "Job failed").slice(0, 400);
    await db.update(automationRuns).set({ status: "FAILED", finishedAt: Date.now(), error })
      .where(eq(automationRuns.id, id));
    return Response.json({ status: "FAILED", slot, error }, { status: 502 });
  }
}
