export const dynamic = "force-dynamic";



/**
 * Anonymous reachability probe for the scheduler path. It reports only whether
 * the request reached the app and whether the job secret has been provisioned;
 * it never reveals a secret, reads the database, or spends model budget.
 */
export async function GET() {
  const tick = Boolean(process.env.AUTOMATION_TICK_SECRET?.trim()), cron = Boolean(process.env.CRON_SECRET?.trim());
  return Response.json({ service: "on-record", status: "reachable", tickSecretConfigured: tick, cronSecretConfigured: cron, database: process.env.TURSO_DATABASE_URL ? "turso" : "local-file", time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } });
}
