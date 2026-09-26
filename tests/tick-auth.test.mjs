import test from "node:test";
import assert from "node:assert/strict";
import { bearerToken, tickAuthorized } from "../lib/tick-auth.ts";

test("bearer parsing accepts only a well-formed header", () => {
  assert.equal(bearerToken("Bearer abc"), "abc");
  assert.equal(bearerToken("bearer abc"), "");
  assert.equal(bearerToken("Basic abc"), "");
  assert.equal(bearerToken(null), "");
  assert.equal(bearerToken("Bearer "), "");
});

test("the job refuses everything when no secret is configured", async () => {
  assert.equal(await tickAuthorized("Bearer anything", {}), null);
  assert.equal(await tickAuthorized("Bearer anything", { cronSecret: "", tickSecret: "   " }), null);
});

test("either configured secret authorizes, and the match is reported", async () => {
  const secrets = { cronSecret: "cron-value", tickSecret: "tick-value" };
  assert.equal(await tickAuthorized("Bearer cron-value", secrets), "cron");
  assert.equal(await tickAuthorized("Bearer tick-value", secrets), "tick");
  assert.equal(await tickAuthorized("Bearer wrong", secrets), null);
  assert.equal(await tickAuthorized(null, secrets), null);
  assert.equal(await tickAuthorized("Bearer tick-value", { cronSecret: "cron-value" }), null);
});
