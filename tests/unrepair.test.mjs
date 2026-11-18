import test from "node:test";
import assert from "node:assert/strict";
import { stripAll, stripMisapplied } from "../lib/analysis/unrepair.ts";
import { unexplainedJargon, fillerIn, isCommonKnowledge } from "../lib/analysis/standard.ts";
import { bannedWordsIn, unsupportedClaims } from "../lib/analysis/checker.ts";

// What readers of H.R. 4219 were shown on 18 Nov 2026.
const LIVE = "The agency could provide technical help, funding, or a strike team agreement if appropriate (money Congress approves to be spent).";

test("an explanation attached to a word that is not the term is removed, and nothing else changes", () => {
  const r = stripMisapplied(LIVE);
  assert.equal(r.text, "The agency could provide technical help, funding, or a strike team agreement if appropriate.");
  assert.deepEqual(r.removed, ['"appropriate (money Congress approves to be spent)"']);
  assert.equal(stripMisapplied("other information the Attorney General considers appropriate (money Congress approves to be spent).").text, "other information the Attorney General considers appropriate.");
});

test("an explanation in the right place is kept", () => {
  for (const ok of ["Congress sets appropriations (money Congress approves to be spent) each year.", "The bill would cut deficits (the gap between what the government spends and takes in).",
    "Congress may appropriate (money Congress approves to be spent) $10 million a year.", "The agency issued a final rule (a regulation an agency has issued) in June."])
    assert.deepEqual(stripMisapplied(ok), { text: ok, removed: [] }, ok);
});

test("the marketplace note on an everyday exchange is removed even though the note itself mentions health plans", () => {
  const plain = "the government marketplace where people buy health plans (HealthCare.gov in most states)";
  const text = `The bill bars money for academic exchange (${plain}) programs with the university.`;
  assert.equal(stripMisapplied(text).text, "The bill bars money for academic exchange programs with the university.");
  const health = `People who buy insurance on an exchange (${plain}) would pay less.`;
  assert.equal(stripMisapplied(health).text, health);
});

test("every field of a summary is cleaned against the whole summary", () => {
  const o = { a: LIVE, b: "Allows $10 million a year." };
  const removed = stripAll([{ get: () => o.a, set: v => { o.a = v; } }, { get: () => o.b, set: v => { o.b = v; } }]);
  assert.equal(removed.length, 1); assert.doesNotMatch(o.a, /money Congress/); assert.equal(o.b, "Allows $10 million a year.");
});

test("18 Nov false alarms: the word lists", () => {
  const terms = t => unexplainedJargon(["", t]).map(x => x.term.toLowerCase());
  assert.deepEqual(terms("The agency could provide a strike team agreement if appropriate."), []);
  assert.deepEqual(terms("Other information the Attorney General considers appropriate."), []);
  assert.deepEqual(terms("Congress may appropriate $10 million a year."), ["appropriate"]);
  assert.deepEqual(terms("The bill appropriates money for roads."), ["appropriates"]);
  // A proposed rule and rulemaking each get their own explanation, not "a regulation an agency has issued".
  assert.match(unexplainedJargon(["", "A 2023 proposed rule is not finished."])[0].plain, /put forward but not yet issued/);
  assert.match(unexplainedJargon(["", "It limits federal rulemaking power."])[0].plain, /steps an agency takes/);
  assert.equal(unexplainedJargon(["", "It lowers enrollment next year."])[0].plain, "the number of people signed up");
  assert.deepEqual(fillerIn("Changes apply to HealthCare.gov and related state sites."), []);
  assert.deepEqual(fillerIn("It covers banks and related money businesses."), []);
  assert.equal(fillerIn("It covers banks, credit unions, and related.").length, 1);
  assert.equal(fillerIn("It changes fees and related matters.").length, 1);
  for (const w of ["federal", "Tribal", "grants", "loans", "the federal government"]) assert.equal(isCommonKnowledge(w), true, w);
  for (const w of ["risk adjustment", "critical-minerals", "cloture"]) assert.equal(isCommonKnowledge(w), false, w);
});

test("18 Nov false alarms: names joined by a hyphen, and the law's own word for a declared disaster", () => {
  const sources = ["The bill restricts funds for programs in Israel. Appointed by and with the advice and consent of the Senate."];
  assert.deepEqual(unsupportedClaims("It limits Israel-related grants to Senate-confirmed officials.", sources, []), []);
  assert.deepEqual(unsupportedClaims("It limits Qatar-related grants.", sources, []), ["Qatar-related"]);
  assert.deepEqual(bannedWordsIn("Losses from a federally declared disaster could be deducted, and disaster relief continues."), []);
  assert.deepEqual(bannedWordsIn("Opponents call the bill a disaster for farmers."), ["disaster"]);
});

test("a whole summary is cleaned in place, as the bill page reads it", async () => {
  const { cleanSummaryText } = await import("../lib/analysis/unrepair.ts");
  const s = { whatItDoes: [{ text: "Allows $10 million a year.", section: "Sec. 2" }], whoItAffects: [], whatChangesForYou: LIVE, caseFor: [], caseAgainst: [], unknowns: [] };
  const st = { howItWorksToday: [], changes: [{ today: "Teams exist.", ifPassed: "Each region must have one, as the agency considers appropriate (money Congress approves to be spent).", source: "Sec. 2" }], whyNow: "The House passed it." };
  assert.equal(cleanSummaryText(s, null, st).length, 2);
  assert.doesNotMatch(JSON.stringify([s, st]), /money Congress approves/);
  assert.equal(st.changes[0].source, "Sec. 2");
});
