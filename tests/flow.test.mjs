import test from "node:test";
import assert from "node:assert/strict";
import { carried, clip, longDate, meaningfulVote, NO_RECENT_VOTE, plainBillName, txMeaningfulVote, txNoVoteLine, txVoteLine, voteLine } from "../lib/flow/votes.ts";
import { answerBucket, answerPrivacyLine, censusCongress, cleanZip, districtCompareLine, floorBillStub, orderByIssues, placeForZip, PLACE_ERRORS, zipIndex, zipIndexFor } from "../lib/flow/rules.ts";
import { readFileSync } from "node:fs";
import { MIN_SHOWN } from "../lib/verify/rules.ts";
import { stateForZip } from "../lib/federal/depth-parse.ts";
import { TX_SESSIONS } from "../lib/texas/parse.ts";

// Owner, 17 Nov 2026: each legislator's most recent MEANINGFUL vote, in one plain line.

/* ------------------------------------------------------------ which vote counts --- */

// Every distinct question (with its result) in official_roll_calls on 17 Nov 2026, with a real title of that kind.
const REAL = [
  // House
  ["On Passage", "Passed", "Major Richard Star Act", "pass"],
  ["On Motion to Suspend the Rules and Pass", "Passed", "Retire through Ownership Act", "pass"],
  ["On Motion to Suspend the Rules and Pass", "Failed", "Proposing an amendment to the Constitution of the United States", "pass"],
  ["On Motion to Suspend the Rules and Pass, as Amended", "Passed", "GUARD Act", "pass"],
  ["On Agreeing to the Resolution", "Passed", "Providing for the condemnation and denouncement of socialism in all its forms", "pass"],
  ["On Agreeing to the Resolution", "Failed", "Directing the President, pursuant to section 5(c) of the War Powers Resolution", "pass"],
  ["On Agreeing to the Resolution", "Passed", "Providing for consideration of the bill (H.R. 2102) to amend title 10, United States Code", null], // a rule: only sets the terms of debate
  ["On Motion to Concur in the Senate Amendment", "Passed", "Continuing Appropriations and Extensions Act, 2026", "other_chamber"],
  ["On Motion to Concur in the Senate Amendments", "Passed", "An Act to amend the Internal Revenue Code of 1986", "other_chamber"],
  ["On Motion to Suspend the Rules and Concur in the Senate Amendments", "Passed", "AGOA Extension Act", "other_chamber"],
  ["On Motion to Recommit", "Failed", "Do No Harm in Medicaid Act", null],
  ["On Motion to Commit", "Failed", "To require the Secretary of Veterans Affairs to disinter the remains", null],
  ["On Ordering the Previous Question", "Passed", "Providing for consideration of the bill (H.R. 1013)", null],
  ["On Agreeing to the Amendment", "Failed", "SPEED Act", null],
  ["On Motion to Table", "Passed", "Impeaching Donald John Trump, President of the United States", null],
  ["On Motion to Table", "Failed", "Disapproving the behavior of Representative Jesus G. Garcia", null],
  ["On Motion to Refer", "Passed", "Impeaching Peter Brian Hegseth, Secretary of Defense", null],
  ["On Motion to Refer", "Failed", "Censuring and condemning Delegate Stacey Plaskett", null],
  ["On Motion to Discharge", "Passed", "Providing for consideration of the bill (H.R. 2550)", null],
  // Senate
  ["On Passage of the Bill", "Bill Passed", "H.R. 5334, as amended", "pass"],
  ["On the Concurrent Resolution", "Concurrent Resolution Rejected", "H. Con. Res. 89", "pass"],
  ["On the Motion to Proceed", "Motion to Proceed Rejected", "Motion to Proceed to S.J. Res. 197", "take_up"], // it stopped there
  ["On the Motion to Proceed", "Motion to Proceed Agreed to", "Motion to Proceed to H.R. 2347", null], // debate went on
  ["On Cloture on the Motion to Proceed", "Cloture on the Motion to Proceed Rejected", "Motion to Invoke Cloture: Motion to Proceed to H.R. 9340", "take_up"],
  ["On Cloture on the Motion to Proceed", "Cloture on the Motion to Proceed Agreed to", "Motion to Invoke Cloture: Motion to Proceed to S. 4668", null],
  ["On the Cloture Motion", "Cloture Motion Agreed to", "Motion to Invoke Cloture: Collins Amdt. No. 6732 to H.R. 2347", null],
  ["On the Motion to Discharge", "Motion to Discharge Rejected", "Motion to Discharge S. Res. 852", null],
];

test("the meaningful-vote rule, on every kind of question in the database", () => {
  for (const [question, result, title, want] of REAL) {
    assert.equal(meaningfulVote({ question, result, title, hasBill: true }), want, `${question} [${result}] ${title}`);
  }
});

test("nominations, amendments and tabling votes with no bill never count", () => {
  for (const [question, result, title] of [
    ["On the Nomination", "Nomination Confirmed", "Confirmation: Gregory Carl Cook, of Alabama, to be U.S. District Judge"],
    ["On the Cloture Motion", "Cloture Motion Agreed to", "Motion to Invoke Cloture: Anna St. John to be U.S. Circuit Judge for the Fifth Circuit"],
    ["On the Amendment", "Amendment Rejected", "Booker Amdt. No. 6835"], ["On the Amendment", "Amendment Agreed to", "Baldwin Amdt. No. 6828"],
    ["On the Motion to Table", "Motion to Table Agreed to", "Motion to Table Budd Amdt. No. 6747"]]) {
    assert.equal(meaningfulVote({ question, result, title, hasBill: false }), null, question);
    assert.equal(meaningfulVote({ question, result, title, hasBill: true }), null, `${question} (even with a bill attached)`);
  }
  assert.equal(meaningfulVote({ question: "On Passage", result: "Passed", title: "Some Act", hasBill: false }), null, "no bill to link to");
});

test("kinds not in today's data: veto overrides, conference reports, treaties, quorum calls, the Journal, adjournment", () => {
  const kind = (question, result, title = "Some Act") => meaningfulVote({ question, result, title, hasBill: true });
  assert.equal(kind("On Passage, Objections of the President To The Contrary Notwithstanding", "Failed"), "override");
  assert.equal(kind("On Overriding the Veto", "Veto Sustained"), "override");
  assert.equal(kind("On Agreeing to the Conference Report", "Passed"), "final_version");
  assert.equal(kind("On the Conference Report", "Conference Report Agreed to"), "final_version");
  assert.equal(kind("On the Motion", "Motion Agreed to", "Motion to Concur in the House Amendment to S. 870"), "other_chamber");
  assert.equal(kind("On the Joint Resolution", "Joint Resolution Passed"), "pass");
  assert.equal(kind("On Motion to Suspend the Rules and Agree, as Amended", "Passed"), "pass");
  assert.equal(kind("On the Cloture Motion", "Cloture Motion Rejected", "Motion to Invoke Cloture: H.R. 7008"), "end_debate"); // ending debate failed: the bill stopped
  assert.equal(kind("On the Cloture Motion", "Cloture Motion Rejected", "Motion to Invoke Cloture: Paul Amdt. No. 6715"), null); // debate on one amendment
  for (const q of ["On the Resolution of Ratification", "On Approving the Journal", "On Motion to Adjourn", "Call of the House", "Quorum Call", "On the Point of Order",
    "On the Motion to Table the Motion to Reconsider", "On Motion to Instruct Conferees", "Election of the Speaker", "On the Decision of the Chair"]) assert.equal(kind(q, "Passed"), null, q);
  assert.equal(kind("On the Motion to Proceed", null), null, "a debate vote with no stated result is not counted as having stopped anything");
});

test("the rule reads the result the same way whichever side won", () => {
  assert.equal(carried("Passed"), true); assert.equal(carried("Bill Passed"), true); assert.equal(carried("Cloture Motion Agreed to"), true); assert.equal(carried("Veto Overridden"), true);
  assert.equal(carried("Failed"), false); assert.equal(carried("Concurrent Resolution Rejected"), false); assert.equal(carried("Veto Sustained"), false); assert.equal(carried("Cloture Motion Not Invoked"), false);
  assert.equal(carried(null), null); assert.equal(carried(""), null);
});

test("Texas: votes on the bill count; procedural motions, amendments and confirmations do not", () => {
  assert.equal(txMeaningfulVote("Passed to engrossment"), "advance");
  assert.equal(txMeaningfulVote("Passed to third reading"), "advance");
  assert.equal(txMeaningfulVote("Read 3rd time"), "pass");
  assert.equal(txMeaningfulVote("Passed"), "pass");
  assert.equal(txMeaningfulVote("Adopted"), "pass");
  assert.equal(txMeaningfulVote("Concur in Senate amendments"), "other_chamber");
  assert.equal(txMeaningfulVote("Adopt conference committee report"), "final_version");
  for (const m of ["Amendment 3 (Smith)", "Table amendment 2", "Motion to table", "Suspend the constitutional three-day rule", "Postpone", "Previous question", "Reconsider the vote", "Confirm nominee", "Adjourn"]) assert.equal(txMeaningfulVote(m), null, m);
});

/* -------------------------------------------------------------- the bill's name --- */

test("the plain name of a bill: official titles, clipped to about 80 characters", () => {
  const name = (title, billType = "hr", label = "H.R. 1") => plainBillName({ title, billType, label });
  assert.deepEqual(name("GUARD Act"), { text: "the GUARD Act", label: "Official" });
  assert.equal(name("Continuing Appropriations and Extensions Act, 2026").text, "the Continuing Appropriations and Extensions Act, 2026"); // "Continuing" is part of a name, not a description
  assert.equal(name("Crossett Experimental Forest Act of 2026, as amended").text, "the Crossett Experimental Forest Act of 2026");
  assert.equal(name("To require the Secretary of Agriculture to convey a parcel of property of the Forest Service to Perry County, Arkansas, and for other purposes").text,
    "a bill to require the Secretary of Agriculture to convey a parcel of property of the…");
  assert.equal(name("An Act to amend the Internal Revenue Code of 1986").text, "a bill to amend the Internal Revenue Code of 1986");
  assert.equal(name("Directing the President, pursuant to section 5(c) of the War Powers Resolution, to remove United States Armed Forces", "hconres").text,
    "a measure directing the President, pursuant to section 5(c) of the War Powers Resolution…");
  assert.equal(name("Relating to test subject 2.", "hb").text, "a bill relating to test subject 2");
  assert.equal(name("In the matter of allegations relating to Representative X", "hres").text, "a measure titled “In the matter of allegations relating to Representative X”");
  // A bill known only from a roll call carries the motion's wording or just its number as its title: the number stands in.
  assert.equal(name("Motion to Proceed to S.J. Res. 197", "sjres", "S.J.Res. 197").text, "S.J.Res. 197");
  assert.equal(name("H.R. 5334, as amended", "hr", "H.R. 5334").text, "H.R. 5334");
  assert.ok(name("Department of Homeland Security Vehicular Terrorism Prevention and Mitigation Reauthorization and Improvement Act").text.length <= 86);
  assert.equal(clip("one two three four", 9), "one two…");
});

test("with a summary readers may see, the Analysis headline becomes the phrase and the line is labelled Analysis", () => {
  assert.deepEqual(plainBillName({ title: "Providing for congressional disapproval …", billType: "sjres", headline: "Blocks new 2027 rules for health plans sold on the ACA marketplaces." }),
    { text: "a measure that blocks new 2027 rules for health plans sold on the ACA marketplaces", label: "Analysis" });
  assert.deepEqual(plainBillName({ title: "Major Richard Star Act", billType: "hr", headline: "Would let certain military retirees receive disability pay and retired pay together" }),
    { text: "a bill that would let certain military retirees receive disability pay and retired pay together", label: "Analysis" });
  assert.equal(plainBillName({ title: "X Act", billType: "hr", headline: "Federal funding through January" }).text, "a bill described as “Federal funding through January”");
  // No visible summary (the gate is shut): official facts only.
  assert.equal(plainBillName({ title: "Major Richard Star Act", billType: "hr", headline: null }).label, "Official");
});

/* ---------------------------------------------------------------- the one line --- */

test("the one line for each kind of vote and each position", () => {
  const base = { name: "the GUARD Act", billType: "hr", chamber: "house", question: "On Passage" };
  assert.equal(voteLine({ ...base, position: "Yea", kind: "pass", result: "Passed", yea: 232, nay: 198 }), "Voted Yes to pass the GUARD Act. It passed 232–198.");
  assert.equal(voteLine({ ...base, position: "Nay", kind: "pass", result: "Passed", yea: 232, nay: 198 }), "Voted No on passing the GUARD Act. It passed 232–198.");
  assert.equal(voteLine({ ...base, position: "Yea", kind: "pass", result: "Failed", yea: 198, nay: 232 }), "Voted Yes to pass the GUARD Act. It did not pass, 198–232.");
  assert.equal(voteLine({ ...base, position: "Not Voting", kind: "pass", result: "Passed", yea: 232, nay: 198 }), "Did not vote on passing the GUARD Act. It passed 232–198.");
  assert.equal(voteLine({ ...base, position: "Present", kind: "pass", result: "Passed", yea: 232, nay: 198 }), "Voted Present on passing the GUARD Act. It passed 232–198.");
  // A fast-track vote can fail with more Yes than No.
  assert.equal(voteLine({ ...base, position: "Nay", kind: "pass", question: "On Motion to Suspend the Rules and Pass", result: "Failed", yea: 212, nay: 206 }),
    "Voted No on passing the GUARD Act. It did not pass, 212–206 (it needed two-thirds).");
  assert.equal(voteLine({ ...base, position: "Yea", kind: "override", result: "Passed", yea: 300, nay: 120 }), "Voted Yes to override the President’s veto of the GUARD Act. The veto was overridden, 300–120.");
  assert.equal(voteLine({ ...base, position: "Nay", kind: "override", result: "Failed", yea: 250, nay: 170 }), "Voted No on overriding the President’s veto of the GUARD Act. The veto stood, 250–170.");
  assert.equal(voteLine({ ...base, position: "Yea", kind: "final_version", result: "Passed", yea: 220, nay: 210 }), "Voted Yes to approve the final House–Senate version of the GUARD Act. It was approved 220–210.");
  assert.equal(voteLine({ ...base, position: "Yea", kind: "other_chamber", result: "Passed", yea: 222, nay: 209 }), "Voted Yes to accept the Senate’s changes to the GUARD Act. The changes were accepted 222–209.");
  assert.equal(voteLine({ ...base, chamber: "senate", position: "Nay", kind: "other_chamber", result: "Motion Rejected", yea: 40, nay: 58 }),
    "Voted No on accepting the House’s changes to the GUARD Act. The changes were not accepted, 40–58.");
});

test("a debate vote that stopped a bill says so, the same way for Yes and No", () => {
  const v = { kind: "take_up", name: "S.J.Res. 197", billType: "sjres", chamber: "senate", question: "On the Motion to Proceed", result: "Motion to Proceed Rejected", yea: 48, nay: 51 };
  assert.equal(voteLine({ ...v, position: "Nay" }), "Voted No on taking up S.J.Res. 197; the measure stalled, 48–51.");
  assert.equal(voteLine({ ...v, position: "Yea" }), "Voted Yes on taking up S.J.Res. 197; the measure stalled, 48–51.");
  assert.equal(voteLine({ position: "Yea", kind: "take_up", name: "the Ratepayer Protection Act", billType: "hr", question: "On Cloture on the Motion to Proceed", result: "Cloture on the Motion to Proceed Rejected", yea: 57, nay: 43 }),
    "Voted Yes on taking up the Ratepayer Protection Act; the bill stalled, 57–43 (60 votes were needed).");
  assert.equal(voteLine({ position: "Nay", kind: "end_debate", name: "the Ratepayer Protection Act", billType: "hr", question: "On the Cloture Motion", result: "Cloture Motion Rejected", yea: 52, nay: 46 }),
    "Voted No on ending debate on the Ratepayer Protection Act; the bill stalled, 52–46 (60 votes were needed).");
});

test("the line leaves the numbers out when the tally is under review, and never judges the vote", () => {
  assert.equal(voteLine({ position: "Yea", kind: "pass", name: "the GUARD Act", result: "Passed", yea: 232, nay: 198, tallyUnderReview: true }), "Voted Yes to pass the GUARD Act. It passed.");
  assert.equal(voteLine({ position: "Yea", kind: "pass", name: "the GUARD Act", result: null, yea: 0, nay: 0 }), "Voted Yes to pass the GUARD Act.");
  assert.equal(voteLine({ position: "Yea", kind: "pass", name: "a bill to require the Secretary of…", result: "Passed", yea: 388, nay: 0 }), "Voted Yes to pass a bill to require the Secretary of… It passed 388–0.");
  const all = ["Yea", "Nay", "Present", "Not Voting"].flatMap(position => ["pass", "override", "final_version", "other_chamber", "take_up", "end_debate"].flatMap(kind =>
    ["Passed", "Failed"].map(result => voteLine({ position, kind, name: "the X Act", result, yea: 10, nay: 9, chamber: "house", question: "On the Cloture Motion" }))));
  for (const line of all) assert.doesNotMatch(line, /\b(good|bad|right|wrong|against the people|sadly|unfortunately|rightly|shamefully|bravely|blocked|killed)\b/i, line);
});

test("Texas lines and the line for a member with no vote", () => {
  assert.equal(txVoteLine({ option: "yes", kind: "advance", name: "a bill relating to school funding", result: "pass", yes: 90, no: 55 }), "Voted Yes to move a bill relating to school funding forward. It went on to a final vote, 90–55.");
  assert.equal(txVoteLine({ option: "no", kind: "pass", name: "a bill relating to school funding", result: "pass", yes: 90, no: 55 }), "Voted No on passing a bill relating to school funding. It passed 90–55.");
  assert.equal(txVoteLine({ option: "absent", kind: "pass", name: "a bill relating to school funding", result: "fail", yes: 60, no: 85 }), "Did not vote on passing a bill relating to school funding. It did not pass, 60–85.");
  assert.equal(txVoteLine({ option: "yes", kind: "pass", name: "a bill relating to school funding", result: "pass", yes: 90, no: 55, tallyOk: false }), "Voted Yes to pass a bill relating to school funding. It passed.");
  assert.equal(NO_RECENT_VOTE, "No recent vote on a bill on record.");
  // The date comes from the session list, not from a literal.
  const next = TX_SESSIONS.filter(s => s.start > "2026-11-17").sort((a, b) => a.start.localeCompare(b.start))[0];
  assert.equal(txNoVoteLine("2026-11-17", TX_SESSIONS), `The Texas Legislature next meets on ${longDate(next.start)}; no votes yet this session.`);
  assert.equal(txNoVoteLine("2026-11-17", TX_SESSIONS), "The Texas Legislature next meets on 12 January 2027; no votes yet this session.");
  assert.equal(txNoVoteLine("2027-02-01", TX_SESSIONS), "No votes yet this session.");
  assert.equal(txNoVoteLine("2026-11-17", [{ start: "2025-01-14", end: "2025-06-02" }]), "The Texas Legislature is not in session. No recent vote on a bill on record.");
});

/* ------------------------------------------------------------------- the place --- */

const TABLE = { congress: 119, districts: { "TX-10": "78660 78641", "TX-17": "78660", "TX-35": "78660 78704", "TX-37": "78660 78701 78704", "VT-AL": "05401", "DC-AL": "20001", "NM-02": "79922", "TX-16": "79922 79936" } };

test("a ZIP in one district gives the district; a ZIP that spans several gives a choice, never a guess", () => {
  const index = zipIndex(TABLE);
  assert.deepEqual(placeForZip("78701", index, stateForZip), { state: "TX", congressional: "TX-37", choices: [] });
  assert.deepEqual(placeForZip("78660", index, stateForZip), { state: "TX", congressional: null, choices: ["TX-10", "TX-17", "TX-35", "TX-37"] });
  assert.deepEqual(placeForZip("05401", index, stateForZip), { state: "VT", congressional: "VT-AL", choices: [] });
  assert.deepEqual(placeForZip("79922", index, stateForZip), { state: "TX", congressional: null, choices: ["NM-02", "TX-16"] }, "a ZIP that crosses a state line");
  assert.deepEqual(placeForZip("73301", index, stateForZip), { state: "TX", congressional: null, choices: [] }, "a ZIP the Census table does not list still gives its state");
  assert.equal(placeForZip("00000", index, stateForZip), null, "not a US ZIP");
});

test("the ZIP table names a district only while its own Congress is sitting", () => {
  assert.deepEqual(placeForZip("78701", zipIndexFor(TABLE, 119), stateForZip), { state: "TX", congressional: "TX-37", choices: [] });
  assert.deepEqual(placeForZip("78701", zipIndexFor(TABLE, 120), stateForZip), { state: "TX", congressional: null, choices: [] }, "a new Congress: state only, the reader chooses");
});

test("the shipped ZIP table: built from the Census file, every district id well formed", () => {
  const table = JSON.parse(readFileSync(new URL("../lib/data/zip-districts.json", import.meta.url), "utf8"));
  assert.equal(table.congress, 119);
  assert.match(table.source, /^https:\/\/www2\.census\.gov\//);
  const ids = Object.keys(table.districts);
  assert.ok(ids.length >= 435 && ids.every(id => /^[A-Z]{2}-(\d{2}|AL)$/.test(id)));
  assert.equal(ids.filter(id => id.startsWith("TX-")).length, 38);
  const index = zipIndex(table);
  assert.ok(index.size > 30000);
  assert.deepEqual(index.get("78701"), ["TX-37"]); // the Texas Capitol's ZIP
  assert.ok(index.get("78660").length > 1);
});

test("what was typed as a ZIP", () => {
  assert.equal(cleanZip(" 78701 "), "78701"); assert.equal(cleanZip("78701-1234"), "78701"); assert.equal(cleanZip("787011234"), "78701");
  for (const bad of ["", "7870", "787O1", "abcde", "123456", null, undefined]) assert.equal(cleanZip(bad), null, String(bad));
  for (const m of Object.values(PLACE_ERRORS)) assert.ok(m.length > 20 && !/error|invalid|geocod/i.test(m), m);
});

test("the Census map's Congress is read from the match, so a map that runs ahead of the sitting Congress is noticed", () => {
  assert.equal(censusCongress({ geographies: { "120th Congressional Districts": [{ CD120: "10", CDSESSN: "120" }] } }), 120);
  assert.equal(censusCongress({ geographies: { "119th Congressional Districts": [{ CD119: "37" }] } }), 119);
  assert.equal(censusCongress({ geographies: { States: [{ STUSAB: "TX" }] } }), null);
  assert.equal(censusCongress(null), null);
});

/* ------------------------------------------------------------------ what is next --- */

test("coming votes: bills on the reader's issues first, the given order kept inside each group", () => {
  const items = [{ id: "a", issues: [] }, { id: "b", issues: ["taxes"] }, { id: "c", issues: ["health-care", "taxes"] }, { id: "d", issues: ["guns"] }, { id: "e", issues: ["health-care"] }];
  assert.deepEqual(orderByIssues(items, ["health-care"]).map(i => [i.id, i.onIssue]), [["c", true], ["e", true], ["a", false], ["b", false], ["d", false]]);
  assert.deepEqual(orderByIssues(items, ["guns", "taxes"]).map(i => i.id), ["b", "c", "d", "a", "e"]);
  assert.deepEqual(orderByIssues(items, []).map(i => i.id), ["a", "b", "c", "d", "e"], "no issues picked: the schedule's own order");
  assert.equal(items[0].onIssue, undefined, "the input is not changed");
});

test("a scheduled bill gets a starter bill record: the House title, or the number for the Senate", () => {
  assert.deepEqual(floorBillStub({ billId: "119-hr-10136", chamber: "house", label: "H.R. 10136", description: "Crossett Experimental Forest Act of 2026, as amended" }),
    { id: "119-hr-10136", congress: 119, billType: "hr", number: 10136, title: "Crossett Experimental Forest Act of 2026" });
  assert.equal(floorBillStub({ billId: "119-s-4668", chamber: "senate", label: "S. 4668", description: "The Senate will resume consideration of S. 4668 at 3 p.m." }).title, "S. 4668");
  assert.equal(floorBillStub({ billId: null, chamber: "house", label: "Motion", description: "x" }), null);
  assert.equal(floorBillStub({ billId: "not-a-bill", chamber: "house", label: "x", description: "x" }), null);
});

/* ---------------------------------------------------------- district comparison --- */

test("the district comparison: a total only from 25 counted answers, otherwise the reason, never a number", () => {
  assert.equal(MIN_SHOWN, 25);
  const below = districtCompareLine({ enabled: true, district: "TX-37", totals: { support: 14, oppose: 10 } });
  assert.deepEqual(below, { state: "below", text: "Not enough verified answers from your district yet. Totals show once 25 verified people have answered." });
  assert.equal(districtCompareLine({ enabled: true, district: "TX-37", totals: null }).state, "below");
  assert.deepEqual(districtCompareLine({ enabled: true, district: "TX-37", totals: { support: 15, oppose: 10 } }), { state: "shown", text: "In TX-37: 15 support · 10 oppose" });
  assert.equal(districtCompareLine({ enabled: true, district: null, totals: { support: 40, oppose: 10 } }).state, "no_district");
  // With verification switched off nothing is counted, and it says so even when a total exists in the table.
  const off = districtCompareLine({ enabled: false, district: "TX-37", totals: { support: 40, oppose: 30 } });
  assert.equal(off.state, "off");
  assert.match(off.text, /^Counting opens when verification is switched on\./);
  for (const line of [below, off, districtCompareLine({ enabled: true, district: null, totals: null })]) assert.doesNotMatch(line.text.replace(/\b25\b/g, ""), /\d/, "no figure below the threshold");
});

test("the small print under the buttons says what is true for each setting", () => {
  assert.match(answerPrivacyLine(true), /^Your answer is private\. It counts toward your district’s total only after you verify you are a real person/);
  assert.match(answerPrivacyLine(false), /Nothing is counted toward a district total yet/);
});

/* ------------------------------------------------------- time to first weigh-in --- */

test("time from the landing form to the first answer, as a bucket", () => {
  const first = 1_794_900_000, at = s => (first + s) * 1000;
  assert.equal(answerBucket(String(first), at(0)), "under_60");
  assert.equal(answerBucket(String(first), at(59)), "under_60");
  assert.equal(answerBucket(String(first), at(60)), "60_120");
  assert.equal(answerBucket(String(first), at(119)), "60_120");
  assert.equal(answerBucket(String(first), at(120)), "120_300");
  assert.equal(answerBucket(String(first), at(299)), "120_300");
  assert.equal(answerBucket(String(first), at(300)), "over_300");
  assert.equal(answerBucket(String(first), at(86_400 * 30)), "over_300");
  for (const bad of [undefined, null, "", "abc", "12", String(first + 500), "1794900000; x"]) assert.equal(answerBucket(bad, at(10)), null, String(bad));
});
