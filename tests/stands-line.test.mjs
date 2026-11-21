// Owner, 21 Nov 2026: "The single visible line on where the bill stands must also say whether it can still be changed,
// and the hearing date when one is confirmed. Examples: 'In a Senate committee. It can still be changed. Hearing:
// Tuesday, Dec 1.' 'Passed the House, now in the Senate. It can still be changed.' 'Became law on July 12, 2026. It can
// no longer be changed.' Keep it to one line where possible, two at most."
import test from "node:test";
import assert from "node:assert/strict";
import { federalWindow, texasWindow, CHANGES, NO_HEARING_DATE } from "../lib/changes/window.ts";
import { shortChange, shortHearing, shortWhere, standsLine } from "../lib/changes/stands-line.ts";

const w = (o) => ({ place: "committee", state: "open", where: "In committee in the Senate.", changes: CHANGES.committee, hearing: NO_HEARING_DATE, hearingAt: null, ...o });

test("the owner's three examples", () => {
  assert.equal(standsLine(w({ place: "hearing_scheduled", where: "In committee: the Senate Committee on Finance has it. A hearing is set for Tuesday, December 1 at 10:00 a.m. Eastern.",
    hearing: "A hearing is set for Tuesday, December 1 at 10:00 a.m. Eastern.", hearingAt: "2026-12-01T15:00:00Z" })), "In a Senate committee. It can still be changed. Hearing: Tuesday, Dec 1.");
  assert.equal(standsLine(w({ place: "other_chamber", where: "Passed the House on November 17, 2026. The Senate has it now.", changes: CHANGES.otherChamber("Senate", "House") })), "Passed the House, now in the Senate. It can still be changed.");
  assert.equal(standsLine(w({ place: "final", state: "closed", where: "Became law on July 12, 2026.", changes: CHANGES.law })), "Became law on July 12, 2026. It can no longer be changed.");
});

test("on the President's desk the text is final, but the bill is not finished", () => {
  const base = { congress: 119, billType: "hr", committees: [], meetings: [], floorChambers: [], stalledIn: null, blocked: null, actionsUrl: "https://www.congress.gov/x/all-actions", now: Date.parse("2026-11-21T12:00:00Z") };
  // Owner, 21 Nov 2026, word for word.
  assert.equal(standsLine(federalWindow({ ...base, stage: "president", stageDate: "2026-11-13" })), "Sent to the President on November 13, 2026. The text is final; the President can still sign or veto it.");
  // "Use 'It can no longer be changed' only once it is law, vetoed without override, or dead."
  assert.equal(standsLine(federalWindow({ ...base, stage: "law", stageDate: "2026-07-12" })), "Became law on July 12, 2026. It can no longer be changed.");
  assert.equal(standsLine(federalWindow({ ...base, stage: "vetoed", stageDate: "2026-10-02" })), "Vetoed by the President on October 2, 2026. The text is final; Congress can still override the veto.");
  assert.equal(standsLine(federalWindow({ ...base, stage: "vetoed", stageDate: "2026-10-02", now: Date.parse("2027-02-01T00:00:00Z") })), "Vetoed by the President on October 2, 2026. It can no longer be changed.", "that Congress has ended: no override is possible");
  assert.equal(standsLine(federalWindow({ ...base, stage: "failed", stageDate: "2026-11-19", stalledIn: "senate" })), "Failed a vote in the Senate on November 19, 2026. It can no longer be changed.");
  assert.equal(standsLine(federalWindow({ ...base, stage: "committee", stageDate: "2026-01-02", now: Date.parse("2027-02-01T00:00:00Z") })), "Congress ended before it became law. It can no longer be changed.");
  assert.equal(shortChange({ state: "closed", changes: CHANGES.governor }), "The text is final; the Governor can still sign or veto it.");
  assert.equal(shortChange({ state: "closed", changes: CHANGES.sessionOver("June 2, 2027") }), "It can no longer be changed.");
});

test("a hearing date is given only when it was confirmed", () => {
  assert.equal(shortHearing(w({})), null);
  assert.equal(shortHearing(w({ hearing: "A committee meeting on this bill is listed, but its date could not be confirmed. The date isn't known.", hearingAt: null })), null, "listed but not confirmed: no date");
  assert.equal(shortHearing(w({ hearing: "A meeting to vote on changes (a markup) is set for Thursday, December 3 at 2:00 p.m. Eastern.", hearingAt: "2026-12-03T19:00:00Z" })), "Vote on changes: Thursday, Dec 3.");
  assert.equal(shortHearing(w({ hearing: "A committee meeting on this bill is set for Monday, December 7 at 9:00 a.m. Eastern.", hearingAt: "2026-12-07T14:00:00Z" })), "Committee meeting: Monday, Dec 7.");
  // The day is the chamber's own day, not the day in London: 8 p.m. Eastern on Dec 1 is already Dec 2 in UTC.
  assert.equal(shortHearing(w({ hearing: "A hearing is set for Tuesday, December 1 at 8:00 p.m. Eastern.", hearingAt: "2026-12-02T01:00:00Z" })), "Hearing: Tuesday, Dec 1.");
  assert.equal(shortHearing(w({ hearing: "A hearing is set for …", hearingAt: "not a date" })), null);
});

test("whether it can still be changed follows the window the record gives", () => {
  assert.equal(shortChange({ state: "open", changes: CHANGES.committee }), "It can still be changed.");
  assert.equal(shortChange({ state: "closed", changes: CHANGES.law }), "It can no longer be changed.");
  assert.equal(shortChange({ state: "not_open_yet", changes: CHANGES.notOpenYet }), "It cannot be changed yet.");
  assert.equal(shortChange({ state: "narrow", changes: CHANGES.resolving }), "It can be changed only in a narrow way.");
  assert.equal(shortChange({ state: "narrow", changes: CHANGES.stalled("Senate") }), "It can be changed only if it is taken up again.");
});

test("where it is, in a few words", () => {
  assert.equal(shortWhere({ place: "committee", where: "In committee: the House Committee on Natural Resources has it." }), "In a House committee.");
  assert.equal(shortWhere({ place: "committee", where: "In committee." }), "In committee.");
  assert.equal(shortWhere({ place: "other_chamber", where: "Passed the House on November 17, 2026. The Senate has it now. It is on the Senate floor schedule this week." }), "Passed the House, now in the Senate.");
  assert.equal(shortWhere({ place: "other_chamber", where: "Passed the House on September 15, 2026. The Senate has it, but a vote to take it up failed on November 19, 2026." }), "Passed the House, now stalled in the Senate.");
  assert.equal(shortWhere({ place: "other_chamber", where: "Passed one chamber on May 2, 2027. The other chamber has it now." }), "Passed one chamber, now in the other chamber.");
  assert.equal(shortWhere({ place: "final", where: "Sent to the President on November 13, 2026." }), "Sent to the President on November 13, 2026.");
  assert.equal(shortWhere({ place: "floor", where: "Stalled on the Senate floor: a vote to end debate failed on November 19, 2026." }), "Stalled on the Senate floor.");
  assert.equal(shortWhere({ place: "final", where: "The 119th Congress ended on January 3, 2027, and this bill had not become law." }), "Congress ended before it became law.");
  assert.equal(shortWhere({ place: "introduced", where: "Filed for the 2027 regular session, which opens January 12, 2027." }), "Filed for the session that opens January 12, 2027.");
  assert.equal(shortWhere({ place: "resolving", where: "Passed both chambers in different versions. The House and the Senate are settling the differences." }), "Passed both chambers in different versions.");
});

test("real windows from the record's own rules stay short: two lines on a phone at most", () => {
  const base = { congress: 119, billType: "hr", committees: [], meetings: [], floorChambers: [], stalledIn: null, blocked: null, actionsUrl: "https://www.congress.gov/x/all-actions", now: Date.parse("2026-11-21T12:00:00Z") };
  const cases = [
    { ...base, stage: "introduced", stageDate: "2026-11-01" },
    { ...base, stage: "committee", stageDate: "2026-11-02", committees: [{ name: "Committee on Natural Resources", chamber: "house", referredAt: "2026-11-02", reportedAt: null }] },
    { ...base, stage: "passed_first", stageDate: "2026-11-17" },
    { ...base, stage: "passed_second", stageDate: "2026-11-18" },
    { ...base, stage: "resolving", stageDate: "2026-11-18" },
    { ...base, stage: "president", stageDate: "2026-11-13" },
    { ...base, stage: "law", stageDate: "2026-07-12" },
    { ...base, stage: "vetoed", stageDate: "2026-07-12" },
    { ...base, stage: "failed", stageDate: "2026-11-19", stalledIn: "senate" },
    { ...base, stage: "law", stageDate: "2026-07-12", now: Date.parse("2027-02-01T00:00:00Z") },
    { ...base, stage: "committee", stageDate: "2026-01-02", now: Date.parse("2027-02-01T00:00:00Z") },
  ];
  for (const f of cases) {
    const win = federalWindow(f); assert.ok(win, f.stage);
    const line = standsLine(win);
    // The line for a bill on the President's desk, and for a veto that can still be overridden, is the owner's own wording and is a little longer.
    assert.ok(line.length <= (/^The text is final/.test(line.split(". ").at(-1)) ? 104 : 90), `${f.stage}: ${line.length} characters: ${line}`);
    assert.match(line, /It can (?:still be changed|no longer be changed|be changed only|not be changed yet)|It cannot be changed yet|The text is final; /, line);
    assert.doesNotMatch(line, /Hearing:|Vote on changes:|Committee meeting:/, "no meeting was confirmed in these");
  }
  assert.equal(standsLine(federalWindow(cases[6])), "Became law on July 12, 2026. It can no longer be changed.");
  assert.equal(standsLine(federalWindow(cases[1])), "In a House committee. It can still be changed.");
  assert.equal(typeof texasWindow, "function");
});
