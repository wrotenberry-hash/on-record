import test from "node:test";
import assert from "node:assert/strict";
import { sameAccessKey, signSession, verifySession, signAction, verifyAction } from "../lib/session-token.ts";

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

test("action tokens are single-purpose, expire, and are not interchangeable with sessions", async () => {
  const token = await signAction(key, "defer", "case-1", later);
  assert.deepEqual(await verifyAction(key, "defer", token), { purpose: "defer", subject: "case-1", expiresAt: later });
  assert.equal(await verifyAction(key, "publish", token), null, "wrong purpose");
  assert.equal(await verifyAction("another-key", "defer", token), null, "wrong key");
  assert.equal(await verifyAction(key, "defer", token, later + 1), null, "expired");
  assert.equal(await verifyAction(key, "defer", token.slice(0, -2) + "xx"), null, "tampered signature");
  assert.equal(await verifySession(key, token), null, "an action token is not a session");
  assert.equal(await verifyAction(key, "defer", await signSession(key, "a@b.c", later)), null, "a session token is not an action");
  await assert.rejects(() => signAction(key, "Not Valid", "x", later));
});
