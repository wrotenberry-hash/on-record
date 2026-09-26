import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

/**
 * Turso (hosted SQLite) in production; a local SQLite file for development and
 * tests. The schema and every migration are unchanged from the D1 build.
 */
export const LOCAL_DATABASE_URL = "file:./.data/on-record.db";

export function databaseUrl(): string {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (url) return url;
  mkdirSync(".data", { recursive: true });
  return LOCAL_DATABASE_URL;
}

let client: Client | undefined;
let db: LibSQLDatabase<typeof schema> | undefined;

export function getDb() {
  if (!db) {
    client = createClient({ url: databaseUrl(), authToken: process.env.TURSO_AUTH_TOKEN || undefined });
    db = drizzle(client, { schema });
  }
  return db;
}
