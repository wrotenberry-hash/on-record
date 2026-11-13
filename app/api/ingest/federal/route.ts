import { tickAuthorized } from "@/lib/tick-auth";
import { runFederalIngest } from "@/lib/federal/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Federal official-record ingestion on demand, for the scheduler secrets only. Uses no model calls. */
async function handle(request: Request) {
  const via = await tickAuthorized(request.headers.get("authorization"), { cronSecret: process.env.CRON_SECRET, tickSecret: process.env.AUTOMATION_TICK_SECRET });
  if (!via) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await runFederalIngest({ budgetMs: 240_000, trigger: `manual:${via}` });
  return Response.json(summary, { status: summary.status === "FAILED" ? 502 : 200 });
}
export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
