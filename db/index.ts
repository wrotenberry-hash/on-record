import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";
import { databaseSettings } from "./settings";

export { databaseSettings, LOCAL_DATABASE_URL } from "./settings";

/** Turso (hosted SQLite) in production; a local SQLite file otherwise. See ./settings.ts. */
let client: Client | undefined;
let db: LibSQLDatabase<typeof schema> | undefined;

export function getDb() {
  if (!db) {
    const settings = databaseSettings();
    if (settings.source === "local") mkdirSync(".data", { recursive: true });
    client = createClient({ url: settings.url, authToken: settings.authToken });
    db = drizzle(client, { schema });
  }
  return db;
}
