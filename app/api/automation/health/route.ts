import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { databaseSettings } from "@/db/settings";
import { automationRuns } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Hostname only, never the token. Lets an operator confirm every deploy uses the same database. */
function databaseHost(): string | null {
  try { const { url, source } = databaseSettings(); return source === "local" ? null : new URL(url).hostname; } catch { return "unparseable"; }
}

/** Status words from the newest ledger row. No candidate, representation or error text. */
async function lastRun() {
  try {
    const row = await getDb().select({ slot: automationRuns.slot, status: automationRuns.status, captureStatus: automationRuns.captureStatus,
      researchStatus: automationRuns.researchStatus, startedAt: automationRuns.startedAt, finishedAt: automationRuns.finishedAt })
      .from(automationRuns).orderBy(desc(automationRuns.startedAt)).limit(1).get();
    return row ? { ...row, hadError: row.status === "FAILED" } : null;
  } catch { return "unavailable" as const; }
}

/**
 * Anonymous reachability probe for the scheduler path. It reports only whether
 * the request reached the app, which secrets are provisioned, which database is
 * in use and the status words of the last scheduled run. It never reveals a
 * secret, a captured statement, or spends model budget.
 */
export async function GET() {
  const tick = Boolean(process.env.AUTOMATION_TICK_SECRET?.trim()), cron = Boolean(process.env.CRON_SECRET?.trim());
  return Response.json({ service: "on-record", status: "reachable", tickSecretConfigured: tick, cronSecretConfigured: cron,
    openaiKeyConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()), editorAllowlistConfigured: Boolean((process.env.EDITOR_EMAILS ?? process.env.EDITOR_USER_IDS ?? "").trim()),
    database: databaseSettings().source, databaseHost: databaseHost(), lastRun: await lastRun(), time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } });
}
