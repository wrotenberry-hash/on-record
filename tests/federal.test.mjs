import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHouseRoll, parseSenateVote, parseSenateMenu, parseLegislators, normalizeBillRef, normalizePosition, congressGovPage,
  easternToUtc, congressForYear, sessionForYear, parseCongressBill, parseCongressSubjects, parseCongressBillList, houseRollUrl, senateVoteUrl } from "../lib/federal/parse.ts";
import { categorize, DEFAULT_MAPPINGS, ISSUE_CATEGORIES } from "../lib/federal/categories.ts";

// Fixtures are trimmed copies of live responses fetched on 2026-11-13.
const fx = name => readFileSync(new URL(`./fixtures/federal/${name}`, import.meta.url), "utf8");

test("a House roll call on a bill parses with its tallies, members and Eastern time", () => {
  const r = parseHouseRoll(fx("house-2026-roll323.xml"), houseRollUrl(2026, 323));
  assert.equal(r.id, "house-2026-323");
  assert.equal(r.chamber, "house"); assert.equal(r.congress, 119); assert.equal(r.session, 2); assert.equal(r.rollNumber, 323);
  assert.equal(r.question, "On Passage"); assert.equal(r.result, "Passed"); assert.equal(r.title, "Major Richard Star Act");
  assert.deepEqual(r.bill, { id: "119-hr-2102", congress: 119, billType: "hr", number: 2102 });
  assert.deepEqual([r.yea, r.nay, r.present, r.notVoting], [392, 18, 0, 23]);
  assert.equal(r.members.length, 433);
  assert.equal(r.members.filter(m => m.position === "Yea").length, 392);
  assert.equal(new Date(r.votedAt).toISOString(), "2026-11-12T15:59:00.000Z", "10:59 Eastern standard time");
  assert.equal(r.sourceUrl, "https://clerk.house.gov/evs/2026/roll323.xml");
});

test("a quorum call parses with no bill, and the Clerk's error body for a missing roll is not a vote", () => {
  const q = parseHouseRoll(fx("house-2026-roll001.xml"), houseRollUrl(2026, 1));
  assert.equal(q.bill, null); assert.equal(q.documentLabel, "QUORUM"); assert.equal(q.present, 406);
  assert.equal(parseHouseRoll(fx("house-missing-roll.xml"), "x"), null);
  assert.equal(parseHouseRoll("<html>Not found</html>", "x"), null);
});

test("a Senate vote parses with LIS member ids, a nomination has no bill", () => {
  const s = parseSenateVote(fx("senate-119-2-262.xml"), senateVoteUrl(119, 2, 262));
  assert.equal(s.id, "senate-119-2-262"); assert.equal(s.chamber, "senate");
  assert.equal(s.question, "On the Cloture Motion"); assert.equal(s.result, "Cloture Motion Agreed to");
  assert.equal(s.documentLabel, "PN1181-7"); assert.equal(s.bill, null);
  assert.deepEqual([s.yea, s.nay, s.notVoting], [49, 26, 25]);
  assert.equal(s.members.length, 100);
  assert.ok(s.members.some(m => m.memberKey === "S428" && m.position === "Nay"));
  assert.equal(new Date(s.votedAt).toISOString(), "2026-11-12T20:21:00.000Z", "03:21 PM Eastern");
  assert.equal(s.sourceUrl, "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00262.xml");
});

test("the Senate session menu lists vote numbers", () => {
  const menu = parseSenateMenu(fx("senate-menu-119-2.xml"));
  assert.equal(menu.congress, 119); assert.equal(menu.session, 2);
  assert.deepEqual(menu.voteNumbers, [262, 261, 260]);
});

test("legislators parse from each member's latest term, with the Senate LIS crosswalk", () => {
  const rows = parseLegislators(JSON.parse(fx("legislators-sample.json")));
  const cantwell = rows.find(r => r.id === "C000127");
  assert.equal(cantwell.chamber, "senate"); assert.equal(cantwell.lisId, "S275"); assert.equal(cantwell.state, "WA");
  assert.equal(cantwell.district, null); assert.equal(cantwell.party, "Democrat");
  assert.ok(rows.filter(r => r.chamber === "house").every(r => Number.isInteger(r.district)));
  assert.deepEqual(parseLegislators(null), []);
});

test("bill labels from both chambers normalize to one id; nominations and quorum calls do not", () => {
  const cases = [["H R 2102", "119-hr-2102"], ["H.R. 2347", "119-hr-2347"], ["S. 123", "119-s-123"], ["S 123", "119-s-123"],
    ["H RES 1247", "119-hres-1247"], ["S.Res. 852", "119-sres-852"], ["H J RES 5", "119-hjres-5"], ["S.J.Res. 4", "119-sjres-4"],
    ["H CON RES 3", "119-hconres-3"], ["S.Con.Res. 9", "119-sconres-9"]];
  for (const [label, id] of cases) assert.equal(normalizeBillRef(label, 119)?.id, id, label);
  for (const label of ["PN1181-7", "QUORUM", "ADJOURN", "", null]) assert.equal(normalizeBillRef(label, 119), null, String(label));
  assert.equal(congressGovPage(normalizeBillRef("H R 2102", 119)), "https://www.congress.gov/bill/119th-congress/house-bill/2102");
  assert.equal(congressGovPage(normalizeBillRef("S.J.Res. 4", 121)), "https://www.congress.gov/bill/121st-congress/senate-joint-resolution/4");
});

test("vote words normalize; unusual words keep their raw form elsewhere", () => {
  assert.equal(normalizePosition("Aye"), "Yea"); assert.equal(normalizePosition("No"), "Nay");
  assert.equal(normalizePosition("Not Voting"), "Not Voting"); assert.equal(normalizePosition("Jeffries"), "Present");
});

test("Eastern time handles daylight saving, and years map to Congress and session", () => {
  assert.equal(new Date(easternToUtc(2026, 7, 1, 10, 0)).toISOString(), "2026-07-01T14:00:00.000Z");
  assert.equal(new Date(easternToUtc(2026, 12, 1, 10, 0)).toISOString(), "2026-12-01T15:00:00.000Z");
  assert.equal(congressForYear(2025), 119); assert.equal(congressForYear(2026), 119); assert.equal(congressForYear(2027), 120);
  assert.equal(sessionForYear(2025), 1); assert.equal(sessionForYear(2026), 2);
});

test("Congress.gov responses parse defensively (shapes from the v3 documentation; unverified against a live key)", () => {
  const detail = parseCongressBill({ bill: { title: "Major Richard Star Act", policyArea: { name: "Armed Forces and National Security" }, introducedDate: "2025-03-14",
    latestAction: { actionDate: "2026-11-12", text: "Passed House." }, sponsors: [{ bioguideId: "B001234" }] } });
  assert.deepEqual(detail, { title: "Major Richard Star Act", policyArea: "Armed Forces and National Security", introducedAt: "2025-03-14",
    latestActionText: "Passed House.", latestActionAt: "2026-11-12", sponsorId: "B001234" });
  assert.equal(parseCongressBill({}), null);
  assert.deepEqual(parseCongressSubjects({ subjects: { legislativeSubjects: [{ name: "Veterans' pensions and compensation" }], policyArea: { name: "Armed Forces and National Security" } } }),
    { policyArea: "Armed Forces and National Security", subjects: ["Veterans' pensions and compensation"] });
  const list = parseCongressBillList({ bills: [{ congress: 119, type: "HR", number: "2102", title: "T", latestAction: { actionDate: "2026-11-12", text: "x" } }, { congress: 119, type: "XYZ", number: "1" }] });
  assert.equal(list.length, 1); assert.equal(list[0].ref.id, "119-hr-2102");
});

test("categories: 14 fixed, mappings point at real categories, and matching ignores who sponsored the bill", () => {
  assert.equal(ISSUE_CATEGORIES.length, 14);
  const slugs = new Set(ISSUE_CATEGORIES.map(c => c.slug));
  assert.ok(DEFAULT_MAPPINGS.every(mp => slugs.has(mp.categorySlug)));
  assert.equal(new Set(DEFAULT_MAPPINGS.map(mp => mp.id)).size, DEFAULT_MAPPINGS.length, "mapping ids are unique");
  assert.deepEqual(categorize("Health", [], DEFAULT_MAPPINGS).map(c => c.slug), ["health-care"]);
  assert.deepEqual(categorize("Armed Forces and National Security", ["Veterans' pensions and compensation", "Firearms and explosives"], DEFAULT_MAPPINGS).map(c => c.slug).sort(),
    ["defense-veterans", "guns"]);
  assert.deepEqual(categorize("Native Americans", [], DEFAULT_MAPPINGS), [], "unmapped policy areas stay uncategorized");
  assert.deepEqual(categorize(null, [], DEFAULT_MAPPINGS), []);
  const off = DEFAULT_MAPPINGS.map(mp => mp.categorySlug === "health-care" ? { ...mp, active: 0 } : mp);
  assert.deepEqual(categorize("Health", [], off), [], "an editor can switch a mapping off");
});
