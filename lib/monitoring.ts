/**
 * Exception-only monitoring rules. Pure: no database, no network, no clock of
 * its own, so every rule is unit-tested. The runtime (lib/monitoring-runtime.ts)
 * gathers the inputs, calls `evaluate`, and sends one email per alert kind that
 * has not been sent in the last 24 hours. A healthy system produces no alerts
 * and therefore no email.
 */
export const ALERT_KINDS = ["CONSECUTIVE_FAILURES", "NO_CAPTURE_72H", "SPEND_75_PERCENT", "KEY_EXPIRING", "TEST", "DAILY_CASE", "DAILY_NUDGE", "INGEST_FAILING", "BILLING_REFUSED", "SUMMARIES_READY"] as const;
export type AlertKind = typeof ALERT_KINDS[number];

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const NO_CAPTURE_WINDOW_MS = 72 * HOUR_MS;
/**
 * A continuing problem is reported once, then repeated every three days, not
 * daily: during the October 2026 budget outage the 24-hour cadence produced
 * three emails a day for a week, all unread. The first alert is still immediate.
 */
export const DEDUPE_WINDOW_MS = 72 * HOUR_MS;
/** The daily review emails repeat at most once per calendar day; 20 h tolerates scheduler drift. */
export const RHYTHM_WINDOW_MS = 20 * HOUR_MS;
/** Reviewed CHECKING records needed before the public inventory opens (mirrors lib/public-access.ts). */
export const LAUNCH_TARGET = 20;
export const KEY_EXPIRY_WARNING_DAYS = 21;
export const SPEND_ALERT_FRACTION = 0.75;
/** The owner's OpenAI monthly usage limit (auto recharge on since 2026-11-13: $10 when under $3). OPENAI_MONTHLY_LIMIT_USD overrides. */
export const DEFAULT_MONTHLY_LIMIT_USD = 40;
/** A billing refusal this recent raises BILLING_REFUSED. */
export const BILLING_REFUSAL_WINDOW_MS = 24 * HOUR_MS;

/** Billing codes OpenAI returns when the account cannot pay (lib/automated-research.ts). */
export const BILLING_CODES = ["insufficient_quota", "credit_balance_exhausted", "organization_usage_limit_exceeded",
  "organization_spend_limit_exceeded", "project_spend_limit_exceeded"] as const;
/** The billing code inside a run's error text, or null. */
export function billingCodeIn(error: string | null | undefined): string | null {
  if (!error) return null;
  return BILLING_CODES.find(c => error.includes(c)) ?? null;
}

export type LedgerRun = { status: "RUNNING" | "COMPLETE" | "FAILED"; captureStatus: string | null; startedAt: number; finishedAt: number | null; error?: string | null };
/** Month-to-date OpenAI spend: priced from On Record's ledger of every model call, or the OpenAI Costs API when an admin key is set. */
export type Spend = { monthToDateUsd: number; source: "openai-costs-api" | "model-call-ledger" } | { monthToDateUsd: null; source: "unavailable"; reason: string };

export type MonitoringInput = {
  /** Ledger rows, newest first. */
  runs: readonly LedgerRun[];
  spend: Spend;
  monthlyLimitUsd: number;
  /** ISO date (YYYY-MM-DD) or null when not configured. */
  keyExpires: string | null;
  /** Last time each kind was sent, or undefined. */
  lastSent: ReadonlyMap<AlertKind, number>;
  /** Federal official-record ingestion runs, newest first (optional). */
  ingestRuns?: ReadonlyArray<{ status: "RUNNING" | "COMPLETE" | "PARTIAL" | "FAILED"; startedAt: number; error: string | null }>;
  /** Newest billing refusal recorded by the model-call ledger (optional). */
  billingRefusal?: { at: number; code: string } | null;
  /** When OpenAI last answered a call successfully (optional). A refusal older than this has been resolved. */
  lastSuccessfulCallAt?: number | null;
};

export type Alert = { kind: AlertKind; subject: string; detail: string };
export type Evaluation = { alerts: Alert[]; suppressed: Alert[]; checks: Record<string, string> };

/**
 * Statement intake (capture and research, the model-bearing part of the
 * scheduled run) runs only in these UTC hours. Owner decision 2026-11-13: once
 * a day, at the 13:00 run. Federal ingestion, bill summaries, alerts and the
 * afternoon nudge still run at every scheduled run.
 */
export function intakeHours(value: string | undefined | null): number[] {
  const hours = (value ?? "13").split(",").map(x => Number(x.trim())).filter(h => Number.isInteger(h) && h >= 0 && h <= 23);
  return hours.length ? hours : [13];
}
export function intakeAllowed(now: number, value: string | undefined | null) { return intakeHours(value).includes(new Date(now).getUTCHours()); }

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
      detail: `Month-to-date OpenAI spend is ${input.spend.monthToDateUsd.toFixed(2)} (${input.spend.source === "openai-costs-api" ? "from the OpenAI Costs API" : "priced from On Record's ledger of every model call"}), above 75% of the ${input.monthlyLimitUsd.toFixed(2)} limit (OPENAI_MONTHLY_LIMIT_USD). Check the OpenAI usage page and the organisation's monthly limit.` });
  }

  // (4) API key expiring within 21 days (or already expired).
  const days = daysUntil(input.keyExpires, now);
  checks.keyExpiry = days === null ? "OPENAI_KEY_EXPIRES not set" : `${days} days`;
  if (days !== null && days <= KEY_EXPIRY_WARNING_DAYS) found.push({ kind: "KEY_EXPIRING", subject: days < 0 ? "OpenAI API key has expired" : `OpenAI API key expires in ${days} days`,
    detail: `OPENAI_KEY_EXPIRES is ${input.keyExpires}. Create a new key in the OpenAI dashboard, put it in Vercel as OPENAI_API_KEY, redeploy, revoke the old key, then update OPENAI_KEY_EXPIRES.` });

  // (5) Federal ingestion: the two most recent finished runs both FAILED outright (PARTIAL is a run that stored something).
  const ingest = (input.ingestRuns ?? []).filter(r => r.status !== "RUNNING").slice(0, 2);
  const ingestFailing = ingest.length === 2 && ingest.every(r => r.status === "FAILED");
  checks.federalIngest = ingest.length ? ingest.map(r => r.status).join(", ") : "no runs yet";
  if (ingestFailing) found.push({ kind: "INGEST_FAILING", subject: "federal vote and bill ingestion failed twice in a row",
    detail: `The last two federal ingestion runs (started ${iso(ingest[1].startedAt)} and ${iso(ingest[0].startedAt)}) both failed. Latest error: ${(ingest[0].error ?? "none recorded").slice(0, 300)}` });

  // (6) OpenAI refused a call for billing: in the call ledger, or in the newest finished run's error.
  // A refusal is over once a later call succeeded (auto recharge is on); so is one older than 24 h.
  const resolvedAt = input.lastSuccessfulCallAt ?? 0;
  const recent = (at: number) => now - at < BILLING_REFUSAL_WINDOW_MS && at > resolvedAt;
  const runCode = finished[0] && finished[0].status === "FAILED" && recent(finished[0].startedAt) ? billingCodeIn(finished[0].error) : null;
  const ledgerRefusal = input.billingRefusal && recent(input.billingRefusal.at) ? input.billingRefusal : null;
  const refusalCode = ledgerRefusal?.code ?? runCode;
  checks.billing = refusalCode ? `refused (${refusalCode})` : "no unresolved billing refusal in the last 24 h";
  if (refusalCode) found.push({ kind: "BILLING_REFUSED", subject: "OpenAI refused a call for billing",
    detail: `OpenAI answered "${refusalCode}"${ledgerRefusal ? ` at ${iso(ledgerRefusal.at)}` : ` on the scheduled run started ${iso(finished[0].startedAt)}`}. Statement capture, research and bill summaries stop until billing is fixed. Auto recharge should have covered this: check platform.openai.com > Settings > Billing (payment method, auto recharge) and > Limits (the ${input.monthlyLimitUsd.toFixed(0)} monthly usage limit).` });

  // Each kind at most once per DEDUPE_WINDOW_MS.
  const alerts: Alert[] = [], suppressed: Alert[] = [];
  for (const alert of found) {
    const last = input.lastSent.get(alert.kind);
    (last !== undefined && now - last < DEDUPE_WINDOW_MS ? suppressed : alerts).push(alert);
  }
  return { alerts, suppressed, checks };
}

/** One email per run: every alert the run raised, in one message. */
export function formatAlertEmail(alerts: Alert | readonly Alert[], checks: Record<string, string>, siteUrl: string, now = Date.now()): { subject: string; text: string } {
  const list = Array.isArray(alerts) ? alerts as readonly Alert[] : [alerts as Alert];
  const subject = list.length === 1 ? list[0].subject : `${list[0].subject} (+${list.length - 1} more)`;
  const body = list.length === 1 ? [list[0].detail] : list.flatMap(a => [`${a.subject.toUpperCase()}`, a.detail, ""]);
  const lines = [
    `On Record alert: ${subject}.`, "", ...body, "",
    "Current checks:", ...Object.entries(checks).map(([k, v]) => `- ${k}: ${v}`), "",
    `Editor: ${siteUrl}/editor`, `Health: ${siteUrl}/api/automation/health`, "",
    `Sent ${iso(now)}. A continuing problem is repeated every ${DEDUPE_WINDOW_MS / HOUR_MS} hours. Healthy runs send nothing.`,
  ];
  return { subject: `[On Record] ${subject}`, text: lines.join("\n") };
}

/* ---------------------------------------------------------------------------
 * Daily review rhythm. The unit of daily work is one case reviewed (a rejection
 * counts); published records are the output. The morning run emails one
 * pre-chosen case with a one-tap link; the afternoon run sends one nudge if no
 * human gate has been recorded since that email. No case ready means no email.
 * ------------------------------------------------------------------------- */
export type ReadyCase = { id: string; speakerName: string; exactText: string; issue: string | null; capturedAt: number; researchReady: boolean };
export type RhythmInput = {
  readyCase: ReadyCase | null;
  /** Cases still open in the editor, the ready one included. */
  waitingCount: number;
  publishedCount: number;
  /** Any human gate (source check, materiality, review, publication) recorded after `since`. */
  humanActedSince: (since: number) => boolean;
  /** Distinct days with a human gate in the last 7, for the streak line. Optional; 0 shows no streak. */
  daysWithReviewLast7?: number;
  lastSent: ReadonlyMap<AlertKind, number>;
};
export type RhythmDecision = { email: Alert | null; reason: string; phase: "morning" | "afternoon" };

/** Scheduled runs are at 13:00 and 19:00 UTC; anything before 16:00 UTC counts as the morning run. */
export function rhythmPhase(now: number): "morning" | "afternoon" { return new Date(now).getUTCHours() < 16 ? "morning" : "afternoon"; }

export function decideRhythm(input: RhythmInput, now = Date.now()): RhythmDecision {
  const phase = rhythmPhase(now);
  if (!input.readyCase) return { email: null, reason: "no case ready", phase };
  const lastCase = input.lastSent.get("DAILY_CASE"), lastNudge = input.lastSent.get("DAILY_NUDGE");
  const caseSentToday = lastCase !== undefined && now - lastCase < RHYTHM_WINDOW_MS;
  if (!caseSentToday) return { email: dailyCaseAlert(input), reason: phase === "morning" ? "morning case" : "first case email of the day", phase };
  if (phase === "morning") return { email: null, reason: "case email already sent today", phase };
  if (input.humanActedSince(lastCase!)) return { email: null, reason: "reviewed since the morning email", phase };
  if (lastNudge !== undefined && now - lastNudge < RHYTHM_WINDOW_MS) return { email: null, reason: "nudge already sent today", phase };
  return { email: nudgeAlert(input), reason: "no review since the morning email", phase };
}

function progress(input: RhythmInput) {
  return `Published records: ${input.publishedCount} of ${LAUNCH_TARGET} toward launch. Cases waiting: ${input.waitingCount}.`;
}

/** The streak line: only when there is one. Silence is not a reproach. */
function streak(input: RhythmInput): string[] {
  const days = input.daysWithReviewLast7 ?? 0;
  if (days <= 0) return [];
  return [days >= 7 ? "Reviewed every day this week." : days === 1 ? "Reviewed on 1 of the last 7 days. Keep it going." : `Reviewed on ${days} of the last 7 days. Keep it going.`, ""];
}

function dailyCaseAlert(input: RhythmInput): Alert {
  const c = input.readyCase!;
  return { kind: "DAILY_CASE", subject: `Today's case: ${c.speakerName}`,
    detail: [...streak(input), `"${c.exactText}"`, `${c.issue ?? "Unclassified"} · captured ${iso(c.capturedAt).slice(0, 10)} · ${c.researchReady ? "machine research is ready" : "machine research pending; you can run it from the case"}.`, "",
      "Four cards, about five minutes: check the source, judge it, tick the evidence, finish. Rejecting is a valid outcome and counts as today's review.", "", progress(input)].join("\n") };
}

function nudgeAlert(input: RhythmInput): Alert {
  const c = input.readyCase!;
  return { kind: "DAILY_NUDGE", subject: `Still open: ${c.speakerName}`,
    detail: [`This morning's case has not been reviewed yet.`, `"${c.exactText}"`, "", "One nudge a day, no more. Missed days are counted in Monday's report.", "", progress(input)].join("\n") };
}

export function formatRhythmEmail(alert: Alert, caseId: string, siteUrl: string, skipUrl?: string | null): { subject: string; text: string } {
  const lines = [alert.detail, "", `Open the case: ${siteUrl}/editor?case=${encodeURIComponent(caseId)}`,
    ...(skipUrl ? ["", `Not today? ${skipUrl}`, "One tap moves this case to the back of the order; tomorrow's email picks another. The link works for 48 hours and changes nothing until you confirm."] : []),
    "", "Sent by On Record's scheduled run. No case ready means no email."];
  return { subject: `[On Record] ${alert.subject}`, text: lines.join("\n") };
}

function iso(ms: number) { return new Date(ms).toISOString().replace(".000Z", "Z"); }
