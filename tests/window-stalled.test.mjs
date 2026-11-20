// "Can this bill still be changed?" when the other chamber has voted not to take a bill up (20 Nov 2026).
// Seen on the owner's own screen: H.R. 9340 passed the House, then a Senate vote to end debate on taking it up failed
// 57 to 43. The block said "The Senate can still change it." while the timeline below it showed the failed vote. True
// as procedure, but it read as if the bill were moving. "Never overpromise impact."
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "../db/schema.ts";
import { federalWindow } from "../lib/changes/window.ts";
import { billWindow, openWindowBills } from "../lib/changes/window-store.ts";
import { toneProblems } from "../lib/analysis/tone.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), NOW = Date.UTC(2026, 10, 20, 13, 0);
const base = { stage: "passed_first", stageDate: "2026-09-16", congress: 119, billType: "hr", committees: [], meetings: [], floorChambers: [], stalledIn: null, actionsUrl: "https://www.congress.gov/bill/119th-congress/house-bill/9340/all-actions", now: NOW };

test("a bill the other chamber voted not to take up is said to be stalled there, not open to change", () => {
  const open = federalWindow(base);
  assert.equal(open.state, "open"); assert.equal(open.changes, "The Senate can still change it. If it does, the House must agree to the changes.");
  const w = federalWindow({ ...base, blocked: { chamber: "senate", date: "2026-09-30", what: "end_debate_take_up" } });
  assert.equal(w.place, "other_chamber"); assert.equal(w.state, "narrow");
  assert.equal(w.where, "Passed the House on September 16, 2026. The Senate has it, but a Senate vote to end debate on taking it up failed on September 30, 2026.");
  assert.equal(w.changes, "It is not moving. It can be changed only if the Senate takes it up again.");
  assert.equal(w.hearing, "No hearing date is known.");
  assert.doesNotMatch(`${w.where} ${w.changes}`, /can still change it/);
  assert.match(federalWindow({ ...base, blocked: { chamber: "senate", date: "2026-09-30", what: "take_up" } }).where, /but a Senate vote to take it up failed on September 30, 2026\.$/);
  assert.match(federalWindow({ ...base, blocked: { chamber: "senate", date: "2026-09-30", what: "end_debate" } }).where, /but a Senate vote to end debate on it failed on September 30, 2026\.$/);
  for (const s of [w.where, w.changes]) assert.deepEqual(toneProblems(s), []);
  // On this week's floor schedule again: the earlier failed vote no longer describes where it stands.
  assert.equal(federalWindow({ ...base, floorChambers: ["senate"], blocked: { chamber: "senate", date: "2026-09-30", what: "take_up" } }).state, "open");
  // A failed vote in the chamber that already passed it says nothing about the other chamber.
  assert.equal(federalWindow({ ...base, blocked: { chamber: "house", date: "2026-09-10", what: "take_up" } }).state, "open");
});

const open = [];
after(() => { for (const o of open) { o.client.close(); rmSync(o.dir, { recursive: true, force: true }); } });
async function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "stalled-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
  await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
  open.push({ client, dir });
  return db;
}
async function bill(db, id) {
  const [, type, number] = id.split("-");
  await db.insert(schema.officialBills).values({ id, congress: 119, billType: type, number: Number(number), title: `Sample ${id}`, latestActionAt: "2026-09-30", congressUrl: `https://www.congress.gov/bill/119th-congress/house-bill/${number}`,
    detailStatus: "complete", sourceUrl: "https://www.congress.gov/", retrievedAt: NOW });
  await db.insert(schema.officialBillDepth).values({ billId: id, stage: "passed_first", stageDate: "2026-09-16", latestActionAt: "2026-09-30" });
}
const roll = (id, billId, day, question, result, yea, nay, n) => ({ id, chamber: "senate", congress: 119, session: 2, rollNumber: n, votedAt: Date.UTC(2026, 8, day, 18), question, title: "A bill.", result, billId, yea, nay,
  sourceUrl: "https://www.senate.gov/", retrievedAt: NOW });

test("read from the roll calls on file: the latest vote after passage decides, and a stalled bill gets no menu", async () => {
  const db = await freshDb();
  await bill(db, "119-hr-9340"); await bill(db, "119-hr-9341"); await bill(db, "119-hr-9342");
  await db.insert(schema.officialRollCalls).values([
    // H.R. 9340: the Senate would not end debate on taking it up.
    roll("senate-119-2-401", "119-hr-9340", 30, "On Cloture on the Motion to Proceed H.R. 9340", "Cloture on the Motion to Proceed Rejected", 57, 43, 401),
    // H.R. 9341: the same vote failed, then carried a week later.
    roll("senate-119-2-402", "119-hr-9341", 22, "On Cloture on the Motion to Proceed H.R. 9341", "Cloture on the Motion to Proceed Rejected", 55, 45, 402),
    roll("senate-119-2-410", "119-hr-9341", 29, "On Cloture on the Motion to Proceed H.R. 9341", "Cloture on the Motion to Proceed Agreed to", 62, 38, 410),
  ]);
  const stalled = await billWindow("119-hr-9340", NOW, db);
  assert.equal(stalled.state, "narrow");
  assert.equal(stalled.where, "Passed the House on September 16, 2026. The Senate has it, but a Senate vote to end debate on taking it up failed on September 30, 2026.");
  assert.equal((await billWindow("119-hr-9341", NOW, db)).state, "open", "a later vote that carried clears it");
  assert.equal((await billWindow("119-hr-9342", NOW, db)).state, "open", "no vote on file: as before");
  // Menus are drafted only for bills that can still be changed: the stalled one is left out.
  assert.deepEqual((await openWindowBills(10, NOW, db)).map(b => b.billKey).sort(), ["119-hr-9341", "119-hr-9342"]);
});
