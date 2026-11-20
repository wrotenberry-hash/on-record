// The weekly re-check must not take a sound summary off the page (owner, 19 Nov 2026: "Yes to all", point 3).
// It chose its rules with `promptVersion >= "b5"`, a comparison of text. As text "b11" sorts below "b5", so every summary
// from generator 10 on was checked by the rules for the oldest format, and 4 of the first 5 sampled were hidden for
// "Headline must start with Would", "needs exactly 2 arguments" and for citing a source the re-check does not fetch.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkSummary, SOURCE_CITE } from "../lib/analysis/checker.ts";
import { currentShape } from "../lib/analysis/prompt-order.ts";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// A real summary written by generator 10 (H.R. 2102), as the re-check sees it: the stored parts only, and the bill's own sections.
const DRAFT = {
  headline: "Lets about 58,000 combat-injured military retirees keep their full retirement pay.",
  whatItDoes: [
    { text: "Stops the cut to military retirement pay for people medically retired with a combat-related disability after fewer than 20 years of service.", section: "Sec. 2" },
    { text: "Raises the average affected retiree's income by about $1,450 a month, according to the budget office estimate printed in the House record.", section: "FLOOR" },
    { text: "Applies to payments starting the first full month after it becomes law. It does not repay money lost in earlier years.", section: "Sec. 2" }],
  whoItAffects: [
    { text: "About 58,000 medically retired service members with combat-related disabilities, a number the budget office expects to reach about 65,000 by 2036.", section: "FLOOR" },
    { text: "Taxpayers. The budget office estimates the bill adds about $13 billion from 2027 through 2036 to the gap between what the government spends and takes in.", section: "FLOOR" }],
  whatChangesForYou: "A soldier who was medically retired after 12 years because of a combat injury would get both payments in full. The budget office puts the average gain at about $1,450 a month. Most other people would see no change in their own pay.",
  caseFor: [
    { argument: "These veterans earned both payments and were forced to retire by their injuries; they did not choose to leave before 20 years.", attribution: "Rep. Ruiz (floor statement, November 12, 2026)", source: "FLOOR" },
    { argument: "The extra $1,450 a month is food on the table and bills paid, and can let a spouse cut back work hours to care for a wounded veteran.", attribution: "Rep. Elfreth (floor statement, November 12, 2026)", source: "FLOOR" }],
  caseAgainst: [
    { argument: "He supports ending the cut but says new veterans' benefits have to be paid for, and this bill is not. He prefers another veterans bill the House has passed.", attribution: "Rep. Bost (floor statement, November 12, 2026)", source: "FLOOR" }],
  unknowns: ["Why 18 House members voted no. None of them spoke in the debate.", "Whether the Senate will vote. The bill went to a Senate committee on November 12, 2026.",
    "How the cost would be covered. The budget office counts it as money the government would have to borrow."],
  confidence: "high", confidenceReason: "The bill is one short section, and the budget office estimate printed in the House record gives the numbers.",
};
const SECTIONS = [
  { num: "1", heading: "SHORT TITLE", text: "SECTION 1. SHORT TITLE. This Act may be cited as the ``Major Richard Star Act''." },
  { num: "2", heading: "EXPANSIONS OF ELIGIBILITY TO CERTAIN MILITARY RETIREES FOR CONCURRENT RECEIPT OF VETERANS' DISABILITY COMPENSATION AND RETIRED PAY",
    text: "SEC. 2. The retired pay of an eligible combat-related disabled uniformed services retiree, who is retired under chapter 61 of this title with fewer than 20 years of creditable service, is not subject to reduction under sections 5304 and 5305 of title 38. (c) Effective Date.--The amendments made by this section shall take effect on the first day of the first month beginning after the date of the enactment of this Act and shall apply to payments for months beginning on or after such date." }];
const TEXT = SECTIONS.map(s => s.text).join(" ");
const recheck = shape => checkSummary(DRAFT, SECTIONS, { subject: "Major Richard Star Act", fullText: TEXT, b5Shape: shape });

test("generator versions are compared by number when the re-check picks its rules", () => {
  for (const v of ["b5-2026-11-16", "b9-2026-11-17", "b10-2026-11-17", "b11-2026-11-17", "b12-2026-12-01", "b100-2027-01-01"]) assert.equal(currentShape(v), true, v);
  for (const v of ["b2-2026-11-16", "b4-2026-11-16", "", null, undefined, "nonsense"]) assert.equal(currentShape(v), false, String(v));
  // The mistake itself, kept here so it is plain what went wrong: as text, 10 and 11 sort below 5.
  assert.equal("b11-2026-11-17" >= "b5", false); assert.equal("b10-2026-11-17" >= "b5", false);
  const quality = read("lib/analysis/quality.ts");
  assert.match(quality, /b5Shape: currentShape\(s\.promptVersion\)/);
  assert.doesNotMatch(quality.replace(/\/\/.*$/gm, ""), /promptVersion\s*[<>]=?\s*"/, "no generator version is compared as text");
});

test("a sound summary from a current generator passes the weekly re-check", () => {
  const fixed = recheck(currentShape("b10-2026-11-17"));
  assert.deepEqual(fixed.failures, []);
  assert.equal(recheck(currentShape("b11-2026-11-17")).passed, true);
  // What the re-check did before: the same summary, judged by the rules for the oldest format.
  const before = recheck("b10-2026-11-17" >= "b5").failures.join(" | ");
  assert.match(before, /Headline must start with "Would"/);
  assert.match(before, /cites "FLOOR", which is not a section of this text or one of the sources/);
  assert.match(before, /Case against needs exactly 2 arguments; it has 1/);
});

test("the re-check still catches what it can check from the bill alone", () => {
  const bad = r => checkSummary({ ...DRAFT, ...r }, SECTIONS, { subject: "Major Richard Star Act", fullText: TEXT, b5Shape: true }).failures.join(" | ");
  assert.match(bad({ whatItDoes: [{ text: DRAFT.whatItDoes[0].text, section: "Sec. 9" }] }), /cites "Sec\. 9", which is not a section of this text/);
  assert.match(bad({ whatItDoes: [{ text: DRAFT.whatItDoes[0].text, section: "" }] }), /cites no section/);
  assert.match(bad({ caseAgainst: [DRAFT.caseAgainst[0], DRAFT.caseAgainst[0], DRAFT.caseAgainst[0]] }), /Case against needs at most 2 arguments; it has 3/);
  assert.match(bad({ unknowns: [] }), /What we don't know needs 1 to/);
  assert.match(bad({ whatChangesForYou: "" }), /What changes for you is empty/);
});

test("every kind of source citation is left alone when the sources are not in hand, and nothing else is", () => {
  for (const c of ["RULE", "REPORT", "CRS", "CBO", "BILL", "PRIMER", "FLOOR", "FLOOR2", "STATUS", "USC 10 §1413a", "floor"]) assert.ok(SOURCE_CITE.test(c), c);
  for (const c of ["Sec. 2", "Section 3(a)", "Full text", "§ 4", ""]) assert.ok(!SOURCE_CITE.test(c), c);
  // Each source the writer is given is on the list (lib/analysis/gather.ts and sources.ts name them).
  const ids = [...(read("lib/analysis/gather.ts") + read("lib/analysis/sources.ts")).matchAll(/id: "([A-Z]+)"/g)].map(m => m[1]);
  assert.ok(ids.length >= 6, "found the source ids");
  for (const id of ids) assert.ok(SOURCE_CITE.test(id), `${id} is a source citation the re-check must not fail`);
  for (const p of ["PRIMER", "FLOOR2"]) {
    const d = { ...DRAFT, whoItAffects: [{ text: DRAFT.whoItAffects[0].text, section: p }] };
    assert.deepEqual(checkSummary(d, SECTIONS, { subject: "Major Richard Star Act", fullText: TEXT, b5Shape: true }).failures, []);
  }
});

test("a summary the re-check cannot read the bill for is never hidden", () => {
  const q = read("lib/analysis/quality.ts");
  assert.match(q, /if \(!res\.ok\) throw new Error\(`bill text \$\{res\.status\}`\)/);
  assert.match(q, /action: error \|\| passed \? "none" : "held"/);
  assert.match(q, /if \(!error && failures\.length\) \{/);
});

test("a takedown made by the wrong rules is listed as the check's mistake, not as a rule the summary broke", async () => {
  const { judgedByWrongRules, RECHECK_FIXED_AT, RECHECK_MISTAKE } = await import("../lib/analysis/recheck-rules.ts");
  const before = Date.UTC(2026, 10, 18, 19, 5), after = Date.UTC(2026, 10, 25, 13, 5);
  assert.equal(judgedByWrongRules(before, "b11-2026-11-17"), true); assert.equal(judgedByWrongRules(before, "b10-2026-11-17"), true);
  assert.equal(judgedByWrongRules(before, "b5-2026-11-16"), false, "generators 5 to 9 sorted correctly as text, so their re-checks stand");
  assert.equal(judgedByWrongRules(before, "b9-2026-11-17"), false);
  assert.equal(judgedByWrongRules(before, "b2-2026-11-16"), false, "the oldest format was judged by its own rules");
  assert.equal(judgedByWrongRules(after, "b11-2026-11-17"), false, "after the fix a failure is a real one");
  assert.equal(judgedByWrongRules(RECHECK_FIXED_AT, "b11-2026-11-17"), false);
  assert.match(RECHECK_MISTAKE, /^Our mistake: an automatic check applied rules written for an older format/);
  const q = read("lib/analysis/quality.ts");
  assert.match(q, /reason: mistake \? RECHECK_MISTAKE : r\.failures\[0\]/);
  assert.match(q, /"taken down by mistake; not yet shown again"/);
  // The page prints "Rule it broke" only for a real failure.
  assert.match(read("app/corrections/page.tsx"), /\{f\.mistake \? f\.reason : <>Rule it broke: \{f\.reason\}<\/>\}/);
  // Nothing here puts a summary back: that stays an editor's decision after it has been read against its sources.
  const body = q.slice(q.indexOf("export async function wronglyHeldBillIds"));
  assert.doesNotMatch(body.slice(0, body.indexOf("\n}\n")), /\.update\(|\.insert\(|\.delete\(/);
  assert.doesNotMatch(read("app/api/automation/review-packets/route.ts"), /analysisBillSummaries\)\.set|\.update\(analysisBillSummaries/);
});

test("the summary limit is 75, inside the unchanged $25 monthly cap; older bills wait", () => {
  const g = read("lib/analysis/generate.ts");
  assert.match(g, /maxSummaries: num\(process\.env\.ANALYSIS_MAX_SUMMARIES, 75\)/); // owner, 20 Nov 2026: 50 to 75 for the last-90-days group
  // "Do NOT run the older 118 yet": a first summary is written only for a bill voted on in the last 90 days.
  assert.match(g, /freshWindowDays: num\(process\.env\.ANALYSIS_FRESH_WINDOW_DAYS, 90\)/);
  assert.match(g, /ranked\.filter\(c => c\.lastVote != null && Number\(c\.lastVote\) >= started - limits\.freshWindowDays \* 86_400_000\)/);
  assert.match(g, /: recentOnly;/);
  assert.match(g, /spendCapUsd: num\(process\.env\.ANALYSIS_SPEND_CAP_USD, 25\)/);
});
