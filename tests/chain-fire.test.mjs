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
  assert.equal(lines[0], "CHAIN hand-over to link 5 | answered at once with 508: INFINITE_LOOP_DETECTED");
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
