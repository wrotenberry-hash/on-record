// Owner, 20 Nov 2026: "Yes to fixes A through E and the five-summary trial … Do not retry the 19 until I've seen them."
// And for the briefing: resolutions that do something are summarised; items are ordered by the reader's own
// legislators' votes, then by how many people the bill affects; a headline must make sense alone.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bannedWordsIn, figureInFull, plainWords } from "../lib/analysis/checker.ts";
import { vagueChangeRow, isCommonKnowledge } from "../lib/analysis/standard.ts";
import { summaryScope, SUMMARY_TYPES } from "../lib/summary-scope.ts";
import { byReach, peopleStated, reachOf } from "../lib/briefing-reach.ts";
import { pickItems } from "../lib/briefing-inline.ts";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("fix A: a loaded word used as a plain fact passes when an official source that is not a floor speech uses the same phrase", () => {
  const sources = ["Congress acted after the September 11 attacks to keep insurance available.", "The Secretary may respond to extreme weather events."];
  assert.deepEqual(bannedWordsIn("The backup was created after the September 11 attacks.", sources), []);
  assert.deepEqual(bannedWordsIn("It adds help after extreme weather.", sources), []);
  assert.deepEqual(bannedWordsIn("Rep. X says the bill is an attack on families.", sources), ["attack"], "a member's label is still refused");
  assert.deepEqual(bannedWordsIn("The backup was created after the September 11 attacks.", []), ["attacks"], "with no source to show it is a fact, the list applies");
  assert.deepEqual(bannedWordsIn("A sweeping and radical bill.", sources).sort(), ["radical", "sweeping"], "the rest of the list has no exception");
  assert.match(read("lib/analysis/checker.ts"), /filter\(x => !\/\^FLOOR\/i\.test\(x\.id\)\)/, "floor speeches never make a loaded word a fact");
});

test("fix A: an amount the bill writes in full supports the same amount said in millions or billions", () => {
  assert.equal(figureInFull("$235.5", "It allows $235.5 million a year.", "there is authorized to be appropriated $235,500,000 for each fiscal year"), true);
  assert.equal(figureInFull("$9.761523", "about $9.761523 billion for embassies", "$9,761,523,000"), true);
  assert.equal(figureInFull("$5", "the $5 million threshold", "the threshold is 5000000 dollars"), true);
  assert.equal(figureInFull("$235.5", "It allows $235.5 million a year.", "$235,000,000"), false, "a different amount is still refused");
  assert.equal(figureInFull("$40", "about $40 a month", "$40,000,000"), false, "no unit, no conversion");
});

test("fix A: a row about a place or a thing is concrete without a number", () => {
  assert.equal(vagueChangeRow({ label: "Where court sits", today: "Court for that division is held in Galveston.", ifPassed: "Court is also held in Texas City.", source: "Sec. 2" }), null);
  assert.match(vagueChangeRow({ label: "x", today: "The rules stay as they are now.", ifPassed: "The rules are a little different.", source: "s" }), /no number, date or clear rule/);
});

test("fix C: a credited reason carries the source's exact words, checked against the source and the speaker", () => {
  const g = read("lib/analysis/generate.ts"), c = read("lib/analysis/checker.ts");
  assert.match(g, /required: \["argument", "attribution", "source", "quote"\]/);
  assert.match(g, /Each argument also has "quote": 6 to 25 words in a row copied exactly/);
  assert.match(c, /quotes words that are not in \$\{src\}/);
  assert.match(c, /but the words it quotes were said by someone else/);
  assert.equal(plainWords("“Up to 2 million people,” she said—would lose coverage."), "up to 2 million people she said would lose coverage");
});

test("fix B and the headline rule are in the writer's instructions", () => {
  const g = read("lib/analysis/generate.ts");
  assert.match(g, /export const PROMPT_VERSION = "b12-2026-11-20";/);
  assert.match(g, /CURRENT LAW comes only from a passage in a source, never from general knowledge/);
  assert.match(g, /a declared "disaster" is not an "emergency"; "authorizes" or "allows up to" is not "funds"/);
  assert.match(g, /The headline must make sense to someone who reads nothing else\./);
  assert.match(g, /"a California tribe, the Barona Band"/);
  assert.match(g, /count them; aim for 60 to 75, because 81 fails/);
  // The reader gate still opens from b11, so summaries already on show stay on show.
  assert.match(read("lib/analysis/publish-gate.ts"), /PUBLIC_MIN_PROMPT = "b11-2026-11-17"/);
});

test("fix D: everyday things are not words a reader failed to understand", () => {
  for (const w of ["visa", "September 11", "speed cameras", "military chaplain", "colleges"]) assert.equal(isCommonKnowledge(w), true, w);
  for (const w of ["cloture", "Department of Homeland Security", "polar vortex"]) assert.equal(isCommonKnowledge(w), false, w);
});

test("only the bills the owner named are rewritten, each once, and never the three that need a hand-written explainer", () => {
  const g = read("lib/analysis/generate.ts");
  assert.match(g, /export const REWRITE_TRIAL = \["119-s-32", "119-hr-7128", "119-hr-4541", "119-hr-1181", "119-sjres-197"\];/);
  assert.match(g, /export const REWRITE_FOR_BRIEFING = \["119-hr-8483", "119-hr-9600"\];/);
  assert.match(g, /export const NEEDS_HAND_EXPLAINER = \["119-hr-8800", "119-hr-8595", "119-hr-3106"\];/);
  assert.match(g, /where\(and\(inArray\(analysisBillSummaries\.billId, ids\), sql`\$\{analysisBillSummaries\.promptVersion\} <> \$\{PROMPT_VERSION\}`/, "a new writer no longer rewrites every summary");
  assert.doesNotMatch(g, /heldBeforeFix|heldByOctober/, "nothing else is picked up for a rewrite");
  // A rewrite that does not pass leaves a summary readers can see exactly as it was.
  assert.match(g, /if \(existing && route\.status !== "visible"\) \{/);
  assert.match(g, /if \(old\?\.status === "visible" && !READER_HOLDS\[c\.id\]\) \{\s+await setCursor\(db, triedKey\(c\.id\), PROMPT_VERSION\);/);
});

test("which measures get a summary: bills, joint resolutions, and resolutions that do something themselves", () => {
  assert.deepEqual([...SUMMARY_TYPES], ["hr", "s", "hjres", "sjres", "hres", "sres", "hconres", "sconres"]);
  const s = (billId, title) => summaryScope({ billId, title });
  assert.equal(s("119-hconres-93", "Directing the President, pursuant to section 5(c) of the War Powers Resolution, to remove United States Armed Forces from hostilities with Iran."), "summarised");
  assert.equal(s("119-hres-1655", "Impeaching Peter Brian Hegseth, Secretary of Defense, for high crimes and misdemeanors"), "summarised");
  assert.equal(s("119-hjres-213", "Providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule …"), "summarised");
  assert.equal(s("119-hjres-1", "Proposing an amendment to the Constitution of the United States"), "summarised");
  assert.equal(s("119-hres-1498", "In the matter of allegations relating to Representative Chuck Edwards"), "summarised");
  assert.equal(s("119-hres-1247", "Providing for consideration of the bill (H.R. 2102) to amend title 10"), "debate_rule");
  for (const t of ["Honoring the life of a former member", "Recognizing National Nurses Week", "Electing Members to certain standing committees", "Providing for a conditional adjournment of the House", "Supporting the goals and ideals of a day", "Expressing condolences to the families"])
    assert.equal(s("119-hres-10", t), "ceremonial", t);
  assert.equal(s("119-hr-10", "Honoring Our Veterans Act"), "summarised", "a bill is always summarised, whatever its name");
  assert.equal(s("ocd-bill/1", "Relating to public education."), "summarised", "a Texas bill is not decided here");
  const g = read("lib/analysis/generate.ts");
  assert.match(g, /export const RESOLUTIONS_NOW = list\(process\.env\.ANALYSIS_RESOLUTIONS_NOW, \["119-hconres-93"\]\);/, "only the one the owner named is written until the count and cost are approved");
  assert.match(g, /summaryScope\(\{ billType: r\.billType, title: r\.title \}\) === "summarised" && \(\(LAWMAKING_TYPES as readonly string\[\]\)\.includes\(r\.billType\) \|\| RESOLUTIONS_NOW\.includes\(r\.id\)\)/);
});

test("reach, read from the approved summary's own words", () => {
  const r = (headline, plainEnglish = "") => reachOf({ headline, plainEnglish });
  assert.deepEqual(reachOf(null), { tier: 0, people: null }, "no approved summary: not known");
  assert.equal(r("Lets the Barona Band add 847 federal acres to its reservation.").tier, 1);
  assert.equal(r("Lets a Thomas Paine memorial be placed near the National Mall.").tier, 1);
  assert.equal(r("Lets fraud victims deduct stolen money on federal taxes.").tier, 2);
  assert.deepEqual(r("Lets about 58,000 combat-injured military retirees keep full retirement pay."), { tier: 3, people: 58000 });
  assert.deepEqual(r("Blocks new 2027 rules for health plans.", "The rule expects 1.2 million to 2 million fewer people in these plans in 2027."), { tier: 4, people: 2000000 });
  assert.equal(r("Funds federal agencies through December 4 to avoid a shutdown.").tier, 5);
  assert.equal(peopleStated("It costs $58,000 and started in 2026."), null, "a dollar figure or a year is not a count of people");
  assert.ok(byReach({ tier: 3, people: 58000 }, { tier: 3, people: 900000 }) > 0, "within a step the larger number comes first");
});

test("the briefing's order: own legislators' votes first, then reach, then decided before coming, newest first", () => {
  const p = (key, event, date, voteId = null) => ({ key, system: "federal", billKey: key, label: key, title: key, href: `/bills/${key}`, date, event, note: "", voteId, chamber: voteId ? "senate" : null });
  const all = [p("tribe", "passed", "2026-11-17"), p("memorial", "passed", "2026-11-17"), p("retirees", "passed", "2026-11-12"), p("warpowers", "failed", "2026-11-19", "v1"), p("nosummary", "coming", "2026-11-16")];
  const reach = { tribe: { tier: 1, people: null }, memorial: { tier: 1, people: null }, retirees: { tier: 3, people: 58000 }, warpowers: { tier: 0, people: null }, nosummary: { tier: 0, people: null } };
  const picked = pickItems(all, k => k !== "nosummary" && k !== "warpowers", 5, { ownVote: c => c.voteId === "v1", reach: c => reach[c.key] });
  assert.deepEqual(picked.map(x => x.key), ["warpowers", "retirees", "tribe", "memorial", "nosummary"]);
  // Without a reader's place or summaries the order is what it was.
  assert.deepEqual(pickItems(all, k => k !== "nosummary" && k !== "warpowers", 5).map(x => x.key), ["tribe", "memorial", "retirees", "warpowers", "nosummary"]);
  const items = read("lib/briefing-items.ts");
  assert.match(items, /filter\(r => \/\^\(\?:yea\|nay\|aye\|no\|yes\|present\)\$\/i\.test\(r\.position\.trim\(\)\)\)/, "a legislator who did not vote did not cast a vote");
});

test("a briefing item's headline must make sense alone, and no item promises a summary that will not come", () => {
  const t = read("lib/briefing-test.ts");
  assert.match(t, /namesNotExplained: look at the FIRST LINE only \(the headline\)/);
  assert.match(t, /The headline does not make sense alone: it names/);
  assert.match(read("lib/briefing-inline.ts"), /export const INLINE_VERSION = "i2";/, "every item is tested again under the new rule");
  assert.match(read("lib/briefing-inline.ts"), /export const BRIEFING_INLINE_LIVE = false;/, "still off for readers until the owner says go");
});
