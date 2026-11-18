import test from "node:test";
import assert from "node:assert/strict";
import { meaningfulVote, matchMark, memberVoteLine, districtView, answeredBills, DISTRICT_THRESHOLD_MESSAGE, DISTRICT_OFF_MESSAGE, MARK_LABEL } from "../lib/voice-rules.ts";
import { MIN_SHOWN } from "../lib/verify/rules.ts";

const day = n => Date.UTC(2026, 10, n, 17);
const v = (id, chamber, question, votedAt, extra = {}) => ({ id, chamber, question, votedAt, title: "A bill to do a thing", result: "Passed", yea: 60, nay: 40, rollNumber: 1, ...extra });

test("the vote shown is the final vote on passing the bill in that chamber", () => {
  const votes = [
    v("h1", "house", "On Agreeing to the Amendment", day(3)),
    v("h2", "house", "On Motion to Recommit", day(4), { result: "Failed" }),
    v("h3", "house", "On Passage", day(4)),
    v("h4", "house", "On Motion to Concur in the Senate Amendment", day(12)),
    v("s1", "senate", "On Cloture on the Motion to Proceed", day(6), { result: "Cloture on the Motion to Proceed Agreed to" }),
    v("s2", "senate", "On Passage of the Bill", day(9), { result: "Bill Passed" }),
    v("s3", "senate", "On the Amendment S.Amdt. 12", day(10)),
  ];
  const house = meaningfulVote(votes, "house");
  assert.equal(house.vote.id, "h4", "the latest vote on the bill itself is the final one");
  assert.equal(house.role, "passage");
  assert.equal(meaningfulVote(votes, "senate").vote.id, "s2", "a later amendment vote never replaces the passage vote");
  assert.equal(meaningfulVote(votes, "upper"), null, "a chamber with no vote has nothing to show");
});

test("with no vote on the bill itself, the latest failed vote to take it up is shown", () => {
  const votes = [
    v("s1", "senate", "On Cloture on the Motion to Proceed", day(3), { result: "Cloture on the Motion to Proceed Rejected", yea: 47, nay: 52 }),
    v("s2", "senate", "On the Amendment S.Amdt. 12", day(2)),
    v("s0", "senate", "On Cloture on the Motion to Proceed", day(1), { result: "Cloture on the Motion to Proceed Rejected", yea: 45, nay: 54 }),
  ];
  const m = meaningfulVote(votes, "senate");
  assert.equal(m.vote.id, "s1");
  assert.equal(m.role, "stopped");
  assert.equal(m.step, "end_debate");
  assert.match(m.label, /47–52/);
  const proceed = meaningfulVote([v("s5", "senate", "On the Motion to Proceed", day(5), { result: "Motion to Proceed Rejected", yea: 48, nay: 51 })], "senate");
  assert.equal(proceed.role, "stopped");
  assert.equal(proceed.step, "debate");
  const discharge = meaningfulVote([v("s6", "senate", "On the Motion to Discharge", day(5), { result: "Motion to Discharge Rejected", yea: 48, nay: 51 })], "senate");
  assert.equal(discharge.step, "committee");
});

test("a later step that carried means nothing has decided the bill yet", () => {
  const votes = [
    v("s1", "senate", "On Cloture on the Motion to Proceed", day(3), { result: "Cloture on the Motion to Proceed Rejected" }),
    v("s2", "senate", "On Cloture on the Motion to Proceed", day(8), { result: "Cloture on the Motion to Proceed Agreed to" }),
  ];
  assert.equal(meaningfulVote(votes, "senate"), null);
});

test("amendments, nominations and routine procedural steps are never the vote shown", () => {
  const routine = [
    v("a", "house", "On Agreeing to the Amendment", day(1), { result: "Failed" }),
    v("b", "house", "On Ordering the Previous Question", day(2)),
    v("c", "house", "On Motion to Recommit", day(3), { result: "Failed" }),
    v("d", "house", "On Motion to Table", day(4)),
    v("e", "senate", "On the Nomination", day(5), { result: "Nomination Confirmed" }),
    v("f", "house", "On Agreeing to the Resolution", day(6), { title: "Providing for consideration of the bill H.R. 1" }),
    v("g", "house", "On Approving the Journal", day(7)),
  ];
  assert.equal(meaningfulVote(routine, "house"), null);
  assert.equal(meaningfulVote(routine, "senate"), null);
});

test("a vote whose kind the caller already knows (Texas motions) follows the same rule", () => {
  const votes = [
    { id: "t1", chamber: "lower", question: "Amendment 3 by Smith", votedAt: day(2), kind: "amendment" },
    { id: "t2", chamber: "lower", question: "Third reading", votedAt: day(3), kind: "passage" },
    { id: "t3", chamber: "lower", question: "Motion to table", votedAt: day(4), kind: "procedural" },
  ];
  assert.equal(meaningfulVote(votes, "lower").vote.id, "t2");
  assert.equal(meaningfulVote(votes, "upper"), null);
});

test("the mark compares Support or Oppose only with a Yes or No on passing the bill", () => {
  assert.equal(matchMark("support", "Yea", "passage"), "same");
  assert.equal(matchMark("support", "Nay", "passage"), "different");
  assert.equal(matchMark("oppose", "Nay", "passage"), "same");
  assert.equal(matchMark("oppose", "Yea", "passage"), "different");
  for (const p of ["Present", "Not Voting", null, undefined, ""]) assert.equal(matchMark("support", p, "passage"), null);
  assert.equal(matchMark("unsure", "Yea", "passage"), null, "Unsure is never compared");
  assert.equal(matchMark("support", "Yea", "stopped"), null, "a procedural vote is never a vote for or against the bill");
  assert.equal(matchMark("oppose", "Nay", "stopped"), null);
  assert.equal(matchMark("support", "Yea", null), null);
  assert.deepEqual(MARK_LABEL, { same: "Same as you", different: "Different from you" });
});

test("a member's row says how they voted, when, and whether it matches", () => {
  const passage = { vote: v("h3", "house", "On Passage", day(12)), role: "passage" };
  assert.deepEqual(memberVoteLine(passage, "Yea", "support", "Nov 12, 2026"), { state: "voted", text: "Voted yes on passing it, Nov 12, 2026", mark: "same", note: null });
  assert.deepEqual(memberVoteLine(passage, "Nay", "support", "Nov 12, 2026"), { state: "voted", text: "Voted no on passing it, Nov 12, 2026", mark: "different", note: null });
  assert.equal(memberVoteLine(passage, "Nay", "unsure", "Nov 12, 2026").mark, null);
  assert.deepEqual(memberVoteLine(passage, "Not Voting", "oppose", "Nov 12, 2026"), { state: "voted", text: "Did not vote, Nov 12, 2026", mark: null, note: null });
  assert.equal(memberVoteLine(passage, "Present", "oppose", "Nov 12, 2026").text, "Voted present, Nov 12, 2026");
  assert.deepEqual(memberVoteLine(null, null, "support", ""), { state: "not_yet", text: "Has not voted on it yet", mark: null, note: null });
  assert.deepEqual(memberVoteLine(passage, null, "support", "Nov 12, 2026"), { state: "not_in_office", text: "Not in office for that vote", mark: null, note: null });
});

test("a vote that stopped a bill is worded as a step and never marked", () => {
  const m = meaningfulVote([v("s1", "senate", "On Cloture on the Motion to Proceed", day(3), { result: "Cloture on the Motion to Proceed Rejected", yea: 47, nay: 52 })], "senate");
  for (const answer of ["support", "oppose", "unsure"]) for (const position of ["Yea", "Nay"]) {
    const line = memberVoteLine(m, position, answer, "Nov 3, 2026");
    assert.equal(line.mark, null);
    assert.equal(line.text, `Voted ${position === "Yea" ? "yes" : "no"} on ending debate so it could move ahead, Nov 3, 2026`);
    assert.match(line.note, /not on the bill itself/);
    assert.doesNotMatch(line.text, /passing/);
  }
  assert.equal(memberVoteLine(m, "Not Voting", "support", "Nov 3, 2026").text, "Did not vote, Nov 3, 2026");
});

test("the wording is the same whichever way a member voted and whoever they are", () => {
  const passage = { vote: v("h3", "house", "On Passage", day(12)), role: "passage" };
  const yes = memberVoteLine(passage, "Yea", "oppose", "Nov 12, 2026"), no = memberVoteLine(passage, "Nay", "support", "Nov 12, 2026");
  assert.equal(yes.mark, "different");
  assert.equal(no.mark, "different");
  assert.equal(yes.text.replace("yes", "no"), no.text);
});

test("a district total is never shown below the threshold", () => {
  assert.equal(MIN_SHOWN, 25);
  assert.equal(DISTRICT_THRESHOLD_MESSAGE, "Not enough constituents yet — share this bill."); // owner's wording, 18 Nov 2026
  for (const totals of [null, undefined, { support: 0, oppose: 0 }, { support: 24, oppose: 0 }, { support: 12, oppose: 12 }]) {
    const d = districtView({ enabled: true, districtId: "TX-07", totals });
    assert.equal(d.kind, "below");
    assert.equal(d.text, DISTRICT_THRESHOLD_MESSAGE);
    assert.doesNotMatch(d.text, /\d/, "no count appears below the threshold");
  }
  const shown = districtView({ enabled: true, districtId: "TX-07", totals: { support: 13, oppose: 12 } });
  assert.equal(shown.kind, "total");
  assert.equal(shown.text, "Counted residents of TX-07: 13 support · 12 oppose · 0 unsure (25 voters)");
});

test("with verification off or no district, the page says so and shows no number", () => {
  const off = districtView({ enabled: false, districtId: "TX-07", totals: { support: 900, oppose: 100 } });
  assert.equal(off.kind, "off");
  assert.equal(off.text, DISTRICT_OFF_MESSAGE);
  assert.doesNotMatch(off.text, /\d/);
  const unknown = districtView({ enabled: true, districtId: null, totals: { support: 900, oppose: 100 } });
  assert.equal(unknown.kind, "unknown");
  assert.doesNotMatch(unknown.text, /\d/);
});

test("answers are listed one per bill, newest first", () => {
  const rows = answeredBills(
    [{ billId: "119-hr-1", stance: "support", updatedAt: 10 }, { billId: "119-s-2", stance: "oppose", updatedAt: 30 }, { billId: "119-hr-9", stance: "maybe", updatedAt: 99 }],
    [{ billId: "119-hr-3", updatedAt: 20 }, { billId: "119-hr-1", updatedAt: 5 }]);
  assert.deepEqual(rows, [{ billId: "119-s-2", answer: "oppose", at: 30 }, { billId: "119-hr-3", answer: "unsure", at: 20 }, { billId: "119-hr-1", answer: "support", at: 10 }]);
  assert.deepEqual(answeredBills([], []), []);
});
