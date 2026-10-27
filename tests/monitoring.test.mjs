import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, daysUntil, parseMonthlyLimit, formatAlertEmail, decideRhythm, formatRhythmEmail, rhythmPhase, DEDUPE_WINDOW_MS, HOUR_MS, DAY_MS } from "../lib/monitoring.ts";

const now = Date.parse("2026-09-28T13:05:00Z");
const run = (status, captureStatus, hoursAgo) => ({ status, captureStatus, startedAt: now - hoursAgo * HOUR_MS, finishedAt: now - hoursAgo * HOUR_MS + 90_000 });
const healthy = () => ({
  runs: [run("COMPLETE", "CAPTURED", 0.1), run("COMPLETE", "CAPTURED", 18), run("FAILED", null, 24), run("COMPLETE", "CAPTURED", 42)],
  spend: { monthToDateUsd: 3.2, source: "ledger-estimate" }, monthlyLimitUsd: 20, keyExpires: "2026-12-02", lastSent: new Map(),
});

test("a healthy ledger produces no alerts", () => {
  const out = evaluate(healthy(), now);
  assert.deepEqual(out.alerts, []);
  assert.deepEqual(out.suppressed, []);
  assert.match(out.checks.keyExpiry, /^6\d days$/);
});

test("two consecutive failed runs alert; one failure does not; a run still RUNNING is ignored", () => {
  const two = { ...healthy(), runs: [run("FAILED", null, 0.1), run("FAILED", null, 6), run("COMPLETE", "CAPTURED", 12)] };
  assert.deepEqual(evaluate(two, now).alerts.map(a => a.kind), ["CONSECUTIVE_FAILURES"]);
  const one = { ...healthy(), runs: [run("FAILED", null, 0.1), run("COMPLETE", "CAPTURED", 6)] };
  assert.deepEqual(evaluate(one, now).alerts, []);
  const running = { ...healthy(), runs: [{ status: "RUNNING", captureStatus: null, startedAt: now, finishedAt: null }, run("FAILED", null, 6), run("FAILED", null, 12)] };
  assert.deepEqual(evaluate(running, now).alerts.map(a => a.kind), ["CONSECUTIVE_FAILURES"]);
});

test("no capture for 72 hours alerts, counting from the last capture or from the first run", () => {
  const stale = { ...healthy(), runs: [run("COMPLETE", "NO_QUEUED_LEAD", 1), run("COMPLETE", "FAILED", 30), run("COMPLETE", "CAPTURED", 73)] };
  assert.deepEqual(evaluate(stale, now).alerts.map(a => a.kind), ["NO_CAPTURE_72H"]);
  const fresh = { ...healthy(), runs: [run("COMPLETE", "NO_QUEUED_LEAD", 1), run("COMPLETE", "CAPTURED", 71)] };
  assert.deepEqual(evaluate(fresh, now).alerts, []);
  const never = { ...healthy(), runs: [run("COMPLETE", "FAILED", 2), run("COMPLETE", "FAILED", 80)] };
  assert.deepEqual(evaluate(never, now).alerts.map(a => a.kind), ["NO_CAPTURE_72H"]);
  const young = { ...healthy(), runs: [run("COMPLETE", "FAILED", 2), run("COMPLETE", "FAILED", 20)] };
  assert.deepEqual(evaluate(young, now).alerts, []);
  assert.deepEqual(evaluate({ ...healthy(), runs: [] }, now).alerts, []);
});

test("spend above 75% of the limit alerts; unknown spend never does", () => {
  const high = { ...healthy(), spend: { monthToDateUsd: 15.01, source: "openai-costs-api" } };
  assert.deepEqual(evaluate(high, now).alerts.map(a => a.kind), ["SPEND_75_PERCENT"]);
  const edge = { ...healthy(), spend: { monthToDateUsd: 15, source: "openai-costs-api" } };
  assert.deepEqual(evaluate(edge, now).alerts, []);
  const bigger = { ...healthy(), spend: { monthToDateUsd: 15.01, source: "openai-costs-api" }, monthlyLimitUsd: 40 };
  assert.deepEqual(evaluate(bigger, now).alerts, []);
  const unknown = { ...healthy(), spend: { monthToDateUsd: null, source: "unavailable", reason: "no admin key" } };
  assert.deepEqual(evaluate(unknown, now).alerts, []);
  assert.match(evaluate(unknown, now).checks.spend, /unknown/);
});

test("key expiry alerts within 21 days and after expiry, not before", () => {
  assert.equal(daysUntil("2026-12-02", now), 65);
  assert.deepEqual(evaluate({ ...healthy(), keyExpires: "2026-10-19" }, now).alerts.map(a => a.kind), ["KEY_EXPIRING"]);
  assert.deepEqual(evaluate({ ...healthy(), keyExpires: "2026-10-20" }, now).alerts, []);
  assert.deepEqual(evaluate({ ...healthy(), keyExpires: "2026-09-01" }, now).alerts.map(a => a.subject), ["OpenAI API key has expired"]);
  assert.deepEqual(evaluate({ ...healthy(), keyExpires: null }, now).alerts, []);
  assert.deepEqual(evaluate({ ...healthy(), keyExpires: "not a date" }, now).alerts, []);
});

test("a continuing problem is repeated every three days, not daily", () => {
  assert.equal(DEDUPE_WINDOW_MS, 3 * DAY_MS);
  const input = { ...healthy(), keyExpires: "2026-10-01", lastSent: new Map([["KEY_EXPIRING", now - 2 * DAY_MS]]) };
  const out = evaluate(input, now);
  assert.deepEqual(out.alerts, []);
  assert.deepEqual(out.suppressed.map(a => a.kind), ["KEY_EXPIRING"]);
  const later = evaluate({ ...input, lastSent: new Map([["KEY_EXPIRING", now - 3 * DAY_MS - 1]]) }, now);
  assert.deepEqual(later.alerts.map(a => a.kind), ["KEY_EXPIRING"]);
  const first = evaluate({ ...input, lastSent: new Map() }, now);
  assert.deepEqual(first.alerts.map(a => a.kind), ["KEY_EXPIRING"]);
});

test("several alerts from one run go in one email", () => {
  const two = [{ kind: "CONSECUTIVE_FAILURES", subject: "two scheduled runs in a row failed", detail: "A." }, { kind: "NO_CAPTURE_72H", subject: "no successful capture in 72 hours", detail: "B." }];
  const mail = formatAlertEmail(two, { spend: "ok" }, "https://x.test", now);
  assert.equal(mail.subject, "[On Record] two scheduled runs in a row failed (+1 more)");
  assert.match(mail.text, /A\./); assert.match(mail.text, /B\./); assert.match(mail.text, /NO SUCCESSFUL CAPTURE IN 72 HOURS/);
});

const ready = { id: "case-1", speakerName: "Gov. A. Example", exactText: "Wait times fell by 40 percent.", issue: "Health", capturedAt: now - 3 * DAY_MS, researchReady: true };
const morning = Date.parse("2026-09-28T13:02:00Z"), afternoon = Date.parse("2026-09-28T19:02:00Z");
const rhythm = (over = {}) => ({ readyCase: ready, waitingCount: 3, publishedCount: 2, humanActedSince: () => false, lastSent: new Map(), ...over });

test("the morning run emails one case; no case ready means no email", () => {
  assert.equal(rhythmPhase(morning), "morning"); assert.equal(rhythmPhase(afternoon), "afternoon");
  const out = decideRhythm(rhythm(), morning);
  assert.equal(out.email?.kind, "DAILY_CASE");
  assert.match(out.email.subject, /Today's case: Gov\. A\. Example/);
  assert.match(out.email.detail, /2 of 20 toward launch/);
  assert.match(out.email.detail, /Cases waiting: 3/);
  assert.equal(decideRhythm(rhythm({ readyCase: null }), morning).email, null);
  const again = decideRhythm(rhythm({ lastSent: new Map([["DAILY_CASE", morning - 1 * HOUR_MS]]) }), morning);
  assert.equal(again.email, null); assert.match(again.reason, /already sent/);
});

test("the afternoon run nudges once, only when nothing was reviewed since the morning email", () => {
  const sentThisMorning = new Map([["DAILY_CASE", morning]]);
  const nudge = decideRhythm(rhythm({ lastSent: sentThisMorning }), afternoon);
  assert.equal(nudge.email?.kind, "DAILY_NUDGE");
  assert.match(nudge.email.subject, /Still open/);
  const reviewed = decideRhythm(rhythm({ lastSent: sentThisMorning, humanActedSince: since => since === morning }), afternoon);
  assert.equal(reviewed.email, null); assert.match(reviewed.reason, /reviewed/);
  const twice = decideRhythm(rhythm({ lastSent: new Map([["DAILY_CASE", morning], ["DAILY_NUDGE", afternoon - 10 * 60_000]]) }), afternoon);
  assert.equal(twice.email, null);
  // No morning email (no case was ready then) but a case is ready now: the afternoon sends the case, not a nudge.
  const late = decideRhythm(rhythm(), afternoon);
  assert.equal(late.email?.kind, "DAILY_CASE");
  // Yesterday's case email does not count as today's.
  const stale = decideRhythm(rhythm({ lastSent: new Map([["DAILY_CASE", morning - DAY_MS]]) }), morning);
  assert.equal(stale.email?.kind, "DAILY_CASE");
});

test("the rhythm email carries a one-tap link to the case", () => {
  const out = decideRhythm(rhythm(), morning);
  const mail = formatRhythmEmail(out.email, "case-1", "https://x.test");
  assert.equal(mail.subject, "[On Record] Today's case: Gov. A. Example");
  assert.match(mail.text, /https:\/\/x\.test\/editor\?case=case-1/);
  assert.doesNotMatch(mail.text, /Current checks/);
});

test("limit parsing and email formatting", () => {
  assert.equal(parseMonthlyLimit(undefined), 20);
  assert.equal(parseMonthlyLimit("abc"), 20);
  assert.equal(parseMonthlyLimit("40"), 40);
  assert.equal(parseMonthlyLimit("-3"), 20);
  const mail = formatAlertEmail({ kind: "TEST", subject: "test alert", detail: "Hello." }, { spend: "ok" }, "https://x.test", now);
  assert.equal(mail.subject, "[On Record] test alert");
  assert.match(mail.text, /Hello\./);
  assert.match(mail.text, /- spend: ok/);
  assert.match(mail.text, /https:\/\/x\.test\/editor/);
});
