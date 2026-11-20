// Suggest changes: the rules a drafting run keeps to (owner, 20 Nov 2026: "$5 a month for menus", "get approval before
// any bulk run", "nothing goes live until the editor approves it", "say plainly where data is missing").
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planMenuRun, menuNotes, CHANGE_SPEND_PURPOSES, MENU_WORST_CASE_USD } from "../lib/changes/run-rules.ts";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("a drafting run keeps to its own monthly limit, a small number of bills, and can be paused", () => {
  const L = { spendCapUsd: 5, perRun: 5, maxMenus: 15 }, ok = { paused: false, keyConfigured: true, spentUsd: 0, menus: 0 };
  assert.deepEqual(planMenuRun(ok, L), { go: true, room: 5 });
  assert.equal(planMenuRun({ ...ok, paused: true }, L).go, false);
  assert.equal(planMenuRun({ ...ok, keyConfigured: false }, L).go, false);
  assert.deepEqual(planMenuRun({ ...ok, menus: 13 }, L), { go: true, room: 2 }, "never past the limit on menus");
  assert.match(planMenuRun({ ...ok, menus: 15 }, L).reason, /a larger run needs the owner's yes/);
  assert.equal(planMenuRun({ ...ok, spentUsd: 5 - MENU_WORST_CASE_USD + 0.01 }, L).go, false, "a run does not start if one menu's worst case could pass the limit");
  assert.equal(planMenuRun({ ...ok, spentUsd: 4.1 }, L).room, 2);
  assert.deepEqual([...CHANGE_SPEND_PURPOSES], ["change_menu", "change_reader"]);
  // Counted apart from summaries: neither purpose is in the summaries' own list, and both are known to the cost ledger.
  assert.doesNotMatch(read("lib/model-calls.ts").match(/SUMMARY_SPEND_PURPOSES = \[[^\]]*\]/)[0], /change_/);
  assert.match(read("lib/automated-research.ts"), /"change_menu" \| "change_reader"/);
  const run = read("lib/changes/run.ts");
  assert.match(run, /spendCapUsd: num\(env\.CHANGES_SPEND_CAP_USD, 5\)/);
  assert.match(run, /perRun: num\(env\.CHANGES_MENUS_PER_RUN, 5\), maxMenus: num\(env\.CHANGES_MAX_MENUS, 15\)/);
  assert.match(run, /paused: env\.CHANGES_PAUSED === "1"/);
});

test("the notes on a menu say what could not be offered, source by source", () => {
  assert.deepEqual(menuNotes({ dials: 0, diffs: 0, versions: 1, pendingAmendments: 0, skipped: [], failed: [], readerFailed: [], textNotes: [] }), [
    "From the bill's own text: no number, date or limit was found.",
    "Differences between versions: only one version of this bill has been published (or every published version says the same thing), so there is nothing to compare.",
    "Filed amendments: none is on the official list for this bill. Amendments offered in committee are not published in a form that can be read."]);
  const full = menuNotes({ dials: 3, diffs: 2, versions: 2, pendingAmendments: 4, skipped: [{ id: "d1", reason: "names a map" }], failed: [{ id: "d2", failures: ["The \"up\" choice states 7500."] }],
    readerFailed: [{ id: "d3", failures: ["The reader read the \"up\" choice as \"less\"."] }], textNotes: ["The reported version could not be read."] }).join(" | ");
  assert.match(full, /From the bill's own text: 3 numbers, dates or limits found\./);
  assert.match(full, /Differences between versions: 2 passages differ between the newest version and the last one that says something different\./);
  assert.match(full, /Filed amendments: 4 are on the official list\. Their text is not read yet, so none is offered\./);
  assert.match(full, /Left out as not a real choice \(1\): names a map\./);
  assert.match(full, /failing a written check twice \(1\)/); assert.match(full, /after the reader test \(1\)/);
  assert.match(full, /The reported version could not be read\./);
  assert.match(menuNotes({ dials: 1, diffs: 0, versions: 2, pendingAmendments: 1, skipped: [], failed: [], readerFailed: [], textNotes: [] }).join(" | "), /the newest version and the one before it say the same thing\. \| Filed amendments: 1 is on the official list/);
});

test("drafting is reachable only with the scheduled update's secret, stores drafts for review, and returns no wording", () => {
  const route = read("app/api/automation/changes/route.ts");
  assert.match(route, /const via = await tickAuthorized\(/);
  assert.match(route, /if \(!via\) return Response\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/);
  const answer = route.slice(route.lastIndexOf('return Response.json('));
  assert.doesNotMatch(answer, /wording|quote|notes/, 'the answer carries counts and bill numbers only');
  const run = read("lib/changes/run.ts");
  assert.match(run, /status: "draft", createdAt: now/, "every choice starts as a draft");
  assert.match(run, /await store\(passed\.length \? "review" : "closed"/, "a menu waits for the editor; it is never stored as live");
  assert.doesNotMatch(run, /status: "live"|"approved"/);
  assert.match(run, /quote: g\.quote/, "the stored quote is the one code cut out of the bill");
  assert.match(run, /maxCallCost\(limits\.model, MENU_INSTRUCTIONS\.length \+ input\.length, 3500\) > limits\.spendCapUsd\) throw Error\("spend limit"\)/);
  assert.match(run, /-\(\?:hr\|s\|hjres\|sjres\)-/, "only bills that would make law get a menu");
  const packets = read("app/api/automation/change-packets/route.ts");
  assert.doesNotMatch(packets, /\.update\(|\.insert\(|\.delete\(|responseRequest/, "the review route changes nothing and makes no model call");
  assert.match(packets, /menus: menus\.map\(m => \(\{ bill: m\.billKey, version: m\.version, status: m\.status, choices:/);
});

test("a bill with no published text does not use up one of the run's places, and is looked at again a day later", () => {
  // 20 Nov 2026, first real run: four of the five bills taken had no published text, so one menu was drafted.
  const s = readFileSync(new URL("../lib/changes/run.ts", import.meta.url), "utf8");
  assert.doesNotMatch(s, /\.slice\(0, plan\.room\)/, "the run does not stop at the first few bills whatever their text");
  assert.match(s, /if \(drafted >= plan\.room \|\| looked >= MAX_LOOKED_AT \|\| Date\.now\(\) > deadline - 60_000\) break;/);
  assert.match(s, /if \(m\.status === "skipped" && m\.costUsd === 0 && m\.notes\.some\(n => \/text could not be read\/\.test\(n\)\)\) noText\[billKey\] = now;\n\s+else \{ drafted\+\+;/);
  assert.match(s, /!\(noText\[k\] && now - noText\[k\] < NO_TEXT_WAIT_MS\)/);
  assert.match(s, /const NO_TEXT_WAIT_MS = 20 \* 3600_000, MAX_LOOKED_AT = 30;/);
});
