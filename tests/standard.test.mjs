// The writing standard (owner instruction, 17 Nov 2026) and the average-reader test's pass/fail rules.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JARGON, unexplainedJargon, headlineProblems, acronymsIn, unexplainedAcronyms, fillerIn, HAS_SPECIFIC, mechanicsShare, readerTestResult, VAGUE_ANSWER, HEADLINE_VERBS } from "../lib/analysis/standard.ts";
import * as S from "../lib/analysis/sources.ts";
import { questionFromHeadline } from "../lib/federal/stance-question.ts";

const fx = name => readFileSync(new URL(`./fixtures/sources/${name}`, import.meta.url), "utf8");

test("headline: the owner's bad example fails, the good one passes", () => {
  const bad = headlineProblems("Would block a 2027 HHS rule on marketplace payment parameters.").join(" ");
  assert.match(bad, /clear verb/); assert.match(bad, /"HHS"/);
  assert.deepEqual(headlineProblems("Blocks new 2027 rules for health plans people buy on HealthCare.gov."), []);
  assert.match(headlineProblems("Requires the Secretary of Health and Human Services to publish a yearly report on rural hospital closures and funding")[0], /limit is 15/);
  assert.deepEqual(headlineProblems("Requires photo ID to vote in U.S. elections."), [], "ID and U.S. are everyday");
});

test("jargon: every listed term fails unless it is explained on first use; the headline has no room to explain", () => {
  for (const term of ["risk adjustment", "user fees", "parameters", "cost-sharing", "appropriations", "cloture", "reconciliation", "Basic Health Program"])
    assert.ok(unexplainedJargon(["Blocks a rule.", `The rule changes ${term} for next year.`]).length >= 1, term);
  assert.deepEqual(unexplainedJargon(["Blocks a rule.", "The Senate needed 60 votes to end debate (called cloture)."]), [], "plain words first, the term in brackets");
  assert.deepEqual(unexplainedJargon(["Blocks a rule.", "A voter gets a provisional ballot (one set aside until officials confirm the voter)."]), [], "the term, then its meaning in brackets");
  assert.equal(unexplainedJargon(["Changes user fees (a charge insurers pay) for 2027."])[0].part, 0, "an explained term still fails in the headline");
  assert.equal(unexplainedJargon(["Blocks a rule.", "It needs cloture (60 votes).", "Cloture failed."]).length, 0, "only the first use needs it");
  assert.ok(JARGON.length >= 50);
});

test("abbreviations must be spelled out; everyday ones are fine", () => {
  assert.deepEqual(acronymsIn("The CMS rule and the BHP, a photo ID, and U.S. law"), ["CMS", "BHP"]);
  assert.deepEqual(unexplainedAcronyms(["The Department of Veterans Affairs (VA) pays it. The VA sends it monthly."]), []);
  assert.deepEqual(unexplainedAcronyms(["The VA pays it."]), ["VA"]);
});

test("specifics: filler fails, a concrete fact is recognised", () => {
  assert.ok(fillerIn("The rule would affect payment and program standards.").length);
  assert.ok(fillerIn("It makes conforming changes and certain provisions apply.").length >= 2);
  assert.deepEqual(fillerIn("It cuts the fee insurers pay from 2.5 percent of premiums to 1.9 percent."), []);
  for (const s of ["about $1,450 a month", "1.2 to 2 million fewer people", "on September 29, 2026", "voted 48–51", "within 3 days"]) assert.ok(HAS_SPECIFIC.test(s), s);
  assert.ok(!HAS_SPECIFIC.test("It changes how plans are regulated."));
});

test("reasons, not mechanics", () => {
  const did = ["Bars members of Congress from buying stock in publicly traded companies."];
  assert.ok(mechanicsShare("It bars members of Congress from buying stock in publicly traded companies.", did) >= 0.8);
  assert.ok(mechanicsShare("A ban removes even the appearance that lawmakers profit from inside knowledge.", did) < 0.5);
});

const ok = { verdict: "correct", why: "matches" };
const reader = { whatItDoes: "It cancels new rules for health insurance people buy themselves on the government website.", whoIsAffected: "People who buy their own health plans; fewer might be signed up under the rule.",
  dailyLifeChange: "Someone shopping for a plan would not see the long, high-deductible plans.", wordsNotUnderstood: [] };

test("average-reader test: passes only when every answer is correct and specific and no word is flagged", () => {
  assert.equal(readerTestResult(reader, { whatItDoes: ok, whoIsAffected: ok, dailyLifeChange: ok, arguments: [] }).passed, true);
  const wrong = readerTestResult(reader, { whatItDoes: { verdict: "wrong", why: "The rule is not about Medicare." }, whoIsAffected: ok, dailyLifeChange: ok, arguments: [] });
  assert.equal(wrong.passed, false); assert.match(wrong.reasons[0], /got "What does this bill do\?" wrong/);
  assert.equal(readerTestResult(reader, { whatItDoes: ok, whoIsAffected: { verdict: "vague", why: "Could describe any bill." }, dailyLifeChange: ok, arguments: [] }).passed, false);
  const words = readerTestResult({ ...reader, wordsNotUnderstood: ["risk adjustment", "none"] }, { whatItDoes: ok, whoIsAffected: ok, dailyLifeChange: ok, arguments: [] });
  assert.equal(words.passed, false); assert.match(words.reasons[0], /"risk adjustment"/); assert.doesNotMatch(words.reasons[0], /"none"/);
});

test("average-reader test: a vague answer fails even if the second check lets it through; an unsupported reason fails", () => {
  for (const a of ["It changes some rules.", "It doesn't say.", "Not sure, something about health care.", "Rules."]) {
    const r = readerTestResult({ ...reader, whatItDoes: a }, { whatItDoes: ok, whoIsAffected: ok, dailyLifeChange: ok, arguments: [] });
    assert.equal(r.passed, false, a);
  }
  assert.ok(VAGUE_ANSWER.test("The bill changes some rules"));
  const arg = readerTestResult(reader, { whatItDoes: ok, whoIsAffected: ok, dailyLifeChange: ok, arguments: [{ side: "against", index: 0, supported: false, why: "The senator spoke for the resolution, not against it." }] });
  assert.equal(arg.passed, false); assert.match(arg.reasons[0], /case against argument 1 is not supported/);
});

test("floor record: who said what, without procedure or the vote list; the bill's actions as dated steps", () => {
  const rec = S.parseFloorSpeeches(fx("CREC-2026-09-29-pt1-PgS5139-2.htm"));
  assert.equal(rec.chamber, "Senate"); assert.equal(rec.date, "September 29, 2026");
  assert.deepEqual(rec.speeches.map(s => s.name), ["Baldwin"], "the presiding officer, the clerk and the absence announcement are not speakers");
  assert.match(rec.speeches[0].text, /up to 2 million Americans/);
  assert.ok(S.recordMentionsBill(rec.text, "sjres", 197));
  assert.deepEqual(S.crPageRefs(fx("billstatus-119sjres197.xml")), [{ chamber: "S", page: 5139, date: "2026-09-29", kind: "consideration" }]);
  assert.equal(S.crLinkUrl("2026-09-29", "S", 5139), "https://www.govinfo.gov/link/crec/172/S/5139?link-type=html");
  const house = S.parseFloorSpeeches(fx("CREC-2026-11-12-pt1-PgH6194-4.htm"));
  assert.ok(house.speeches.some(s => s.name === "Bost") && house.speeches.some(s => s.name === "Ruiz"));
  assert.match(house.budget, /about 58,000 Chapter 61 retirees/);
  const status = S.statusDoc(fx("billstatus-119sjres197.xml"), "https://www.congress.gov/");
  assert.match(status.text, /September 29, 2026: Motion to proceed to consideration of measure rejected in Senate by Yea-Nay Vote\. 48 - 51/);
});

test("the rule's own reasons and numbers come out of its preamble", () => {
  const p = JSON.parse(fx("fr-2026-10050-preamble.json"));
  assert.match(p.why, /more affordable coverage to consumers/);
  assert.match(p.impact, /average enrollment for 2027 to decrease between 1\.2 and 2 million enrollees/);
  assert.equal(p.effective, "July 20, 2026");
  assert.equal(S.frFullTextUrl("2026-05-20", "2026-10050"), "https://www.govinfo.gov/content/pkg/FR-2026-05-20/html/2026-10050.htm");
});

test("the voting question follows the new headline form", () => {
  assert.equal(questionFromHeadline("Blocks new 2027 rules for health plans people buy on HealthCare.gov."), "Do you support blocking new 2027 rules for health plans people buy on HealthCare.gov?");
  assert.equal(questionFromHeadline("Bans members of Congress from buying stocks and requires photo ID to vote."), "Do you support banning members of Congress from buying stocks and requiring photo ID to vote?");
  assert.ok(Object.keys(HEADLINE_VERBS).length >= 40);
});

test("\"Social Security\" and \"national security\" are not investing jargon; \"securities\" is", async () => {
  const { unexplainedJargon } = await import("../lib/analysis/standard.ts");
  assert.deepEqual(unexplainedJargon(["", "Social Security pays monthly income. The bill cites national security."]), []);
  assert.equal(unexplainedJargon(["", "Members may not buy securities."]).length, 1);
  assert.equal(unexplainedJargon(["", "A member who owns a security must sell it."]).length, 1);
});

// ── 17 Nov, first runs with the stronger writer: 1 of 5 passed the reader test; most failures were the test's own. ──
test("reader test: a correct answer that adds \"the note does not say more\" is an answer", async () => {
  const { couldNotAnswer, readerTestResult } = await import("../lib/analysis/standard.ts");
  const ok = { verdict: "correct", why: "matches" };
  assert.equal(couldNotAnswer("If it passed, some people buying their own insurance would keep the older, lower yearly cost limit. The note does not say anything more.", ok, 5), false);
  assert.equal(couldNotAnswer("It doesn't say.", ok, 5), true);
  assert.equal(couldNotAnswer("The note doesn't say what would change, so I'm not sure.", { verdict: "vague", why: "" }, 5), true);
  const reader = { whatItDoes: "It blocks a new rule for health plans people buy on their own.", whoIsAffected: "People who buy their own insurance, and the companies that sell it.",
    dailyLifeChange: "Some buyers would keep the older, lower yearly limit of $12,000 instead of $15,600. The note does not say more.", wordsNotUnderstood: ["HealthCare.gov", "combat-injured", "pooled"] };
  const judge = { whatItDoes: ok, whoIsAffected: ok, dailyLifeChange: ok, arguments: [] };
  assert.equal(readerTestResult(reader, judge, "Blocks new 2027 rules for health plans people buy on HealthCare.gov.").passed, true);
});

test("reader test: real jargon the note does not explain still fails; explained jargon does not", async () => {
  const { countedFlags } = await import("../lib/analysis/standard.ts");
  const note = "Teachers often save through workplace 403(b) plans, which are retirement accounts for many public schools. Today those plans cannot offer the pooled bank funds used in 401(k) plans.";
  assert.deepEqual(countedFlags(["pooled", "403(b)", "401(k)"], note, true), ["401(k)"]);
  assert.deepEqual(countedFlags(["deductible", "bronze plans"], "Some bronze plans can raise the deductible.", true), ["bronze plans"], "on the jargon list; \"deductible\" alone is a note when every answer was right");
  assert.deepEqual(countedFlags(["pooled"], note, false), ["pooled"], "when an answer was wrong or vague, every flag counts");
});
