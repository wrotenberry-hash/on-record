// Week-two return rate (owner, 18 Nov 2026, point 12) and the guard for point 8: no comment threads, replies or
// debate features anywhere. The database functions run against a temporary database built from the real migrations.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "../db/schema.ts";
import { inWeekTwo, noteVisit, weekTwoMeasure, weekTwoRate } from "../lib/week-two.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), DAY = 86400e3;
const dir = mkdtempSync(join(tmpdir(), "weektwo-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
after(() => { client.close(); rmSync(dir, { recursive: true, force: true }); });
const T0 = Date.UTC(2026, 10, 20);
let seq = 0;
const user = async (kind = "public", createdAt = T0) => { const id = `u-${++seq}`; await db.insert(schema.appUsers).values({ id, kind, externalKey: `k-${seq}`, createdAt }); return id; };

test("the second week is days 8 to 14 after the first visit", () => {
  assert.equal(inWeekTwo(T0, T0 + 6.9 * DAY), false); assert.equal(inWeekTwo(T0, T0 + 7 * DAY), true);
  assert.equal(inWeekTwo(T0, T0 + 13.9 * DAY), true); assert.equal(inWeekTwo(T0, T0 + 14 * DAY), false);
});

test("the rate counts only readers whose second week is over, and says how many are still inside it", () => {
  const now = T0 + 30 * DAY;
  const r = weekTwoRate([{ firstSeenAt: T0, weekTwoAt: T0 + 9 * DAY }, { firstSeenAt: T0, weekTwoAt: null }, { firstSeenAt: T0 + 2 * DAY, weekTwoAt: null }, { firstSeenAt: now - 3 * DAY, weekTwoAt: null }], now);
  assert.deepEqual([r.cohort, r.returned, r.stillInFirstTwoWeeks], [3, 1, 1]); assert.equal(Math.round(r.rate * 100), 33);
  assert.equal(r.line, "1 of 3 readers came back in their second week (33%). 1 more are still in their first two weeks.");
  assert.equal(weekTwoRate([], now).rate, null); assert.equal(weekTwoRate([], now).line, "No reader has visited yet.");
  assert.match(weekTwoRate([{ firstSeenAt: now - DAY, weekTwoAt: null }], now).line, /No reader has finished a second week yet; 1 is in their first two weeks\./);
});

test("a visit writes the first-visit time once and the week-two mark once; nothing about days or pages", async () => {
  const a = await user(), b = await user(), c = await user();
  await noteVisit(db, a, T0); await noteVisit(db, a, T0 + 2 * DAY);            // came in week one only
  await noteVisit(db, b, T0); const second = await noteVisit(db, b, T0 + 9 * DAY); await noteVisit(db, b, T0 + 10 * DAY); // came back in week two, twice
  assert.equal(second.weekTwo, true);
  await noteVisit(db, c, T0); await noteVisit(db, c, T0 + 20 * DAY);           // came back, but after week two
  const rows = Object.fromEntries((await db.select().from(schema.readerSetup)).map(r => [r.userId, r]));
  assert.equal(rows[a].firstSeenAt, T0); assert.equal(rows[a].weekTwoAt, null);
  assert.equal(rows[b].weekTwoAt, T0 + 9 * DAY, "the mark is written once, at the first visit of week two");
  assert.equal(rows[c].weekTwoAt, null);
  assert.deepEqual(Object.keys(rows[b]).sort(), ["defaultsAt", "firstSeenAt", "issuesAskedAt", "placeKey", "userId", "weekTwoAt"], "no per-day or per-page column exists");
  const m = await weekTwoMeasure(db, T0 + 30 * DAY);
  assert.deepEqual([m.cohort, m.returned], [3, 1]);
});

test("a reader from before the table existed starts from their account's creation time; the editor is never counted", async () => {
  const old = await user("public", T0 - 10 * DAY);
  const r = await noteVisit(db, old, T0);
  assert.equal(r.firstSeenAt, T0 - 10 * DAY); assert.equal(r.weekTwo, true, "day 10 is inside week two");
  const editor = await user("editor", T0 - 40 * DAY); await noteVisit(db, editor, T0);
  const before = await weekTwoMeasure(db, T0 + 60 * DAY);
  const all = await db.select().from(schema.readerSetup);
  assert.equal(before.cohort, all.length - 1, "the editor's row is left out of the rate");
  // And the site only calls it for a trial reader.
  assert.match(readFileSync(join(ROOT, "app/visit/actions.ts"), "utf8"), /!!access\.invite && !access\.editor/);
});

// ── Point 8: no comment threads, replies or debate features anywhere ──
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const DEBATE = /\b(comments?|repl(?:y|ies)|threads?|discussions?|forums?|chat|reactions?|upvotes?|downvotes?|likes?)\b/i;

test("no table, page or route is a comment thread, a reply, a reaction or a debate feature", () => {
  const tables = [...readFileSync(join(ROOT, "db/schema.ts"), "utf8").matchAll(/sqliteTable\("([a-z0-9_]+)"/g)].map(m => m[1]);
  assert.ok(tables.length > 80);
  assert.deepEqual(tables.filter(t => DEBATE.test(t.replace(/_/g, " "))), [], "no such table");
  const routes = walk(join(ROOT, "app")).filter(p => /(page|route)\.tsx?$/.test(p)).map(p => p.slice(ROOT.length + 1));
  assert.deepEqual(routes.filter(r => DEBATE.test(r.replace(/[/\[\]-]/g, " "))), [], "no such page or route");
  const components = walk(join(ROOT, "components")).map(p => p.slice(ROOT.length + 1));
  assert.deepEqual(components.filter(c => DEBATE.test(c.replace(/[/.\-]/g, " ")) || /bubble/i.test(c)), [], "no such component (the unused reactions component is gone)");
});

test("a reader's own words are never shown to another reader", () => {
  // The optional reason on an answer: read back only by a query that filters on the viewer's own id.
  const opinions = readFileSync(join(ROOT, "lib/opinions.ts"), "utf8");
  assert.match(opinions, /export async function answerHistory\(userId: string/);
  // Who touches the stored reason or the reader's answer history at all: the answer layer, the reader's own box and page,
  // account deletion and the fraud checks (which see a hash, never the words). Nothing else, so no page can show it to anyone else.
  const all = ["app", "components", "lib"].flatMap(d => walk(join(ROOT, d))).filter(p => /\.tsx?$/.test(p));
  const touch = all.filter(p => /answerHistory\(|voiceVotes\.reason\b|positionHistory\.reason\b/.test(readFileSync(p, "utf8"))).map(p => p.slice(ROOT.length + 1));
  assert.ok(touch.length >= 2);
  for (const f of touch) assert.ok(/^lib\/opinions\.ts$|^lib\/constituent\/|^lib\/verify\/|^lib\/flow\/|^lib\/voice\.ts$|^components\/voice\/|^app\/voice\/|^app\/bills\/|^app\/texas\/bills\//.test(f), `${f} reads a reader's reason or answer history`);
});

test("the four measures read as plain sentences, with and without data", async () => {
  const { habitLines } = await import("../lib/habit-lines.ts");
  const empty = habitLines({ weekTwo: weekTwoRate([], T0), loop: { week: "2026-W47", weeklyEmailsSent: 0, weeklyOpens: 0, weeklyOpenRate: null, noticeDays: 28, noticesSent: 0, noticeReturns: 0, noticeReturnRate: null },
    share: { last7: { billViews: 0, sharesStarted: 0, rate: null }, last28: { billViews: 0, sharesStarted: 0, rate: null } }, readerEmailReady: false });
  assert.deepEqual(empty.map(l => l.key), ["weekTwo", "emailOpens", "shareRate", "noticeReturn"]);
  assert.equal(empty[0].value, "No reader has visited yet.");
  assert.equal(empty[1].value, "No weekly email has been sent yet: emails to readers wait for the site's own sending address.");
  assert.equal(empty[2].value, "No reader has opened a bill page in the last 7 days; no reader has opened a bill page in the last 28 days.");
  assert.match(empty[3].value, /^No notice has been sent in the last 28 days\./);
  const full = habitLines({ weekTwo: weekTwoRate([{ firstSeenAt: T0, weekTwoAt: T0 + 9 * DAY }, { firstSeenAt: T0, weekTwoAt: null }], T0 + 30 * DAY),
    loop: { week: "2026-W47", weeklyEmailsSent: 8, weeklyOpens: 6, weeklyOpenRate: 0.75, noticeDays: 28, noticesSent: 11, noticeReturns: 2, noticeReturnRate: 0.182 },
    share: { last7: { billViews: 40, sharesStarted: 3, rate: 0.075 }, last28: { billViews: 900, sharesStarted: 1, rate: 0.001 } }, readerEmailReady: true });
  assert.equal(full[0].value, "1 of 2 readers came back in their second week (50%).");
  assert.equal(full[1].value, "6 of 8 weekly emails were opened in week 2026-W47 (75%).");
  assert.equal(full[2].value, "3 shares started from 40 bill-page views in the last 7 days (8%); 1 share started from 900 bill-page views in the last 28 days (under 1%).");
  assert.equal(full[3].value, "2 of 11 notices sent in the last 28 days were followed back to the site (18%).");
  const broken = habitLines({ weekTwo: null, loop: null, share: null, readerEmailReady: false });
  assert.ok(broken.every(l => l.value === "Could not be read just now."));
  for (const l of [...empty, ...full]) assert.match(l.note, /\.$/);
  // On the What's next page and the probe.
  assert.match(readFileSync(join(ROOT, "app/editor/next/page.tsx"), "utf8"), /Do people come back and share\?/);
  assert.match(readFileSync(join(ROOT, "app/api/automation/health/route.ts"), "utf8"), /habit: await import\("@\/lib\/habit"\)/);
});
