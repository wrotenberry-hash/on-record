import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "turso",
  dbCredentials: {
    url: process.env.ON_RECORD_DATABASE_URL || process.env.TURSO_DATABASE_URL || "file:./.data/on-record.db",
    authToken: process.env.ON_RECORD_DATABASE_URL ? process.env.ON_RECORD_DATABASE_TOKEN : process.env.TURSO_AUTH_TOKEN,
  },
});
