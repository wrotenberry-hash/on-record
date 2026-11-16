// Summary rebuild b5 (owner review, 16 Nov 2026), with S.J.Res. 197 as the test case.
// Fixtures are official files saved on 16 Nov 2026: the Federal Register search for the disapproved rule,
// H. Rept. 119-390 (govinfo), 10 U.S.C. 1413a (govinfo) and the BILLSTATUS files for S.J.Res. 197 and H.R. 1013.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../lib/analysis/sources.ts";
import { checkSummary, unsupportedClaims, titleShare, agencyForms, attributionAllowed, CIRCULAR_CHANGE, HAS_EXAMPLE } from "../lib/analysis/checker.ts";

const fx = name => readFileSync(new URL(`./fixtures/sources/${name}`, import.meta.url), "utf8");
const TITLE = `A joint resolution providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Centers for Medicare & Medicaid Services of the Department of Health and Human Services relating to "Patient Protection and Affordable Care Act, HHS Notice of Benefit and Payment Parameters for 2027; and Basic Health Program".`;
const TEXT = `That Congress disapproves the rule submitted by the Centers for Medicare & Medicaid Services of the Department of Health and Human Services relating to "Patient Protection and Affordable Care Act, HHS Notice of Benefit and Payment Parameters for 2027; and Basic Health Program" (91 Fed. Reg. 30000 (May 20, 2026)), and such rule shall have no force or effect.`;
const cra = S.disapprovedRule(TITLE);
const rule = S.pickFederalRegisterRule(JSON.parse(fx("fr-search-nbpp2027.json")).results, cra.rule);
const RULE = S.federalRegisterDoc(rule);
const context = { title: TITLE, docs: [{ id: RULE.id, text: RULE.text }], agencies: [...S.frAgencies(rule), cra.agency],
  allowedFor: ["Sen. Tammy Baldwin, the sponsor"], allowedAgainst: ["the Centers for Medicare & Medicaid Services, which issued the rule"], needsBackground: true };

test("a disapproval resolution's title gives the rule and the agency; the Federal Register gives the final rule, not a correction or proposal", () => {
  assert.equal(cra.rule, "Patient Protection and Affordable Care Act, HHS Notice of Benefit and Payment Parameters for 2027; and Basic Health Program");
  assert.match(cra.agency, /^Centers for Medicare & Medicaid Services of the Department of Health and Human Services$/);
  assert.equal(rule.document_number, "2026-10050");
  assert.match(RULE.text, /user fee rates for issuers offering qualified health plans/);
  assert.match(RULE.text, /Basic Health Program/);
  assert.equal(S.disapprovedRule("A bill to amend title 10"), null);
});

test("committee reports: citation to govinfo package; purpose, background, minority views and the CBO section", () => {
  assert.deepEqual(S.committeeReportCitations(fx("billstatus-119hr1013.xml")), ["H. Rept. 119-390"]);
  assert.equal(S.reportPackage("H. Rept. 119-390"), "CRPT-119hrpt390");
  assert.equal(S.reportPackage("S. Rept. 118-12"), "CRPT-118srpt12");
  const r = S.parseCommitteeReport(fx("CRPT-119hrpt390.htm"));
  assert.equal(r.committee, "Committee on Financial Services");
  assert.equal(r.chamber, "House");
  assert.match(r.purpose, /Representative Frank Lucas/);
  assert.match(r.background, /401\(k\) plans/);
  assert.match(r.minority, /unregistered securities/);
  assert.ok(r.cbo, "the cost estimate section is found");
});

test("current law: U.S. Code cites in bill text, and the section text from govinfo", () => {
  assert.deepEqual(S.usCodeCites("Section 1413a(b)(3) of title 10, United States Code, is amended. Section 193 of the Atomic Energy Act of 1954 (42 U.S.C. 2243) is amended."),
    [{ title: "10", section: "1413a" }, { title: "42", section: "2243" }]);
  const doc = S.parseUsCodeSection(fx("usc-10-1413a.htm"), "10", "1413a");
  assert.equal(doc.id, "USC 10 §1413a");
  assert.match(doc.text, /^§1413a\. Combat-related special compensation/);
  assert.equal(S.changesExistingLaw(TITLE, TEXT), true);
  assert.equal(S.changesExistingLaw("A bill to name a post office", "The facility shall be known as"), false);
});

test("S.J.Res. 197: the headline that named Medicare and Medicaid fails; the agency's name is not a program", () => {
  const bad = "Would block a Health and Human Services rule for Medicare, Medicaid, and the Basic Health Program.";
  assert.deepEqual(unsupportedClaims(bad, [TITLE, TEXT, RULE.text], context.agencies), ["Medicare", "Medicaid"]);
  assert.ok(titleShare(bad, TITLE) > 0.8, "it also restates the title");
  const good = "Would block the 2027 Affordable Care Act marketplace rule that sets insurer fees and plan standards.";
  assert.deepEqual(unsupportedClaims(good, [TITLE, TEXT, RULE.text], context.agencies), []);
  assert.deepEqual(unsupportedClaims("Do you support blocking the 2027 ACA marketplace rule?", [TITLE, RULE.text], context.agencies), [], "ACA is the initials of Affordable Care Act");
  assert.ok(agencyForms(["Health and Human Services Department"]).includes("Department of Health and Human Services"));
});

test("what changes for you: circular wording fails, a concrete person passes", () => {
  assert.ok(CIRCULAR_CHANGE.test("Most people would notice no direct change. The bill would only matter if you are affected by the rule that would be set aside."));
  assert.ok(HAS_EXAMPLE.test("A family buying a 2027 marketplace plan would pay under the earlier fee rules."));
  assert.ok(!HAS_EXAMPLE.test("Insurers would follow earlier rules."));
});

test("attributions: only actors in the record; generic labels fail", () => {
  assert.ok(attributionAllowed("Sen. Tammy Baldwin, the sponsor", context.allowedFor));
  assert.ok(attributionAllowed("the Centers for Medicare & Medicaid Services", context.allowedAgainst));
  assert.ok(!attributionAllowed("budget analysts", context.allowedFor));
  assert.ok(!attributionAllowed("the resolution's sponsor", ["Sen. Tammy Baldwin, the sponsor"]));
});

const b4 = { // what the b4 generator wrote for S.J.Res. 197 on 16 Nov (23:24 UTC), with the new fields filled as it would have
  headline: "Would block a Health and Human Services rule for Medicare, Medicaid, and the Basic Health Program.",
  plainEnglish: "This resolution would disapprove the Centers for Medicare & Medicaid Services rule on 2027 benefit and payment parameters and the Basic Health Program. The rule would have no force or effect.",
  background: "", backgroundSources: [], question: "Do you support the joint resolution providing for congressional disapproval of the rule?",
  whatItDoes: [{ text: "Congress would disapprove the Centers for Medicare & Medicaid Services rule on 2027 benefit and payment parameters and the Basic Health Program.", section: "Full text" }],
  whoItAffects: [{ text: "People and plans covered by the 2027 benefit and payment parameters would be affected through the withdrawn rule.", section: "Full text" }],
  whatChangesForYou: "Most people would notice no direct change. The bill would only matter if you are affected by the rule that would be set aside.",
  caseFor: [{ argument: "It would stop the 2027 rule from taking effect, so Congress would keep control over the policy change.", attribution: "the resolution's sponsor", source: "Full text" }],
  caseAgainst: [{ argument: "It would cancel a rule the agency already submitted, so planned changes for 2027 would not move forward.", attribution: "the Centers for Medicare & Medicaid Services", source: "RULE" }],
  unknowns: ["The text does not describe what the rule would change."], confidence: "low", confidenceReason: "The text only disapproves one rule by name." };

test("S.J.Res. 197 regression: the b4 summary fails the b5 checks for every problem the owner found", () => {
  const f = checkSummary(b4, [], { fullText: TEXT, sources: context }).failures.join("\n");
  assert.match(f, /headline names "Medicare", "Medicaid"/);
  assert.match(f, /headline restates the official title/);
  assert.match(f, /Background is required/);
  assert.match(f, /What changes for you is circular/);
  assert.match(f, /attributed to "the resolution's sponsor", who is not in the record/);
});

test("S.J.Res. 197: a summary built from the rule's own summary passes", () => {
  const good = { ...b4,
    headline: "Would block the 2027 Affordable Care Act marketplace rule that sets insurer fees and plan standards.",
    plainEnglish: "This resolution would cancel the 2027 Affordable Care Act marketplace rule. That rule sets fees that insurers pay to sell plans on federal exchanges and changes plan standards. The Senate voted not to take it up, so the rule stays in place for now.",
    background: "The rule sets 2027 user fee rates for insurers on Federally-facilitated Exchanges, allows catastrophic plans with terms of up to 10 years, and changes who counts in Basic Health Program payments to states.",
    backgroundSources: ["RULE"], question: "Do you support blocking the 2027 Affordable Care Act marketplace rule?",
    whatItDoes: [{ text: "Congress would disapprove the 2027 marketplace payment rule, and the rule would have no force or effect.", section: "Full text" }],
    whoItAffects: [{ text: "Issuers offering qualified health plans through Federally-facilitated Exchanges, which pay the 2027 user fees the rule sets.", section: "RULE" },
      { text: "States with a Basic Health Program, whose federal payments the rule changes.", section: "RULE" }],
    whatChangesForYou: "A person buying a catastrophic plan on a federal exchange could lose the rule's option of plan terms of up to 10 years. Insurer user fees for 2027 would fall back to earlier rules.",
    caseFor: [{ argument: "Blocking it would stop the rule's 2027 user fees, agent standards and plan changes from applying to marketplace insurers and enrollees.", attribution: "Sen. Tammy Baldwin, the sponsor", source: "RULE" }],
    caseAgainst: [{ argument: "The agency says the rule improves how the Affordable Care Act works, including user fee rates, catastrophic plan options and payment parameters.", attribution: "the Centers for Medicare & Medicaid Services, which issued the rule", source: "RULE" }],
    unknowns: ["No CBO estimate is listed, so the budget effect of blocking the rule is not shown."], confidence: "medium", confidenceReason: "The rule's own summary is clear, but its full effects depend on its long text." };
  const r = checkSummary(good, [], { fullText: TEXT, sources: context });
  assert.deepEqual(r.failures, []);
});

test("a resolution with no numbered sections is now checked against its full text", () => {
  const r = checkSummary({ ...b4, whatItDoes: [{ text: "Raises the minimum wage for restaurant workers in every state.", section: "Full text" }] }, [], { fullText: TEXT, sources: context });
  assert.match(r.failures.join("\n"), /What it does point 1 shares no key words with Full text/);
});
