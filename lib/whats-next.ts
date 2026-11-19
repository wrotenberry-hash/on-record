import type { OwnerStep } from "./whats-next-plan.ts";

/**
 * Editor → What's next, worked out from the health probe (pure; tested in tests/dashboard.test.mjs).
 * The same view Claude gives at a check-in: where things stand, what needs the owner now, and which
 * owner-only steps are already done. Automatic emails are off, so anything the system flags shows here.
 */
type Probe = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Flag = { level: "blocker" | "soon" | "info"; text: string; href?: string };
const usd = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;
const when = (v: unknown) => (v ? new Date(v as string | number).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) + " CT" : "never");

export const ALERT_PLAIN: Record<string, string> = { CONSECUTIVE_FAILURES: "Two scheduled runs in a row failed", NO_CAPTURE_72H: "No statement captured in 72 hours", SPEND_75_PERCENT: "OpenAI spend passed 75% of the monthly limit",
  KEY_EXPIRING: "The OpenAI key is about to expire", INGEST_FAILING: "The official-records update is failing", BILLING_REFUSED: "OpenAI refused a call (billing or limit)", SUMMARIES_READY: "New bill summaries are ready to review",
  SUMMARIES_REVISED: "Bill summaries were rewritten after a fix", TRIAL_OPEN: "The trial can open", SUMMARY_SPEND_75: "Bill-summary spend passed 75% of its cap", TALLY_MISMATCH: "A roll-call tally does not match the official totals",
  PARITY_DRIFT: "Summaries drift between parties", SITE_ERRORS: "The site showed errors to readers", DAILY_CASE: "A case was picked for review", DAILY_NUDGE: "The picked case is still open", TEST: "Test alert" };

export function standing(p: Probe): string[] {
  const a = p.analysis ?? {}, s = p.openaiSpend ?? {}, t = p.trial ?? {}, f = p.federal ?? {}, lines: string[] = [];
  const last = a.lastRun, ok = s.lastSuccessfulCallAt;
  lines.push(a.written > 0 ? `Bill summaries: ${a.written} written, ${a.visible} on the site, ${a.held} held back, ${a.openReviews} waiting for your review.`
    : `Bill summaries: none yet. ${ok ? `Last successful AI call ${when(ok)}.` : "No AI call has succeeded in production yet."}${last?.status === "FAILED" ? ` The last attempt (${when(last.startedAt)}) failed: ${String(last.error ?? "").split(".")[0]}.` : ""}`);
  lines.push(`Cost this month: ${usd(s.monthToDateUsd)} of the ${usd(s.monthlyLimitUsd)} OpenAI limit; summaries ${usd(a.summaryCostUsd)} of the ${usd(a.limits?.spendCapUsd)} cap${a.written > 0 ? ` (${usd(a.summaryCostUsd / a.written)} per summary)` : ""}.`);
  lines.push(`Official record: ${f.politicians ?? 0} members, ${f.rollCalls ?? 0} roll calls, ${f.bills ?? 0} bills; latest vote ${f.latestVoteAt ? when(f.latestVoteAt) : "none"}. Last update ${f.lastRun?.status === "COMPLETE" ? "worked" : `status: ${f.lastRun?.status ?? "none"}`} (${when(f.lastRun?.startedAt)}).`);
  lines.push(`Readers: trial ${t.gate?.open ? "open" : `not open yet (${t.gate?.reason ?? "closed"})`}; ${t.invites ?? 0} invites made, ${t.used ?? 0} used, ${t.returningLast7Days ?? 0} came back this week. Shares this week: ${p.sharing?.last7Days?.shares ?? 0}.`);
  lines.push(`Claim checking: ${p.throughput?.casesWaiting ?? 0} cases waiting, ${p.throughput?.last7d?.reviews ?? 0} reviewed this week${p.intakePause?.paused ? "; new intake is paused until the queue is under " + p.intakePause.threshold : ""}.`);
  return lines;
}

/** What the system would have emailed, plus anything waiting on the owner, most urgent first. */
export function flags(p: Probe, now = Date.now()): Flag[] {
  const out: Flag[] = [], a = p.analysis ?? {}, days = p.monitoring?.keyDaysLeft;
  const refused = (p.recentAlerts ?? []).some((x: Probe) => x.kind === "BILLING_REFUSED" && now - Date.parse(x.sentAt) < 36 * 3600e3) || (a.lastRun?.status === "FAILED" && /billing|limit|credit|quota/i.test(a.lastRun?.error ?? "") && now - Date.parse(a.lastRun.startedAt) < 36 * 3600e3);
  if (refused) out.push({ level: "blocker", text: "OpenAI refused the last AI call (billing or usage limit). AI work is paused; everything else keeps running. Check the API project's billing and limits at platform.openai.com." });
  // Errors on the site itself: flagged only when it is real breakage (lib/error-rules.ts), never for a stray error.
  if (p.errors?.breakage === true) out.push({ level: "blocker", text: `The site is failing for readers. ${String((p.errors.reasons ?? [])[0] ?? "See the error list.").slice(0, 220)}${(p.errors.reasons ?? []).length > 1 ? ` (and ${p.errors.reasons.length - 1} more)` : ""}`, href: "/editor/metrics#errors" });
  if (typeof days === "number" && days <= 3) out.push({ level: "blocker", text: `The OpenAI key expires in ${days} day${days === 1 ? "" : "s"}. Replace it (steps below) or summaries stop.` });
  else if (typeof days === "number" && days <= 14) out.push({ level: "soon", text: `The OpenAI key expires in ${days} days (${p.monitoring.keyExpires}).` });
  const lim = Number(p.openaiSpend?.monthlyLimitUsd ?? 0), spent = Number(p.openaiSpend?.monthToDateUsd ?? 0);
  if (lim > 0 && spent >= lim) out.push({ level: "blocker", text: `OpenAI spend reached the ${usd(lim)} monthly limit. AI work stops until next month or a higher limit.` });
  else if (lim > 0 && spent > 0.75 * lim) out.push({ level: "soon", text: `OpenAI spend is ${usd(spent)}, above 75% of the ${usd(lim)} limit.` });
  if (Number(a.openReviews) > 0) out.push({ level: "soon", text: `${a.openReviews} bill summar${a.openReviews === 1 ? "y waits" : "ies wait"} for your approve or reject.`, href: "/editor/analysis" });
  if (Number(p.throughput?.casesWaiting) > 0) out.push({ level: "info", text: `${p.throughput.casesWaiting} claim-checking case${p.throughput.casesWaiting === 1 ? " waits" : "s wait"} for your review.`, href: "/editor" });
  if (p.federal?.lastRun && p.federal.lastRun.status !== "COMPLETE") out.push({ level: "soon", text: `The last official-records update did not finish (${p.federal.lastRun.status}).` });
  const tm = Number(p.federal?.depth?.tally?.mismatches ?? 0) + Number(p.texas?.tallyMismatches ?? 0);
  if (tm > 0) out.push({ level: "info", text: `${tm} roll-call tall${tm === 1 ? "y is" : "ies are"} shown as “under review” because the member votes do not add up to the official totals.` });
  for (const f of p.quality?.parity?.findings ?? []) out.push({ level: "soon", text: `Fairness check: ${f}`, href: "/editor/quality" });
  const wrong = Number(p.quality?.rereview90d?.heldByWrongRules) || 0, rightly = (Number(p.quality?.rereview90d?.held) || 0) - wrong;
  if (rightly > 0) out.push({ level: "info", text: `${rightly} summar${rightly === 1 ? "y was" : "ies were"} withdrawn by the weekly re-check.`, href: "/editor/quality" });
  if (wrong > 0) out.push({ level: "soon", text: `${wrong} summar${wrong === 1 ? "y was" : "ies were"} taken down by the weekly re-check using the wrong rules (fixed 19 Nov). ${wrong === 1 ? "It stays" : "They stay"} down until read against the sources and approved in the review queue.`, href: "/editor/analysis" });
  if (Number(p.sharing?.problems?.open) > 0) out.push({ level: "soon", text: `${p.sharing.problems.open} reader problem report${p.sharing.problems.open === 1 ? "" : "s"} to look at.`, href: "/editor/problems" });
  if (Number(p.sharing?.postQueue?.draft) > 0) out.push({ level: "info", text: `${p.sharing.postQueue.draft} drafted post${p.sharing.postQueue.draft === 1 ? "" : "s"} in the queue (nothing posts while the site is private).`, href: "/editor/social" });
  if (Number(p.verification?.flags?.open) > 0) out.push({ level: "soon", text: `${p.verification.flags.open} flagged answer pattern${p.verification.flags.open === 1 ? "" : "s"} to clear or confirm.`, href: "/editor/integrity" });
  if (p.trial?.gate?.open && Number(p.trial?.invites ?? 0) === 0) out.push({ level: "soon", text: "The trial can open: no invite links have been made yet.", href: "/editor/trial" });
  const order = { blocker: 0, soon: 1, info: 2 } as const;
  return out.sort((x, y) => order[x.level] - order[y.level]);
}

/** Which owner-only steps the probe can already see as done. */
export function ownerStepDone(step: OwnerStep, p: Probe): boolean | null {
  switch (step.key) {
    case "openaiKey": return p.monitoring?.keyDaysLeft == null ? null : p.monitoring.keyDaysLeft > 30;
    case "openStates": return !!p.texas?.openStatesConfigured;
    case "turnstile": return !!p.verification?.turnstileConfigured;
    case "twilio": return !!p.verification?.twilioConfigured;
    case "contact": return p.contactEmailConfigured ? null : false; // the About text cannot be seen from the probe
    case "bluesky": return !!p.sharing?.connected?.bluesky;
    case "threads": return !!p.sharing?.connected?.threads;
    default: return null;
  }
}

/** True when something genuinely needs the owner now: the only reason Claude sends a push. */
export function needsOwnerNow(p: Probe, now = Date.now()) { return flags(p, now).filter(f => f.level === "blocker"); }
