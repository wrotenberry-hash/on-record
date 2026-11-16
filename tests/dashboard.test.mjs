import test from "node:test";
import assert from "node:assert/strict";
import { stageFromLatestAction, funnel, funnelTakeaway, isPartyLine, parseLeadership } from "../lib/federal/dashboard-rules.ts";

test("stage from the latest official action, implying earlier steps", () => {
  assert.equal(stageFromLatestAction("Became Public Law No: 119-21."), "law");
  assert.equal(stageFromLatestAction("Presented to President."), "passed_both");
  assert.equal(stageFromLatestAction("Vetoed by President."), "vetoed");
  assert.equal(stageFromLatestAction("Received in the Senate and Read twice and referred to the Committee on Finance."), "passed_one");
  assert.equal(stageFromLatestAction("Passed/agreed to in House: On passage Passed by recorded vote: 215 - 214."), "passed_one");
  assert.equal(stageFromLatestAction("Ordered to be Reported (Amended) by the Yeas and Nays: 30 - 20."), "committee");
  assert.equal(stageFromLatestAction("Placed on the Union Calendar, Calendar No. 412."), "committee");
  assert.equal(stageFromLatestAction("Referred to the House Committee on Energy and Commerce."), "filed");
  assert.equal(stageFromLatestAction(null), "filed");
});

test("funnel counts bills that reached at least each stage", () => {
  const f = funnel(["filed", "filed", "committee", "passed_one", "law", "vetoed"]);
  assert.deepEqual(f.reach, { filed: 6, committee: 4, passed_one: 3, passed_both: 2, law: 1, vetoed: 1 });
  assert.equal(f.pct.law, 16.7);
  assert.match(funnelTakeaway("House bills", f), /of 6 bills filed, 50% passed at least one chamber and 1 \(16.7%\) became law; 33.3% have had no committee action/);
  assert.equal(funnelTakeaway("X", funnel([])), "X: no bills filed yet.");
});

test("party-line votes need both parties mostly on opposite sides", () => {
  assert.equal(isPartyLine({ Yea: 210, Nay: 2 }, { Yea: 5, Nay: 200 }), true);
  assert.equal(isPartyLine({ Yea: 210, Nay: 2 }, { Yea: 200, Nay: 5 }), false);
  assert.equal(isPartyLine({ Yea: 5, Nay: 2 }, { Yea: 1, Nay: 200 }), false, "too few Democrats voting");
  assert.equal(isPartyLine({ Yea: 100, Nay: 100 }, { Yea: 1, Nay: 200 }), false, "tie");
});

test("leadership roles from congress-legislators", () => {
  const l = parseLeadership([{ id: { bioguide: "J000299" }, name: { official_full: "Mike Johnson" }, leadership_roles: [{ title: "Speaker of the House", chamber: "house", start: "2023-10-25" }] },
    { id: { bioguide: "X" }, leadership_roles: [{ title: "Majority Whip", chamber: "senate", start: "2021-01-01", end: "2023-01-03" }] }]);
  assert.deepEqual(l, [{ politicianId: "J000299", name: "Mike Johnson", title: "Speaker of the House", chamber: "house", start: "2023-10-25" }]);
});
