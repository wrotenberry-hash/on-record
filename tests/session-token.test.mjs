import test from "node:test";
import assert from "node:assert/strict";
import { sameAccessKey, signSession, verifySession } from "../lib/session-token.ts";

const key = "a-long-random-access-key-for-tests";
const later = Date.now() + 60_000;

test("a signed session verifies with the same key and carries the email", async () => {
  const token = await signSession(key, "reviewer@example.test", later);
  assert.deepEqual(await verifySession(key, token), { email: "reviewer@example.test", expiresAt: later });
});

test("a session is refused when expired, tampered, or signed with a different key", async () => {
  const token = await signSession(key, "reviewer@example.test", later);
  assert.equal(await verifySession(key, token, later + 1), null);
  assert.equal(await verifySession("another-key", token), null);
  const [v, email, exp, sig] = token.split(".");
  assert.equal(await verifySession(key, [v, email, String(later + 5), sig].join(".")), null);
  assert.equal(await verifySession(key, [v, "b3RoZXI", exp, sig].join(".")), null);
  assert.equal(await verifySession(key, "v1.garbage"), null);
  assert.equal(await verifySession(key, null), null);
  assert.equal(await verifySession("", token), null);
});

test("the access key comparison is exact and fails closed", async () => {
  assert.equal(await sameAccessKey(key, key), true);
  assert.equal(await sameAccessKey(key, ` ${key} `), true);
  assert.equal(await sameAccessKey(key.slice(0, -1), key), false);
  assert.equal(await sameAccessKey(key, ""), false);
  assert.equal(await sameAccessKey("", key), false);
});
