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

test("the checkpoint email carries every summary in full, badged, with the checker's verdict; sent once at 5", async () => {
  const { formatSummariesEmail, summariesEmailDue } = await import("../lib/analysis/report-format.ts");
  const row = { label: "H.R. 2102", title: "Veterans' Transportation Act", billId: "119-hr-2102", category: "veterans", headline: "Would let veterans ride for free.",
    whatItDoes: [{ text: "Pays for rides.", section: "Sec. 2" }], whoItAffects: [{ text: "Rural veterans.", section: "Sec. 2" }], whatChangesForYou: "Nothing for most people.",
    caseFor: [{ argument: "Rides help veterans reach care.", attribution: "veterans' groups" }, { argument: "Costs are small.", attribution: "the bill's sponsor" }],
    caseAgainst: [{ argument: "Money could go elsewhere.", attribution: "budget analysts" }, { argument: "Rules are unclear.", attribution: "state officials" }],
    unknowns: ["The cost."], confidence: "medium", confidenceReason: "Parts depend on other laws.", status: "visible", queue: "sample", checkPassed: true, attempts: 1,
    failures: [], warnings: ["reading grade 9.4 is above the target of 8"], readingGrade: 9.4, totalWords: 210, costUsd: 0.0123, truncated: false };
  const mail = formatSummariesEmail([row], "https://example.test");
  assert.equal(mail.subject, "[On Record] 1 bill summaries are ready to read");
  for (const needle of ["H.R. 2102: Veterans' Transportation Act", "[Analysis] Headline: Would let veterans ride for free.", "Pays for rides. (Sec. 2)",
    "(veterans' groups)", "(budget analysts)", "Checker: passed after 1 attempt · reading grade 9.4 · 210 words · $0.0123", "In your queue (sample)",
    "Warnings: reading grade 9.4", "https://example.test/bills/119-hr-2102", "approve or reject the 1 waiting"]) assert.ok(mail.text.includes(needle), needle);
  assert.ok(!mail.text.includes("[Official] Headline"), "the headline is Analysis");
  assert.equal(summariesEmailDue(4, false), false);
  assert.equal(summariesEmailDue(5, false), true);
  assert.equal(summariesEmailDue(9, true), false, "sent once");
});

test("each section keeps its own text, and a point must share key words with the section it cites", async () => {
  const { citeSupports, contentWords } = await import("../lib/analysis/checker.ts");
  const t = parseBillTextHtml(fx("bill-119hr2102eh.htm"));
  assert.match(t.sections[1].text, /retired pay/i, "section 2's own text is kept");
  assert.ok(!t.sections[0].text.includes("SEC. 2"), "a section's text stops where the next begins");
  assert.equal(citeSupports("Lets military retirees with combat-related disabilities receive retired pay and disability compensation.", "Sec. 2", t.sections), true);
  assert.equal(citeSupports("Creates a new grant program for rural broadband internet providers.", "Sec. 2", t.sections), false);
  assert.equal(citeSupports("Anything at all.", "Sec. 2", SECTIONS), null, "no section text, nothing to check");
  assert.ok(contentWords("Retirees retired retirement").size >= 1);
  const d = good(); d.whatItDoes[0] = { text: "Creates a new grant program for rural broadband internet providers.", section: "Sec. 2" };
  const withText = t.sections.map(s => ({ ...s }));
  assert.match(checkSummary(d, withText).failures.join(" "), /shares no key words with Sec\. 2/);
});

test("the review email shows each cited section's opening words", async () => {
  const { formatSummariesEmail } = await import("../lib/analysis/report-format.ts");
  const row = { label: "H.R. 2102", title: "Major Richard Star Act", billId: "119-hr-2102", category: "defense-veterans", ...good(), status: "visible", queue: null,
    checkPassed: true, attempts: 1, failures: [], warnings: [], readingGrade: 7, totalWords: 180, costUsd: 0.012, truncated: false,
    excerpts: { "Sec. 2": "SEC. 2. EXPANSIONS OF ELIGIBILITY..." }, textUrl: "https://www.govinfo.gov/x.htm", previousCostUsd: 0.01 };
  const first = formatSummariesEmail([row], "https://site.test");
  assert.match(first.text, /Text of Sec\. 2: "SEC\. 2\. EXPANSIONS/);
  assert.match(first.text, /Bill text: https:\/\/www\.govinfo\.gov\/x\.htm/);
  const revised = formatSummariesEmail([row], "https://site.test", { revised: true, promptVersion: "b2" });
  assert.match(revised.subject, /rewritten for review/);
  assert.match(revised.text, /Earlier version cost \$0\.0100/);
});

test("Round 1 review fixes: names do not count against reading level; 'no change unless' fails; grade failures say what to fix (regressions)", async () => {
  const { plainGrade, withoutOfficialNames, citeOverlap } = await import("../lib/analysis/checker.ts");
  const named = "The Nuclear Regulatory Commission must update its rules. The Nuclear Regulatory Commission keeps its power to inspect.";
  assert.equal(withoutOfficialNames(named), "The Name must update its rules. The Name keeps its power to inspect.");
  assert.ok(plainGrade(named) < readingGrade(named) - 3, "an official name counts as one short word");
  assert.equal(withoutOfficialNames("Members of Congress may not buy stock."), "Name may not buy stock.");
  const sections = [{ num: "2", heading: "Photo identification", text: "An election official may not provide a ballot unless the individual presents a valid photo identification. Each State shall notify applicants." }];
  const base = { headline: "Would require photo identification to vote in federal elections", whatItDoes: [{ text: "Requires a valid photo identification before an election official provides a ballot.", section: "Sec. 2" }],
    whoItAffects: [{ text: "Individuals who vote in federal elections must present photo identification.", section: "Sec. 2" }],
    whatChangesForYou: "Most people would see no direct change unless they are voting in a federal election.",
    caseFor: [{ argument: "State officials could say one photo rule gives every polling place the same check.", attribution: "state election officials" }, { argument: "The sponsor could say a photo check gives voters more trust in the count.", attribution: "the bill's sponsor" }],
    caseAgainst: [{ argument: "Voting rights groups could say some eligible voters lack a listed photo card.", attribution: "voting rights groups" }, { argument: "Local officials could say checking cards adds work and cost at polling places.", attribution: "local election officials" }],
    unknowns: ["The text lists no cost estimate."], confidence: "high", confidenceReason: "The text is short and clear." };
  assert.ok(checkSummary(base, sections).failures.some(f => /most people see no change, then adds an exception/.test(f)));
  assert.equal(checkSummary({ ...base, whatChangesForYou: "You would need to show a photo ID to vote in a federal election." }, sections).passed, true);
  const share = citeOverlap("Retirement plans for employees of public schools, charities and churches are covered.", "Sec. 2", sections);
  assert.ok(share !== null && share < 0.34, "a point built from words the section does not use is flagged for a look");
  const heavy = "comprehensive identification verification requirements necessitating governmental documentation presentation before election officials provide any individual a ballot under applicable administrative procedures";
  const dense = { ...base, whatChangesForYou: `Individuals would encounter ${heavy}.`, whoItAffects: [{ text: `Individuals voting in federal elections encounter ${heavy}.`, section: "Sec. 2" }], whatItDoes: [{ text: "Establishes comprehensive identification verification requirements necessitating governmental documentation presentation before election officials provide any individual a ballot under the applicable administrative procedures.", section: "Sec. 2" }] };
  const f = checkSummary(dense, sections).failures.find(x => /Reading level/.test(x));
  assert.ok(f && /Split these sentences in two|Use plainer words/.test(f), f);
});
