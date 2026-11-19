// Finding a bill's floor debate in the Congressional Record (19 Nov 2026).
// The official link for a page of the Record lands on ONE item printed on that page, and not always the one about the
// bill. Two summaries (H.R. 1118 and S. 307) were written as if nobody had given reasons, although the House debated
// both. Every fixture here is the real page as govinfo serves it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../lib/analysis/sources.ts";

const fx = name => readFileSync(new URL(`./fixtures/sources/${name}`, import.meta.url), "utf8");
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const BASE = "https://www.govinfo.gov/content/pkg";

test("every item on the same page of the Record can be tried", () => {
  // The link for page H4656 lands on the second item, a debate on another bill.
  const landed = `${BASE}/CREC-2026-07-20/html/CREC-2026-07-20-pt1-PgH4656-2.htm`;
  assert.deepEqual(S.crPageItems(landed), [`${BASE}/CREC-2026-07-20/html/CREC-2026-07-20-pt1-PgH4656.htm`,
    `${BASE}/CREC-2026-07-20/html/CREC-2026-07-20-pt1-PgH4656-3.htm`, `${BASE}/CREC-2026-07-20/html/CREC-2026-07-20-pt1-PgH4656-4.htm`]);
  // Landed on the first item: the next two are tried. Landed on the fifth: all seven.
  assert.deepEqual(S.crPageItems(`${BASE}/CREC-2026-08-31/html/CREC-2026-08-31-pt1-PgH5268.htm`).map(u => u.split("-Pg")[1]), ["H5268-2.htm", "H5268-3.htm"]);
  assert.deepEqual(S.crPageItems(`${BASE}/CREC-2026-08-31/html/CREC-2026-08-31-pt1-PgH5347-5.htm`).map(u => u.split("-Pg")[1]),
    ["H5347.htm", "H5347-2.htm", "H5347-3.htm", "H5347-4.htm", "H5347-6.htm", "H5347-7.htm"]);
  assert.ok(S.crPageItems(`${BASE}/CREC-2026-08-31/html/CREC-2026-08-31-pt1-PgH5347-40.htm`).length <= 8, "never more than eight a page");
  // Anything that is not an item of the Record on govinfo is left alone: no address is built from an unknown one.
  for (const u of ["https://www.govinfo.gov/error", "https://example.org/CREC-2026-07-20-pt1-PgH4656-2.htm", "", "https://www.govinfo.gov/link/crec/172/H/4656?link-type=html"])
    assert.deepEqual(S.crPageItems(u), [], u);
});

test("H.R. 1118: the item the link lands on is another bill's debate; the right one is found beside it", () => {
  const wrong = S.parseFloorSpeeches(fx("CREC-2026-07-20-pt1-PgH4656-2.htm")), right = S.parseFloorSpeeches(fx("CREC-2026-07-20-pt1-PgH4656.htm"));
  assert.equal(S.floorWeight(wrong, "hr", 1118), 0, "the debate on H.R. 7283 says nothing about H.R. 1118");
  assert.ok(S.floorWeight(right, "hr", 1118) > 300);
  assert.deepEqual(right.speeches.map(s => s.name), ["Burlison", "Subramanyam"]);
  assert.match(right.speeches[0].text, /awarding contracts based on the best value instead of the lowest overall cost alternative/);
  assert.match(right.speeches[1].text, /choose these contracts based on best quality, not just lowest cost/);
  const picked = S.pickFloor([{ url: "a-2", weight: S.floorWeight(wrong, "hr", 1118) }, { url: "a", weight: S.floorWeight(right, "hr", 1118) }]);
  assert.deepEqual(picked.map(p => p.url), ["a"]);
});

test("S. 307: the roll-call page with two members' missed-vote notes is not a debate; the debate is", () => {
  const rollCall = S.parseFloorSpeeches(fx("CREC-2026-08-31-pt1-PgH5347-5.htm")), debate = S.parseFloorSpeeches(fx("CREC-2026-08-31-pt1-PgH5268.htm"));
  assert.ok(S.recordMentionsBill(rollCall.text, "s", 307), "the page does name the bill, in a member's note about a vote she missed");
  assert.deepEqual(rollCall.speeches, [], "a note about a missed vote is not a reason for or against a bill");
  assert.equal(S.floorWeight(rollCall, "s", 307), 0);
  assert.deepEqual(debate.speeches.map(s => s.name), ["Lee of Florida", "Raskin"]);
  assert.ok(S.floorWeight(debate, "s", 307) > 1000);
  assert.match(debate.speeches[0].text, /40 percent of them reported experiencing sexual harassment or sexual assault by an inmate/);
  // Senate passage by unanimous consent: two procedural requests, nobody giving a reason.
  const senate = S.parseFloorSpeeches(fx("CREC-2025-04-29-pt1-PgS2643-2.htm"));
  assert.deepEqual(senate.speeches, []); assert.equal(S.floorWeight(senate, "s", 307), 0);
  // The page of the debate is looked at even though two other references come first.
  const refs = S.crPageRefs(fx("billstatus-119s307.xml"), 4);
  assert.ok(refs.some(r => r.chamber === "H" && r.page === 5268), JSON.stringify(refs));
  assert.ok(!S.crPageRefs(fx("billstatus-119s307.xml")).some(r => r.page === 5268), "with only two references looked at, the debate's page was never opened");
});

test("missed-vote notes and procedural requests are left out; real speech is kept", () => {
  for (const t of ["Mr. Speaker, I was unable to vote during the series today. Had I been able to vote, I would have voted: YEA on Roll Call No. 284.",
    "Madam Speaker, had I been present, I would have voted yea.", "Mr. Speaker, I was unavoidably detained."]) assert.ok(S.MISSED_VOTE.test(t), t);
  for (const t of ["Madam President, I ask unanimous consent that the Committee on the Judiciary be discharged", "I ask unanimous consent that the bill be considered read a third time and passed",
    "Mr. Speaker, I ask unanimous consent that all Members may have 5 legislative days"]) assert.ok(S.UNANIMOUS_CONSENT.test(t), t);
  for (const t of ["Mr. Speaker, I rise in support of H.R. 1118.", "Mr. Speaker, I yield myself such time as I may consume. This bill allows GSA to consider best value."])
    assert.ok(!S.MISSED_VOTE.test(t) && !S.UNANIMOUS_CONSENT.test(t), t);
  // The debates already in the test set read as before: same speakers, nothing dropped.
  const house = S.parseFloorSpeeches(fx("CREC-2026-11-12-pt1-PgH6194-4.htm"));
  assert.ok(house.speeches.length >= 15 && house.speeches.some(s => s.name === "Bost") && house.speeches.some(s => s.name === "Ruiz"));
  assert.ok(S.floorWeight(house, "hr", 2102) > 3000);
  const senate = S.parseFloorSpeeches(fx("CREC-2026-09-29-pt1-PgS5139-2.htm"));
  assert.ok(senate.speeches.length >= 1 && S.floorWeight(senate, "sjres", 197) > 0);
});

test("weight: full when the item opens with the bill, a tenth when the bill is only mentioned further down, nothing without speech", () => {
  const speech = [{ speaker: "Mr. Doe", name: "Doe", text: Array(200).fill("word").join(" ") }];
  const opens = { text: `HEADING\n  Mr. DOE. I move to pass the bill (H.R. 55).\n${"x ".repeat(4000)}`, speeches: speech };
  const later = { text: `ANOTHER BILL\n${"x ".repeat(4000)} as we did in H.R. 55 last year`, speeches: speech };
  assert.equal(S.floorWeight(opens, "hr", 55), 200); assert.equal(S.floorWeight(later, "hr", 55), 20);
  assert.equal(S.floorWeight({ ...opens, speeches: [] }, "hr", 55), 0); assert.equal(S.floorWeight(opens, "hr", 56), 0);
  assert.equal(S.floorWeight(opens, "hr", 5), 0, "H.R. 55 is not H.R. 5");
  // The two fullest are kept, each item once, and an item with no weight never is.
  const picked = S.pickFloor([{ url: "a", weight: 20 }, { url: "b", weight: 900 }, { url: "c", weight: 0 }, { url: "b", weight: 900 }, { url: "d", weight: 300 }]);
  assert.deepEqual(picked.map(p => p.url), ["b", "d"]);
  assert.deepEqual(S.pickFloor([]), []);
});

test("the gatherer tries the page's other items and keeps the address of the item it used", () => {
  const g = read("lib/analysis/gather.ts");
  assert.match(g, /for \(const ref of crPageRefs\(input\.billStatusXml, 4\)\)/);
  assert.match(g, /if \(!opensWithBill\) for \(const url of crPageItems\(first\.url\)\)/);
  assert.match(g, /for \(const \[i, f\] of pickFloor\(found\)\.entries\(\)\)/);
  assert.match(g, /floorDoc\(i \? `FLOOR\$\{i \+ 1\}` : "FLOOR", f\.url, f\.rec\)/);
  assert.match(g, /floorDeadline = Date\.now\(\) \+ 75_000/, "the extra reading is bounded in time");
  // Still said plainly when a page holds no debate on the bill.
  assert.match(g, /No floor statements were found at Congressional Record/);
});
