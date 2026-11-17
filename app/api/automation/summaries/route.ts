import { tickAuthorized } from "@/lib/tick-auth";
import { runAnalysisBatch } from "@/lib/analysis/generate";
import { fireSummaryChain, SUMMARY_CHAIN_MAX } from "@/lib/analysis/chain";

/**
 * Bill summaries, back to back (test-ready build, 17 Nov 2026).
 *
 * The owner's bar: every federal bill with a roll-call vote in the last 90 days has a summary that passes. The host
 * runs the scheduled update only twice a day and each run fits two or three summaries, so a run that stops for lack
 * of time hands over to this route, which writes for up to four minutes and then calls itself again. The chain ends
 * when nothing is left, when the summary cap or the monthly spend cap is reached, on an error, or after
 * SUMMARY_CHAIN_MAX links. Same secret as the scheduled update; nothing here is reachable without it.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const via = await tickAuthorized(request.headers.get("authorization"), { cronSecret: process.env.CRON_SECRET, tickSecret: process.env.AUTOMATION_TICK_SECRET });
  if (!via) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url), link = Math.max(1, Math.min(99, Number(url.searchParams.get("chain")) || 1));
  const run = await runAnalysisBatch({ budgetMs: 240_000, trigger: `chain ${link}` }).catch(error => ({ status: "FAILED" as const, stoppedBy: "error", made: [], error: (error instanceof Error ? error.message : "failed").slice(0, 200) }));
  const made = "made" in run ? run.made.length : 0, more = run.status !== "FAILED" && run.stoppedBy === "time budget" && link < SUMMARY_CHAIN_MAX;
  console.log(`SUMMARY_CHAIN link ${link} | ${run.status} | made ${made} | stopped by ${run.stoppedBy ?? "nothing left"} | ${more ? "continues" : "ends"}`);
  if (more) await fireSummaryChain(url.origin, link + 1);
  return Response.json({ status: run.status, link, made, stoppedBy: run.stoppedBy ?? null, continues: more });
}
