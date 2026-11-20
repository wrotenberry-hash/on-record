import { tickAuthorized } from "@/lib/tick-auth";
import { runChangeMenus } from "@/lib/changes/run";

/**
 * Drafting menus of changes (owner, 20 Nov 2026). Started by the scheduled update with the same secret; nothing here
 * is reachable without it. It has its own time allowance so that summaries and menus do not crowd each other, and its
 * own monthly limit (lib/changes/run.ts). It answers with counts and bill numbers, never with wording.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const via = await tickAuthorized(request.headers.get("authorization"), { cronSecret: process.env.CRON_SECRET, tickSecret: process.env.AUTOMATION_TICK_SECRET });
  if (!via) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const run = await runChangeMenus({ budgetMs: 250_000 }).catch(error => ({ status: "FAILED" as const, reason: (error instanceof Error ? error.message : "failed").slice(0, 200), spentUsd: 0, capUsd: 0, made: [] }));
  console.log(`CHANGE_MENUS | ${run.status}${run.reason ? ` | ${run.reason}` : ""} | ${run.made.length} bills | month $${run.spentUsd} of $${run.capUsd}`);
  return Response.json({ status: run.status, reason: run.reason ?? null, bills: run.made.map(m => ({ bill: m.label, status: m.status, groups: m.groups, choices: m.options })), spentUsd: run.spentUsd, capUsd: run.capUsd });
}
