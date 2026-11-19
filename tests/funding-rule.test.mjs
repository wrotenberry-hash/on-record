// "Funds" where a bill only allows spending (19 Nov 2026). Three summaries that passed every check said a bill funds a
// program or gives a sum when it only authorizes the money (H.R. 9640, H.R. 3276, H.R. 2140).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fundsWithoutMoney, fundingLine } from "../lib/analysis/funding-rule.ts";

// H.R. 2140 as written, with the sentences its sources gave.
const DERA = ["This bill reauthorizes through FY2029 the Diesel Emissions Reduction Act program.",
  "H.R. 2140 would reauthorize the Diesel Emissions Reduction Act (DERA) program through Fiscal Year 2029 at its current authorization level of $100 million annually.",
  "Section 797(a) of the Energy Policy Act of 2005 (42 U.S.C. 16137(a)) is amended by striking ``2024'' and inserting ``2029''."];

test("a headline or question that says a bill funds what it only authorizes is caught", () => {
  const f = fundsWithoutMoney({ headline: "Funds cleaner replacements for older diesel engines through 2029.", question: "Do you support funding cleaner replacements for older diesel engines through 2029?",
    plainEnglish: "This bill keeps a federal program running through 2029. It helps replace older diesel engines." }, DERA);
  assert.deepEqual(f.map(x => x.part), ["headline", "question"]);
  assert.match(fundingLine(f[0]), /^The headline opens by saying the bill funds or pays for something \(“Funds”\), but the sources say the bill only authorizes the money/);
  assert.match(fundingLine(f[1]), /^The question asks about funding or paying for something/);
  // H.R. 9640's wording: "gives $84 million".
  const g = fundsWithoutMoney({ headline: "Gives $84 million to rural water systems.", plainEnglish: "The bill gives $84 million over five years." }, ["There is authorized to be appropriated $84,000,000 for fiscal years 2027 through 2031."]);
  assert.deepEqual(g.map(x => x.part), ["headline", "plain English"]);
  assert.equal(fundsWithoutMoney({ headline: "Would fund nothing new.", plainEnglish: "The bill provides up to $200,000 a year for grants." }, ["authorized to be appropriated $200,000 for each fiscal year"]).length, 1);
});

test("the honest wordings pass", () => {
  for (const headline of ["Allows up to $100 million a year for cleaner diesel engines through 2029.", "Extends permission to spend on cleaner diesel engines through 2029.",
    "Keeps a diesel engine program eligible for money through 2029.", "Stops federal funds from going to states that miss the deadline.", "Changes how funding levels are reported to Congress."])
    assert.deepEqual(fundsWithoutMoney({ headline, question: "Do you support allowing up to $100 million a year for cleaner diesel engines?" }, DERA), [], headline);
});

test("a bill that does provide money may say so", () => {
  const approp = ["There is appropriated, out of any money in the Treasury not otherwise appropriated, $50,000,000 for fiscal year 2027.", "The program is authorized to be appropriated such sums afterwards."];
  assert.deepEqual(fundsWithoutMoney({ headline: "Funds disaster repairs with $50 million.", question: "Do you support funding disaster repairs?" }, approp), []);
  assert.deepEqual(fundsWithoutMoney({ headline: "Funds the government through January." }, ["Making continuing appropriations for fiscal year 2027."]), []);
  assert.deepEqual(fundsWithoutMoney({ headline: "Pays for veterans' benefits." }, ["CBO estimates the bill would increase direct spending by $13 billion."]), []);
});

test("with no word about money in the sources, the rule stays silent rather than guess", () => {
  assert.deepEqual(fundsWithoutMoney({ headline: "Funds a new office." }, ["The bill establishes an office in the Department of Justice."]), []);
  assert.deepEqual(fundsWithoutMoney({ headline: "", question: undefined }, DERA), []);
  assert.deepEqual(fundsWithoutMoney({ headline: "Funds a new office." }, []), []);
});

test("the rule is part of the written check, on the headline, the question and the plain-English part", () => {
  const c = readFileSync(new URL("../lib/analysis/checker.ts", import.meta.url), "utf8");
  assert.match(c, /for \(const f of fundsWithoutMoney\(\{ headline: d\.headline, question: d\.question, plainEnglish: d\.plainEnglish \}, src\.docs\.map\(x => x\.text\)\)\) fail\(fundingLine\(f\)\);/);
});
