import test from "node:test";
import assert from "node:assert/strict";
import { databaseSettings, LOCAL_DATABASE_URL } from "../db/settings.ts";

test("a hand-set stable database wins over the integration's per-deployment one", () => {
  const env = { ON_RECORD_DATABASE_URL: "libsql://on-record-stable.turso.io", ON_RECORD_DATABASE_TOKEN: "t1",
    TURSO_DATABASE_URL: "libsql://dpl-abc-vercel.turso.io", TURSO_AUTH_TOKEN: "t2" };
  assert.deepEqual(databaseSettings(env), { url: "libsql://on-record-stable.turso.io", authToken: "t1", source: "manual" });
});

test("the integration database is used only when no stable one is set", () => {
  const env = { TURSO_DATABASE_URL: " libsql://dpl-abc-vercel.turso.io ", TURSO_AUTH_TOKEN: "t2" };
  assert.deepEqual(databaseSettings(env), { url: "libsql://dpl-abc-vercel.turso.io", authToken: "t2", source: "integration" });
});

test("with nothing set, a local file is used", () => {
  assert.deepEqual(databaseSettings({}), { url: LOCAL_DATABASE_URL, source: "local" });
  assert.deepEqual(databaseSettings({ ON_RECORD_DATABASE_URL: "  " }), { url: LOCAL_DATABASE_URL, source: "local" });
});
