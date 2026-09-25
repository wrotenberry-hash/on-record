import { env } from "cloudflare:workers";

export const runtime = "edge";

/**
 * Anonymous reachability probe for the scheduler path. It reports only whether
 * the request reached the app and whether the job secret has been provisioned;
 * it never reveals the secret, reads the database, or spends model budget.
 */
export async function GET() {
  const configured = Boolean((env as unknown as { AUTOMATION_TICK_SECRET?: string }).AUTOMATION_TICK_SECRET);
  return Response.json({ service: "on-record", status: "reachable", tickSecretConfigured: configured, time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } });
}
