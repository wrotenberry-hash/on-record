import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { databaseSettings } from "@/db/settings";
import { alertEvents, automationRuns } from "@/db/schema";
import { monitoringConfigured } from "@/lib/monitoring-runtime";

export const dynamic = "force-dynamic";

/** Hostname only, never the token. Lets an operator confirm every deploy uses the same database. */
function databaseHost(): string | null {
  try { const { url, source } = databaseSettings(); return source === "local" ? null : new URL(url).hostname; } catch { return "unparseable"; }
}

/** Status words from the newest ledger row. No candidate, representation or error text. */
async function lastRun() {
  try {
    const row = await getDb().select({ slot: automationRuns.slot, status: automationRuns.status, captureStatus: automationRuns.captureStatus,
      researchStatus: automationRuns.researchStatus, startedAt: automationRuns.startedAt, finishedAt: automationRuns.finishedAt,
      error: automationRuns.error })
      .from(automationRuns).orderBy(desc(automationRuns.startedAt)).limit(1).get();
    if (!row) return null;
    // Error text is status words and generic fetch/extraction messages; strip anything URL-shaped defensively.
    const note = row.error ? row.error.replace(/https?:\/\/\S+/g, "[url]").slice(0, 300) : null;
    return { ...row, error: note, hadError: row.status === "FAILED" };
  } catch { return "unavailable" as const; }
}

async function lastAlert() {
  try {
    const row = await getDb().select({ kind: alertEvents.kind, sentAt: alertEvents.sentAt }).from(alertEvents).orderBy(desc(alertEvents.sentAt)).limit(1).get();
    return row ?? null;
  } catch { return "unavailable" as const; }
}

/**
 * Anonymous reachability probe for the scheduler path. It reports only whether
 * the request reached the app, which secrets are provisioned, which database is
 * in use and the status words (plus generic error notes) of the last scheduled run. It never reveals a
 * secret, a captured statement, or spends model budget.
 */
export async function GET() {
  const tick = Boolean(process.env.AUTOMATION_TICK_SECRET?.trim()), cron = Boolean(process.env.CRON_SECRET?.trim());
  return Response.json({ service: "on-record", status: "reachable", tickSecretConfigured: tick, cronSecretConfigured: cron,
    openaiKeyConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()), editorAllowlistConfigured: Boolean((process.env.EDITOR_EMAILS ?? process.env.EDITOR_USER_IDS ?? "").trim()),
    database: databaseSettings().source, databaseHost: databaseHost(), lastRun: await lastRun(),
    monitoring: { resendConfigured: monitoringConfigured().resend, spendSource: monitoringConfigured().spendSource, keyExpires: monitoringConfigured().keyExpires, lastAlert: await lastAlert() },
    time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } });
}
