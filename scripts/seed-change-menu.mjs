// Local viewing only: builds a NEW throwaway database from ./drizzle and puts one made-up bill, its stored text in two
// versions, and one drafted menu of two groups into it, so /editor/changes can be looked at without drafting anything.
//
//   node scripts/seed-change-menu.mjs [path-to-a-new-file.db]
//
// It never writes into a database that already exists (so it cannot touch the shared local one or a hosted one): the
// file must not exist yet, and with no path it makes one in the system's temporary folder. It then prints the setting
// to start the site with. The fixture is the one tests/change-queue.test.mjs uses.
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "../db/schema.ts";
import { seedMenu } from "../tests/change-queue-helpers.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2] ? resolve(process.argv[2]) : join(mkdtempSync(join(tmpdir(), "change-menu-")), "seed.db");
if (/^(libsql|https?|wss?):/i.test(process.argv[2] ?? "")) { console.error("seed-change-menu: a file path only, never a hosted database"); process.exit(2); }
if (existsSync(file)) { console.error(`seed-change-menu: ${file} already exists; give the path of a file that does not exist yet`); process.exit(2); }
mkdirSync(dirname(file), { recursive: true });

const client = createClient({ url: `file:${file}` }), db = drizzle(client);
await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
const { menuId } = await seedMenu(db, schema, { now: Date.now() });
client.close();
console.log(`seeded one menu (${menuId}) into ${file}`);
console.log(`start the site with: ON_RECORD_DATABASE_URL=file:${file} npm run dev   then open /editor/changes`);
