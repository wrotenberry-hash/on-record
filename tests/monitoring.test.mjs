import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, daysUntil, parseMonthlyLimit, formatAlertEmail, HOUR_MS, DAY_MS } from "../lib/monitoring.ts";

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

test("each kind is sent at most once per 24 hours", () => {
  const input = { ...healthy(), keyExpires: "2026-10-01", lastSent: new Map([["KEY_EXPIRING", now - 23 * HOUR_MS]]) };
  const out = evaluate(input, now);
  assert.deepEqual(out.alerts, []);
  assert.deepEqual(out.suppressed.map(a => a.kind), ["KEY_EXPIRING"]);
  const later = evaluate({ ...input, lastSent: new Map([["KEY_EXPIRING", now - DAY_MS - 1]]) }, now);
  assert.deepEqual(later.alerts.map(a => a.kind), ["KEY_EXPIRING"]);
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
