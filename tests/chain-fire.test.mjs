import test from "node:test";
import assert from "node:assert/strict";
import { describeFire, fireLink, fireOnce } from "../lib/chain-fire.ts";

const timeout = () => { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; return Promise.reject(e); };
const answer = (status, body = "") => () => Promise.resolve(new Response(body, { status }));
const refused = () => Promise.reject(new TypeError("fetch failed"));
const quiet = { pause: async () => {}, log: () => {} };

test("a request still open after the wait means the next run was accepted", async () => {
  assert.deepEqual(await fireOnce("https://site.test/x", "s", 10, timeout), { state: "running" });
  const r = await fireLink("https://site.test/x", "s", "CHAIN hand-over to link 5", { ...quiet, request: timeout });
  assert.equal(r.ok, true); assert.equal(r.tries.length, 1);
});

test("an answer at once is logged with its status and is not retried", async () => {
  let calls = 0; const lines = [];
  const r = await fireLink("https://site.test/x", "s", "CHAIN hand-over to link 5", { pause: async () => {}, log: l => lines.push(l), request: () => { calls++; return answer(508, "INFINITE_LOOP_DETECTED")(); } });
  assert.equal(r.ok, false); assert.equal(calls, 1);
  assert.equal(lines[0], "CHAIN hand-over to link 5 | stopped by the host's limit on back-to-back runs (508); the rest waits for the next scheduled update");
  const ok = await fireLink("https://site.test/x", "s", "L", { ...quiet, request: answer(200, '{"status":"SKIPPED"}') });
  assert.equal(ok.ok, true, "a 200 answer is the next run saying it had nothing to do");
});

test("a request that never left is tried once more, and the line says so", async () => {
  let calls = 0; const lines = [];
  const r = await fireLink("https://site.test/x", "s", "CHAIN hand-over to link 5", { pause: async () => {}, log: l => lines.push(l), request: () => (++calls === 1 ? refused() : timeout()) });
  assert.equal(r.ok, true); assert.equal(calls, 2);
  assert.equal(lines[0], "CHAIN hand-over to link 5 | accepted; the next run is under way (after 1 failed try)");
  const dead = await fireLink("https://site.test/x", "s", "L", { ...quiet, request: refused });
  assert.equal(dead.ok, false); assert.equal(dead.tries.length, 2);
  assert.match(describeFire("L", dead.tries), /did not start: TypeError: fetch failed \(after 1 failed try\)/);
});

test("the host's limit on back-to-back runs is named as that, not as an error (19:00 run, 18 Nov)", () => {
  const line = describeFire("SUMMARY_CHAIN hand-over to link 5", [{ state: "answered", status: 508, body: "Infinite loop detected INFINITE_LOOP_DETECTED" }]);
  assert.match(line, /stopped by the host's limit on back-to-back runs \(508\); the rest waits for the next scheduled update/);
  assert.match(describeFire("L", [{ state: "answered", status: 409, body: "busy" }]), /answered at once with 409: busy/);
});
