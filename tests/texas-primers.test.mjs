// Texas primers (owner instruction 5, 17 Nov 2026): the same written rules as the federal ones (tests/primers.test.mjs),
// with the official Texas hosts allowed instead of the federal ones.
import test from "node:test";
import assert from "node:assert/strict";
import { TX_PRIMERS, txPrimersFor, txPrimerById } from "../lib/texas/primers.ts";
import { PRIMERS } from "../lib/analysis/primers.ts";
import { unexplainedJargon, unexplainedAcronyms, fillerIn } from "../lib/analysis/standard.ts";
import { plainGrade } from "../lib/analysis/checker.ts";

/** Official Texas sources only (TEXAS_BRIEF.md): Texas Legislature Online and the Legislature's own offices. */
const TX_HOSTS = /^https:\/\/(capitol\.texas\.gov|statutes\.capitol\.texas\.gov|tlc\.texas\.gov|house\.texas\.gov|hro\.house\.texas\.gov|senate\.texas\.gov|lbb\.texas\.gov|lrl\.texas\.gov)\//;

for (const p of TX_PRIMERS) test(`Texas primer "${p.title}" meets the same written rules as a summary`, () => {
  assert.ok(p.bullets.length >= 3 && p.bullets.length <= 5, "3 to 5 bullets");
  for (const b of p.bullets) assert.ok(b.split(/\s+/).length <= 55, `bullet too long: ${b.slice(0, 40)}`);
  assert.deepEqual(unexplainedJargon(["", ...p.bullets]).map(x => x.term), [], "no unexplained jargon");
  assert.deepEqual(unexplainedAcronyms(p.bullets), [], "no bare abbreviations");
  assert.deepEqual(fillerIn(p.bullets.join(" ")), []);
  assert.ok(plainGrade(p.bullets.join(" ")) <= 10, `reading grade ${plainGrade(p.bullets.join(" "))}`);
  assert.ok(p.sources.length >= 1 && p.sources.every(s => TX_HOSTS.test(s.url)), "official Texas sources only");
  assert.ok(p.sources.every(s => s.label.trim().length > 0), "every source is labelled");
  assert.match(p.lawAsOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(p.kind === "process" || p.kind === "topic");
});

test("the four Texas primers the owner asked for exist, with ids distinct from the federal ones", () => {
  assert.deepEqual(TX_PRIMERS.map(p => p.id), ["tx-how-a-bill-passes", "tx-lieutenant-governor-and-speaker", "tx-session-calendar", "tx-special-sessions"]);
  assert.equal(new Set(TX_PRIMERS.map(p => p.id)).size, TX_PRIMERS.length);
  const federal = new Set(PRIMERS.map(p => p.id));
  assert.ok(TX_PRIMERS.every(p => !federal.has(p.id)));
  assert.equal(txPrimerById("tx-special-sessions")?.title, "Special sessions of the Texas Legislature");
  assert.equal(txPrimerById("nope"), null);
});

test("Texas primers are used only after the owner approves them", () => {
  assert.ok(TX_PRIMERS.every(p => p.reviewed === false), "none is approved yet");
  const ctx = { title: "Relating to public school finance.", text: "", actions: "Read 2nd time\nPassed to engrossment\nRecord vote" };
  assert.deepEqual(txPrimersFor(ctx), [], "unreviewed primers never reach a page or a prompt");
  assert.deepEqual(txPrimersFor(ctx, true).map(p => p.id), ["tx-how-a-bill-passes"]);
});

test("Texas primers match the right bills and not the others", () => {
  const ids = actions => txPrimersFor({ title: "Relating to water.", text: "", actions }, true).map(p => p.id);
  assert.deepEqual(ids("Filed\nRead first time\nReferred to Natural Resources"), [], "a bill still in committee gets none");
  assert.deepEqual(ids("Read 2nd time\nPassed to 3rd reading as amended"), ["tx-how-a-bill-passes"], "a Senate bill in the House");
  assert.deepEqual(ids("Senate conferees appointed: Kolkhorst, Perry"), ["tx-how-a-bill-passes"]);
  assert.deepEqual(ids("Conference committee report adopted\nRecord vote"), ["tx-how-a-bill-passes"]);
  // The officers, calendar and special-session primers attach to no bill by default (see lib/texas/primers.ts).
  for (const id of ["tx-lieutenant-governor-and-speaker", "tx-session-calendar", "tx-special-sessions"]) assert.deepEqual(txPrimerById(id).match, {});
});

test("the calendar primer agrees with the sourced calendar rules", async () => {
  const { TX_RULES, TX_REGULAR_SESSION_DAYS } = await import("../lib/texas/calendar.ts");
  const text = txPrimerById("tx-session-calendar").bullets.join(" ");
  assert.match(text, new RegExp(`at most ${TX_REGULAR_SESSION_DAYS} days`));
  assert.match(text, /noon on the second Tuesday of January in odd-numbered years/);
  assert.match(text, /10 days, not counting Sundays/); assert.match(text, /20 days after it ends/);
  assert.match(text, /91st day after the session ends/);
  assert.match(text, /after the first 60 days/);
  const urls = txPrimerById("tx-session-calendar").sources.map(s => s.url);
  for (const k of ["convene", "length", "veto", "effective"]) assert.ok(urls.includes(TX_RULES[k].sourceUrl), `same page as calendar.ts for ${k}`);
});
