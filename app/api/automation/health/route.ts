import { databaseSettings } from "@/db/settings";
export const dynamic = "force-dynamic";

/** Hostname only, never the token. Lets an operator confirm every deploy uses the same database. */
function databaseHost(): string | null {
  try { const { url, source } = databaseSettings(); return source === "local" ? null : new URL(url).hostname; } catch { return "unparseable"; }
}



/**
 * Anonymous reachability probe for the scheduler path. It reports only whether
 * the request reached the app and whether the job secret has been provisioned;
 * it never reveals a secret, reads the database, or spends model budget.
 */
export async function GET() {
  const tick = Boolean(process.env.AUTOMATION_TICK_SECRET?.trim()), cron = Boolean(process.env.CRON_SECRET?.trim());
  return Response.json({ service: "on-record", status: "reachable", tickSecretConfigured: tick, cronSecretConfigured: cron, database: databaseSettings().source, databaseHost: databaseHost(), time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } });
}
