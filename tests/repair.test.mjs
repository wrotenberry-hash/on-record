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
  assert.deepEqual(unexplainedJargon(["", "Plans sold on the Exchange change."]).map(x => x.term), ["Exchange"]);
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
