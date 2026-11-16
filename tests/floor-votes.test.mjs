import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseActions, stageOf, lifecycle, floorKind, floorVoteOf, floorVoteFromRollCall, floorVotes, STAGE_LABEL } from "../lib/federal/depth-parse.ts";

// Owner, 16 Nov 2026: the timeline must show floor action. S.J.Res. 197 is the test case.
const sjres197 = JSON.parse(readFileSync(new URL("./fixtures/federal/actions-119sjres197.json", import.meta.url), "utf8"));
const roll251 = { id: "senate-119-2-251", chamber: "senate", rollNumber: 251, votedAt: Date.parse("2026-09-29T14:12:00Z"), question: "On the Motion to Proceed",
  title: "Motion to Proceed to S.J.Res. 197", result: "Motion to Proceed Rejected", yea: 48, nay: 51 };

test("S.J.Res. 197: the rejected motion to proceed is its own step, 48–51, with what it means, and sets the stage", () => {
  const life = lifecycle(parseActions(sjres197), "2026-06-17", [roll251]);
  const floor = life.steps.filter(s => "floor" in s);
  assert.equal(floor.filter(s => s.floor.kind === "proceed").length, 1, "the repeated action is shown once");
  const mtp = floor.find(s => s.floor.kind === "proceed");
  assert.equal(mtp.label, "Senate voted 48–51 not to take it up");
  assert.equal(mtp.date, "2026-09-29");
  assert.equal(mtp.text, "It cannot be debated unless the Senate votes again to take it up.");
  assert.equal(mtp.floor.rollCallId, "senate-119-2-251", "linked to the roll call on file");
  assert.equal(life.current, "not_taken_up");
  assert.equal(STAGE_LABEL[life.current], "Floor vote to take it up failed");
  assert.equal(life.currentStep, mtp.key);
  assert.equal(life.stageDate, "2026-09-29");
  // The CRA discharge petition is a step too, before the vote, and the stages still to come stay after it.
  const pet = floor.find(s => s.floor.kind === "discharged_petition");
  assert.equal(pet.label, "Senators brought it out of committee by petition");
  assert.match(pet.text, /Congressional Review Act, 30 senators/);
  assert.equal(floor.filter(s => s.floor.kind === "discharged_petition").length, 1);
  const keys = life.steps.map(s => s.key);
  assert.ok(keys.indexOf(pet.key) < keys.indexOf(mtp.key));
  assert.ok(keys.indexOf("committee") < keys.indexOf(pet.key));
  assert.ok(keys.indexOf(mtp.key) < keys.indexOf("passed_first"), "not-yet stages come after the floor votes");
  assert.equal(life.steps.find(s => s.key === "passed_first").done, false);
});

test("a roll call alone (no actions read yet) still shows the step and the stage", () => {
  const life = lifecycle([], "2026-06-17", [roll251]);
  const mtp = life.steps.find(s => "floor" in s);
  assert.equal(mtp.label, "Senate voted 48–51 not to take it up");
  assert.equal(life.current, "not_taken_up");
});

test("both wordings of a failed motion to proceed: 'rejected' and 'not agreed to'", () => {
  for (const text of ["Motion to proceed to consideration of measure rejected in Senate by Yea-Nay Vote. 48 - 51. Record Vote Number: 251.",
    "Motion to proceed to consideration of measure not agreed to in Senate by Yea-Nay Vote. 48 - 51. Record Vote Number: 262."]) {
    assert.deepEqual(floorKind(text), { kind: "proceed", passed: false });
    assert.equal(stageOf({ text, type: "Floor" }), "not_taken_up");
    const v = floorVoteOf({ text, actionDate: "2026-09-29", chamber: "senate" });
    assert.equal(v.label, "Senate voted 48–51 not to take it up");
    assert.ok([251, 262].includes(v.rollNumber));
  }
  const ok = floorVoteOf({ text: "Motion to proceed to consideration of measure agreed to in Senate by Yea-Nay Vote. 52 - 47. Record Vote Number: 300.", actionDate: "2026-10-01", chamber: "senate" });
  assert.equal(ok.label, "Senate voted 52–47 to take it up");
  assert.equal(ok.meaning, "It can now be debated and voted on.");
  assert.equal(floorKind("Motion to proceed to consideration of measure made in Senate."), null, "a motion made is not a vote");
  assert.equal(floorKind("Motion to proceed to consideration of measure withdrawn in Senate."), null);
});

test("cloture: needs 60 for most measures; on the motion to proceed or on the measure", () => {
  const t1 = "Cloture motion on the motion to proceed to the measure not invoked in Senate by Yea-Nay Vote. 52 - 47. Record Vote Number: 120.";
  const v1 = floorVoteOf({ text: t1, actionDate: "2026-05-01", chamber: "senate" });
  assert.equal(v1.kind, "cloture_proceed");
  assert.equal(v1.label, "Senate vote to end debate on taking it up failed, 52–47");
  assert.match(v1.meaning, /60 votes/);
  assert.equal(stageOf({ text: t1, type: "Floor" }), "debate_blocked");
  const v2 = floorVoteOf({ text: "Cloture on the measure invoked in Senate by Yea-Nay Vote. 61 - 38. Record Vote Number: 130.", actionDate: "2026-05-02", chamber: "senate" });
  assert.equal(v2.kind, "cloture");
  assert.equal(v2.label, "Senate voted 61–38 to end debate");
  assert.equal(floorKind("Cloture motion on the measure presented in Senate."), null, "a cloture motion filed is not a vote");
  const v3 = floorVoteOf({ text: "Cloture on the measure not invoked in Senate by Yea-Nay Vote. 45 - 54. Record Vote Number: 131.", actionDate: "2026-05-02", chamber: "senate" });
  assert.equal(v3.label, "Senate voted 45–54 not to end debate");
});

test("discharge motion, failed passage and veto override, with plain lines", () => {
  const d = floorVoteOf({ text: "Motion to discharge Senate Committee on Banking rejected in Senate by Yea-Nay Vote. 47 - 50. Record Vote Number: 88.", actionDate: "2026-03-01", chamber: "senate" });
  assert.equal(d.label, "Senate voted 47–50 not to bring it out of committee");
  assert.equal(d.meaning, "It stays in committee unless another vote brings it out.");
  const p = floorVoteOf({ text: "Failed of passage/not agreed to in House: On motion to suspend the rules and pass the bill Failed by the Yeas and Nays: (2/3 required): 250 - 170 (Roll no. 99).", actionDate: "2026-04-01", chamber: "house" });
  assert.equal(p.kind, "passage");
  assert.equal(p.label, "House vote to pass it failed, 250–170 (two-thirds needed)");
  assert.equal(p.rollNumber, 99);
  assert.equal(stageOf({ text: "Failed of passage/not agreed to in House: On passage Failed by the Yeas and Nays: 200 - 220.", type: "Floor" }), "failed", "unchanged");
  const o = floorVoteOf({ text: "On passage, the objections of the President to the contrary notwithstanding Failed by the Yeas and Nays: (2/3 required): 260 - 160 (Roll no. 400).", actionDate: "2026-06-01", chamber: "house" });
  assert.equal(o.kind, "veto_override");
  assert.equal(o.label, "House vote to override the veto failed, 260–160 (two-thirds needed)");
  assert.equal(o.meaning, "The veto stands, so it does not become law.");
  const o2 = floorVoteOf({ text: "Passed Senate over veto by Yea-Nay Vote. 81 - 16. Record Vote Number: 401.", actionDate: "2026-06-02", chamber: "senate" });
  assert.equal(o2.label, "Senate voted 81–16 to override the veto");
});

test("amendment votes and committee report numbers are not floor steps; tallies are not read from report numbers", () => {
  assert.equal(floorKind("Amendment SA 2360 agreed to in Senate by Yea-Nay Vote. 51 - 49."), null);
  assert.equal(floorKind("Reported (Amended) by the Committee on Budget. H. Rept. 119-106."), null);
  assert.equal(floorKind("Motion to table the motion to reconsider agreed to without objection."), null);
});

test("a later successful vote clears the block; passage clears it too", () => {
  const acts = parseActions({ actions: [
    { actionDate: "2026-10-05", text: "Passed/agreed to in Senate: Passed Senate without amendment by Yea-Nay Vote. 51 - 48. Record Vote Number: 310.", type: "Floor", sourceSystem: { name: "Senate" } },
    { actionDate: "2026-10-01", text: "Motion to proceed to consideration of measure agreed to in Senate by Yea-Nay Vote. 51 - 48. Record Vote Number: 300.", type: "Floor", sourceSystem: { name: "Senate" } },
    { actionDate: "2026-09-29", text: "Motion to proceed to consideration of measure rejected in Senate by Yea-Nay Vote. 48 - 51. Record Vote Number: 251.", type: "Floor", sourceSystem: { name: "Senate" } },
    { actionDate: "2026-06-17", text: "Introduced in Senate", type: "IntroReferral", sourceSystem: { name: "Library of Congress" } }] });
  const life = lifecycle(acts, "2026-06-17");
  assert.equal(life.current, "passed_first");
  assert.equal(life.currentStep, "passed_first");
  assert.equal(life.steps.filter(s => "floor" in s).length, 2);
});

test("roll calls: procedural kinds from the clerk's wording; a passage that carried is not a floor step", () => {
  assert.equal(floorVoteFromRollCall({ ...roll251, question: "On the Cloture Motion", title: "Motion to Invoke Cloture: Motion to Proceed to S. 5", result: "Cloture Motion Rejected", yea: 55, nay: 44 }).kind, "cloture_proceed");
  assert.equal(floorVoteFromRollCall({ ...roll251, question: "On Passage of the Bill", result: "Bill Passed", yea: 60, nay: 39 }), null);
  assert.equal(floorVoteFromRollCall({ ...roll251, question: "On Passage of the Bill", result: "Bill Defeated", yea: 45, nay: 54 }).label, "Senate voted 45–54 against passing it");
  assert.equal(floorVoteFromRollCall({ ...roll251, chamber: "house", id: "house-2026-9", question: "On Overriding the Veto", result: "Failed", yea: 260, nay: 160 }).kind, "veto_override");
  // Same vote from an action and a roll call is one step.
  assert.equal(floorVotes(parseActions(sjres197), [roll251]).filter(v => v.kind === "proceed").length, 1);
});
