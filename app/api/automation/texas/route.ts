import { tickAuthorized } from "@/lib/tick-auth";
import { runTexasLink } from "@/lib/texas/ingest";
import { chainLogLine, fireTexasChain, txChainSettings, type StartKind } from "@/lib/texas/chain";

/**
 * The Texas loader, back to back (17 Nov 2026).
 *
 * Thousands of 2027 bills are filed before January and about ten thousand in a regular session; the scheduled update
 * runs twice a day with a dozen requests. This route loads for up to four minutes, then calls itself again while
 * there is work and budget (lib/texas/chain.ts chainDecision). It keeps to a daily request budget and a per-minute
 * pace, stops cleanly on a 429, never runs beside another Texas load (a lock in ingest_cursors), and logs one line per
 * link. Same secret as the scheduled update; nothing here is reachable without it.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const via = await tickAuthorized(request.headers.get("authorization"), { cronSecret: process.env.CRON_SECRET, tickSecret: process.env.AUTOMATION_TICK_SECRET });
  if (!via) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url), link = Math.max(1, Math.min(99, Number(url.searchParams.get("chain")) || 1));
  const start = url.searchParams.get("start");
  const kind: StartKind = start === "scheduled" || start === "chain" ? start : "manual";
  const chain = (url.searchParams.get("id") ?? "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64) || undefined;
  const startUsed = Math.max(0, Number(url.searchParams.get("used")) || 0);
  const run = await runTexasLink({ budgetMs: txChainSettings().linkMs, kind, link, chain, startUsed }).catch(error => ({
    status: "FAILED" as const, stoppedBy: "error" as const, requests: 0, usedToday: 0, daily: 0, startUsed, bills: 0, waiting: {}, workLeft: false,
    decision: { next: false, reason: "stopped on an error" }, detail: {} as Record<string, unknown>, error: (error instanceof Error ? error.message : "failed").slice(0, 200) }));
  console.log(chainLogLine(link, run));
  if (run.decision.next) await fireTexasChain(url.origin, link + 1, { chain: String(run.detail.chain ?? chain ?? ""), start: "chain", startUsed: run.startUsed });
  return Response.json({ status: run.status, link, requests: run.requests, usedToday: run.usedToday, bills: run.bills, waiting: run.waiting, stoppedBy: run.stoppedBy,
    continues: run.decision.next, reason: run.decision.reason, ...(run.error ? { error: run.error } : {}) });
}
