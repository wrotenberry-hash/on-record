import { getDb } from "@/db";
import { getCursor, setCursor } from "@/lib/federal/ingest";
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
 * SUMMARY_CHAIN_MAX links. POST: same secret as the scheduled update.
 *
 * GET (owner, 21 Nov 2026: "Run the second summary trial now instead of waiting for the 13:00 UTC run"): starts the
 * same chain between the two scheduled updates. It needs no sign-in, like the briefing reader tests, so it is paced
 * (one start every 10 minutes) and does nothing a scheduled update would not do: the run it starts stops at the
 * summaries' monthly cap, the monthly spend limit and the count of summaries, writes only what the writer is allowed
 * to write, and steps aside when another run is in progress. It is not a scheduled update, so it takes neither of the
 * day's two. It answers with whether a run was started, never with wording.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const EVERY_MS = 10 * 60 * 1000, CURSOR = "summaries:start:at";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const db = getDb(), now = Date.now(), last = Number(await getCursor(db, CURSOR)) || 0;
  if (now - last < EVERY_MS) return Response.json({ service: "on-record", started: false, nextAfter: new Date(last + EVERY_MS).toISOString() }, { headers });
  await setCursor(db, CURSOR, String(now));
  const started = await fireSummaryChain(new URL(request.url).origin, 1);
  console.log(`SUMMARY_CHAIN started between scheduled updates | ${started ? "link 1 running" : "not started"}`);
  return Response.json({ service: "on-record", started }, { headers });
}

export async function POST(request: Request) {
  const via = await tickAuthorized(request.headers.get("authorization"), { cronSecret: process.env.CRON_SECRET, tickSecret: process.env.AUTOMATION_TICK_SECRET });
  if (!via) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url), link = Math.max(1, Math.min(99, Number(url.searchParams.get("chain")) || 1));
  const run = await runAnalysisBatch({ budgetMs: 240_000, trigger: `chain ${link}` }).catch(error => ({ status: "FAILED" as const, stoppedBy: "error", made: [], error: (error instanceof Error ? error.message : "failed").slice(0, 200) }));
  const made = "made" in run ? run.made.length : 0, more = run.status !== "FAILED" && run.stoppedBy === "time budget" && link < SUMMARY_CHAIN_MAX;
  // 17 Nov: the 19:00 run's two chain-written summaries could not be reviewed, because only the scheduled update wrote
  // what it made to the log. The same packets (the summary beside the bill sections it cites) are written here.
  if ("made" in run && run.made.length) await import("@/lib/analysis/report").then(m => m.logReviewPackets(run.made.map(x => x.billId), 25_000)).catch(() => null);
  console.log(`SUMMARY_CHAIN link ${link} | ${run.status} | made ${made} | stopped by ${run.stoppedBy ?? "nothing left"} | ${more ? "continues" : "ends"}`);
  if (more) await fireSummaryChain(url.origin, link + 1);
  return Response.json({ status: run.status, link, made, stoppedBy: run.stoppedBy ?? null, continues: more });
}
