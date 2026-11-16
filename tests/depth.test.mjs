import test from "node:test";
import assert from "node:assert/strict";
import { parseActions, stageOf, lifecycle, parseAmendments, amendmentOutcome, amendmentLine, parseTextVersions, compareSections, parseCommittees,
  parseCommitteeMembership, committeeIdFromSystemCode, parseHouseFloor, parseSenateFloor, weekOf, houseFloorUrl, districtsFromCensus, stateForZip,
  tallyMismatches } from "../lib/federal/depth-parse.ts";

// Congress.gov v3 /bill/{c}/{t}/{n}/actions shape (newest first), per the LoC API documentation.
const actions = { actions: [
  { actionCode: "36000", actionDate: "2025-07-04", sourceSystem: { code: 9, name: "Library of Congress" }, text: "Became Public Law No: 119-21.", type: "BecameLaw" },
  { actionCode: "E40000", actionDate: "2025-07-04", sourceSystem: { code: 9, name: "Library of Congress" }, text: "Signed by President.", type: "President" },
  { actionCode: "E20000", actionDate: "2025-07-03", sourceSystem: { code: 9, name: "Library of Congress" }, text: "Presented to President.", type: "Floor" },
  { actionCode: "H38310", actionDate: "2025-07-03", sourceSystem: { code: 2, name: "House floor actions" }, text: "On motion that the House agree to the Senate amendment Agreed to by the Yeas and Nays: 218 - 214 (Roll no. 190).", type: "Floor",
    recordedVotes: [{ chamber: "House", rollNumber: 190, sessionNumber: 1, date: "2025-07-03T18:28:08Z" }] },
  { actionCode: "17000", actionDate: "2025-07-01", sourceSystem: { code: 0, name: "Senate" }, text: "Passed/agreed to in Senate: Passed Senate with an amendment by Yea-Nay Vote. 51 - 50. Record Vote Number: 372.", type: "Floor" },
  { actionDate: "2025-06-30", sourceSystem: { code: 0, name: "Senate" }, text: "Amendment SA 2360 agreed to in Senate by Yea-Nay Vote. 51 - 49.", type: "Floor" },
  { actionCode: "8000", actionDate: "2025-05-22", sourceSystem: { code: 9, name: "Library of Congress" }, text: "Passed/agreed to in House: On passage Passed by recorded vote: 215 - 214, 1 Present (Roll no. 145).", type: "Floor" },
  { actionCode: "H12200", actionDate: "2025-05-20", sourceSystem: { code: 2, name: "House floor actions" }, text: "Reported (Amended) by the Committee on Budget. H. Rept. 119-106.", type: "Committee", committees: [{ name: "Budget Committee", systemCode: "hsbu00" }] },
  { actionCode: "H11100", actionDate: "2025-05-20", sourceSystem: { code: 2, name: "House floor actions" }, text: "Referred to the House Committee on the Budget.", type: "IntroReferral", committees: [{ name: "Budget Committee", systemCode: "hsbu00" }] },
  { actionCode: "Intro-H", actionDate: "2025-05-20", sourceSystem: { code: 9, name: "Library of Congress" }, text: "Introduced in House", type: "IntroReferral" },
], pagination: { count: 10 } };

test("actions parse oldest first with chamber, committees and recorded votes", () => {
  const a = parseActions(actions);
  assert.equal(a.length, 10);
  assert.equal(a[0].actionDate, "2025-05-20");
  assert.equal(a.at(-1).text, "Became Public Law No: 119-21.");
  const house = a.find(x => x.actionCode === "H38310");
  assert.equal(house.chamber, "house");
  assert.deepEqual(house.rollCalls, [{ chamber: "house", rollNumber: 190, session: 1, date: "2025-07-03T18:28:08Z" }]);
  assert.deepEqual(a.find(x => x.actionCode === "H11100").committees, ["hsbu00"]);
  assert.deepEqual(parseActions(null), []);
  assert.deepEqual(parseActions({ actions: "nope" }), []);
});

test("stages: passage is not confused with an amendment, a failed vote or a committee report with an amendment", () => {
  assert.equal(stageOf({ text: "Amendment SA 2360 agreed to in Senate by Yea-Nay Vote. 51 - 49.", type: "Floor" }), null);
  assert.equal(stageOf({ text: "Passed/agreed to in Senate: Passed Senate with an amendment by Yea-Nay Vote. 51 - 50.", type: "Floor" }), "passed_first");
  assert.equal(stageOf({ text: "Failed of passage/not agreed to in House: On passage Failed by the Yeas and Nays: 200 - 220.", type: "Floor" }), "failed");
  assert.equal(stageOf({ text: "Reported (Amended) by the Committee on Budget. H. Rept. 119-106.", type: "Committee" }), "committee");
  assert.equal(stageOf({ text: "Motion to proceed to consideration of measure agreed to in Senate by Yea-Nay Vote.", type: "Floor" }), null);
  assert.equal(stageOf({ text: "Presented to President.", type: "Floor" }), "president");
  assert.equal(stageOf({ text: "Vetoed by President.", type: "Veto" }), "vetoed");
  assert.equal(stageOf({ text: "Sponsor introductory remarks on measure.", type: "IntroReferral" }), "introduced");
  assert.equal(stageOf({ text: "Cosponsor added.", type: null }), null);
});

test("the lifecycle shows both chambers, the President and law, with dates", () => {
  const { steps, current } = lifecycle(parseActions(actions), "2025-05-20");
  assert.equal(current, "law");
  const by = Object.fromEntries(steps.map(s => [s.key, s]));
  assert.equal(by.passed_first.date, "2025-05-22");
  assert.equal(by.passed_second.date, "2025-07-01");
  assert.equal(by.resolving.date, "2025-07-03");
  assert.equal(by.president.date, "2025-07-03");
  assert.equal(by.law.date, "2025-07-04");
  assert.ok(steps.every(s => s.done));
  const early = lifecycle(parseActions({ actions: actions.actions.slice(-3) }), "2025-05-20");
  assert.equal(early.current, "committee");
  assert.equal(early.steps.find(s => s.key === "passed_first").done, false);
  assert.equal(early.steps.some(s => s.key === "resolving"), false);
});

test("amendments: outcome from the latest action, one plain line", () => {
  const list = parseAmendments({ amendments: [
    { congress: 119, number: "2360", type: "SAMDT", purpose: "In the nature of a substitute.", latestAction: { actionDate: "2025-06-30", text: "Amendment SA 2360 agreed to in Senate by Yea-Nay Vote. 51 - 49." } },
    { congress: 119, number: "45", type: "HAMDT", description: "An amendment to strike section 4 and insert a reporting requirement. It also changes the date.", latestAction: { actionDate: "2025-05-21", text: "On agreeing to the Smith amendment (A003) Failed by recorded vote: 190 - 230." } },
    { congress: 119, number: "7", type: "SAMDT", latestAction: { text: "Amendment SA 7 withdrawn in Senate." } },
    { congress: 119, number: "x", type: "SAMDT" },
  ] });
  assert.equal(list.length, 3);
  assert.deepEqual(list.map(a => a.outcome), ["adopted", "failed", "withdrawn"]);
  assert.equal(list[0].id, "119-samdt-2360");
  assert.equal(amendmentLine(list[1]), "An amendment to strike section 4 and insert a reporting requirement.");
  assert.equal(amendmentLine(list[2]), "Senate amendment 7");
  assert.equal(amendmentOutcome("Amendment SA 9 not agreed to in Senate by Voice Vote."), "failed");
  assert.equal(amendmentOutcome("Submitted in the Senate."), "pending");
  assert.equal(parseAmendments({ amendment: { congress: 119, number: 3, type: "HAMDT", purpose: "To add a study." } })[0].purpose, "To add a study.");
});

test("text versions sort oldest first and pick each format; section comparison is exact", () => {
  const v = parseTextVersions({ textVersions: [
    { date: "2025-07-04T04:00:00Z", type: "Enrolled Bill", formats: [{ type: "Formatted Text", url: "https://www.congress.gov/119/bills/hr1/BILLS-119hr1enr.htm" }, { type: "PDF", url: "https://x/enr.pdf" }, { type: "Formatted XML", url: "https://x/enr.xml" }] },
    { date: "2025-05-20T04:00:00Z", type: "Introduced in House", formats: [{ type: "Formatted XML", url: "https://x/ih.xml" }] },
    { date: null, type: "Public Law", formats: [] },
  ] });
  assert.deepEqual(v.map(x => x.type), ["Public Law", "Introduced in House", "Enrolled Bill"]);
  assert.equal(v[2].xmlUrl, "https://x/enr.xml");
  assert.equal(v[2].htmlUrl, "https://www.congress.gov/119/bills/hr1/BILLS-119hr1enr.htm");
  assert.deepEqual(compareSections([{ number: "1", text: "a" }, { number: "2", text: "b" }, { number: "3", text: "c" }], [{ number: "1", text: "a " }, { number: "2", text: "B" }, { number: "4", text: "d" }]),
    { added: ["4"], removed: ["3"], changed: ["2"] });
});

test("committees and membership from congress-legislators", () => {
  const c = parseCommittees([{ type: "house", name: "House Committee on Agriculture", thomas_id: "HSAG", url: "https://agriculture.house.gov/", subcommittees: [{ name: "Livestock", thomas_id: "29" }] },
    { type: "senate", name: "Senate Committee on Finance", thomas_id: "SSFI" }, { name: "no id" }]);
  assert.deepEqual(c.map(x => x.id), ["HSAG", "HSAG29", "SSFI"]);
  assert.equal(c[1].parentId, "HSAG");
  const m = parseCommitteeMembership({ HSAG: [{ name: "G. T. Thompson", party: "majority", rank: 1, title: "Chair", bioguide: "T000467" }, { name: "x" }], SSFI: [{ bioguide: "C000880", party: "majority", rank: 1, title: "Chairman" }] });
  assert.equal(m.length, 2);
  assert.deepEqual(m[0], { committeeId: "HSAG", politicianId: "T000467", side: "majority", rank: 1, title: "Chair" });
  assert.equal(committeeIdFromSystemCode("hsbu00"), "HSBU");
  assert.equal(committeeIdFromSystemCode("ssfi10"), "SSFI10");
  assert.equal(committeeIdFromSystemCode("bad"), null);
});

test("floor schedules: House weekly XML and bill numbers on the Senate page", () => {
  assert.equal(weekOf(Date.UTC(2026, 10, 19, 15)), "20261116");
  assert.equal(weekOf(Date.UTC(2026, 10, 16, 1)), "20261116");
  assert.equal(houseFloorUrl("20261116"), "https://docs.house.gov/floor/Download.aspx?file=/billsthisweek/20261116/20261116.xml");
  const xml = `<floorschedule week-date="2026-11-16"><category type="suspension"><floor-items>
    <floor-item id="1"><legis-num>H.R. 2102</legis-num><floor-text>Major Richard Star Act, as amended</floor-text></floor-item>
    <floor-item id="2"><legis-num>S. 45</legis-num><floor-text>To designate the facility &amp; for other purposes</floor-text></floor-item>
    <floor-item id="3"><legis-num>H.Res. 900</legis-num><floor-text>Rule providing for consideration</floor-text></floor-item>
    <floor-item id="4"><legis-num>H.R. 2102</legis-num><floor-text>duplicate</floor-text></floor-item></floor-items></category></floorschedule>`;
  const h = parseHouseFloor(xml, 119);
  assert.deepEqual(h.map(x => x.billId), ["119-hr-2102", "119-s-45", "119-hres-900"]);
  assert.equal(h[1].description, "To designate the facility & for other purposes");
  const html = `<html><body><script>var x="S. 1"</script><p>The Senate will convene at 10:00 a.m. and resume consideration of H.R. 4321, the appropriations bill.</p>
    <p>At 2:15 p.m., vote on cloture on S.J.Res. 12. Also S. 99 and H.R. 4321 again.</p></body></html>`;
  const s = parseSenateFloor(html, 119);
  assert.deepEqual(s.map(x => x.billId), ["119-hr-4321", "119-sjres-12", "119-s-99"]);
});

test("Census geocoder: congressional and both state legislative districts", () => {
  const match = { matchedAddress: "1100 CONGRESS AVE, AUSTIN, TX, 78701", geographies: {
    States: [{ STUSAB: "TX", NAME: "Texas" }], "119th Congressional Districts": [{ CD119: "37", BASENAME: "37" }],
    "2024 State Legislative Districts - Upper": [{ SLDU: "014", BASENAME: "14", NAME: "State Senate District 14" }],
    "2024 State Legislative Districts - Lower": [{ SLDL: "049", BASENAME: "49", NAME: "State House District 49" }] } };
  assert.deepEqual(districtsFromCensus(match), { state: "TX", congressional: "TX-37", stateUpper: "TX-SD-14", stateLower: "TX-HD-49", matchedAddress: "1100 CONGRESS AVE, AUSTIN, TX, 78701" });
  const dc = districtsFromCensus({ geographies: { States: [{ STUSAB: "DC" }], "119th Congressional Districts": [{ CD119: "98" }] } });
  assert.equal(dc.congressional, "DC-AL"); assert.equal(dc.stateUpper, null);
  assert.equal(districtsFromCensus({}), null);
});

test("ZIP to state, including the Texas and Oklahoma exceptions", () => {
  assert.equal(stateForZip("78701"), "TX"); assert.equal(stateForZip("73301"), "TX"); assert.equal(stateForZip("73102"), "OK");
  assert.equal(stateForZip("88510"), "TX"); assert.equal(stateForZip("02108"), "MA"); assert.equal(stateForZip("20500"), "DC");
  assert.equal(stateForZip("99501"), "AK"); assert.equal(stateForZip("1234"), null); assert.equal(stateForZip("abcde"), null);
});

test("tally integrity: official totals against stored member votes", () => {
  assert.deepEqual(tallyMismatches({ yea: 215, nay: 214, present: 1, notVoting: 4 }, { Yea: 215, Nay: 214, Present: 1, "Not Voting": 4 }), []);
  assert.deepEqual(tallyMismatches({ yea: 215, nay: 214, present: 0, notVoting: 4 }, { Yea: 214, Nay: 214, "Not Voting": 4 }), [{ field: "yea", official: 215, counted: 214 }]);
});

test("what changed: H.R. 2102 introduced vs engrossed, compared section by section on the real GPO text", async () => {
  const { readFileSync } = await import("node:fs");
  const { parseBillTextHtml } = await import("../lib/analysis/billtext.ts");
  const ih = parseBillTextHtml(readFileSync(new URL("./fixtures/bill-119hr2102ih.htm", import.meta.url), "utf8")).sections;
  const eh = parseBillTextHtml(readFileSync(new URL("./fixtures/bill-119hr2102eh.htm", import.meta.url), "utf8")).sections;
  assert.ok(ih.length >= 2 && eh.length >= 1, `sections ih ${ih.length} eh ${eh.length}`);
  const d = compareSections(ih.map(s => ({ number: s.num, text: s.text })), eh.map(s => ({ number: s.num, text: s.text })));
  // The engrossed text is shorter than the introduced one, so at least one section changed or was removed.
  assert.ok(d.changed.length + d.removed.length + d.added.length > 0, JSON.stringify(d));
  console.log("hr2102 ih→eh", JSON.stringify(d), ih.map(s => s.num).join(","), "→", eh.map(s => s.num).join(","));
});
