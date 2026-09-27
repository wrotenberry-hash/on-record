/**
 * Exception-only monitoring rules. Pure: no database, no network, no clock of
 * its own, so every rule is unit-tested. The runtime (lib/monitoring-runtime.ts)
 * gathers the inputs, calls `evaluate`, and sends one email per alert kind that
 * has not been sent in the last 24 hours. A healthy system produces no alerts
 * and therefore no email.
 */
export const ALERT_KINDS = ["CONSECUTIVE_FAILURES", "NO_CAPTURE_72H", "SPEND_75_PERCENT", "KEY_EXPIRING", "TEST"] as const;
export type AlertKind = typeof ALERT_KINDS[number];

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const NO_CAPTURE_WINDOW_MS = 72 * HOUR_MS;
export const DEDUPE_WINDOW_MS = 24 * HOUR_MS;
export const KEY_EXPIRY_WARNING_DAYS = 21;
export const SPEND_ALERT_FRACTION = 0.75;
export const DEFAULT_MONTHLY_LIMIT_USD = 20;

export type LedgerRun = { status: "RUNNING" | "COMPLETE" | "FAILED"; captureStatus: string | null; startedAt: number; finishedAt: number | null };
export type Spend = { monthToDateUsd: number; source: "openai-costs-api" | "ledger-estimate" } | { monthToDateUsd: null; source: "unavailable"; reason: string };

export type MonitoringInput = {
  /** Ledger rows, newest first. */
  runs: readonly LedgerRun[];
  spend: Spend;
  monthlyLimitUsd: number;
  /** ISO date (YYYY-MM-DD) or null when not configured. */
  keyExpires: string | null;
  /** Last time each kind was sent, or undefined. */
  lastSent: ReadonlyMap<AlertKind, number>;
};

export type Alert = { kind: AlertKind; subject: string; detail: string };
export type Evaluation = { alerts: Alert[]; suppressed: Alert[]; checks: Record<string, string> };

export function parseMonthlyLimit(value: string | undefined | null): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_LIMIT_USD;
}

/** Calendar days (UTC) until the key expires, negative once expired; null when unset or unparseable. */
export function daysUntil(isoDate: string | null | undefined, now: number): number | null {
  if (!isoDate) return null;
  const at = Date.parse(`${isoDate.trim()}T00:00:00Z`);
  if (!Number.isFinite(at)) return null;
  return Math.floor(at / DAY_MS) - Math.floor(now / DAY_MS);
}

export function evaluate(input: MonitoringInput, now = Date.now()): Evaluation {
  const found: Alert[] = [];
  const checks: Record<string, string> = {};

  // (1) Two consecutive scheduled runs failed. Only finished runs count.
  const finished = input.runs.filter(r => r.status !== "RUNNING");
  const lastTwo = finished.slice(0, 2);
  const consecutive = lastTwo.length === 2 && lastTwo.every(r => r.status === "FAILED");
  checks.consecutiveFailures = lastTwo.length < 2 ? "fewer than two finished runs" : consecutive ? "last two runs FAILED" : `last two: ${lastTwo.map(r => r.status).join(", ")}`;
  if (consecutive) found.push({ kind: "CONSECUTIVE_FAILURES", subject: "two scheduled runs in a row failed",
    detail: `The last two scheduled runs (started ${iso(lastTwo[1].startedAt)} and ${iso(lastTwo[0].startedAt)}) both ended FAILED. Open the editor's "Scheduled intake" line for the error text.` });

  // (2) No successful capture in 72 hours. With no capture ever, the clock starts at the oldest run.
  const lastCapture = finished.find(r => r.captureStatus === "CAPTURED");
  const oldest = input.runs[input.runs.length - 1];
  const referenceAt = lastCapture ? (lastCapture.finishedAt ?? lastCapture.startedAt) : oldest?.startedAt;
  const stale = referenceAt !== undefined && now - referenceAt > NO_CAPTURE_WINDOW_MS;
  checks.noCapture72h = referenceAt === undefined ? "no runs yet" : `${lastCapture ? "last capture" : "no capture; first run"} ${Math.round((now - referenceAt) / HOUR_MS)} h ago`;
  if (stale) found.push({ kind: "NO_CAPTURE_72H", subject: "no successful capture in 72 hours",
    detail: lastCapture ? `The last scheduled run that captured a statement finished ${iso(referenceAt!)}. Runs since then completed without a capture or failed.`
      : `No scheduled run has captured a statement since the first run at ${iso(referenceAt!)}.` });

  // (3) Month-to-date spend above 75% of the configured monthly limit.
  const threshold = input.monthlyLimitUsd * SPEND_ALERT_FRACTION;
  if (input.spend.monthToDateUsd === null) checks.spend = `unknown (${input.spend.reason})`;
  else {
    checks.spend = `$${input.spend.monthToDateUsd.toFixed(2)} of $${input.monthlyLimitUsd.toFixed(2)} (${input.spend.source})`;
    if (input.spend.monthToDateUsd > threshold) found.push({ kind: "SPEND_75_PERCENT", subject: "OpenAI spend above 75% of the monthly limit",
      detail: `Month-to-date OpenAI spend is $${input.spend.monthToDateUsd.toFixed(2)} (${input.spend.source === "openai-costs-api" ? "from the OpenAI Costs API" : "estimated from the run ledger"}), above 75% of the $${input.monthlyLimitUsd.toFixed(2)} limit (OPENAI_MONTHLY_LIMIT_USD). Check the OpenAI usage page and the project's hard limit.` });
  }

  // (4) API key expiring within 21 days (or already expired).
  const days = daysUntil(input.keyExpires, now);
  checks.keyExpiry = days === null ? "OPENAI_KEY_EXPIRES not set" : `${days} days`;
  if (days !== null && days <= KEY_EXPIRY_WARNING_DAYS) found.push({ kind: "KEY_EXPIRING", subject: days < 0 ? "OpenAI API key has expired" : `OpenAI API key expires in ${days} days`,
    detail: `OPENAI_KEY_EXPIRES is ${input.keyExpires}. Create a new key in the OpenAI dashboard, put it in Vercel as OPENAI_API_KEY, redeploy, revoke the old key, then update OPENAI_KEY_EXPIRES.` });

  // Each kind at most once per 24 hours.
  const alerts: Alert[] = [], suppressed: Alert[] = [];
  for (const alert of found) {
    const last = input.lastSent.get(alert.kind);
    (last !== undefined && now - last < DEDUPE_WINDOW_MS ? suppressed : alerts).push(alert);
  }
  return { alerts, suppressed, checks };
}

export function formatAlertEmail(alert: Alert, checks: Record<string, string>, siteUrl: string, now = Date.now()): { subject: string; text: string } {
  const lines = [
    `On Record alert: ${alert.subject}.`, "", alert.detail, "",
    "Current checks:", ...Object.entries(checks).map(([k, v]) => `- ${k}: ${v}`), "",
    `Editor: ${siteUrl}/editor`, `Health: ${siteUrl}/api/automation/health`, "",
    `Sent ${iso(now)}. This alert kind is sent at most once per 24 hours. Healthy runs send nothing.`,
  ];
  return { subject: `[On Record] ${alert.subject}`, text: lines.join("\n") };
}

function iso(ms: number) { return new Date(ms).toISOString().replace(".000Z", "Z"); }
