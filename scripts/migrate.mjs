// Applies pending SQL migrations from ./drizzle in journal order. Idempotent:
// drizzle records applied migrations in __drizzle_migrations. Runs before every
// Vercel build (see package.json) and can be run by hand with `npm run db:migrate`.
import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

// Same precedence as db/index.ts: a hand-set stable database first, then the
// Marketplace integration's per-deployment database, then a local file.
const manual = process.env.ON_RECORD_DATABASE_URL?.trim();
const url = manual || process.env.TURSO_DATABASE_URL?.trim();
const authToken = (manual ? process.env.ON_RECORD_DATABASE_TOKEN : process.env.TURSO_AUTH_TOKEN)?.trim() || undefined;
if (!url && process.env.VERCEL) {
  console.log("migrate: no database URL is set; skipping migrations for this build.");
  process.exit(0);
}
if (!url) mkdirSync(".data", { recursive: true });
const client = createClient({ url: url || "file:./.data/on-record.db", authToken });
const db = drizzle(client);
await migrate(db, { migrationsFolder: "./drizzle" });
console.log(`migrate: up to date (${url ? `${manual ? "manual" : "integration"} ${new URL(url).hostname}` : "local file"})`);
client.close();
