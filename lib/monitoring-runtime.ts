import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { alertEvents, automationRuns, machineResearchDrafts, sourceCaptures } from "@/db/schema";
import { ALERT_KINDS, evaluate, formatAlertEmail, parseMonthlyLimit, type Alert, type AlertKind, type Evaluation, type Spend } from "@/lib/monitoring";

/**
 * Gathers the inputs for lib/monitoring.ts, evaluates, and sends alert emails
 * through Resend. Called at the end of every scheduled run; never throws into
 * the run (the caller wraps it). Healthy runs send nothing.
 */
export const DEFAULT_ALERT_TO = "wrotenberry@gmail.com";
const DEFAULT_ALERT_FROM = "On Record <onboarding@resend.dev>";
const RESEND_API_URL = process.env.RESEND_API_URL?.trim() || "https://api.resend.com/emails";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";

// Ledger-based estimate when no OpenAI admin key is available. Observed on
// 2026-09-26: about $0.61 for one capture plus one bilateral research draft.
const EST_COST_PER_DRAFT_USD = Number(process.env.OPENAI_EST_COST_PER_DRAFT_USD ?? "0.55") || 0.55;
const EST_COST_PER_CAPTURE_USD = Number(process.env.OPENAI_EST_COST_PER_CAPTURE_USD ?? "0.06") || 0.06;

export function monitoringConfigured() {
  return { resend: Boolean(process.env.RESEND_API_KEY?.trim()), recipient: process.env.ALERT_TO_EMAIL?.trim() || DEFAULT_ALERT_TO,
    monthlyLimitUsd: parseMonthlyLimit(process.env.OPENAI_MONTHLY_LIMIT_USD), keyExpires: process.env.OPENAI_KEY_EXPIRES?.trim() || null,
    spendSource: process.env.OPENAI_ADMIN_KEY?.trim() ? "openai-costs-api" : "ledger-estimate" };
}

function monthStart(now: number) { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); }

/** Month-to-date spend: the OpenAI Costs API when an admin key is set, else an estimate from the ledger. */
export async function monthToDateSpend(now = Date.now()): Promise<Spend> {
  const adminKey = process.env.OPENAI_ADMIN_KEY?.trim();
  const start = Math.floor(monthStart(now) / 1000);
  if (adminKey) {
    try {
      const params = new URLSearchParams({ start_time: String(start), bucket_width: "1d", limit: "31" });
      if (process.env.OPENAI_PROJECT_ID?.trim()) params.append("project_ids[]", process.env.OPENAI_PROJECT_ID.trim());
      const response = await fetch(`https://api.openai.com/v1/organization/costs?${params}`, { headers: { Authorization: `Bearer ${adminKey}` }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) return { monthToDateUsd: null, source: "unavailable", reason: `costs API ${response.status}` };
      const body = await response.json() as { data?: Array<{ results?: Array<{ amount?: { value?: number } }> }> };
      const total = (body.data ?? []).flatMap(b => b.results ?? []).reduce((sum, r) => sum + (Number(r.amount?.value) || 0), 0);
      return { monthToDateUsd: Math.round(total * 100) / 100, source: "openai-costs-api" };
    } catch (error) {
      return { monthToDateUsd: null, source: "unavailable", reason: error instanceof Error ? error.message.slice(0, 80) : "costs API error" };
    }
  }
  const db = getDb(), since = monthStart(now);
  const [drafts, captures] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(machineResearchDrafts).where(and(eq(machineResearchDrafts.status, "COMPLETE"), gte(machineResearchDrafts.completedAt, since))).get(),
    db.select({ n: sql<number>`count(*)` }).from(sourceCaptures).where(gte(sourceCaptures.capturedAt, since)).get(),
  ]);
  const estimate = Number(drafts?.n ?? 0) * EST_COST_PER_DRAFT_USD + Number(captures?.n ?? 0) * EST_COST_PER_CAPTURE_USD;
  return { monthToDateUsd: Math.round(estimate * 100) / 100, source: "ledger-estimate" };
}

export async function lastSentByKind(): Promise<Map<AlertKind, number>> {
  const rows = await getDb().select({ kind: alertEvents.kind, last: sql<number>`max(${alertEvents.sentAt})` }).from(alertEvents).groupBy(alertEvents.kind);
  const map = new Map<AlertKind, number>();
  for (const row of rows) if ((ALERT_KINDS as readonly string[]).includes(row.kind)) map.set(row.kind as AlertKind, Number(row.last));
  return map;
}

export async function evaluateNow(now = Date.now()): Promise<Evaluation & { configured: ReturnType<typeof monitoringConfigured> }> {
  const configured = monitoringConfigured();
  const [runs, spend, lastSent] = await Promise.all([
    getDb().select({ status: automationRuns.status, captureStatus: automationRuns.captureStatus, startedAt: automationRuns.startedAt, finishedAt: automationRuns.finishedAt })
      .from(automationRuns).orderBy(desc(automationRuns.startedAt)).limit(50),
    monthToDateSpend(now), lastSentByKind(),
  ]);
  return { ...evaluate({ runs, spend, monthlyLimitUsd: configured.monthlyLimitUsd, keyExpires: configured.keyExpires, lastSent }, now), configured };
}

async function sendEmail(subject: string, text: string): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  const to = process.env.ALERT_TO_EMAIL?.trim() || DEFAULT_ALERT_TO;
  const from = process.env.ALERT_FROM_EMAIL?.trim() || DEFAULT_ALERT_FROM;
  try {
    const response = await fetch(RESEND_API_URL, { method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, text }) });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
    if (!response.ok) return { ok: false, error: `Resend ${response.status}: ${body.message ?? body.name ?? "error"}`.slice(0, 200) };
    return { ok: true, id: body.id };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message.slice(0, 200) : "send failed" }; }
}

async function recordSent(alert: Alert, recipient: string) {
  await getDb().insert(alertEvents).values({ id: crypto.randomUUID(), kind: alert.kind, sentAt: Date.now(), detail: alert.detail.slice(0, 1000), recipient });
}

export type MonitoringOutcome = { evaluated: true; sent: Array<{ kind: AlertKind; id?: string }>; failed: Array<{ kind: AlertKind; error: string }>;
  suppressed: AlertKind[]; checks: Record<string, string> };

/** Evaluate and send. Called after every scheduled run. */
export async function runMonitoring(now = Date.now()): Promise<MonitoringOutcome> {
  const result = await evaluateNow(now);
  const outcome: MonitoringOutcome = { evaluated: true, sent: [], failed: [], suppressed: result.suppressed.map(a => a.kind), checks: result.checks };
  for (const alert of result.alerts) {
    const mail = formatAlertEmail(alert, result.checks, SITE_URL, now);
    const delivery = await sendEmail(mail.subject, mail.text);
    if (delivery.ok) { await recordSent(alert, result.configured.recipient); outcome.sent.push({ kind: alert.kind, id: delivery.id }); }
    else outcome.failed.push({ kind: alert.kind, error: delivery.error });
  }
  return outcome;
}

/** A deliberate test message. Always sends; recorded like any other alert. */
export async function sendTestAlert(requestedBy: string, now = Date.now()) {
  const result = await evaluateNow(now);
  const alert: Alert = { kind: "TEST", subject: "test alert", detail: `A test alert requested by ${requestedBy}. Delivery works if you are reading this. The checks below show the live state; no real alert condition is implied.` };
  const mail = formatAlertEmail(alert, result.checks, SITE_URL, now);
  const delivery = await sendEmail(mail.subject, mail.text);
  if (delivery.ok) await recordSent(alert, result.configured.recipient);
  return { delivery, checks: result.checks, wouldAlert: result.alerts.map(a => a.kind), suppressed: result.suppressed.map(a => a.kind) };
}
