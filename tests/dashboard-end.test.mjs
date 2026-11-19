// Finite design on the two legislature dashboards (owner, 18 Nov 2026, point 6): every list is capped and ends with
// a line, and each page closes with "You're caught up." and the time its figures were last updated.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { capList, CAUGHT_UP, DASH_CAPS, dashboardClose, latestTime, listEnd } from "../lib/dashboard-end.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const count = (text, re) => (text.match(re) ?? []).length;
const LOUD = /!|slams|shocking|outrage|betray|finally|don't miss|act now|streak|badge|\bpoints\b/i;

test("a list's last line says it is the end, and how many there were", () => {
  assert.equal(listEnd({ shown: 10, total: 10 }), "That is all 10.");
  assert.equal(listEnd({ shown: 14, total: 14, what: "issues" }), "That is all 14 issues.");
  assert.equal(listEnd({ shown: 1, total: 1 }), "That is the only one.");
  assert.equal(listEnd({ shown: 3 }), "That is all 3.", "no total given and not a cut list: every row is shown");
  // A "most" list cut at its cap says so, with the full number when it is on file.
  assert.equal(listEnd({ shown: 10, total: 34, top: true }), "Those are the 10 highest of 34. The list stops here.");
  assert.equal(listEnd({ shown: 10, top: true }), "Those are the 10 highest. The list stops here.", "an older snapshot has no total");
  assert.equal(listEnd({ shown: 10, total: 10, top: true }), "That is all 10.", "exactly ten in all: nothing was cut");
  assert.equal(listEnd({ shown: 6, total: 6, top: false }), "That is all 6.");
  assert.equal(listEnd({ shown: 150, total: 163, what: "committees" }), "Those are 150 of 163 committees. The list stops here.");
  // An empty list gets no line: the page already says why it is empty.
  for (const shown of [0, -1]) assert.equal(listEnd({ shown, total: 0 }), "");
  for (const line of [listEnd({ shown: 10, total: 34, top: true }), listEnd({ shown: 2, total: 2 }), listEnd({ shown: 150, total: 163 })]) {
    assert.match(line, /\.$/); assert.doesNotMatch(line, LOUD); assert.doesNotMatch(line, /more to load|load more|keep scrolling|undefined|null|NaN/i);
  }
});

test("every list is capped", () => {
  assert.deepEqual(capList([1, 2, 3], 10), { rows: [1, 2, 3], shown: 3, total: 3 });
  assert.deepEqual(capList([1, 2, 3, 4, 5], 2), { rows: [1, 2], shown: 2, total: 5 });
  assert.deepEqual(capList(null, 5), { rows: [], shown: 0, total: 0 }); assert.deepEqual(capList(undefined, 5), { rows: [], shown: 0, total: 0 });
  for (const [name, cap] of Object.entries(DASH_CAPS)) assert.ok(Number.isInteger(cap) && cap > 0 && cap <= 150, `${name} has a real cap`);
  const long = capList(Array.from({ length: 400 }, (_, i) => i), DASH_CAPS.chairs);
  assert.equal(long.rows.length, 150); assert.equal(listEnd(long), "Those are 150 of 400. The list stops here.");
});

test("each dashboard closes with one calm line and the time the figures were last updated", () => {
  assert.equal(CAUGHT_UP, "You're caught up.");
  const updatedAt = Date.UTC(2026, 10, 18, 19, 10), updated = "Nov 18, 2:10 PM ET";
  assert.deepEqual(dashboardClose({ updated, updatedAt, previousVisit: null }), { head: "You're caught up.", text: "That is everything on this page. The figures were last updated Nov 18, 2:10 PM ET." });
  // The reader was here after the figures were last updated: nothing has changed since.
  assert.deepEqual(dashboardClose({ updated, updatedAt, previousVisit: updatedAt + 3600e3 }), { head: "You're caught up.", text: "These figures have not changed since your last visit. They were last updated Nov 18, 2:10 PM ET." });
  // The figures are newer than the reader's last visit.
  assert.equal(dashboardClose({ updated, updatedAt, previousVisit: updatedAt - 3600e3 }).text, "That is everything on this page. The figures were last updated Nov 18, 2:10 PM ET.");
  assert.equal(dashboardClose({ updated: null, updatedAt: null, previousVisit: 5 }).text, "That is everything on this page. The time of the last update is not on file.");
  for (const c of [dashboardClose({ updated, updatedAt, previousVisit: null }), dashboardClose({ updated, updatedAt, previousVisit: updatedAt + 1 }), dashboardClose({ updated: null, updatedAt: null, previousVisit: null })]) {
    assert.equal(c.head, CAUGHT_UP); assert.doesNotMatch(`${c.head} ${c.text}`, LOUD); assert.doesNotMatch(c.text, /undefined|null|NaN/);
  }
  assert.equal(latestTime(5, null, 9, undefined, 0), 9); assert.equal(latestTime(null, undefined, 0), null); assert.equal(latestTime(), null);
});

test("both dashboard pages end every list with a line and close with the caught-up line, once", () => {
  for (const [file, lists] of [["app/dashboard/page.tsx", 8], ["app/dashboard/texas/page.tsx", 9]]) {
    const page = read(file);
    // Every bar list is followed straight away by its last line.
    const bars = count(page, /<RowBars /g);
    assert.ok(bars >= 4, `${file} has its bar lists`);
    assert.equal(count(page, /<RowBars [^\n]*\/>\s*(?:<p className="meta">[^\n]*<\/p>\s*)?<ListEnd /g), bars, `${file}: every bar list ends with a line`);
    assert.equal(count(page, /<ListEnd /g), lists, `${file}: one end line per list`);
    // Every list on the page is drawn from a capped copy, never straight from the data.
    assert.doesNotMatch(page, /\bd\.(advanced|againstParty|missed|stall|chairs|leaders|byIssue|officers|funnels|history)\.map\(/, `${file} draws no list uncapped`);
    assert.ok(count(page, /capList\(/g) >= 7, `${file} caps its lists`);
    // One closing line, at the very end of the page, with the time of the last update.
    assert.equal(count(page, /<CaughtUp /g), 1, `${file} closes once`);
    assert.match(page, /<CaughtUp updated=\{[^\n]*\} updatedAt=\{[^\n]*\} previousVisit=\{lastVisit\} \/>\s*<\/section>\s*<\/PublicShell>;\s*}\s*$/, `${file}: the closing line is the last thing on the page`);
    // Still private, still finite, and nothing new to look at.
    assert.match(page, /const access = await viewerAccess\(\);\s*if \(!access\.allowed\) return <PublicShell current="\/dashboard" access=\{access\} page="\/dashboard[^"]*">\{null\}<\/PublicShell>;/);
    assert.doesNotMatch(page, /load more|infinite|IntersectionObserver|"use client"/i);
    assert.equal(count(page, /<(FunnelChart|SeatBar) /g), 5, `${file}: the charts are the ones that were there before`);
  }
  assert.match(read("app/dashboard/page.tsx"), /<CaughtUp updated=\{when\(d\.generatedAt\)\} updatedAt=\{d\.generatedAt\}/, "Congress: the time the stored figures were computed");
  assert.match(read("app/dashboard/texas/page.tsx"), /<CaughtUp updated=\{d\.figuresAt \? when\(d\.figuresAt\) : null\} updatedAt=\{d\.figuresAt\}/, "Texas: the latest time its sources were read, not the time the page was drawn");
  assert.match(read("lib/texas/dashboard.ts"), /const figuresAt = latestTime\(current\.readAt, seatsReadAt, committeesReadAt, historyRun\?\.at, \.\.\.statRows\.map\(r => Number\(r\.retrievedAt\)\)\);/);
  // The component only words the line; the rule is the pure file above.
  const part = read("components/dashboard/list-end.tsx");
  assert.match(part, /const text = listEnd\(props\);\s*return text \? <p className="list-end">\{text\}<\/p> : null;/);
  assert.match(part, /<p className="caught-up" role="status"><b>\{c\.head\}<\/b> \{c\.text\}<\/p>/);
});

test("the dashboards' own figures say how long each cut list is in full", () => {
  const fed = read("lib/federal/dashboard.ts"), tx = read("lib/texas/dashboard.ts");
  assert.match(fed, /const listTotals = \{ advanced: Number\(sponsorsAdvanced\?\.n \?\? 0\), againstParty: against\.length, missed: missed\.length, stall: Number\(committeesReferred\?\.n \?\? 0\) \};/);
  assert.match(fed, /againstParty: against\.slice\(0, 10\), missed: missed\.slice\(0, 10\), listTotals,/);
  assert.match(fed, /export type StoredCongressDashboard = Omit<CongressDashboard, "listTotals"> & \{ listTotals\?: CongressDashboard\["listTotals"\] \};/, "a snapshot stored before this change has no totals, and the page allows for that");
  assert.match(read("app/dashboard/page.tsx"), /total=\{d\.listTotals\?\.advanced\}/);
  assert.match(tx, /const listTotals = \{ advanced: advanced\.length, againstParty: against\.length, missed: missed\.length, stall: stalled\.length \};/);
  assert.match(tx, /advanced: advanced\.slice\(0, 10\)[^\n]*againstParty: against\.slice\(0, 10\), missed: missed\.slice\(0, 10\),\s*stall: stalled\.slice\(0, 15\)/);
});
