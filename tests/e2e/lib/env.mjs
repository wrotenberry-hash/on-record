import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The repo root (two levels above tests/e2e/lib). */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const E2E_DIR = resolve(ROOT, "tests/e2e");
export const LOCAL_DATABASE_URL = "file:./.data/on-record.db";

/**
 * Values from `.env.local`, read by this process only. Nothing here is ever
 * printed: the runner needs EDITOR_ACCESS_KEY to mint a local invite cookie the
 * same way lib/trial-token.ts does, and for nothing else.
 */
export function localEnv() {
  const file = resolve(ROOT, ".env.local"), out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/**
 * The database the app would use (mirrors db/settings.ts). The suite writes
 * test readers and answers, so it refuses anything but the local file.
 */
export function databaseUrl(env = { ...localEnv(), ...process.env }) {
  return env.ON_RECORD_DATABASE_URL?.trim() || env.TURSO_DATABASE_URL?.trim() || LOCAL_DATABASE_URL;
}
export function isLocalDatabase(url) { return /^file:/.test(String(url ?? "")); }
export function assertLocalDatabase(env) {
  const url = databaseUrl(env);
  if (!isLocalDatabase(url)) throw new Error("tests/e2e refuses to run: the database URL is not a local file. Unset ON_RECORD_DATABASE_URL and TURSO_DATABASE_URL first.");
  return url;
}
