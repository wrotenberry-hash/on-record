import { getDb } from "@/db";
import { getCursor, setCursor } from "@/lib/federal/ingest";
import { tickAuthorized } from "@/lib/tick-auth";
import { runInlineTests } from "@/lib/briefing-test";

/**
 * The reader test for briefing items (owner, 20 Nov 2026: "Each inline item must pass the average-reader test on its
 * own, with no knowledge of the full page assumed"). Each approved summary's short version is tested once, and again
 * only if its words change, so the total cost is bounded by the number of approved summaries; the calls are counted
 * inside the summaries' monthly limit and stop at it.
 *
 * POST: started by the scheduled update with its secret. GET: needs no sign-in, like the key check, so it is paced
 * (one run every 10 minutes) and cannot be made to spend more than the same once-per-summary tests. Both answer with
 * bill numbers and pass or fail only, never with wording.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const EVERY_MS = 10 * 60 * 1000, CURSOR = "briefing:tests:at";
const headers = { "Cache-Control": "no-store" };

async function run() {
  const r = await runInlineTests(Date.now(), { max: 12, budgetMs: 230_000 }).catch(error => ({ error: (error instanceof Error ? error.message : "tests failed").replace(/sk-[A-Za-z0-9_-]{6,}/g, "[key]").slice(0, 200) }));
  return Response.json({ service: "on-record", ran: true, ...r }, { headers });
}

export async function POST(request: Request) {
  const via = await tickAuthorized(request.headers.get("authorization"), { cronSecret: process.env.CRON_SECRET, tickSecret: process.env.AUTOMATION_TICK_SECRET });
  if (!via) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await setCursor(getDb(), CURSOR, String(Date.now()));
  return run();
}

export async function GET() {
  const db = getDb(), now = Date.now(), last = Number(await getCursor(db, CURSOR)) || 0;
  if (now - last < EVERY_MS) return Response.json({ service: "on-record", ran: false, nextAfter: new Date(last + EVERY_MS).toISOString() }, { headers });
  await setCursor(db, CURSOR, String(now));
  return run();
}
