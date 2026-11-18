// Tone rules for everything a reader sees (owner, 18 Nov 2026, point 7): calm, specific, no outrage wording,
// no adjectives about legislators; and the tone finding of the average-reader test.
import test from "node:test";
import assert from "node:assert/strict";
import { toneProblems, toneLine, toneFinding, MEMBER_LABELS, OUTRAGE_WORDS, TONE_JUDGE_ADDITION } from "../lib/analysis/tone.ts";
import { readerTestResult } from "../lib/analysis/standard.ts";
import { checkSummary } from "../lib/analysis/checker.ts";

const kinds = t => toneProblems(t).map(p => p.kind);

test("outrage and hurry wording is refused; plain reporting is not", () => {
  assert.deepEqual(kinds("Sen. Lee slams the bill."), ["outrage"]);
  assert.deepEqual(kinds("The Senate finally passed it."), ["outrage"]);
  assert.deepEqual(kinds("Act now: the vote is Tuesday."), ["outrage"]);
  assert.deepEqual(kinds("The House passed the bill 392–18 on November 12, 2026."), []);
  // Words a bill can use in their plain meaning are not on the list.
  for (const plain of ["The bill covers explosive devices.", "It pays for urgent care clinics.", "Records destroyed in a fire can be replaced.", "A person breaking this rule pays $500.", "The HEROES Act of 2003 is amended."])
    assert.deepEqual(toneProblems(plain), [], plain);
  assert.ok(OUTRAGE_WORDS.every(w => !["explosive", "urgent", "breaking", "hero"].includes(w)));
});

test("an exclamation mark is refused", () => {
  assert.deepEqual(kinds("It passed!"), ["exclamation"]);
  assert.deepEqual(kinds("It passed."), []);
});

test("no adjective about a legislator, the same for every party", () => {
  for (const [bad, words] of [["The embattled Sen. Lee voted no.", "embattled Sen."], ["Moderate House Republicans voted yes.", "Moderate House Republicans"],
    ["Progressive Democrats voted no.", "Progressive Democrats"], ["An outspoken Texas state Representative filed it.", "outspoken Texas state Representative"],
    ["Rep. Mary Ann Roe is a staunch supporter.", "Rep. Mary Ann Roe is a staunch"], ["Sen. Lee, the conservative from Utah, voted no.", "Sen. Lee, the conservative"]]) {
    const p = toneProblems(bad);
    assert.equal(p.length, 1, bad); assert.equal(p[0].kind, "member-label"); assert.equal(p[0].words, words);
    assert.match(toneLine(p[0]), /Give the name, the office and what they did or said/);
  }
  // Party, office and seniority are facts, not labels; and the same words about things that are not legislators are fine.
  for (const fine of ["Republican Rep. Smith voted yes.", "The senior senator from Texas voted no.", "The ranking member objected.", "Moderate-income families qualify.",
    "A conservative estimate is $2 million.", "The bill protects vulnerable members of the armed forces.", "Sen. Lee is the sponsor.", "House Democrats voted 201–3 against it."])
    assert.deepEqual(toneProblems(fine), [], fine);
  // One list, with no party in it: a label is refused whichever party follows it.
  for (const label of MEMBER_LABELS) for (const party of ["Republicans", "Democrats"]) assert.equal(kinds(`The ${label} ${party} voted.`)[0], "member-label", `${label} ${party}`);
});

test("the tone judge is believed only when it quotes words that are on the page", () => {
  const page = "Lets about 58,000 combat-injured military retirees keep their full retirement pay.\n\nThe outspoken Rep. Roe says the cost is too high.";
  assert.equal(toneFinding({ calm: true, words: [], why: "" }, page), null);
  assert.equal(toneFinding({ calm: false, words: [], why: "It feels harsh." }, page), null, "no quotation, no finding");
  assert.equal(toneFinding({ calm: false, words: ["reckless spending"], why: "Loaded." }, page), null, "words that are not on the page");
  const f = toneFinding({ calm: false, words: ["“outspoken Rep. Roe”", "not there"], why: "A label on a legislator." }, page);
  assert.match(f, /pointed to: "outspoken Rep\. Roe" \(A label on a legislator\.\)/); assert.doesNotMatch(f, /not there/);
  assert.match(TONE_JUDGE_ADDITION, /if you cannot quote one, the page is calm/);
});

test("tone is part of the average-reader test's pass or fail", () => {
  const ok = { verdict: "correct", why: "" }, reader = { whatItDoes: "It lets injured retirees keep full pay.", whoIsAffected: "About 58,000 military retirees who were hurt in combat.", dailyLifeChange: "They get about $1,450 more a month.", wordsNotUnderstood: [] };
  const judge = { whatItDoes: ok, whoIsAffected: ok, dailyLifeChange: ok, arguments: [] };
  const page = "The embattled senator blocked it.";
  assert.equal(readerTestResult(reader, judge, "note", page).passed, true, "a judge that says nothing about tone does not fail a summary");
  assert.equal(readerTestResult(reader, { ...judge, tone: { calm: true, words: [], why: "" } }, "note", page).passed, true);
  const r = readerTestResult(reader, { ...judge, tone: { calm: false, words: ["embattled senator"], why: "A label." } }, "note", page);
  assert.equal(r.passed, false); assert.match(r.reasons[0], /not calm and specific/);
});

test("the written check on a bill summary applies the tone rules", () => {
  const src = readFileSyncSafe();
  assert.match(src, /for \(const p of toneProblems\(/);
  assert.equal(typeof checkSummary, "function");
});

import { readFileSync } from "node:fs";
function readFileSyncSafe() { return readFileSync(new URL("../lib/analysis/checker.ts", import.meta.url), "utf8"); }
