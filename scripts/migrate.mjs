// Applies pending SQL migrations from ./drizzle in journal order. Idempotent:
// drizzle records applied migrations in __drizzle_migrations. Runs before every
// Vercel build (see package.json) and can be run by hand with `npm run db:migrate`.
import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.TURSO_DATABASE_URL?.trim();
if (!url && process.env.VERCEL) {
  console.log("migrate: TURSO_DATABASE_URL is not set; skipping migrations for this build.");
  process.exit(0);
}
if (!url) mkdirSync(".data", { recursive: true });
const client = createClient({ url: url || "file:./.data/on-record.db", authToken: process.env.TURSO_AUTH_TOKEN || undefined });
const db = drizzle(client);
await migrate(db, { migrationsFolder: "./drizzle" });
console.log(`migrate: up to date (${url ? new URL(url).hostname : "local file"})`);
client.close();
