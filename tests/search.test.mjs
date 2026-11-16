import test from "node:test";
import assert from "node:assert/strict";
import { rank, editDistance, parseBillNumber, tokens } from "../lib/search-rank.ts";
import { glossParts, GLOSSARY } from "../lib/glossary.ts";

const docs = [
  { kind: "issue", id: "health-care", title: "Health care", extra: "medicare medicaid insurance prescription drugs", href: "/issues/health-care" },
  { kind: "issue", id: "guns", title: "Guns", extra: "firearms background checks", href: "/issues/guns" },
  { kind: "member", id: "C001098", title: "Ted Cruz", extra: "TX Republican senator", href: "/politicians/C001098" },
  { kind: "member", id: "P000197", title: "Nancy Pelosi", extra: "CA Democrat representative", href: "/politicians/P000197" },
  { kind: "bill", id: "119-hr-2102", title: "Major Richard Star Act", label: "H.R. 2102", extra: "veterans pensions", href: "/bills/119-hr-2102" },
  { kind: "bill", id: "119-hr-2347", title: "Lower Drug Prices for Seniors Act", label: "H.R. 2347", extra: "prescription drugs medicare", href: "/bills/119-hr-2347" },
  { kind: "bill", id: "119-s-45", title: "Rural Broadband Act", label: "S. 45", href: "/bills/119-s-45" },
];

test("bill numbers in any common spelling go straight to the bill", () => {
  for (const q of ["HR 2102", "h.r.2102", "H.R. 2102", "hr2102"]) assert.equal(rank(q, docs)[0].id, "119-hr-2102", q);
  assert.equal(rank("S 45", docs)[0].id, "119-s-45");
  assert.deepEqual(parseBillNumber("hjres 12"), { billType: "hjres", number: 12 });
  assert.equal(parseBillNumber("insulin"), null);
});

test("typos are forgiven: one for short words, two for long ones", () => {
  assert.equal(rank("Pelosy", docs)[0].id, "P000197");
  assert.equal(rank("perscription", docs).some(r => r.id === "119-hr-2347"), true);
  assert.equal(rank("medicaire", docs)[0].id, "health-care");
  assert.equal(rank("cruz", docs)[0].id, "C001098");
  assert.equal(rank("gun", docs)[0].id, "guns");
  assert.equal(rank("zzzz", docs).length, 0);
  assert.equal(editDistance("teh", "the"), 1);
  assert.equal(editDistance("kitten", "sitting", 2), 3);
});

test("every query word must match, and stop words are ignored", () => {
  assert.equal(rank("the drug prices act", docs)[0].id, "119-hr-2347");
  assert.equal(rank("drug broadband", docs).length, 0);
  assert.deepEqual(tokens("The Lower-Drug Prices Act"), ["lower", "drug", "prices"]);
});

test("glossary terms are marked once each, longest match first", () => {
  const parts = glossParts("On Motion to Suspend the Rules and Pass, as Amended; cloture motion; Cloture again");
  const terms = parts.filter(p => p.term).map(p => p.term);
  assert.deepEqual(terms, ["suspend the rules", "cloture"]);
  assert.equal(parts.map(p => p.text).join(""), "On Motion to Suspend the Rules and Pass, as Amended; cloture motion; Cloture again");
  for (const [k, v] of Object.entries(GLOSSARY)) assert.ok(v.split(/\s+/).length <= 40, `${k} definition too long`);
});
