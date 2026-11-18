// The first real run of the b7 generator (17 Nov 2026, 02:06 UTC): five summaries, none passed the written rules in
// three tries, so the average-reader test never ran. These tests use those five drafts as they were written.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repairCitation, repairDraft } from "../lib/analysis/repair.ts";
import { HAS_EXAMPLE, plainStatesAChange, readingFields } from "../lib/analysis/checker.ts";
import { unexplainedAcronyms, unexplainedJargon } from "../lib/analysis/standard.ts";
import { GOLD_EXAMPLES } from "../lib/analysis/gold-examples.ts";

const RUN = JSON.parse(readFileSync(new URL("./fixtures/run-2026-11-17/drafts.json", import.meta.url), "utf8"));
const ctx = id => ({ sourceIds: RUN[id].sourceIds, numberedSections: id !== "119-sjres-197" });

test("false alarm: a company or a soldier and what happens to them is a concrete example", () => {
  assert.match(RUN["119-hr-9612"].draft.whatChangesForYou, HAS_EXAMPLE);
  assert.match(RUN["119-hr-2102"].draft.whatChangesForYou, HAS_EXAMPLE);
  assert.deepEqual(RUN["119-hr-9612"].failures.length, 1, "this was the only reason H.R. 9612 was held");
  assert.doesNotMatch("It only matters if the rule applies to you.", HAS_EXAMPLE);
  assert.doesNotMatch("People could see different costs.", HAS_EXAMPLE);
});

test("false alarm: the names of laws and agencies are not the insurance marketplace or investing jargon", () => {
  const names = ["", "The bill amends the Securities Exchange Act of 1934. The Securities and Exchange Commission enforces it. Shares trade on a stock exchange."];
  assert.deepEqual(unexplainedJargon(names).map(x => x.term), []);
  assert.deepEqual(unexplainedJargon(["", "Health plans sold on the Exchange change."]).map(x => x.term), ["Exchange"]);
  // 18 Nov 2026, H.R. 4795: an everyday "exchange" in a bill that has nothing to do with health coverage.
  assert.deepEqual(unexplainedJargon(["", "The bill bars federal money for academic exchange programs with the university."]).map(x => x.term), []);
  assert.deepEqual(unexplainedJargon(["Cut insurance costs", "People who buy a plan on an exchange would pay less."]).map(x => x.term), ["exchange"], "the health subject can be named in another part");
  assert.deepEqual(unexplainedJargon(["", "Members may not buy securities."]).map(x => x.term), ["securities"]);
});

test("a citation is repaired to one valid source", () => {
  const c = { sourceIds: ["CRS", "REPORT", "FLOOR", "STATUS"], numberedSections: true };
  assert.equal(repairCitation("CRS; REPORT; FLOOR", c), "CRS");
  assert.equal(repairCitation("Sec. 2(a), Sec. 2(b), Sec. 2(c)", c), "Sec. 2(a), Sec. 2(b), Sec. 2(c)");
  assert.equal(repairCitation("floor", c), "FLOOR");
  assert.equal(repairCitation("Bill text", { sourceIds: ["RULE"], numberedSections: false }), "Full text");
  assert.equal(repairCitation("Bill text", c), "Bill text", "a bill with numbered sections must cite the section");
  assert.equal(repairCitation("PRIMER and RULE", { sourceIds: ["RULE"], numberedSections: false }), "RULE");
});

test("jargon from the reviewed list gets its plain-words explanation at the first use; the headline is left for the model", () => {
  const { draft, notes } = repairDraft(RUN["119-sjres-197"].draft, ctx("119-sjres-197"));
  assert.equal(draft.whatItDoes[0].section, "Full text");
  const fields = readingFields(draft), left = unexplainedJargon(fields.map(f => f.get()));
  assert.deepEqual(left.filter(t => fields[t.part].kind === "text").map(t => t.term), [], "every term in running text is explained");
  assert.ok(left.some(t => t.part === 0 && /Basic Health Program/.test(t.term)), "the headline still fails: it has no room for an explanation");
  assert.match(JSON.stringify(draft), /user fees \(a charge insurers pay to sell plans on the government site\)/);
  assert.ok(notes.length >= 5);
  assert.equal(draft.headline, RUN["119-sjres-197"].draft.headline, "the headline is never touched");
});

test("an abbreviation the sources use is spelled out at its first use", () => {
  const { draft } = repairDraft(RUN["119-hr-7008"].draft, ctx("119-hr-7008"));
  assert.deepEqual(unexplainedAcronyms(readingFields(draft).slice(1).map(f => f.get())), []);
  assert.match(JSON.stringify(draft.unknowns), /Congressional Budget Office \(CBO\)/);
  assert.match(JSON.stringify(draft), /notary \(an official witness to a signature\)/);
});

test("a source id written into a sentence is removed", () => {
  const d = structuredClone(RUN["119-hr-9612"].draft);
  d.unknowns = ["The REPORT does not say how many plants would use this (STATUS; FLOOR)."];
  const { draft } = repairDraft(d, ctx("119-hr-9612"));
  assert.equal(draft.unknowns[0], "The committee report does not say how many plants would use this.");
});

test("the repair step leaves the approved gold examples exactly as written", () => {
  for (const g of GOLD_EXAMPLES) {
    const r = repairDraft(g.summary, { sourceIds: ["RULE", "FLOOR", "STATUS", "PRIMER", "REPORT", "CRS", "CBO"], numberedSections: g.billId !== "119-sjres-197" });
    assert.deepEqual(r.notes, [], `${g.billId}: ${r.notes.join("; ")}`);
    assert.deepEqual(r.draft, g.summary);
  }
});

test("a bill that cancels a rule: the plain-English part must give one change with the old figure and the new one", () => {
  const g = GOLD_EXAMPLES.find(x => x.billId === "119-sjres-197").summary;
  assert.equal(plainStatesAChange(g.plainEnglish, g.changes), true);
  assert.equal(plainStatesAChange(RUN["119-sjres-197"].draft.plainEnglish, g.changes), false, "the run's version said only that the rule \"changes costs, plan choices, and enrollment checks\"");
  assert.equal(plainStatesAChange("The rule changes who may vote.", [{ before: "Any member may vote.", today: "Only chairs may vote." }]), true, "rows without figures are not asked for figures");
});

// ── The second real run (17 Nov, 02:44 UTC, generator b8): three summaries, all held again. ──
test("a section repeated in brackets inside a point is removed; the citation has its own field", () => {
  const { draft } = repairDraft(RUN["119-hr-7008"].draft, ctx("119-hr-7008"));
  assert.doesNotMatch(draft.whatItDoes[0].text, /\[Sec\. 2\]/);
  assert.equal(draft.whatItDoes[0].section, "Sec. 2");
});

test("a term the writer explained in running text is not explained twice", async () => {
  const { unexplainedJargon, plainWordsNearby } = await import("../lib/analysis/standard.ts");
  const t = "The rule sets the 2027 user fee, the charge insurers pay to sell plans on the federal site, at $0.18 per member per month.";
  assert.deepEqual(unexplainedJargon(["", t]), []);
  assert.equal(plainWordsNearby("a notary public's witness to the signature.", 8, "an official witness to a signature"), false, "two of three words is not an explanation");
});

test("a rewrite keeps every part its failures were not about", async () => {
  const { keepWhatWasRight } = await import("../lib/analysis/repair.ts");
  const g = structuredClone(GOLD_EXAMPLES.find(x => x.billId === "119-sjres-197").summary);
  const next = structuredClone(g);
  next.whyNow = "The Senate voted 48–51 on September 29, 2026, against taking it up.";
  for (const r of next.changes) delete r.before; // what the model did on its third try
  const r = keepWhatWasRight(g, next, ["Why now is 3 sentences; use one or two."]);
  assert.equal(r.draft.whyNow, next.whyNow, "the part that failed is taken from the rewrite");
  assert.deepEqual(r.draft.changes, g.changes, "the rows, which had been right, are kept");
  assert.deepEqual(r.kept, ["changes"]);
  const whole = keepWhatWasRight(g, next, ["Loaded words: giveaway."]);
  assert.deepEqual(whole.draft, next, "a failure that could be anywhere takes the rewrite whole");
});

test("false alarms from the second run", async () => {
  const { unsupportedClaims } = await import("../lib/analysis/checker.ts");
  const { HAS_SPECIFIC } = await import("../lib/analysis/standard.ts");
  assert.deepEqual(unsupportedClaims("The Congressional Research Service (CRS) says 403(b) plans are for schools and charities.", ["403(b) plans are retirement plans for public schools and charities."], []), []);
  assert.match("The change starts on the first day of the first month after enactment.", HAS_SPECIFIC);
  assert.deepEqual(unsupportedClaims("The rule covers Medicare.", ["a rule about health plans"], []), ["Medicare"], "the check itself still works");
});
