import { test } from "node:test";
import assert from "node:assert/strict";
import { txNoRecordedVoteLine, TX_NO_MEMBER_ON_FILE } from "../lib/flow/votes.ts";
import { TX_SESSIONS } from "../lib/texas/parse.ts";
import { comparable, countLine, mainDecision, decisionLabel, decisionLine, family, firstUseTerms, memberOnDecision, NOT_LISTED_IN_RECORD, NOT_LISTED_LABEL, optionLine, plainAction,
  txDecisions, UNKNOWN_LABEL, VOICE_LABEL, voteAnchor, voteMarker } from "../lib/texas/vote-record.ts";

// History lines copied from Texas Legislature Online (89th Legislature, Regular Session), oldest first.
const A = (date, chamber, description, classification = []) => ({ date, chamber, description, classification });
const SB500 = [
  A("2024-11-22", "upper", "Filed", ["filing"]),
  A("2025-02-03", "upper", "Read first time", ["reading-1"]),
  A("2025-02-03", "upper", "Referred to Health & Human Services", ["referral-committee"]),
  A("2025-04-16", "upper", "Vote taken in committee"),
  A("2025-04-22", "upper", "Reported favorably as substituted", ["committee-passage"]),
  A("2025-04-22", "upper", "Recommended for local & uncontested calendar"),
  A("2025-05-01", "upper", "Placed on local & uncontested calendar"),
  A("2025-05-01", "upper", "Laid before the Senate"),
  A("2025-05-01", "upper", "Read 2nd time & passed to engrossment", ["reading-2"]),
  A("2025-05-01", "upper", "Vote recorded in Journal"),
  A("2025-05-01", "upper", "Three day rule suspended"),
  A("2025-05-01", "upper", "Record vote"),
  A("2025-05-01", "upper", "Read 3rd time", ["reading-3"]),
  A("2025-05-01", "upper", "Passed", ["passage"]),
  A("2025-05-01", "upper", "Record vote"),
  A("2025-05-01", "upper", "Reported engrossed"),
  A("2025-05-27", "lower", "Read 2nd time", ["reading-2"]),
  A("2025-05-27", "lower", "Passed to 3rd reading"),
  A("2025-05-27", "lower", "Record vote RV#3761"),
  A("2025-05-27", "lower", "Statement(s) of vote recorded in Journal"),
  A("2025-05-28", "lower", "Read 3rd time", ["reading-3"]),
  A("2025-05-28", "lower", "Passed", ["passage"]),
  A("2025-05-28", "lower", "Record vote RV#3874"),
  A("2025-05-28", "upper", "House passage reported"),
];

test("real TLO wording: each decision gets the vote line that follows it", () => {
  const d = txDecisions(SB500, []);
  assert.deepEqual(d.map(x => [x.action, x.kind, x.reason, x.rv]), [
    ["Reported favorably as substituted", "unknown", "committee", null],
    ["Read 2nd time & passed to engrossment", "unknown", "journal_unclear", null],
    ["Three day rule suspended", "recorded", "record_vote_no_list", null],
    ["Passed", "recorded", "record_vote_no_list", null],
    ["Passed to 3rd reading", "recorded", "record_vote_no_list", "3761"],
    ["Passed", "recorded", "record_vote_no_list", "3874"],
  ]);
  assert.equal(d[3].what, "Passed the Senate");
  assert.equal(d[5].what, "Passed the House");
  assert.match(d[4].what, /first of two floor votes \(second reading\)/);
});

test("lines that are notes, notices or clerical are not decisions", () => {
  for (const s of ["House passage reported", "Senate passage as amended reported", "House concurs in Senate amendment(s)-reported", "Reported engrossed", "Reported enrolled", "Read first time",
    "Amendment(s) offered", "Amendment withdrawn", "Statement(s) of vote recorded in Journal", "Reason for vote recorded in Journal", "Placed on local & uncontested calendar", "Vote taken in committee",
    "Received from the Senate", "Signed in the House", "Scheduled for public hearing on . . ."]) assert.equal(decisionLine(s), null, s);
  for (const s of ["Passed", "Passed as amended", "Passed to engrossment as amended", "Amendment tabled", "Amended", "Amendment adopted as amended", "House concurs in Senate amendment(s)",
    "Senate adopts conference committee report", "Motion prevails", "Three day rule suspended", "Calendars Committee rule adopted", "Vote reconsidered", "Failed to pass"]) assert.equal(decisionLine(s), "floor", s);
  assert.equal(decisionLine("Reported favorably w/o amendment(s)"), "committee");
});

test("markers: record, nonrecord, Senate journal, voice, consent", () => {
  assert.deepEqual(voteMarker("Record vote RV#303"), { reason: "record", rv: "303" });
  assert.deepEqual(voteMarker("Record vote"), { reason: "record", rv: null });
  assert.equal(voteMarker("Nonrecord vote recorded in Journal").reason, "nonrecord");
  assert.equal(voteMarker("Vote recorded in Journal").reason, "journal_unclear");
  assert.equal(voteMarker("Statement(s) of vote recorded in Journal"), null);
  assert.equal(voteMarker("Reason for vote recorded in Journal"), null);
});

test("a House amendment adopted with a nonrecord vote: not individually recorded, no position", () => {
  const d = txDecisions([A("2025-04-10", "lower", "Amendment(s) offered"), A("2025-04-10", "lower", "Amended", ["amendment-passage"]), A("2025-04-10", "lower", "Nonrecord vote recorded in Journal")], []);
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, "not_recorded");
  assert.equal(decisionLabel(d[0]).label, NOT_LISTED_LABEL);
  assert.equal(decisionLabel(d[0]).label, "The official record does not list how each member voted");
  assert.equal(memberOnDecision(d[0], "yes").show, "label", "even a stray option never becomes a position");
  assert.equal(comparable(d[0]), false);
});

test("voice vote: from the line itself or a marker; label and no position", () => {
  const a = txDecisions([A("2027-02-10", "upper", "Passed to engrossment by viva voce vote", ["passage"])], []);
  const b = txDecisions([A("2027-02-10", "lower", "Passed", ["passage"]), A("2027-02-10", "lower", "Voice vote")], []);
  for (const d of [a[0], b[0]]) {
    assert.equal(d.kind, "voice");
    assert.equal(decisionLabel(d).label, VOICE_LABEL);
    assert.equal(decisionLabel(d).label, "Voice vote: members' individual votes were not recorded");
    assert.deepEqual(memberOnDecision(d, null), { show: "label", line: VOICE_LABEL });
    assert.equal(comparable(d), false);
  }
});

test("a feed vote is never attached to a line that says voice or nonrecord", () => {
  const v = { id: "ocd-vote/1", motion: "passage", date: "2027-02-10", result: "pass", chamber: "lower", counts: { yes: 140, no: 2 }, tallyOk: 1, listed: 142 };
  const d = txDecisions([A("2027-02-10", "lower", "Passed", ["passage"]), A("2027-02-10", "lower", "Voice vote")], [v]);
  assert.equal(d.length, 2);
  assert.equal(d.find(x => x.action === "Passed").kind, "voice");
  assert.equal(d.find(x => x.vote).vote.id, "ocd-vote/1");
});

test("unanimous consent", () => {
  const d = txDecisions([A("2027-03-01", "upper", "Adopted without objection")], []);
  assert.equal(d[0].reason, "consent");
  assert.equal(d[0].kind, "not_recorded");
  assert.match(decisionLabel(d[0]).note, /no member objected/);
});

test("no vote line at all: unknown, and the page says the record does not say", () => {
  const d = txDecisions([A("2025-05-22", "upper", "Vote reconsidered")], []);
  assert.equal(d[0].kind, "unknown");
  assert.equal(d[0].reason, "no_vote_line");
  assert.equal(decisionLabel(d[0]).label, UNKNOWN_LABEL);
  assert.match(UNKNOWN_LABEL, /does not say/);
  assert.equal(memberOnDecision(d[0], null).show, "label");
});

test("a feed vote joins the matching record-vote line: tally, link to the member list, positions", () => {
  const v = { id: "ocd-vote/abc", motion: "Final passage", date: "2025-05-28", result: "pass", chamber: "lower", counts: { yes: 120, no: 25, "not voting": 2 }, tallyOk: 1, listed: 147 };
  const d = txDecisions(SB500, [v]), passed = d.find(x => x.rv === "3874");
  assert.equal(passed.vote.id, "ocd-vote/abc");
  assert.equal(passed.reason, "record_vote");
  const l = decisionLabel(passed);
  assert.equal(l.label, "Record vote: 120 yes, 25 no, 2 present, not voting (passed)");
  assert.equal(l.link, true);
  assert.equal(memberOnDecision(passed, "no").line, "Voted no");
  assert.deepEqual(memberOnDecision(passed, null), { show: "not_listed", line: NOT_LISTED_IN_RECORD });
  assert.equal(NOT_LISTED_IN_RECORD, "Not listed in this vote's record");
  assert.equal(comparable(passed), true);
  assert.equal(d.filter(x => x.vote).length, 1, "attached once, not duplicated");
});

test("a feed vote with no matching line stands on its own as a recorded decision", () => {
  const v = { id: "ocd-vote/90-hb2-1", motion: "Passed to engrossment", date: "2026-11-14", result: "pass", chamber: "lower", counts: { yes: 3, no: 1 }, tallyOk: 1, listed: 4 };
  const d = txDecisions([A("2026-11-09", "lower", "Filed", ["filing"]), A("2026-11-14", "lower", "Referred to Public Education", ["referral-committee"])], [v]);
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, "recorded");
  assert.equal(d[0].vote.id, v.id);
});

test("two feed votes that could each fit two amendment lines are not guessed between", () => {
  const acts = [A("2025-04-16", "lower", "Amendment tabled"), A("2025-04-16", "lower", "Record vote RV#237"), A("2025-04-16", "lower", "Amendment tabled"), A("2025-04-16", "lower", "Record vote RV#238")];
  const votes = ["x", "y"].map(id => ({ id, motion: "Motion to table amendment", date: "2025-04-16", result: "pass", chamber: "lower", counts: { yes: 80, no: 60 }, tallyOk: 1, listed: 140 }));
  const d = txDecisions(acts, votes);
  assert.equal(d.filter(x => x.rv && x.vote).length, 0);
  assert.equal(d.filter(x => !x.rv && x.vote).length, 2);
  assert.equal(d.length, 4);
});

test("a feed vote with totals but no member list: recorded, but no position and not comparable", () => {
  const v = { id: "v", motion: "passage", date: "2025-05-28", result: "pass", chamber: "lower", counts: { yes: 1, no: 0 }, tallyOk: 1, listed: 0 };
  const d = txDecisions([A("2025-05-28", "lower", "Passed", ["passage"]), A("2025-05-28", "lower", "Record vote RV#1")], [v]);
  assert.equal(d[0].reason, "record_vote_no_list");
  assert.equal(memberOnDecision(d[0], null).show, "no_list");
  assert.equal(comparable(d[0]), false);
});

test("a tally that does not add up is shown with a note and kept out of comparisons", () => {
  const v = { id: "v", motion: "passage", date: "2025-05-28", result: "pass", chamber: "lower", counts: { yes: 100, no: 40 }, tallyOk: 0, listed: 139 };
  const d = txDecisions([A("2025-05-28", "lower", "Passed", ["passage"])], [v]);
  assert.match(decisionLabel(d[0]).note, /Tally under review/);
  assert.equal(comparable(d[0]), false);
});

test("member lines never turn a procedural step or an amendment into a vote on the bill", () => {
  assert.equal(optionLine("yes", { action: "Amendment tabled", what: "" }), "Voted yes on a procedural step (not a vote on the bill itself)");
  assert.equal(optionLine("no", { action: "Amended", what: "" }), "Voted no on a proposed change");
  assert.equal(optionLine("absent", { action: "Passed", what: "" }), "Listed as absent");
  assert.equal(optionLine("not voting", { action: "Passed", what: "" }), "Listed as present, not voting");
});

test("plain words: first use of each term on a page, once", () => {
  const d = txDecisions(SB500, []);
  const t = firstUseTerms(d), all = [...t.values()].flat();
  assert.equal(new Set(all).size, all.length, "each term once");
  assert.ok(all.includes("record") && all.includes("journal") && all.includes("secondReading"));
  assert.deepEqual(t.get(d.find(x => x.reason === "journal_unclear").key), ["secondReading", "journal"]);
  assert.equal(firstUseTerms(d, ["record", "journal", "secondReading"]).size, 0);
});

test("small helpers", () => {
  assert.equal(countLine({ no: 1, yes: 3 }), "3 yes, 1 no");
  assert.equal(family("Passed to engrossment"), "advance");
  assert.equal(family("Amendment tabled"), "table");
  assert.equal(family("Passed"), "pass");
  assert.equal(plainAction("House concurs in Senate amendment(s)", "lower"), "The House accepted the other chamber's changes");
  assert.equal(voteAnchor("ocd-vote/90-hb2-1"), "vote-ocd-vote-90-hb2-1");
});

test("real House sequence (SB 1, 89R): a record vote after a line that is not a decision stands alone, never on the next line", () => {
  const acts = [A("2025-04-11", "lower", "Passed to 3rd reading as amended"), A("2025-04-11", "lower", "Record vote RV#150"), A("2025-04-11", "lower", "Statement(s) of vote recorded in Journal"),
    A("2025-04-11", "lower", "Constitutional three day rule suspended"), A("2025-04-11", "lower", "Record vote RV#153"), A("2025-04-11", "lower", "Read 3rd time"),
    A("2025-04-11", "lower", "Passed", ["passage"]), A("2025-04-11", "lower", "Record vote RV#154"), A("2025-04-11", "lower", "Read 3rd time"), A("2025-04-11", "lower", "Record vote RV#999")];
  const d = txDecisions(acts, []);
  assert.deepEqual(d.map(x => [x.action, x.rv]), [["Passed to 3rd reading as amended", "150"], ["Constitutional three day rule suspended", "153"], ["Passed", "154"], ["A vote was taken", "999"]]);
});

test("the same nonrecord note twice is one decision", () => {
  const d = txDecisions([A("2025-04-11", "lower", "Amended"), A("2025-04-11", "lower", "Nonrecord vote recorded in Journal"), A("2025-04-11", "lower", "Nonrecord vote recorded in Journal")], []);
  assert.equal(d.length, 1);
  assert.equal(d[0].reason, "nonrecord");
});

test("main decisions: the floor votes on the bill and committee reports; amendments and procedure are the rest", () => {
  const d = txDecisions(SB500, []);
  assert.deepEqual(d.filter(mainDecision).map(x => x.action), ["Reported favorably as substituted", "Read 2nd time & passed to engrossment", "Passed", "Passed to 3rd reading", "Passed"]);
});

test("Texas cards: no record vote, and a seat with no member on file", () => {
  assert.equal(txNoRecordedVoteLine("2026-11-17", TX_SESSIONS), "No recorded vote on file yet. The Texas Legislature next meets on 12 January 2027.");
  assert.equal(txNoRecordedVoteLine("2027-02-01", TX_SESSIONS), "No recorded vote on file yet.");
  assert.equal(TX_NO_MEMBER_ON_FILE, "The official list has no member for this seat right now.");
  assert.doesNotMatch(TX_NO_MEMBER_ON_FILE, /vacant/i);
});
