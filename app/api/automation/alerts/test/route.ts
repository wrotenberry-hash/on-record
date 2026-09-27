import { tickAuthorized } from "@/lib/tick-auth";
import { sendTestAlert } from "@/lib/monitoring-runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST with the CRON_SECRET or AUTOMATION_TICK_SECRET bearer: sends a test alert email. */
export async function POST(request: Request) {
  const via = await tickAuthorized(request.headers.get("authorization"),
    { cronSecret: process.env.CRON_SECRET, tickSecret: process.env.AUTOMATION_TICK_SECRET });
  if (!via) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await sendTestAlert(`bearer (${via})`);
  return Response.json(result, { status: result.delivery.ok ? 200 : 502, headers: { "Cache-Control": "no-store" } });
}
