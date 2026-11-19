// Checking a replaced key with one small live call (owner, 19 Nov 2026): the wording of pass and fail, the pacing,
// and that no part of a key can come back.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KEY_CHECK_EVERY_MS, dueForCheck, openaiLine, openStatesLine, readKeyCheck } from "../lib/key-check-rules.ts";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("pass and fail say which key, and why", () => {
  assert.deepEqual(openaiLine(null, true, 0.00012), { ok: true, line: "OpenAI key: PASS. One small live call was answered (cost $0.0001)." });
  assert.equal(openaiLine(null, false).line, "OpenAI key: FAIL. OPENAI_API_KEY is not set in production.");
  assert.match(openaiLine("Research service returned 401", true).line, /^OpenAI key: FAIL\. OpenAI rejected the key \(401\)/);
  assert.match(openaiLine("Research API billing or usage limit (insufficient_quota). Check the API project's billing", true).line, /accepted, but OpenAI refused the call for billing or a usage limit/);
  assert.match(openaiLine("Research API rate limit (429). Wait before retrying", true).line, /rate limit \(429\); the key is accepted/);
  assert.match(openaiLine("Research service returned 404", true).line, /does not offer the configured model/);
  assert.match(openaiLine("The operation was aborted due to timeout", true).line, /did not answer in time/);
  assert.equal(openaiLine("Research service returned 401", true).ok, false);
  assert.deepEqual(openStatesLine(200, true), { ok: true, line: "Open States key: PASS. One small live call was answered." });
  assert.equal(openStatesLine(200, false).line, "Open States key: FAIL. OPENSTATES_API_KEY is not set in production.");
  assert.match(openStatesLine(403, true).line, /^Open States key: FAIL\. Open States rejected the key \(403\)/);
  assert.match(openStatesLine(401, true).line, /rejected the key \(401\)/);
  assert.match(openStatesLine(429, true).line, /the key is accepted, but today's allowance is used up/);
  assert.match(openStatesLine(0, true).line, /did not answer/);
  assert.equal(openStatesLine(500, true).line, "Open States key: FAIL. Open States answered 500.");
});

test("no part of a key can come back in an answer", () => {
  const line = openaiLine("boom sk-proj-AbCdEf123456_secret and Bearer sk-live-zzzzzzzz", true).line;
  assert.doesNotMatch(line, /AbCdEf|zzzzzz|sk-proj|sk-live/); assert.match(line, /\[key\]/);
  // The route and the check return sentences and times only.
  const route = read("app/api/automation/keycheck/route.ts"), check = read("lib/key-check.ts");
  assert.doesNotMatch(route, /process\.env/); assert.match(route, /openai: r\.openai, openStates: r\.openStates/);
  assert.doesNotMatch(check, /JSON\.stringify\(\{[^}]*(key|os)\b[^}]*\}\)/, "the key is never written anywhere");
  assert.match(check, /"X-API-KEY": os/); // sent to Open States only, in the header
});

test("the calls go out at most once every 30 minutes; an earlier answer is returned in between", () => {
  const now = Date.UTC(2026, 10, 19, 22, 0), last = { at: now - 10 * 60_000, openai: { ok: true, line: "a" }, openStates: { ok: true, line: "b" } };
  assert.equal(KEY_CHECK_EVERY_MS, 30 * 60_000);
  assert.equal(dueForCheck(null, now), true); assert.equal(dueForCheck(last, now), false);
  assert.equal(dueForCheck({ ...last, at: now - 30 * 60_000 }, now), true);
  assert.deepEqual(readKeyCheck(JSON.stringify(last)), last);
  for (const bad of [null, "", "not json", "{}", JSON.stringify({ at: 1 }), JSON.stringify({ at: "x", openai: last.openai, openStates: last.openStates }), JSON.stringify({ at: 1, openai: { ok: "yes", line: "a" }, openStates: last.openStates })])
    assert.equal(readKeyCheck(bad), null, String(bad));
  const check = read("lib/key-check.ts");
  // The slot is claimed before the calls, so two requests at once make one pair of calls.
  assert.ok(check.indexOf("await setCursor(db, CURSOR, JSON.stringify(pending))") < check.indexOf("await responseRequest("));
  assert.match(check, /if \(last && !dueForCheck\(last, now\)\) return \{ \.\.\.last, fresh: false/);
  // The OpenAI call is the small model with a 16-token answer, and is written to the cost ledger; the Open States call is counted in the day's allowance.
  assert.match(check, /max_output_tokens: 16/); assert.match(check, /purpose: "key_check"/); assert.match(check, /b\.used\+\+/);
});
