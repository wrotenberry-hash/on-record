// Primers and the "today → if this passes" structure (owner instruction, 17 Nov 2026).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRIMERS, primersFor, primerSourceText } from "../lib/analysis/primers.ts";
import { unexplainedJargon, unexplainedAcronyms, vagueChangeRow, pageTestResult, fillerIn } from "../lib/analysis/standard.ts";
import { plainGrade } from "../lib/analysis/checker.ts";
import * as S from "../lib/analysis/sources.ts";

const fx = name => readFileSync(new URL(`./fixtures/sources/${name}`, import.meta.url), "utf8");

for (const p of PRIMERS) test(`primer "${p.title}" meets the same written rules as a summary`, () => {
  assert.ok(p.bullets.length >= 3 && p.bullets.length <= 5, "3 to 5 bullets");
  for (const b of p.bullets) assert.ok(b.split(/\s+/).length <= 55, `bullet too long: ${b.slice(0, 40)}`);
  assert.deepEqual(unexplainedJargon(["", ...p.bullets]).map(x => x.term), [], "no unexplained jargon");
  assert.deepEqual(unexplainedAcronyms(p.bullets), [], "no bare abbreviations");
  assert.deepEqual(fillerIn(p.bullets.join(" ")), []);
  assert.ok(plainGrade(p.bullets.join(" ")) <= 10, `reading grade ${plainGrade(p.bullets.join(" "))}`);
  assert.ok(p.sources.length >= 1 && p.sources.every(s => /^https:\/\/(www\.govinfo\.gov|www\.senate\.gov|www\.healthcare\.gov|www\.medicare\.gov|www\.medicaid\.gov|www\.cms\.gov|www\.cbo\.gov|www\.cbp\.gov|www\.ssa\.gov)\//.test(s.url)), "official sources only");
  assert.match(p.lawAsOf, /^\d{4}-\d{2}-\d{2}$/);
});

test("primers are used only after the owner approves them", () => {
  const actions = S.statusDoc(fx("billstatus-119sjres197.xml"), "x").text;
  const title = `A joint resolution providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Centers for Medicare & Medicaid Services of the Department of Health and Human Services relating to "Patient Protection and Affordable Care Act, HHS Notice of Benefit and Payment Parameters for 2027; and Basic Health Program".`;
  const all = primersFor({ title, text: "", actions }, true).map(p => p.id);
  assert.deepEqual(all, ["cancel-agency-rule", "vote-to-start-debate", "health-plans-healthcare-gov"]);
  const reviewed = primersFor({ title, text: "", actions }).map(p => p.id);
  assert.deepEqual(reviewed, PRIMERS.filter(p => p.reviewed && all.includes(p.id)).map(p => p.id));
});

test("primers match the right bills and not the others", () => {
  const a7008 = S.statusDoc(fx("billstatus-119hr7008.xml"), "x").text, t7008 = fx("BILLS-119hr7008pcs.htm");
  assert.deepEqual(primersFor({ title: "Stop Insider Trading Act", text: t7008, actions: a7008 }, true).map(p => p.id), ["sixty-votes"]);
  const a2102 = S.statusDoc(fx("billstatus-119hr2102.xml"), "x").text, t2102 = fx("BILLS-119hr2102eh.htm");
  assert.deepEqual(primersFor({ title: "To amend title 10", text: t2102, actions: a2102 }, true).map(p => p.id), ["military-retirement-disability-pay"]);
  assert.match(primerSourceText(primersFor({ title: "To amend title 10", text: t2102, actions: a2102 }, true)), /dollar for dollar/);
});

test("what would change: a vague row fails, a concrete one passes", () => {
  assert.ok(vagueChangeRow({ today: "Current rules apply to plans.", ifPassed: "Some rules would change.", source: "RULE" }));
  assert.ok(vagueChangeRow({ today: "The program has certain requirements.", ifPassed: "The program would have new requirements.", source: "RULE" }));
  assert.ok(vagueChangeRow({ today: "Same.", ifPassed: "No change", source: "RULE" }));
  assert.equal(vagueChangeRow({ today: "Insurers pay a fee of 1.9 percent of premiums for 2027.", ifPassed: "The fee goes back to 2.5 percent.", source: "RULE" }), null);
  assert.equal(vagueChangeRow({ today: "Members of Congress may buy stock in any company.", ifPassed: "They may not buy stock in publicly traded companies.", source: "Sec. 2" }), null, "a clear rule flip needs no number");
});

const ok = { verdict: "correct", why: "matches" };
test("page reader test: must describe today, the exact change and who is affected", () => {
  const good = { howItWorksToday: "People buy their own insurance on a government site and many get help paying each month.", whatChanges: "A rule that lets cheap plans last 10 years and lets buyers owe up to $15,600 a year would be cancelled.", whoIsAffected: "People who buy their own health insurance, and the insurance companies that sell it." };
  assert.equal(pageTestResult(good, { howItWorksToday: ok, whatChanges: ok, whoIsAffected: ok }).passed, true);
  const r = pageTestResult({ ...good, howItWorksToday: "It doesn't say." }, { howItWorksToday: ok, whatChanges: ok, whoIsAffected: ok });
  assert.equal(r.passed, false); assert.match(r.reasons[0], /How do things work today/);
  assert.equal(pageTestResult(good, { howItWorksToday: ok, whatChanges: { verdict: "wrong", why: "The limit is $15,600, not $1,560." }, whoIsAffected: ok }).passed, false);
  assert.equal(pageTestResult(good, { howItWorksToday: ok, whatChanges: ok, whoIsAffected: { verdict: "vague", why: "Says only 'people'." } }).passed, false);
});

// Owner review, 17 Nov: on the S.J.Res. 197 card the reader reached the fourth bullet before learning what the old
// rule was, what the new rule is, or what changed, and then only as "raises the most some buyers can owe".
test("a change stated without its number fails; the same change with the number passes", async () => {
  const { unquantifiedChanges } = await import("../lib/analysis/standard.ts");
  assert.equal(unquantifiedChanges("The 2027 rule lets a plan last longer. It also raises the most some buyers can owe in a year and cuts a fee insurers pay.").length, 1);
  assert.deepEqual(unquantifiedChanges("The rule raises the most one person can owe in a year from $12,000 to $15,600."), []);
  assert.deepEqual(unquantifiedChanges("The government helps many buyers pay with a tax credit that lowers the monthly price."), [], "how something works is not a claim about a change");
});

test("a bill that cancels a rule must give all three states in every row: before the rule, today, if this passes", async () => {
  const { checkSummary } = await import("../lib/analysis/checker.ts");
  const { GOLD_EXAMPLES } = await import("../lib/analysis/gold-examples.ts");
  const g = structuredClone(GOLD_EXAMPLES.find(x => x.billId === "119-sjres-197").summary);
  assert.ok(g.changes.every(r => r.label && r.before && r.today && r.ifPassed), "the gold example has all three");
  assert.match(g.plainEnglish, /\$12,000/); assert.match(g.plainEnglish, /\$15,600/);
  const ctx = { title: "x", docs: [{ id: "RULE", text: g.changes.map(r => `${r.label} ${r.before} ${r.today} ${r.ifPassed}`).join(" ") + " HealthCare.gov May July September 2026 2027" }, { id: "PRIMER", text: "" }], agencies: [], allowedFor: [], allowedAgainst: [], needsBackground: false, structure: true, cancelsRule: true };
  delete g.changes[0].before;
  const f = checkSummary(g, [], { fullText: "resolution", sources: ctx }).failures.join("\n");
  assert.match(f, /row 1 does not say what the old rule was/);
});
