import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBillStatus, parseBillTextHtml, billStatusUrl, MAX_TEXT_CHARS } from "../lib/analysis/billtext.ts";
import { checkSummary, bannedWordsIn, citeExists, readingGrade, isSampled, routeSummary, spreadAcrossCategories, LIMITS } from "../lib/analysis/checker.ts";
import { callCost, maxCallCost, priceFor, priceTable, DEFAULT_PRICES } from "../lib/model-cost.ts";

// Fixtures: govinfo.gov files for H.R. 2102 fetched on 2026-11-13 (BILLSTATUS trimmed of actions and cosponsors).
const fx = name => readFileSync(new URL(`./fixtures/federal/${name}`, import.meta.url), "utf8");

test("BILLSTATUS gives text versions newest first, CBO estimates and the CRS summary", () => {
  const s = parseBillStatus(fx("billstatus-119hr2102.xml"));
  assert.equal(s.versions[0].label, "Engrossed in House");
  assert.equal(s.versions[0].code, "eh");
  assert.equal(s.versions[0].htmlUrl, "https://www.govinfo.gov/content/pkg/BILLS-119hr2102eh/html/BILLS-119hr2102eh.htm");
  assert.equal(s.versions.at(-1).code, "ih");
  assert.deepEqual(s.cbo.map(e => e.url), ["https://www.cbo.gov/publication/62877", "https://www.cbo.gov/publication/62237"]);
  assert.match(s.crsSummary, /combat-related disability/);
  assert.equal(billStatusUrl(119, "hr", 2102), "https://www.govinfo.gov/bulkdata/BILLSTATUS/119/hr/BILLSTATUS-119hr2102.xml");
  assert.throws(() => parseBillStatus("<html>not found</html>"));
});

test("bill text parses to plain text with numbered sections", () => {
  const t = parseBillTextHtml(fx("bill-119hr2102eh.htm"));
  assert.deepEqual(t.sections.map(s => s.num), ["1", "2"]);
  assert.equal(t.sections[0].heading, "SHORT TITLE");
  assert.ok(!t.text.includes("<"), "no markup left");
  assert.ok(t.chars < MAX_TEXT_CHARS);
});

const SECTIONS = [{ num: "1", heading: "SHORT TITLE" }, { num: "2", heading: "EXPANSIONS OF ELIGIBILITY" }];
const good = () => ({
  headline: "Would let more disabled military retirees collect both retired pay and disability pay in full.",
  whatItDoes: [
    { text: "Lets retirees with combat-related disabilities receive full retired pay alongside veterans' disability pay.", section: "Sec. 2" },
    { text: "Removes the rule that cut retired pay for those retirees with fewer than 20 years of service.", section: "Sec. 2(a)" },
  ],
  whoItAffects: [{ text: "Military retirees who left service early because of a combat-related disability.", section: "Sec. 2" }],
  whatChangesForYou: "If you are one of these retirees, your monthly payments could rise. Most people would notice no direct change.",
  caseFor: [
    { argument: "Retirees hurt in combat earned both payments and should not lose part of one because of the other.", attribution: "veterans' groups" },
    { argument: "The change treats early combat retirees the same way the law already treats longer-serving retirees today.", attribution: "the bill's sponsor" },
  ],
  caseAgainst: [
    { argument: "Paying both benefits in full adds federal spending at a time when the budget already runs short.", attribution: "budget analysts" },
    { argument: "Other groups of retirees with service-connected injuries would still face the offset, which some see as uneven.", attribution: "Defense Department officials" },
  ],
  unknowns: ["How many retirees would qualify in the first year.", "When the Defense Department could start paying the new amounts."],
  confidence: "high", confidenceReason: "The text is short and complete.",
});

test("a neutral, cited, balanced summary passes", () => {
  const r = checkSummary(good(), SECTIONS);
  assert.deepEqual(r.failures, []);
  assert.equal(r.passed, true);
  assert.ok(r.metrics.totalWords <= LIMITS.totalWords);
});

test("loaded words fail, as whole words in any case, including attributions", () => {
  assert.deepEqual(bannedWordsIn("A Sweeping change"), ["sweeping"]);
  assert.deepEqual(bannedWordsIn("a common-sense fix"), ["common-sense"]);
  assert.deepEqual(bannedWordsIn("common   sense"), ["common sense"]);
  assert.deepEqual(bannedWordsIn("sweepings and gutter and attacked"), []);
  const d = good(); d.headline = "Would make a landmark change to retired pay for disabled veterans.";
  d.caseFor[0].attribution = "radical activists";
  const r = checkSummary(d, SECTIONS);
  assert.equal(r.passed, false);
  assert.match(r.failures.join(" "), /landmark/);
  assert.match(r.failures.join(" "), /radical/);
});

test("headline must start with Would and stay within 20 words", () => {
  const d = good(); d.headline = "This bill lets retirees collect both payments.";
  assert.match(checkSummary(d, SECTIONS).failures.join(" "), /start with "Would"/);
  d.headline = "Would " + "pay ".repeat(20);
  assert.match(checkSummary(d, SECTIONS).failures.join(" "), /Headline is 21 words/);
});

test("every point cites a section that exists in the text", () => {
  assert.ok(citeExists("Sec. 2", SECTIONS) && citeExists("Section 2(b)(1)", SECTIONS) && citeExists("§ 1", SECTIONS));
  assert.ok(!citeExists("Sec. 7", SECTIONS) && !citeExists("the bill", SECTIONS));
  assert.ok(citeExists("Full text", []), "a text without numbered sections accepts Full text");
  const d = good(); d.whatItDoes[1].section = "Sec. 9"; d.whoItAffects[0].section = "";
  const f = checkSummary(d, SECTIONS).failures.join(" ");
  assert.match(f, /cites "Sec. 9", which is not a section/);
  assert.match(f, /Who it affects point 1 cites no section/);
});

test("at most three points in what it does", () => {
  const d = good(); d.whatItDoes = [...d.whatItDoes, ...d.whatItDoes];
  assert.match(checkSummary(d, SECTIONS).failures.join(" "), /What it does needs 1 to 3 points; it has 4/);
});

test("exactly two arguments a side, attributed, and of comparable length", () => {
  const d = good(); d.caseAgainst = d.caseAgainst.slice(0, 1);
  assert.match(checkSummary(d, SECTIONS).failures.join(" "), /Case against needs exactly 2/);
  const e = good(); e.caseFor[1].attribution = "critics";
  assert.match(checkSummary(e, SECTIONS).failures.join(" "), /attributed only to "critics"/);
  const g = good(); g.caseAgainst = [{ argument: "It costs money that the budget does not have now.", attribution: "budget analysts" },
    { argument: "Other retirees would still face the offset in the law.", attribution: "Defense Department officials" }];
  assert.match(checkSummary(g, SECTIONS).failures.join(" "), /case for is \d+ words and the case against is \d+/);
});

test("first-person opinion and grades fail; truncated text cannot claim high confidence", () => {
  const d = good(); d.whatChangesForYou = "We believe most people would notice no change.";
  assert.match(checkSummary(d, SECTIONS).failures.join(" "), /first-person opinion/);
  const e = good(); e.unknowns = ["The sponsor's rating on veterans issues."];
  assert.match(checkSummary(e, SECTIONS).failures.join(" "), /grade or rating/);
  assert.match(checkSummary(good(), SECTIONS, { truncated: true }).failures.join(" "), /confidence cannot be high/);
});

test("total length is capped near two phone screens", () => {
  const d = good(); const long = "word ".repeat(34).trim() + ".";
  d.whatItDoes = [0, 1, 2].map(() => ({ text: long, section: "Sec. 2" })); d.whoItAffects = d.whatItDoes;
  d.unknowns = [0, 1, 2].map(() => "word ".repeat(29).trim());
  d.whatChangesForYou = "word ".repeat(44).trim();
  assert.match(checkSummary(d, SECTIONS).failures.join(" "), /The summary is \d+ words; the limit is 360/);
});

test("reading grade rewards short plain sentences", () => {
  assert.ok(readingGrade("The bill pays vets. It starts next year.") < 5);
  assert.ok(readingGrade("The legislation establishes comprehensive administrative requirements for intergovernmental appropriations reconciliation.") > 14);
  const d = good(); d.whatChangesForYou = "Notwithstanding interdepartmental administrative determinations, compensation computations incorporate additional considerations.";
  assert.match(checkSummary(d, SECTIONS).warnings.concat(checkSummary(d, SECTIONS).failures).join(" "), /Reading level is grade/);
});

test("1 in 5 is sampled; low confidence and twice-failed summaries are held", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(i => isSampled(i)), [false, false, false, false, true, false, true]);
  assert.deepEqual(routeSummary({ checkPassed: true, confidence: "high", sequenceIndex: 0 }), { status: "visible", queue: null });
  assert.deepEqual(routeSummary({ checkPassed: true, confidence: "medium", sequenceIndex: 4 }), { status: "visible", queue: "sample" });
  assert.deepEqual(routeSummary({ checkPassed: true, confidence: "low", sequenceIndex: 4 }), { status: "held", queue: "low_confidence" });
  assert.deepEqual(routeSummary({ checkPassed: false, confidence: "high", sequenceIndex: 1 }), { status: "held", queue: "check_failed" });
});

test("picks spread across categories before repeating one", () => {
  const ranked = [{ id: "a", categorySlug: "guns" }, { id: "b", categorySlug: "guns" }, { id: "c", categorySlug: "taxes" }, { id: "d", categorySlug: "guns" }, { id: "e", categorySlug: "education" }];
  assert.deepEqual(spreadAcrossCategories(ranked, new Map()).slice(0, 3).map(x => x.categorySlug), ["guns", "taxes", "education"]);
  assert.equal(spreadAcrossCategories(ranked, new Map([["guns", 2]]))[0].id, "c");
});

test("cost per call from token usage, cached input and web searches", () => {
  const c = callCost("gpt-5.4-mini", { input_tokens: 10_000, output_tokens: 1_000, input_tokens_details: { cached_tokens: 2_000 } });
  // 8,000 x 0.75 + 2,000 x 0.075 + 1,000 x 4.5, per million
  assert.equal(c.usd, 0.01065);
  assert.equal(callCost("gpt-5.5", { input_tokens: 1_000_000, output_tokens: 0 }, 3).usd, 5.03);
  assert.equal(priceFor("gpt-5.4-mini-2026-03-17").input, 0.75, "dated ids price as their family");
  assert.equal(priceFor("some-new-model").output, 30, "unknown models are priced high, not free");
  assert.equal(priceTable('{"gpt-5.4-mini":{"input":1,"output":2}}')["gpt-5.4-mini"].cachedInput, 1);
  assert.equal(priceTable("not json"), DEFAULT_PRICES);
  assert.ok(maxCallCost("gpt-5.4-mini", 45_000, 4000) < 0.05, "a test summary's worst case is a few cents");
});
