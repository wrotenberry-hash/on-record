/**
 * Which database the app talks to. Two pairs of settings are honoured, in order:
 *   ON_RECORD_DATABASE_URL / ON_RECORD_DATABASE_TOKEN  — a stable database set
 *     by hand. Preferred: it is the same database on every deploy.
 *   TURSO_DATABASE_URL / TURSO_AUTH_TOKEN — injected by the Vercel Marketplace
 *     integration. Observed on 2026-09-26 to name a different database per
 *     deployment (hostname starts with `dpl-`), which would lose data on each
 *     deploy, so it is only a fallback.
 * With neither set, a local SQLite file is used (development and tests).
 */
export const LOCAL_DATABASE_URL = "file:./.data/on-record.db";

export type DatabaseSettings = { url: string; authToken?: string; source: "manual" | "integration" | "local" };

export function databaseSettings(env: Record<string, string | undefined> = process.env): DatabaseSettings {
  const manual = env.ON_RECORD_DATABASE_URL?.trim();
  if (manual) return { url: manual, authToken: env.ON_RECORD_DATABASE_TOKEN?.trim() || undefined, source: "manual" };
  const integration = env.TURSO_DATABASE_URL?.trim();
  if (integration) return { url: integration, authToken: env.TURSO_AUTH_TOKEN?.trim() || undefined, source: "integration" };
  return { url: LOCAL_DATABASE_URL, source: "local" };
}
