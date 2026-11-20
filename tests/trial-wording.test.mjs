// What the trial build tells a reader about votes and alerts must match what it does (owner, 19 Nov 2026).
// In the trial build counting is switched off and the site emails no reader, so no page may say "not enough yet",
// "share this bill", describe address matching as if it were open, or offer alerts by email.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNTING_OFF, NOT_ENOUGH_DISTRICT, PROMISE } from "../lib/constituent/rules.ts";
import { deliveryLines } from "../lib/flow/cards.ts";
import { readerEmailReady } from "../lib/reader-email.ts";
import { toneProblems } from "../lib/analysis/tone.ts";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("with counting off, the bill page says only that counting has not started", () => {
  assert.equal(PROMISE, "Your individual vote is private. Counted votes are added into anonymous totals.");
  assert.match(COUNTING_OFF, /^Counting has not started\. During this trial your answer is saved for you alone: it is not added to any total, and no totals are shown\./);
  assert.doesNotMatch(COUNTING_OFF, /share|not enough|verified|%/i); assert.deepEqual(toneProblems(COUNTING_OFF), []);
  const box = read("components/voice/vote-box.tsx");
  // The promise line already says counting is off; the totals section then shows the one sentence and nothing else.
  assert.match(box, /"Counting is not switched on yet, so no answer is added to a total today\."/);
  const off = box.slice(box.indexOf("{!data.verificationOn ?"), box.indexOf(": <>", box.indexOf("{!data.verificationOn ?")));
  assert.match(off, /<p className="meta">\{COUNTING_OFF\}<\/p>/); assert.doesNotMatch(off, /TotalsList|appear here after you answer|Address-matched means/);
  // The totals, the "after you answer" line and the explanation of address matching are drawn only while counting is on.
  const on = box.slice(box.indexOf(": <>", box.indexOf("{!data.verificationOn ?")));
  for (const s of ["<TotalsList totals={data.totals} />", "appear here after you answer", "Address-matched means"]) assert.ok(on.includes(s), s);
});

test("with counting off, no page prints “not enough constituents yet — share this bill”", () => {
  assert.equal(NOT_ENOUGH_DISTRICT, "Not enough constituents yet — share this bill.");
  // Beside a legislator's vote on both bill pages, the district line is drawn only while counting is on.
  assert.match(read("app/bills/[id]/page.tsx"), /\{voice\?\.verificationOn && <small className="district-total">/);
  assert.match(read("app/texas/bills/[id]/page.tsx"), /\{voice\?\.verificationOn && <small className="district-total">/);
  // The residents' section on a member's page: Congress and Texas alike, only while counting is on.
  assert.match(read("app/politicians/[id]/page.tsx"), /const constituents = verificationConfig\(\)\.enabled \?/);
  assert.match(read("app/texas/members/[id]/page.tsx"), /\{verificationConfig\(\)\.enabled && <div className="fed-section sentiment" id="constituents">/);
  // "Your record" says counting is off in its own words.
  assert.match(read("lib/voice-rules.ts") + read("lib/record/store.ts") + read("app/voice/page.tsx"), /counting is not switched on|not switched on yet/i);
});

test("while the site emails no reader, no screen offers alerts or sign-in by email", () => {
  assert.equal(readerEmailReady({}), false); assert.equal(readerEmailReady({ READER_FROM_EMAIL: "News <news@example.org>" }), true);
  const closed = deliveryLines({ devices: 0, hasEmail: false, alertsOn: true, emailOpen: false });
  assert.equal(closed.email, "Alerts by email are not switched on yet.");
  assert.ok(!closed.links.some(l => /email/i.test(l.label)), "no link to add an email address");
  const open = deliveryLines({ devices: 0, hasEmail: false, alertsOn: true, emailOpen: true });
  assert.equal(open.email, "To get them by email, add your email address on your Account page."); assert.ok(open.links.some(l => l.label === "Add your email address"));
  assert.equal(deliveryLines({ devices: 0, hasEmail: false, alertsOn: true }).email, open.email, "open unless told otherwise");
  assert.match(read("components/home/follow-status.tsx"), /emailOpen: readerEmailReady\(\)/);
  const account = read("app/account/page.tsx");
  // Hidden only in the trial build: with address matching switched on, a reader needs the email sign-in to be matched at all.
  assert.match(account, /!readerEmailReady\(\) && !access\.editor && !vc\.enabled \? <>/);
  assert.match(account, /Signing in by email is not open during this trial\. Your invite link keeps your place, your follows and your answers on this device\./);
  assert.match(account, /alerts by email are not switched on yet/);
});

test("a summary that failed a reading against its sources is hidden by the reader gate itself", async () => {
  const { READER_HOLDS, heldBillIds } = await import("../lib/analysis/reader-holds.ts");
  const ids = Object.keys(READER_HOLDS);
  assert.ok(ids.includes("119-hr-1181") && ids.includes("119-hr-9640"));
  // Owner, 19 Nov 2026 ("Yes to all"): the seven whose reading found a detail stated wrongly are hidden too.
  for (const id of ["119-hr-3276", "119-hr-4219", "119-hr-9500", "119-hr-4646", "119-hr-9497", "119-hr-8884", "119-hjres-213"]) assert.ok(ids.includes(id), id);
  // Late on 19 Nov: two the weekly re-check had taken down, read before anyone approves them, also misstate details.
  for (const id of ["119-hr-1118", "119-hr-9612"]) assert.ok(ids.includes(id), id);
  assert.ok(ids.includes("119-s-307"), "a Senate bill id is well formed too"); assert.ok(ids.includes("119-hr-2140"));
  assert.equal(ids.length, 13);
  // Left on show, each read against its sources: seven sound and three with a small point.
  for (const id of ["119-hr-8823", "119-hr-8483", "119-hjres-210"]) assert.ok(!ids.includes(id), id);
  // The bills read and found sound stay on show.
  for (const id of ["119-hr-2102", "119-hr-1013", "119-hr-7008", "119-hr-3978", "119-hr-8278", "119-hr-9600", "119-hr-9770"]) assert.ok(!ids.includes(id), id);
  assert.deepEqual(heldBillIds(), ids, "every listed id is well formed, so none is silently ignored");
  for (const [id, why] of Object.entries(READER_HOLDS)) { assert.match(id, /^[0-9]+-[a-z]+-[0-9]+$/, id); assert.ok(why.length > 40 && /\.$/.test(why), "each hold says why, in a sentence"); }
  // Both forms of the gate leave the listed bills out: the query-builder form and the raw form used in subqueries.
  const gate = read("lib/analysis/publish-gate.ts");
  assert.match(gate, /\.\.\.\(HELD_IDS\.length \? \[notInArray\(analysisBillSummaries\.billId, HELD_IDS\)\] : \[\]\)/);
  assert.match(gate, /\$\{HELD_IDS\.length \? ` and s\.bill_id not in \(\$\{heldList\}\)` : ""\}/);
  assert.match(gate, /const HELD_IDS = heldBillIds\(\);/);
  // The editor still sees it, with the reason; no reader-facing file reads summaries around the gate.
  assert.match(read("app/bills/[id]/page.tsx"), /const heldByReading = s \? READER_HOLDS\[bill\.id\] \?\? null : null;/);
  for (const f of ["lib/analysis/queries.ts", "lib/cards.ts", "lib/digest.ts", "lib/federal/bill-depth.ts", "lib/flow/data.ts", "lib/search.ts", "lib/social.ts", "lib/voice.ts", "lib/federal/queries.ts", "lib/share-cards.ts"])
    assert.match(read(f === "lib/flow/data.ts" ? "lib/bill-row-store.ts" : f), /readerVisible\(|READER_S/, `${f} reads summaries through the gate`); // 20 Nov: lib/flow/data.ts reads them through lib/bill-row-store.ts
});
