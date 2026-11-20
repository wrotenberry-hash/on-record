// Suggest changes, stage awareness (owner, 20 Nov 2026; docs/SUGGEST_CHANGES.md): "every bill page shows, in plain
// English, where the bill is ... and whether changes are still possible. When the window is closed, say so." and "Check
// the hearing-date reader against live data ... If a hearing date can't be confirmed, the page says the date isn't known."
//
// The fixtures in tests/fixtures/meetings/ are captures of 20 Nov 2026: two Congress.gov committee-meeting lists, one
// detail record (House event 119604), the House's own page for that event, and the Senate's own schedule. The store
// functions run against temporary databases built from the real migrations, with a stand-in for the network.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { toneProblems } from "../lib/analysis/tone.ts";
import { billsNamedIn, meetingBillIds, meetingNamesBill, parseMeetingDetail, parseMeetingList } from "../lib/federal/meetings-parse.ts";
import { checkMeeting, confirmationHolds, CONFIRM_FRESH_MS, easternLabel, easternWallClock, houseEventUrl, parseConfirmations, parseHouseEventPage, parseSenateHearings,
  pruneConfirmations, SENATE_HEARINGS_URL, statusCalledOff, statusGoingAhead } from "../lib/changes/hearing-check.ts";
import { CHANGES, congressEnd, federalWindow, hearingPart, HEARING_CANCELLED, HEARING_POSTPONED, HEARING_UNCONFIRMED, longDate, meetingKind, NAMED_IN_TITLE, NO_HEARING_DATE,
  originChamber, texasWindow } from "../lib/changes/window.ts";
import { CONFIRMED_KEY, confirmedHearings, confirmHearings, ensureMeetingBillStubs } from "../lib/changes/hearing-store.ts";
import { billWindow, openWindowBills } from "../lib/changes/window-store.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), HOUR = 3600e3, DAY = 24 * HOUR;
const read = p => readFileSync(join(ROOT, p), "utf8");
const fx = name => read(`tests/fixtures/meetings/${name}`);
const LIVE_DETAIL = JSON.parse(fx("live-detail-house-119604.json"));
const HOUSE_PAGE = fx("docs-house-event-119604.html"), SENATE_XML = fx("senate-hearings-2026-11-20.xml");
const FOUR = ["119-hr-10307", "119-hr-10458", "119-hr-10751", "119-hr-10956"];
const SENATE_MATTER = SENATE_XML.match(/<matter>(Business meeting to consider\s+S\.5289[\s\S]*?)<\/matter>/)[1];

/* ------------------------------------------------ A. Bills named in a title --- */

test("the live hearing's title names its four bills, which the record's list of related bills left out", () => {
  const raw = LIVE_DETAIL.committeeMeeting;
  assert.equal(raw.relatedItems, undefined, "the live record carries no relatedItems at all");
  assert.deepEqual(billsNamedIn(raw.title, 119), FOUR);
  const m = parseMeetingDetail(LIVE_DETAIL);
  assert.deepEqual(m.billIds, FOUR, "the detail reader now yields the four bills");
  // The rest of the live record, as the reader already read it.
  assert.equal(m.id, "119-house-119604");
  assert.equal(m.startsAt, "2026-11-19T17:30:00.000Z");
  assert.equal(m.meetingType, "Hearing");
  assert.equal(m.status, "Rescheduled");
  assert.deepEqual(m.committeeCodes, ["HSII24"]);
  assert.equal(m.location, "Room 1324, Longworth House Office Building");
});

test("the live lists read: 40 meetings each, every one with its event id and update time", () => {
  for (const [file, chamber] of [["live-list-house-2026-11-20.json", "house"], ["live-list-senate-2026-11-20.json", "senate"]]) {
    const { items, count } = parseMeetingList(JSON.parse(fx(file)));
    assert.equal(items.length, 40, file);
    assert.ok(count > 1000, file);
    assert.ok(items.every(i => i.chamber === chamber && i.congress === 119 && /^\d+$/.test(i.eventId) && i.updateDate), file);
  }
  const senate = parseMeetingList(JSON.parse(fx("live-list-senate-2026-11-20.json"))).items.map(i => i.eventId);
  const scheduled = [...parseSenateHearings(SENATE_XML).keys()];
  assert.ok(scheduled.filter(id => senate.includes(id)).length >= 5, "the Senate's own identifiers are the API's event ids");
});

test("bill numbers as committees write them, in both chambers and every kind", () => {
  assert.deepEqual(billsNamedIn(SENATE_MATTER, 119), ["119-s-5289"], "the Senate's \"S.5289\" with no space");
  assert.deepEqual(billsNamedIn("H.R. 10307, H.R.10307 and H. R. 7", 119), ["119-hr-10307", "119-hr-7"], "each bill once");
  assert.deepEqual(billsNamedIn("S. 5289; S.12", 118), ["118-s-5289", "118-s-12"], "the meeting's own Congress");
  assert.deepEqual(billsNamedIn("H.J. Res. 12, H.J.Res. 13, S.J. Res. 88, S. J. Res. 89", 119), ["119-hjres-12", "119-hjres-13", "119-sjres-88", "119-sjres-89"]);
  assert.deepEqual(billsNamedIn("H. Con. Res. 3, S.Con.Res. 7, H. Res. 5, H.Res. 6, S. Res. 9", 119), ["119-hconres-3", "119-sconres-7", "119-hres-5", "119-hres-6", "119-sres-9"]);
  assert.deepEqual(billsNamedIn("Legislative hearing on: •H.R. 1246 (Rep. Hageman); and•H.R. 1532 (Rep. Hageman)", 119), ["119-hr-1246", "119-hr-1532"]);
  assert.deepEqual(billsNamedIn("Markup of (H.R. 22) and \"S. 3\".", 119), ["119-hr-22", "119-s-3"]);
});

test("false friends name no bill", () => {
  for (const t of ["Oversight of U.S. 30 and the U.S. 2026 budget", "Rep. Kennedy of UT", "(Rep. Kennedy of UT), \"IHS Workforce Parity Act of 2026\"", "10 U.S.C. 1413a and 5 U.S.C. 552",
    "Harry S. Truman Scholarship Foundation", "Hearings to examine the nominations of Peter A. Feldman and Loren Smith, Jr.", "S. 123456 is not a bill number", "S. 1,234 dollars", "h.r. 5 in small letters",
    "Section 5 and Sec. 12", "HR 2026 staffing and the IRS. 30 witnesses", "Pub. L. 119-5", "Room S. Capitol", "", null, undefined, 7])
    assert.deepEqual(billsNamedIn(t, 119), [], String(t));
  assert.deepEqual(billsNamedIn("H.R. 5", 0), [], "no Congress, no id");
});

test("a meeting's bills are those its record lists plus those its title names", () => {
  const m = { congress: 119, billIds: ["119-s-88"], title: "Legislative Hearing on: H.R. 10307 (Rep. Begich) and S. 88" };
  assert.deepEqual(meetingBillIds(m), ["119-s-88", "119-hr-10307"]);
  assert.deepEqual(meetingBillIds({ congress: 119, billIds: null, title: LIVE_DETAIL.committeeMeeting.title }), FOUR, "a meeting stored before the fix, read from its stored title");
  assert.deepEqual(meetingBillIds({ congress: 119, billIds: undefined, title: null }), []);
  assert.equal(meetingNamesBill(m, "119-hr-10307"), "title");
  assert.equal(meetingNamesBill({ ...m, title: "Full committee markup" }, "119-s-88"), "record");
  assert.equal(meetingNamesBill(m, "119-hr-1"), null);
});

/* ------------------------------- B. The chamber's own calendar, and the rule --- */

test("the House's own page for event 119604: Thursday, November 19, 2026 (12:30 PM), rescheduled, not called off", () => {
  assert.deepEqual(parseHouseEventPage(HOUSE_PAGE, "119604"), { eventId: "119604", localStart: "2026-11-19T12:30", calledOff: null, kind: "Hearing" });
  assert.equal(parseHouseEventPage(HOUSE_PAGE, "119605"), null, "a page for another event is not this event's page");
  assert.equal(parseHouseEventPage(HOUSE_PAGE, "11960"), null, "nor is a page whose id only starts the same way");
  for (const bad of ["<html><body><h1>Server Error in '/' Application.</h1></body></html>", "<html><form action=\"./ByEvent.aspx?EventID=119604\"></form><p>No event found.</p></html>", "", null, undefined])
    assert.equal(parseHouseEventPage(bad, "119604"), null);
  assert.equal(houseEventUrl("119604"), "https://docs.house.gov/Committee/Calendar/ByEvent.aspx?EventID=119604");
});

test("the Senate's own schedule: seven meetings by identifier, with the Eastern start", () => {
  const s = parseSenateHearings(SENATE_XML);
  assert.equal(s.size, 7);
  assert.deepEqual(s.get("338840"), { eventId: "338840", localStart: "2026-11-19T10:00", calledOff: null, kind: "Open Hearing" });
  assert.deepEqual(s.get("338841"), { eventId: "338841", localStart: "2026-11-19T10:00", calledOff: null, kind: "Open Business Meeting" });
  assert.equal(s.get("338849").localStart, "2026-11-24T10:15", "the business meeting to consider S.5289");
  assert.equal(s.get("338880").localStart, "2026-12-02T15:30", "an afternoon meeting: 03:30 PM");
  for (const bad of ["<html>Access Denied</html>", "", null, undefined, "<meeting><identifier>1</identifier></meeting>"]) assert.equal(parseSenateHearings(bad).size, 0);
  // The schedule gives each time twice; when the two disagree the time is not known.
  const torn = parseSenateHearings(SENATE_XML.replace("<time_iso_8601>10:15:00</time_iso_8601>", "<time_iso_8601>10:45:00</time_iso_8601>"));
  assert.equal(torn.get("338849").localStart, null);
  const off = parseSenateHearings(SENATE_XML.replace("<type>Open Business Meeting</type>\n    <date>24-NOV-2026 10:15 AM</date>", "<type>POSTPONED</type>\n    <date>24-NOV-2026 10:15 AM</date>"));
  assert.equal(off.get("338849").calledOff, "postponed");
});

test("Washington time from UTC, in January and in July and on both sides of each clock change", () => {
  assert.equal(easternWallClock("2026-01-15T15:00:00Z"), "2026-01-15T10:00", "January: five hours behind");
  assert.equal(easternWallClock("2026-07-15T14:00:00Z"), "2026-07-15T10:00", "July: four hours behind");
  assert.equal(easternWallClock("2026-11-19T17:30:00.000Z"), "2026-11-19T12:30", "the live hearing");
  assert.equal(easternWallClock("2026-03-08T06:59:00Z"), "2026-03-08T01:59", "the minute before clocks go forward");
  assert.equal(easternWallClock("2026-03-08T07:00:00Z"), "2026-03-08T03:00", "and the minute after");
  assert.equal(easternWallClock("2026-11-01T05:59:00Z"), "2026-11-01T01:59", "the minute before clocks go back");
  assert.equal(easternWallClock("2026-11-01T06:00:00Z"), "2026-11-01T01:00", "and the minute after");
  assert.equal(easternWallClock("2026-07-15T04:00:00Z"), "2026-07-15T00:00", "midnight is 00:00, not 24:00");
  assert.equal(easternWallClock("2026-01-01T03:00:00Z"), "2025-12-31T22:00", "the day and the year follow Washington");
  for (const bad of ["", "soon", null, undefined]) assert.equal(easternWallClock(bad), null);
  assert.equal(easternLabel("2026-11-19T17:30:00.000Z"), "Thursday, November 19 at 12:30 p.m. Eastern");
  assert.equal(easternLabel("2026-01-15T15:00:00Z"), "Thursday, January 15 at 10 a.m. Eastern");
  assert.equal(easternLabel("2026-07-15T14:05:00Z"), "Wednesday, July 15 at 10:05 a.m. Eastern");
});

test("confirmed only when the chamber's page shows the same event at the same minute", () => {
  const page = parseHouseEventPage(HOUSE_PAGE, "119604"), stored = { chamber: "house", startsAt: "2026-11-19T17:30:00.000Z", status: "Rescheduled" };
  assert.deepEqual(checkMeeting(stored, page), { confirmed: true, reason: "confirmed" });
  assert.deepEqual(checkMeeting({ ...stored, status: "Scheduled" }, page), { confirmed: true, reason: "confirmed" });
  for (const startsAt of ["2026-11-19T17:31:00.000Z", "2026-11-19T17:29:00.000Z", "2026-11-19T16:30:00.000Z", "2026-11-20T17:30:00.000Z", "2026-11-19T00:00:00.000Z"])
    assert.deepEqual(checkMeeting({ ...stored, startsAt }, page), { confirmed: false, reason: "different_time" }, startsAt);
  // An error page, or no page at all.
  assert.deepEqual(checkMeeting(stored, parseHouseEventPage("<html>Server Error</html>", "119604")), { confirmed: false, reason: "not_listed" });
  assert.deepEqual(checkMeeting(stored, null), { confirmed: false, reason: "not_listed" });
  // Cancelled or postponed: on the chamber's page, or in the stored record.
  const cancelled = HOUSE_PAGE.replace("Meeting was rescheduled to the time and date listed above.", "Meeting was cancelled.");
  assert.equal(parseHouseEventPage(cancelled, "119604").calledOff, "cancelled");
  assert.deepEqual(checkMeeting(stored, parseHouseEventPage(cancelled, "119604")), { confirmed: false, reason: "called_off" });
  const postponed = HOUSE_PAGE.replace("Meeting was rescheduled to the time and date listed above.", "This meeting has been POSTPONED.");
  assert.deepEqual(checkMeeting(stored, parseHouseEventPage(postponed, "119604")), { confirmed: false, reason: "called_off" });
  for (const status of ["Canceled", "Cancelled", "Postponed", "", null, "Unknown"]) assert.deepEqual(checkMeeting({ ...stored, status }, page), { confirmed: false, reason: "status" }, String(status));
  // A joint meeting is on neither chamber's calendar.
  assert.deepEqual(checkMeeting({ ...stored, chamber: "joint" }, page), { confirmed: false, reason: "no_calendar" });
  // A page with no time ("TBD"), or a weekday that does not match its date.
  const tbd = HOUSE_PAGE.replace("Thursday, November 19, 2026 (12:30 PM)", "Thursday, November 19, 2026 (TBD)");
  assert.deepEqual(checkMeeting(stored, parseHouseEventPage(tbd, "119604")), { confirmed: false, reason: "no_time" });
  const wrongDay = HOUSE_PAGE.replace("Thursday, November 19, 2026 (12:30 PM)", "Friday, November 19, 2026 (12:30 PM)");
  assert.deepEqual(checkMeeting(stored, parseHouseEventPage(wrongDay, "119604")), { confirmed: false, reason: "no_time" });
  assert.equal(statusGoingAhead("rescheduled"), true);
  assert.equal(statusCalledOff("Canceled"), "cancelled");
  assert.equal(statusCalledOff("Postponed"), "postponed");
  assert.equal(statusCalledOff("Scheduled"), null);
});

test("the same rule in July and in January, and for the Senate's schedule", () => {
  const at = line => parseHouseEventPage(HOUSE_PAGE.replace("Thursday, November 19, 2026 (12:30 PM)", line), "119604");
  const stored = startsAt => ({ chamber: "house", startsAt, status: "Scheduled" });
  assert.equal(checkMeeting(stored("2026-07-15T14:00:00.000Z"), at("Wednesday, July 15, 2026 (10:00 AM)")).confirmed, true, "July: 10 AM Eastern is 14:00 UTC");
  assert.equal(checkMeeting(stored("2026-07-15T15:00:00.000Z"), at("Wednesday, July 15, 2026 (10:00 AM)")).confirmed, false, "an hour off in summer is not confirmed");
  assert.equal(checkMeeting(stored("2026-01-15T15:00:00.000Z"), at("Thursday, January 15, 2026 (10:00 AM)")).confirmed, true, "January: 10 AM Eastern is 15:00 UTC");
  assert.equal(checkMeeting(stored("2026-01-15T14:00:00.000Z"), at("Thursday, January 15, 2026 (10:00 AM)")).confirmed, false);
  assert.equal(checkMeeting(stored("2026-07-15T16:00:00.000Z"), at("Wednesday, July 15, 2026 (12:00 PM)")).confirmed, true, "noon is 12:00");
  const senate = parseSenateHearings(SENATE_XML);
  // Stand-in stored records (no Senate detail record was captured): the Senate's 10:15 AM on 24 November is 15:15 UTC.
  assert.equal(checkMeeting({ chamber: "senate", startsAt: "2026-11-24T15:15:00.000Z", status: "Scheduled" }, senate.get("338849")).confirmed, true);
  assert.equal(checkMeeting({ chamber: "senate", startsAt: "2026-11-24T15:16:00.000Z", status: "Scheduled" }, senate.get("338849")).confirmed, false);
  assert.equal(checkMeeting({ chamber: "senate", startsAt: "2026-11-24T10:15:00.000Z", status: "Scheduled" }, senate.get("338849")).confirmed, false, "a stored time that was really Eastern is not confirmed");
  assert.deepEqual(checkMeeting({ chamber: "senate", startsAt: "2026-11-24T15:15:00.000Z", status: "Scheduled" }, senate.get("999999") ?? null), { confirmed: false, reason: "not_listed" });
});

test("a confirmation stands for the same start, for 36 hours, while the meeting is ahead and going ahead", () => {
  const meeting = { startsAt: "2026-11-19T17:30:00.000Z", status: "Rescheduled" }, checkedAt = Date.parse("2026-11-18T00:00:00Z");
  const c = { startsAt: meeting.startsAt, checkedAt, source: houseEventUrl("119604") };
  assert.equal(CONFIRM_FRESH_MS, 36 * HOUR);
  assert.equal(confirmationHolds(c, meeting, checkedAt + 36 * HOUR), true);
  assert.equal(confirmationHolds(c, meeting, checkedAt + 36 * HOUR + 1), false, "older than 36 hours no longer counts");
  assert.equal(confirmationHolds(c, { ...meeting, startsAt: "2026-11-19T18:30:00.000Z" }, checkedAt + HOUR), false, "the stored start moved after the check");
  assert.equal(confirmationHolds(c, { ...meeting, status: "Canceled" }, checkedAt + HOUR), false, "the record now says cancelled");
  assert.equal(confirmationHolds(c, meeting, Date.parse(meeting.startsAt) + 1), false, "the meeting has started");
  assert.equal(confirmationHolds(null, meeting, checkedAt), false);
  assert.equal(confirmationHolds(undefined, meeting, checkedAt), false);
  const all = parseConfirmations(JSON.stringify({ "119-house-119604": c, "119-house-1": { ...c, startsAt: "2026-11-17T15:00:00.000Z" }, bad: { startsAt: "x" }, worse: 7 }));
  assert.deepEqual([...all.keys()], ["119-house-119604", "119-house-1"]);
  assert.deepEqual([...pruneConfirmations(all, checkedAt).keys()], ["119-house-119604"], "only meetings still ahead are kept");
  for (const bad of [null, undefined, "", "not json", "[]", "7"]) assert.equal(parseConfirmations(bad).size, 0);
});

/* ------------------------------------------------------ C. The window rules --- */

const NOW = Date.parse("2026-11-18T14:00:00Z");
const ACTIONS = "https://www.congress.gov/bill/119th-congress/house-bill/10307/all-actions";
const meeting = (over = {}) => ({ type: "Hearing", title: "Legislative Hearing on: H.R. 10307", status: "Scheduled", startsAt: "2026-11-24T15:00:00.000Z", confirmed: false, named: "title",
  url: "https://www.congress.gov/event/119th-congress/house-event/119604", calendarUrl: houseEventUrl("119604"), calendarLabel: "The House committee calendar", ...over });
const NR = { name: "House Committee on Natural Resources", chamber: "house", referredAt: "2026-10-01", reportedAt: null };
const fed = (over = {}) => federalWindow({ stage: "committee", stageDate: "2026-10-07", congress: 119, billType: "hr", committees: [NR], meetings: [], floorChambers: [], floorUrl: null, stalledIn: null, actionsUrl: ACTIONS, now: NOW, ...over });
const SESSION_90 = { start: "2027-01-12", end: "2027-05-31", regular: true }, TLO = "https://capitol.texas.gov/BillLookup/History.aspx?LegSess=90R&Bill=HB1";
const tex = (over = {}) => texasWindow({ stage: "committee", session: SESSION_90, today: "2027-02-10", origin: "lower", committee: { name: "Public Education", chamber: "lower" }, reportedOut: false, passedFirst: null,
  eventListed: false, tloUrl: TLO, sessionSource: null, ...over });
const lines = w => [w.where, w.changes, w.hearing];

test("in committee, no meeting known", () => {
  const w = fed();
  assert.deepEqual([w.place, w.state, w.hearingAt], ["committee", "open", null]);
  assert.equal(w.where, "In committee: the House Committee on Natural Resources has it.");
  assert.equal(w.changes, "It can still be changed. Committees rewrite bills before sending them on.");
  assert.equal(w.hearing, "No hearing date is known.");
  assert.deepEqual(w.sources, [{ label: "All actions on this bill (Congress.gov)", url: ACTIONS }]);
  assert.equal(fed({ committees: [NR, { ...NR, name: "House Committee on Energy and Commerce" }] }).where, "In committee: the House Committee on Natural Resources and the House Committee on Energy and Commerce have it.");
  assert.equal(fed({ committees: [NR, { ...NR, name: "House Committee on Agriculture" }, { ...NR, name: "House Committee on the Budget" }] }).where, "In committee: 3 House committees have it, including the House Committee on Natural Resources.");
  assert.equal(fed({ committees: [] }).where, "In committee in the House.");
  assert.equal(fed({ committees: [{ ...NR, name: null }] }).where, "In committee in the House.", "a committee whose name is not on file is not named");
  assert.equal(fed({ billType: "s", committees: [{ name: "Senate Committee on the Judiciary", chamber: "senate", referredAt: "2026-10-01", reportedAt: null }] }).where, "In committee: the Senate Committee on the Judiciary has it.");
  assert.equal(fed({ billType: "s", committees: [NR] }).where, "In committee in the Senate.", "only committees of the chamber that has the bill are named");
});

test("introduced: no committee has it yet", () => {
  const w = fed({ stage: "introduced", committees: [] });
  assert.deepEqual([w.place, w.state], ["introduced", "open"]);
  assert.equal(w.where, "Introduced in the House. No committee has it yet.");
  assert.equal(w.changes, "It can still be changed. Bills go to a committee first. Committees rewrite bills before sending them on.");
  assert.equal(fed({ stage: "introduced", committees: [], billType: "sjres" }).where, "Introduced in the Senate. No committee has it yet.");
  assert.equal(fed({ stage: "introduced" }).place, "committee", "a referral on file means a committee has it, whatever the stage word");
  assert.equal(originChamber("hconres"), "house");
  assert.equal(originChamber("s"), "senate");
});

test("a confirmed hearing ahead: the date is printed, in Eastern time, and the title is credited", () => {
  const w = fed({ meetings: [meeting({ confirmed: true, startsAt: "2026-11-19T17:30:00.000Z", status: "Rescheduled" })] });
  assert.deepEqual([w.place, w.state, w.hearingAt], ["hearing_scheduled", "open", "2026-11-19T17:30:00.000Z"]);
  assert.equal(w.where, "In committee: the House Committee on Natural Resources has it. A hearing is scheduled.");
  assert.equal(w.hearing, "A hearing is set for Thursday, November 19 at 12:30 p.m. Eastern. This bill is named in the meeting's title.");
  assert.equal(w.changes, "It can still be changed. Committees rewrite bills before sending them on. A hearing is for questions and testimony. Changes are voted on at a separate meeting called a markup.");
  assert.deepEqual(w.sources.map(s => s.label), ["All actions on this bill (Congress.gov)", "The committee meeting on Congress.gov", "The House committee calendar"]);
  assert.equal(w.sources[2].url, houseEventUrl("119604"));
  const listed = fed({ meetings: [meeting({ confirmed: true, named: "record", startsAt: "2026-11-19T17:30:00.000Z" })] });
  assert.equal(listed.hearing, "A hearing is set for Thursday, November 19 at 12:30 p.m. Eastern.", "a bill the record itself lists needs no note about the title");
});

test("a markup is called a meeting to vote on changes; the Senate's wording decides for the Senate", () => {
  const m = fed({ meetings: [meeting({ type: "Markup", title: "Full Committee Markup of H.R. 10307", confirmed: true })] });
  assert.equal(m.hearing, "A meeting to vote on changes (a markup) is set for Tuesday, November 24 at 10 a.m. Eastern. This bill is named in the meeting's title.");
  assert.equal(m.where, "In committee: the House Committee on Natural Resources has it. A meeting to vote on changes is scheduled.");
  assert.equal(m.changes, "It can still be changed. A markup is the meeting where a committee votes on changes to a bill.");
  assert.equal(m.place, "hearing_scheduled");
  const s = fed({ billType: "s", committees: [], meetings: [meeting({ type: "Meeting", title: SENATE_MATTER, confirmed: true, startsAt: "2026-11-24T15:15:00.000Z", calendarUrl: SENATE_HEARINGS_URL, calendarLabel: "The Senate's schedule of committee meetings" })] });
  assert.equal(s.hearing, "A meeting to vote on changes (a markup) is set for Tuesday, November 24 at 10:15 a.m. Eastern. This bill is named in the meeting's title.");
  assert.equal(s.where, "In committee in the Senate. A meeting to vote on changes is scheduled.");
  assert.equal(meetingKind("Meeting", "Business meeting to consider S.5289, to protect the right to the free exercise of religion"), "markup");
  assert.equal(meetingKind("Meeting", "Hearings to examine caregivers and AI, focusing on opportunities, challenges, and threats."), "hearing");
  assert.equal(meetingKind("Meeting", "Organizational matters"), "meeting");
  assert.equal(meetingKind("Hearing", "Business meeting to consider"), "hearing", "the House's own type wins");
  assert.equal(meetingKind("Markup", null), "markup");
  const plain = fed({ meetings: [meeting({ type: "Meeting", title: "Organizational matters and H.R. 10307", confirmed: true })] });
  assert.equal(plain.hearing, "A committee meeting on this bill is set for Tuesday, November 24 at 10 a.m. Eastern. This bill is named in the meeting's title.");
  assert.equal(plain.where, "In committee: the House Committee on Natural Resources has it. A committee meeting on it is scheduled.");
});

test("a meeting that is listed but not confirmed: the date isn't known, and the bill stays 'in committee'", () => {
  const w = fed({ meetings: [meeting()] });
  assert.deepEqual([w.place, w.state, w.hearingAt], ["committee", "open", null]);
  assert.equal(w.hearing, "A committee meeting on this bill is listed, but its date could not be confirmed. The date isn't known.");
  assert.equal(w.where, "In committee: the House Committee on Natural Resources has it.");
  assert.deepEqual(w.sources.map(s => s.label), ["All actions on this bill (Congress.gov)", "The committee meeting on Congress.gov"], "no chamber calendar is cited for a date that was not confirmed");
  // "Confirmed" on a record that is not going ahead is not believed.
  assert.equal(fed({ meetings: [meeting({ confirmed: true, status: null })] }).hearing, HEARING_UNCONFIRMED);
  // A confirmed meeting that has already started is not ahead.
  assert.equal(fed({ meetings: [meeting({ confirmed: true, startsAt: "2026-11-18T13:00:00.000Z" })] }).hearing, NO_HEARING_DATE);
  // Of two meetings, the confirmed one gives the date even when the unconfirmed one is sooner.
  const two = fed({ meetings: [meeting({ startsAt: "2026-11-20T15:00:00.000Z" }), meeting({ confirmed: true, startsAt: "2026-12-01T15:00:00.000Z" })] });
  assert.equal(two.hearingAt, "2026-12-01T15:00:00.000Z");
});

test("a cancelled or postponed meeting is said to be so, with no date", () => {
  const c = fed({ meetings: [meeting({ status: "Canceled", confirmed: true })] });
  assert.deepEqual([c.place, c.hearing, c.hearingAt], ["committee", "A committee meeting on this bill was cancelled. No new date is known.", null]);
  assert.equal(fed({ meetings: [meeting({ status: "Postponed" })] }).hearing, "A committee meeting on this bill was postponed. No new date is known.");
  assert.equal(fed({ meetings: [meeting({ status: "Canceled" }), meeting({ startsAt: "2026-12-02T15:00:00.000Z" })] }).hearing, HEARING_UNCONFIRMED, "another meeting that is going ahead comes first");
  assert.deepEqual(hearingPart([], NOW), { hearing: NO_HEARING_DATE, hearingAt: null, kind: null, sources: [] });
});

test("out of committee, and on the floor schedule", () => {
  const out = fed({ committees: [{ ...NR, reportedAt: "2026-11-10" }] });
  assert.deepEqual([out.place, out.state], ["out_of_committee", "open"]);
  assert.equal(out.where, "Out of committee, waiting for a vote by the full House.");
  assert.equal(out.changes, "It can still be changed on the floor, if the House allows amendments when it takes the bill up.");
  assert.equal(fed({ billType: "s", committees: [{ name: "Senate Committee on Finance", chamber: "senate", referredAt: null, reportedAt: "2026-11-10" }] }).where, "Out of committee, waiting for a vote by the full Senate.");
  assert.equal(fed({ billType: "s", committees: [{ ...NR, reportedAt: "2026-11-10" }] }).place, "committee", "a report by the other chamber's committee does not count");
  const floor = fed({ floorChambers: ["house"], floorUrl: "https://docs.house.gov/floor/Download.aspx?file=/billsthisweek/20261116/20261116.xml" });
  assert.deepEqual([floor.place, floor.state], ["floor", "open"]);
  assert.equal(floor.where, "On the House floor schedule this week.");
  assert.equal(floor.changes, "It can still be changed on the floor, if the House allows amendments when it takes the bill up.");
  assert.equal(floor.sources.at(-1).label, "This week's floor schedule");
  assert.equal(fed({ floorChambers: ["senate"] }).place, "committee", "the other chamber's schedule does not put a House bill on the House floor");
});

test("stopped on the floor: only if the chamber takes it up again", () => {
  const a = fed({ stage: "not_taken_up", billType: "s", stalledIn: "senate", stageDate: "2026-10-07" });
  assert.deepEqual([a.place, a.state], ["floor", "narrow"]);
  assert.equal(a.where, "Stalled on the Senate floor: a vote to take it up failed on October 7, 2026.");
  assert.equal(a.changes, "It is not moving. It can be changed only if the Senate takes it up again.");
  const b = fed({ stage: "debate_blocked", stalledIn: null, stageDate: null });
  assert.equal(b.where, "Stalled: a vote to end debate failed.");
  assert.equal(b.changes, "It is not moving. It can be changed only if the chamber takes it up again.");
});

test("the other chamber has it; both passed it; the two versions are being settled", () => {
  const w = fed({ stage: "passed_first", stageDate: "2026-10-07" });
  assert.deepEqual([w.place, w.state], ["other_chamber", "open"]);
  assert.equal(w.where, "Passed the House on October 7, 2026. The Senate has it now.");
  assert.equal(w.changes, "The Senate can still change it. If it does, the House must agree to the changes.");
  const s = fed({ stage: "passed_first", billType: "s", stageDate: null, floorChambers: ["house"], floorUrl: "https://docs.house.gov/floor/" });
  assert.equal(s.where, "Passed the Senate. The House has it now. It is on the House floor schedule this week.");
  assert.equal(s.changes, "The House can still change it. If it does, the Senate must agree to the changes.");
  const r = fed({ stage: "resolving" });
  assert.deepEqual([r.place, r.state], ["resolving", "narrow"]);
  assert.equal(r.where, "Passed both chambers in different versions. The House and the Senate are settling the differences.");
  assert.equal(r.changes, "It can be changed only in a narrow way. Only the differences between the two versions are being settled.");
  const both = fed({ stage: "passed_second" });
  assert.deepEqual([both.place, both.state], ["resolving", "narrow"]);
  assert.equal(both.where, "Passed both the House and the Senate.");
  assert.equal(both.changes, "If both chambers passed the same text, it goes to the President and cannot be changed. If the texts differ, only those differences can still be settled.");
});

test("when the window is closed the page says so, with the reason", () => {
  const cases = [
    [{ stage: "president", stageDate: "2026-10-07" }, "Sent to the President on October 7, 2026.", "The window is closed: both chambers passed the same text, and the President can sign it or veto it."],
    [{ stage: "law", stageDate: "2026-10-07" }, "Became law on October 7, 2026.", "The window is closed: it is law. Changing it now would take a new bill."],
    [{ stage: "vetoed", stageDate: null }, "Vetoed by the President.", "The window is closed: Congress can vote to override a veto, but cannot change the bill."],
    [{ stage: "failed", stageDate: "2026-10-07", stalledIn: "house" }, "Failed a vote in the House on October 7, 2026.", "The window is closed: it failed a vote, and it goes no further unless the House votes on it again."],
    [{ stage: "failed", stageDate: null }, "Failed a vote.", "The window is closed: it failed a vote, and it goes no further unless that chamber votes on it again."],
  ];
  for (const [over, where, changes] of cases) {
    const w = fed(over);
    assert.deepEqual([w.place, w.state, w.where, w.changes], ["final", "closed", where, changes]);
    assert.equal(w.hearing, NO_HEARING_DATE);
  }
  // A bill of a Congress that has ended, whatever stage it had reached.
  for (const stage of ["introduced", "committee", "passed_first", "passed_second", "resolving", "failed", "not_taken_up", "debate_blocked"]) {
    const w = fed({ stage, congress: 118 });
    assert.deepEqual([w.place, w.state], ["final", "closed"], stage);
    assert.equal(w.where, "The 118th Congress ended on January 3, 2025, and this bill had not become law.");
    assert.equal(w.changes, "The window is closed: a bill that has not become law when a Congress ends goes no further. It would have to be introduced again as a new bill.");
  }
  assert.equal(fed({ stage: "law", congress: 118, stageDate: "2024-05-01" }).where, "Became law on May 1, 2024.", "a law stays a law");
  assert.deepEqual(congressEnd(119), { ms: Date.UTC(2027, 0, 3, 17), iso: "2027-01-03" });
  assert.equal(fed({ now: Date.UTC(2027, 0, 3, 16, 59) }).state, "open", "the 119th Congress runs to noon on 3 January 2027");
  assert.equal(fed({ now: Date.UTC(2027, 0, 3, 17) }).state, "closed");
  assert.equal(fed({ stage: null }), null, "a bill whose stage has not been read gets no block");
  assert.equal(longDate("2026-11-18"), "November 18, 2026");
  assert.equal(longDate("soon"), null);
});

test("Texas: filed for a session that has not opened", () => {
  const w = tex({ stage: "filed", today: "2026-11-20", committee: null, sessionSource: { label: "When a regular session opens: Texas Government Code, Sec. 301.001", url: "https://capitol.texas.gov/tlodocs/88R/billtext/html/HB00561I.htm" } });
  assert.deepEqual([w.place, w.state, w.hearingAt], ["introduced", "not_open_yet", null]);
  assert.equal(w.where, "Filed for the 2027 session, which opens January 12, 2027.");
  assert.equal(w.changes, "No committee has it yet, so nothing can be changed until then.");
  assert.equal(w.hearing, "No hearing date is known.");
  assert.deepEqual(w.sources.map(s => s.label), ["Bill history on Texas Legislature Online", "When a regular session opens: Texas Government Code, Sec. 301.001"]);
  assert.equal(tex({ stage: "filed", today: "2027-01-11" }).state, "not_open_yet", "the day before it opens");
  assert.equal(tex({ stage: "filed", today: "2027-01-12" }).state, "open", "the day it opens");
  assert.equal(tex({ stage: "filed", today: "2026-11-20", session: { start: "2027-06-15", end: "2027-07-14", regular: false } }).where, "Filed for a special session, which opens June 15, 2027.");
});

test("Texas, in session: every stage", () => {
  const filed = tex({ stage: "filed", committee: null });
  assert.deepEqual([filed.place, filed.state, filed.where], ["introduced", "open", "Filed in the Texas House. No committee has it yet."]);
  assert.equal(filed.changes, "It can still be changed. Bills go to a committee first. Committees rewrite bills before sending them on.");
  assert.equal(tex({ stage: "filed", committee: null, origin: null }).where, "Filed. No committee has it yet.");
  const c = tex();
  assert.deepEqual([c.place, c.state, c.where], ["committee", "open", "In committee: the Texas House committee on Public Education has it."]);
  assert.equal(c.changes, "It can still be changed. Committees rewrite bills before sending them on.");
  assert.equal(tex({ committee: { name: "State Affairs", chamber: "upper" } }).where, "In committee: the Texas Senate committee on State Affairs has it.");
  assert.equal(tex({ committee: { name: "s/c on Juvenile Justice (3 members) by the chair", chamber: "lower" } }).where, "In committee in the Texas House.", "free text that is not a plain name is not printed");
  assert.equal(tex({ committee: null, origin: null }).where, "In committee.");
  const out = tex({ reportedOut: true });
  assert.deepEqual([out.place, out.state, out.where], ["out_of_committee", "open", "Out of committee, waiting for a vote by the full Texas House."]);
  assert.equal(out.changes, "It can still be changed on the floor, if the Texas House allows amendments when it takes the bill up.");
  const first = tex({ stage: "passed_first", passedFirst: { chamber: "lower", date: "2027-03-30" } });
  assert.deepEqual([first.place, first.state, first.where], ["other_chamber", "open", "Passed the Texas House on March 30, 2027. The Texas Senate has it now."]);
  assert.equal(first.changes, "The Texas Senate can still change it. If it does, the Texas House must agree to the changes.");
  assert.equal(tex({ stage: "passed_first", origin: "upper", passedFirst: null }).where, "Passed the Texas Senate. The Texas House has it now.");
  assert.equal(tex({ stage: "passed_first", origin: null, passedFirst: null }).where, "Passed one chamber. The other chamber has it now.");
  const both = tex({ stage: "passed_both" });
  assert.deepEqual([both.place, both.state, both.where], ["resolving", "narrow", "Passed both the Texas House and the Texas Senate."]);
  assert.equal(both.changes, "If both chambers passed the same text, it goes to the Governor and cannot be changed. If the texts differ, only those differences can still be settled.");
  const closed = [
    ["governor", "Sent to the Governor.", "The window is closed: both chambers passed the same text, and the Governor can sign it, veto it, or let it become law without signing."],
    ["law", "Became law.", "The window is closed: it is law. Changing it now would take a new bill."],
    ["vetoed", "Vetoed by the Governor.", "The window is closed: the Legislature can vote to override a veto, but cannot change the bill."],
    ["failed", "Failed a vote.", "The window is closed: it failed a vote, and it goes no further unless that chamber votes on it again."],
  ];
  for (const [stage, where, changes] of closed) assert.deepEqual(lines(tex({ stage })).slice(0, 2).concat([tex({ stage }).place, tex({ stage }).state]), [where, changes, "final", "closed"]);
});

test("Texas: after the session ends the window is closed; a session this build does not know gets no block", () => {
  const over = { today: "2025-11-20", session: { start: "2025-01-14", end: "2025-06-02", regular: true } };
  for (const stage of ["filed", "committee", "passed_first"]) {
    const w = tex({ ...over, stage });
    assert.deepEqual([w.place, w.state], ["final", "closed"], stage);
    assert.equal(w.where, "Did not pass both chambers before the session ended on June 2, 2025.");
    assert.equal(w.changes, "The window is closed: the session ended on June 2, 2025. A bill that had not passed both chambers by then goes no further.");
  }
  assert.equal(tex({ ...over, stage: "passed_both" }).changes, "The window is closed: the session ended on June 2, 2025, so the Legislature can no longer change this bill.");
  assert.equal(tex({ ...over, stage: "failed" }).where, "Failed a vote.");
  assert.equal(tex({ ...over, stage: "law" }).where, "Became law.");
  assert.equal(tex({ session: null }), null);
});

test("Texas never prints a hearing date: a listed event is 'listed, but its date could not be confirmed'", () => {
  for (const stage of ["filed", "committee", "passed_first", "passed_both", "governor", "law", "vetoed", "failed"]) for (const today of ["2026-11-20", "2027-02-10", "2027-08-01"]) {
    const w = tex({ stage, today, eventListed: true });
    assert.equal(w.hearing, HEARING_UNCONFIRMED, `${stage} ${today}`);
    assert.equal(w.hearingAt, null);
    assert.equal(tex({ stage, today }).hearing, NO_HEARING_DATE);
  }
});

/** Every window the rules can produce from a wide spread of facts: for the checks that must hold for all of them. */
function everyWindow() {
  const out = [];
  const meetingSets = [[], [meeting()], [meeting({ confirmed: true })], [meeting({ confirmed: true, type: "Markup" })], [meeting({ status: "Canceled" })], [meeting({ status: "Postponed" })]];
  for (const stage of ["introduced", "committee", "passed_first", "passed_second", "resolving", "president", "law", "vetoed", "failed", "not_taken_up", "debate_blocked"])
    for (const meetings of meetingSets) for (const billType of ["hr", "s"]) for (const floorChambers of [[], ["house"], ["senate"]]) for (const reportedAt of [null, "2026-10-05"]) for (const congress of [119, 118])
      for (const stalledIn of [null, "senate"]) out.push(fed({ stage, meetings, billType, floorChambers, congress, stalledIn, committees: [{ ...NR, chamber: billType === "s" ? "senate" : "house", reportedAt }] }));
  for (const stage of ["filed", "committee", "passed_first", "passed_both", "governor", "law", "vetoed", "failed"])
    for (const today of ["2026-11-20", "2027-02-10", "2027-08-01"]) for (const eventListed of [false, true]) for (const reportedOut of [false, true]) for (const origin of ["lower", "upper", null])
      out.push(tex({ stage, today, eventListed, reportedOut, origin, passedFirst: origin ? { chamber: origin, date: "2027-03-30" } : null }));
  return out;
}

test("the seven places the owner named (and 'resolving') and all four states are reachable", () => {
  const all = everyWindow();
  assert.ok(all.every(Boolean));
  assert.deepEqual([...new Set(all.map(w => w.place))].sort(), ["committee", "final", "floor", "hearing_scheduled", "introduced", "other_chamber", "out_of_committee", "resolving"]);
  assert.deepEqual([...new Set(all.map(w => w.state))].sort(), ["closed", "narrow", "not_open_yet", "open"]);
  for (const w of all) {
    assert.ok(w.where && w.changes && w.hearing, "every window has all three sentences");
    assert.ok(w.sources.length >= 1 && w.sources.every(s => /^https:\/\//.test(s.url) && s.label), "and at least one source");
    assert.equal(w.state === "closed", /^The window is closed: /.test(w.changes), `${w.where} / ${w.changes}`);
    assert.equal(w.place === "hearing_scheduled", w.state === "open" && !!w.hearingAt && /scheduled\.$/.test(w.where), w.where);
  }
});

test("an unconfirmed meeting never produces a date in any sentence", () => {
  // The unconfirmed meeting is on Tuesday, November 24 at 10 a.m. Eastern; every other date in the facts is in October or March.
  const dated = /Nov|Tuesday|\b24\b|\d{1,2}:\d{2}|\ba\.m\.|\bp\.m\.|Eastern|\b10 a/;
  const sets = [[meeting()], [meeting({ confirmed: true, status: null })], [meeting({ confirmed: true, status: "Canceled" })], [meeting({ status: "Postponed" })], [meeting(), meeting({ status: "Canceled" })]];
  let n = 0;
  for (const stage of ["introduced", "committee", "passed_first", "passed_second", "resolving", "president", "law", "vetoed", "failed", "not_taken_up", "debate_blocked"])
    for (const meetings of sets) for (const billType of ["hr", "s"]) for (const floorChambers of [[], ["house", "senate"]]) for (const reportedAt of [null, "2026-10-05"]) {
      const w = fed({ stage, meetings, billType, floorChambers, committees: [{ ...NR, chamber: billType === "s" ? "senate" : "house", reportedAt }] });
      assert.equal(w.hearingAt, null);
      for (const line of lines(w)) assert.doesNotMatch(line, dated, line);
      assert.notEqual(w.place, "hearing_scheduled");
      assert.ok(!w.sources.some(s => /docs\.house\.gov\/Committee|senate\.gov\/general/.test(s.url)), "no chamber calendar is cited");
      n++;
    }
  assert.equal(n, 11 * 5 * 2 * 2 * 2);
  // And a date is printed in the hearing line only: never anywhere when nothing is confirmed.
  for (const w of everyWindow()) if (!w.hearingAt) assert.doesNotMatch(w.hearing, /\d/, w.hearing);
});

test("every sentence is calm, plain and promises nothing", () => {
  const all = everyWindow(), sentences = new Set(all.flatMap(lines));
  for (const v of Object.values(CHANGES)) sentences.add(typeof v === "function" ? v("House", "Senate") : v);
  for (const s of [NO_HEARING_DATE, HEARING_UNCONFIRMED, HEARING_CANCELLED, HEARING_POSTPONED, NAMED_IN_TITLE]) sentences.add(s);
  assert.ok(sentences.size > 40);
  for (const s of sentences) {
    assert.deepEqual(toneProblems(s), [], s);
    assert.match(s, /^[A-Z].*\.$/, s);
    assert.doesNotMatch(s, /!|\?|…|  /, s);
    // Procedure, never a forecast and never a promise about a reader's answer.
    assert.doesNotMatch(s, /\byour\b|\byou\b|\bwill\b|\blikely\b|\bexpected\b|\bshould\b|sent to (?!the (President|Governor)\b)|legislators?\b|lawmakers?\b|input|\bwe\b|make a difference|have a say/i, s);
    assert.doesNotMatch(s, /Constituent|On Record/, s);
    assert.ok(s.length <= 220, s);
  }
  for (const label of new Set(all.flatMap(w => w.sources.map(x => x.label)))) assert.deepEqual(toneProblems(label), [], label);
});

/* ------------------------------------------------------ D. The store functions --- */

const open = [];
after(() => { for (const o of open) { o.client.close(); rmSync(o.dir, { recursive: true, force: true }); } });
async function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "window-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
  await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
  open.push({ client, dir });
  return db;
}
const SRC = "https://www.congress.gov/";
/** The live House hearing as the ingest stores it, a Senate business meeting (a stand-in record: the Senate's own time, as UTC), and a joint meeting. */
async function seedMeetings(db, { withTitleBillsStored = true } = {}) {
  const live = parseMeetingDetail(LIVE_DETAIL);
  const row = m => ({ id: m.id, congress: m.congress, chamber: m.chamber, committeeCode: m.committeeCodes?.join(",") ?? null, committeeName: m.committeeName ?? null, title: m.title, meetingType: m.meetingType, status: m.status,
    startsAt: m.startsAt, location: m.location ?? null, billIds: m.billIds, url: m.url, retrievedAt: NOW });
  await db.insert(schema.officialCommitteeMeetings).values([
    // As it was stored before 20 Nov 2026: no bills in bill_ids, only the title.
    row({ ...live, billIds: withTitleBillsStored ? live.billIds : [] }),
    row({ id: "119-senate-338849", congress: 119, chamber: "senate", title: SENATE_MATTER, meetingType: "Meeting", status: "Scheduled", startsAt: "2026-11-24T15:15:00.000Z", billIds: [], url: "https://www.congress.gov/event/119th-congress/senate-event/338849" }),
    row({ id: "119-joint-500", congress: 119, chamber: "joint", title: "Hearing on H.R. 77", meetingType: "Hearing", status: "Scheduled", startsAt: "2026-11-25T15:00:00.000Z", billIds: ["119-hr-77"], url: "https://www.congress.gov/event/119th-congress/joint-event/500" }),
    row({ id: "119-house-1", congress: 119, chamber: "house", title: "Oversight of the U.S. 30 corridor", meetingType: "Hearing", status: "Scheduled", startsAt: "2026-11-20T15:00:00.000Z", billIds: [], url: "https://www.congress.gov/event/119th-congress/house-event/1" }),
  ]);
}
async function fedBill(db, id, { stage = "committee", stageDate = "2026-10-01", latestActionAt = "2026-10-01", committee = null, reportedAt = null } = {}) {
  const [congress, billType, number] = id.split("-");
  await db.insert(schema.officialBills).values({ id, congress: Number(congress), billType, number: Number(number), title: `Sample ${id}`, latestActionAt, congressUrl: `https://www.congress.gov/bill/119th-congress/${billType === "s" ? "senate" : "house"}-bill/${number}`,
    detailStatus: "complete", sourceUrl: SRC, retrievedAt: NOW }).onConflictDoUpdate({ target: schema.officialBills.id, set: { latestActionAt, detailStatus: "complete" } });
  if (stage) await db.insert(schema.officialBillDepth).values({ billId: id, stage, stageDate, latestActionAt });
  if (committee) await db.insert(schema.officialBillCommittees).values({ billId: id, committeeId: committee, referredAt: "2026-10-01", reportedAt });
}
/** A stand-in for the network: the captured pages, and a record of what was asked for. */
function standIn(pages = {}) {
  const asked = [];
  const known = { [houseEventUrl("119604")]: HOUSE_PAGE, [SENATE_HEARINGS_URL]: SENATE_XML, ...pages };
  const fetcher = async url => { asked.push(url); const text = known[url]; return text === undefined ? { ok: false, status: 404, text: "" } : text === null ? { ok: false, status: 0, text: "" } : { ok: true, status: 200, text }; };
  return { asked, fetcher };
}
const cursor = async db => JSON.parse((await db.select().from(schema.ingestCursors).where(eq(schema.ingestCursors.key, CONFIRMED_KEY)).get())?.value ?? "null");

test("bills named by upcoming meetings get a starter record, a few per run, and existing records are untouched", async () => {
  const db = await freshDb();
  await seedMeetings(db, { withTitleBillsStored: false });
  await fedBill(db, "119-hr-10307", { stage: null });
  assert.deepEqual(await ensureMeetingBillStubs(NOW, 3, db), { named: 6, added: 3, left: 2 }, "four in the House title, one in the Senate's, one on the joint meeting; one is already on file");
  assert.deepEqual(await ensureMeetingBillStubs(NOW, 3, db), { named: 6, added: 2, left: 0 });
  assert.deepEqual(await ensureMeetingBillStubs(NOW, 3, db), { named: 6, added: 0, left: 0 });
  const bills = await db.select().from(schema.officialBills);
  assert.deepEqual(bills.map(b => b.id).sort(), ["119-hr-10307", "119-hr-10458", "119-hr-10751", "119-hr-10956", "119-hr-77", "119-s-5289"]);
  assert.equal(bills.find(b => b.id === "119-hr-10307").title, "Sample 119-hr-10307", "the record that was there is not overwritten");
  const s = bills.find(b => b.id === "119-s-5289");
  assert.deepEqual([s.congress, s.billType, s.number, s.title, s.detailStatus, s.congressUrl, s.sourceUrl], [119, "s", 5289, "S. 5289", "stub", "https://www.congress.gov/bill/119th-congress/senate-bill/5289", "https://www.congress.gov/event/119th-congress/senate-event/338849"]);
  // A meeting that has started, or is more than three weeks off, names nothing to load.
  assert.deepEqual(await ensureMeetingBillStubs(NOW + 60 * DAY, 40, db), { named: 0, added: 0, left: 0 });
});

test("one run confirms the meetings the chambers' own pages bear out, and keeps them in the cursor store", async () => {
  const db = await freshDb(), net = standIn();
  await seedMeetings(db);
  const run = await confirmHearings(NOW, 10_000, { db, fetcher: net.fetcher, pauseMs: 0 });
  assert.deepEqual(run, { ok: true, upcoming: 4, withBills: 3, due: 2, checked: 2, confirmed: 2, notConfirmed: 0, unreachable: 0, left: 0, onFile: 2 });
  assert.deepEqual(net.asked, [SENATE_HEARINGS_URL, houseEventUrl("119604")], "one request for the Senate's schedule, one page per House event; nothing for a meeting that names no bill or for a joint one");
  assert.deepEqual(await cursor(db), {
    "119-house-119604": { startsAt: "2026-11-19T17:30:00.000Z", checkedAt: NOW, source: houseEventUrl("119604") },
    "119-senate-338849": { startsAt: "2026-11-24T15:15:00.000Z", checkedAt: NOW, source: SENATE_HEARINGS_URL },
  });
  assert.deepEqual([...(await confirmedHearings(NOW + HOUR, db)).keys()].sort(), ["119-house-119604", "119-senate-338849"]);
  assert.equal((await confirmedHearings(NOW + 37 * HOUR, db)).size, 0, "after 36 hours a confirmation no longer counts (the House hearing has also passed by then)");
  // Straight away again: nothing is due, nothing is asked for.
  const again = await confirmHearings(NOW + 10 * 60e3, 10_000, { db, fetcher: net.fetcher, pauseMs: 0 });
  assert.deepEqual([again.due, again.checked, again.onFile], [0, 0, 2]);
  assert.equal(net.asked.length, 2);
  // Three hours on, the hearing that is a day away is checked again; the one six days away is not yet.
  const later = await confirmHearings(NOW + 3 * HOUR, 10_000, { db, fetcher: net.fetcher, pauseMs: 0 });
  assert.deepEqual([later.due, later.confirmed], [1, 1]);
  assert.equal(net.asked.at(-1), houseEventUrl("119604"));
});

test("a page that cannot be reached changes nothing; a page that disagrees removes the confirmation at once", async () => {
  const db = await freshDb();
  await seedMeetings(db);
  await confirmHearings(NOW, 10_000, { db, fetcher: standIn().fetcher, pauseMs: 0 });
  // Unreachable (a network failure, a block page): the earlier confirmations stay until they run out.
  const down = await confirmHearings(NOW + 9 * HOUR, 10_000, { db, fetcher: standIn({ [houseEventUrl("119604")]: null, [SENATE_HEARINGS_URL]: "<html>Access Denied</html>" }).fetcher, pauseMs: 0 });
  assert.deepEqual([down.due, down.checked, down.unreachable, down.onFile], [2, 0, 2, 2]);
  assert.equal((await cursor(db))["119-house-119604"].checkedAt, NOW);
  // The House page now shows another time, and the Senate no longer lists the meeting.
  const moved = HOUSE_PAGE.replace("Thursday, November 19, 2026 (12:30 PM)", "Thursday, November 19, 2026 (2:00 PM)");
  const changed = await confirmHearings(NOW + 9 * HOUR, 10_000, { db, fetcher: standIn({ [houseEventUrl("119604")]: moved, [SENATE_HEARINGS_URL]: SENATE_XML.replace("<identifier>338849</identifier>", "<identifier>338850</identifier>") }).fetcher, pauseMs: 0 });
  assert.deepEqual([changed.checked, changed.confirmed, changed.notConfirmed, changed.onFile], [2, 0, 2, 0]);
  assert.deepEqual(await cursor(db), {});
  // The House says there is no such event (404).
  const db2 = await freshDb();
  await seedMeetings(db2);
  const gone = await confirmHearings(NOW, 10_000, { db: db2, fetcher: standIn({ [houseEventUrl("119604")]: undefined }).fetcher, pauseMs: 0 });
  assert.deepEqual([gone.confirmed, gone.notConfirmed, gone.onFile], [1, 1, 1]);
  // A stored record that says cancelled is not checked at all, and loses any confirmation it had.
  await db2.update(schema.officialCommitteeMeetings).set({ status: "Canceled" }).where(eq(schema.officialCommitteeMeetings.id, "119-senate-338849"));
  const net = standIn(), off = await confirmHearings(NOW + HOUR, 10_000, { db: db2, fetcher: net.fetcher, pauseMs: 0 });
  assert.equal(off.onFile, 1, "the House hearing, confirmed in this run");
  assert.ok(!net.asked.includes(SENATE_HEARINGS_URL));
  // The cap on House pages per run, and no time left.
  const db3 = await freshDb();
  await seedMeetings(db3);
  const capped = await confirmHearings(NOW, 10_000, { db: db3, fetcher: standIn().fetcher, pauseMs: 0, houseCap: 0 });
  assert.deepEqual([capped.due, capped.checked, capped.left], [2, 1, 1]);
  const rushed = standIn(), none = await confirmHearings(NOW + 9 * HOUR, 0, { db: db3, fetcher: rushed.fetcher, pauseMs: 0 });
  assert.deepEqual([none.checked, none.left, rushed.asked.length], [0, 2, 0], "with no time left nothing is asked for");
});

test("billWindow: the date appears only after the chamber's page confirmed it, and goes again when the confirmation is old", async () => {
  const db = await freshDb();
  await seedMeetings(db, { withTitleBillsStored: false }); // the hearing as stored before the fix: its bills only in the title
  await db.insert(schema.officialCommittees).values([{ id: "HSII", chamber: "house", name: "House Committee on Natural Resources", sourceUrl: SRC, retrievedAt: NOW },
    { id: "HSII24", chamber: "house", name: "Indian and Insular Affairs", parentId: "HSII", sourceUrl: SRC, retrievedAt: NOW }]);
  await fedBill(db, "119-hr-10307", { committee: "HSII" });
  await db.insert(schema.officialBillCommittees).values({ billId: "119-hr-10307", committeeId: "HSII24", referredAt: "2026-10-02", reportedAt: null });
  await fedBill(db, "119-s-5289", {});
  const before = await billWindow("119-hr-10307", NOW, db);
  assert.deepEqual([before.place, before.state, before.hearingAt], ["committee", "open", null]);
  assert.equal(before.where, "In committee: the House Committee on Natural Resources has it.", "the full committee, not its subcommittee");
  assert.equal(before.hearing, HEARING_UNCONFIRMED);
  await confirmHearings(NOW, 10_000, { db, fetcher: standIn().fetcher, pauseMs: 0 });
  const w = await billWindow("119-hr-10307", NOW + HOUR, db);
  assert.deepEqual([w.place, w.state, w.hearingAt], ["hearing_scheduled", "open", "2026-11-19T17:30:00.000Z"]);
  assert.equal(w.where, "In committee: the House Committee on Natural Resources has it. A hearing is scheduled.");
  assert.equal(w.hearing, "A hearing is set for Thursday, November 19 at 12:30 p.m. Eastern. This bill is named in the meeting's title.");
  assert.deepEqual(w.sources, [
    { label: "All actions on this bill (Congress.gov)", url: "https://www.congress.gov/bill/119th-congress/house-bill/10307/all-actions" },
    { label: "The committee meeting on Congress.gov", url: "https://www.congress.gov/event/119th-congress/house-event/119604" },
    { label: "The House committee calendar", url: houseEventUrl("119604") }]);
  const s = await billWindow("119-s-5289", NOW + HOUR, db);
  assert.equal(s.hearing, "A meeting to vote on changes (a markup) is set for Tuesday, November 24 at 10:15 a.m. Eastern. This bill is named in the meeting's title.");
  assert.equal(s.sources.at(-1).label, "The Senate's schedule of committee meetings");
  // 37 hours after the check, with no newer check: the Senate meeting is still ahead, and its date is no longer printed.
  const old = await billWindow("119-s-5289", NOW + 37 * HOUR, db);
  assert.deepEqual([old.place, old.hearing, old.hearingAt], ["committee", HEARING_UNCONFIRMED, null]);
  // The record changes its time after the check: the confirmation was for another start.
  await db.update(schema.officialCommitteeMeetings).set({ startsAt: "2026-11-24T16:15:00.000Z" }).where(eq(schema.officialCommitteeMeetings.id, "119-senate-338849"));
  assert.equal((await billWindow("119-s-5289", NOW + HOUR, db)).hearing, HEARING_UNCONFIRMED);
  // The record says cancelled.
  await db.update(schema.officialCommitteeMeetings).set({ status: "Canceled" }).where(eq(schema.officialCommitteeMeetings.id, "119-house-119604"));
  assert.equal((await billWindow("119-hr-10307", NOW + HOUR, db)).hearing, HEARING_CANCELLED);
  // After the hearing: nothing is ahead.
  assert.equal((await billWindow("119-hr-10307", NOW + 3 * DAY, db)).hearing, NO_HEARING_DATE);
});

test("billWindow: nothing is said about a bill that is not on file or whose stage has not been read", async () => {
  const db = await freshDb();
  await fedBill(db, "119-hr-1", { stage: null });
  assert.equal(await billWindow("119-hr-1", NOW, db), null);
  assert.equal(await billWindow("119-hr-2", NOW, db), null);
  assert.equal(await billWindow("tx-90-hb999", NOW, db), null);
  assert.equal(await billWindow("not a bill", NOW, db), null);
});

test("billWindow: floor schedule, a report date, a passage, and the chamber of a failed floor vote, from the stored record", async () => {
  const db = await freshDb(), week = "20261116";
  await fedBill(db, "119-hr-10", { committee: "HSAG", reportedAt: "2026-11-10" });
  await fedBill(db, "119-hr-11", {});
  await db.insert(schema.officialFloorSchedule).values({ chamber: "house", weekOf: week, label: "H.R. 11", billId: "119-hr-11", sourceUrl: "https://docs.house.gov/floor/Download.aspx?file=/billsthisweek/20261116/20261116.xml", retrievedAt: NOW });
  await fedBill(db, "119-hr-12", { stage: "passed_first", stageDate: "2026-11-05" });
  await fedBill(db, "119-s-13", { stage: "not_taken_up", stageDate: "2026-11-06" });
  await db.insert(schema.officialBillActions).values([
    { billId: "119-s-13", seq: 0, actionDate: "2026-10-01", text: "Introduced in Senate", chamber: "senate", sourceUrl: SRC, retrievedAt: NOW },
    { billId: "119-s-13", seq: 1, actionDate: "2026-11-06", text: "Motion to proceed to consideration of measure rejected in Senate by Yea-Nay Vote. 47 - 52. Record Vote Number: 600.", chamber: "senate", sourceUrl: SRC, retrievedAt: NOW }]);
  await fedBill(db, "118-hr-14", {});
  await db.update(schema.officialBills).set({ congress: 118 }).where(eq(schema.officialBills.id, "118-hr-14"));
  const out = await billWindow("119-hr-10", NOW, db);
  assert.deepEqual([out.place, out.where], ["out_of_committee", "Out of committee, waiting for a vote by the full House."]);
  const floor = await billWindow("119-hr-11", NOW, db);
  assert.deepEqual([floor.place, floor.where, floor.sources.at(-1).label], ["floor", "On the House floor schedule this week.", "This week's floor schedule"]);
  assert.equal((await billWindow("119-hr-11", NOW + 14 * DAY, db)).place, "committee", "a schedule of an earlier week does not count");
  assert.equal((await billWindow("119-hr-12", NOW, db)).where, "Passed the House on November 5, 2026. The Senate has it now.");
  const stalled = await billWindow("119-s-13", NOW, db);
  assert.deepEqual([stalled.place, stalled.state, stalled.where], ["floor", "narrow", "Stalled on the Senate floor: a vote to take it up failed on November 6, 2026."]);
  assert.equal((await billWindow("118-hr-14", NOW, db)).where, "The 118th Congress ended on January 3, 2025, and this bill had not become law.");
});

test("billWindow, Texas: filed before the session opens, then in committee once it has; a listed event gives no date", async () => {
  const db = await freshDb(), id = "tx-90-hb1", before = Date.parse("2026-11-20T18:00:00Z"), during = Date.parse("2027-02-10T18:00:00Z");
  await db.insert(schema.txBills).values({ id, session: "90", identifier: "HB 1", title: "Relating to public school finance.", chamber: "lower", stage: "filed", firstActionDate: "2026-11-09",
    tloUrl: TLO, feed: "openstates", sourceUrl: "https://v3.openstates.org/", retrievedAt: before });
  const w = await billWindow(id, before, db);
  assert.deepEqual([w.place, w.state, w.hearingAt], ["introduced", "not_open_yet", null]);
  assert.equal(w.where, "Filed for the 2027 session, which opens January 12, 2027.");
  assert.equal(w.changes, "No committee has it yet, so nothing can be changed until then.");
  assert.equal(w.hearing, "No hearing date is known.");
  assert.deepEqual(w.sources.map(x => x.label), ["Bill history on Texas Legislature Online", "When a regular session opens: Texas Government Code, Sec. 301.001"]);
  // The session opens; the bill is sent to a committee; an event lists it.
  await db.update(schema.txBills).set({ stage: "committee" }).where(eq(schema.txBills.id, id));
  await db.insert(schema.txBillActions).values([{ billId: id, seq: 0, date: "2026-11-09", description: "Filed", chamber: "lower", classification: ["filing"] },
    { billId: id, seq: 1, date: "2027-02-01", description: "Referred to Public Education", chamber: "lower", classification: ["referral-committee"] }]);
  const c = await billWindow(id, during, db);
  assert.deepEqual([c.place, c.state, c.where, c.hearing], ["committee", "open", "In committee: the Texas House committee on Public Education has it.", "No hearing date is known."]);
  await db.insert(schema.txEvents).values([{ id: "ev-1", name: "House Public Education", start: "2027-02-16T14:00:00+00:00", bills: ["HB 1", "HB 2"], url: "https://capitol.texas.gov/", retrievedAt: during },
    { id: "ev-2", name: "Senate Finance", start: "2027-02-17T14:00:00+00:00", bills: ["SB 1"], retrievedAt: during }]);
  const listed = await billWindow(id, during, db);
  assert.equal(listed.hearing, HEARING_UNCONFIRMED);
  assert.equal(listed.hearingAt, null);
  for (const line of lines(listed)) assert.doesNotMatch(line, /February|Feb\b|\b16\b|\d{1,2}:\d{2}|Central|\bCT\b/, line);
  // The committee sends it on; then the House passes it.
  await db.insert(schema.txBillActions).values({ billId: id, seq: 2, date: "2027-03-01", description: "Reported favorably as substituted", chamber: "lower", classification: ["committee-passage"] });
  assert.equal((await billWindow(id, during + 30 * DAY, db)).where, "Out of committee, waiting for a vote by the full Texas House.");
  await db.update(schema.txBills).set({ stage: "passed_first" }).where(eq(schema.txBills.id, id));
  await db.insert(schema.txBillActions).values({ billId: id, seq: 3, date: "2027-03-30", description: "Passed", chamber: "lower", classification: ["passage"] });
  assert.equal((await billWindow(id, during + 60 * DAY, db)).where, "Passed the Texas House on March 30, 2027. The Texas Senate has it now.");
  // A bill of a session that ended, and one of a session this build has no dates for.
  await db.insert(schema.txBills).values([{ id: "tx-89-sb5", session: "89", identifier: "SB 5", title: "Old", chamber: "upper", stage: "committee", tloUrl: TLO, feed: "openstates", sourceUrl: SRC, retrievedAt: before },
    { id: "tx-95-hb1", session: "95", identifier: "HB 1", title: "Unknown session", chamber: "lower", stage: "filed", tloUrl: TLO, feed: "openstates", sourceUrl: SRC, retrievedAt: before }]);
  assert.equal((await billWindow("tx-89-sb5", before, db)).changes, "The window is closed: the session ended on June 2, 2025. A bill that had not passed both chambers by then goes no further.");
  assert.equal(await billWindow("tx-95-hb1", before, db), null);
});

test("openWindowBills: open bills in committee, out of committee or on the floor; a confirmed meeting first, then the latest action", async () => {
  const db = await freshDb();
  await seedMeetings(db);
  await fedBill(db, "119-hr-10307", { latestActionAt: "2026-09-01" });            // confirmed hearing on 19 November
  await fedBill(db, "119-s-5289", { latestActionAt: "2026-09-02" });              // confirmed markup on 24 November
  await fedBill(db, "119-hr-10458", { latestActionAt: "2026-11-17" });            // named by the same hearing
  await fedBill(db, "119-hr-20", { latestActionAt: "2026-11-15", committee: "HSAG", reportedAt: "2026-11-12" }); // out of committee
  await fedBill(db, "119-hr-21", { latestActionAt: "2026-11-10" });               // in committee, no meeting
  await fedBill(db, "119-hr-22", { stage: "introduced", latestActionAt: "2026-11-16" }); // introduced: no committee has it
  await fedBill(db, "119-hr-23", { stage: "passed_first", latestActionAt: "2026-11-17" });
  await fedBill(db, "119-hr-24", { stage: "law", latestActionAt: "2026-11-17" });
  await fedBill(db, "119-hr-25", { stage: null, latestActionAt: "2026-11-17" });
  await fedBill(db, "119-hr-77", { latestActionAt: "2026-08-01" });               // named by the joint meeting, which no calendar confirms
  await db.insert(schema.officialFloorSchedule).values({ chamber: "house", weekOf: "20261116", label: "H.R. 22", billId: "119-hr-22", sourceUrl: "https://docs.house.gov/floor/", retrievedAt: NOW });
  assert.deepEqual((await openWindowBills(20, NOW, db)).map(b => [b.billKey, b.place, b.hearingAt]), [
    ["119-hr-10458", "committee", null], ["119-hr-22", "floor", null], ["119-hr-20", "out_of_committee", null], ["119-hr-21", "committee", null], ["119-s-5289", "committee", null], ["119-hr-10307", "committee", null], ["119-hr-77", "committee", null],
    // Last of all: a bill one chamber has passed and the other can still change (20 Nov 2026).
    ["119-hr-23", "other_chamber", null],
  ], "before any confirmation: by most recent action");
  await confirmHearings(NOW, 10_000, { db, fetcher: standIn().fetcher, pauseMs: 0 });
  const picked = await openWindowBills(20, NOW, db);
  assert.deepEqual(picked.map(b => [b.billKey, b.place, b.hearingAt]), [
    ["119-hr-10458", "hearing_scheduled", "2026-11-19T17:30:00.000Z"], ["119-hr-10307", "hearing_scheduled", "2026-11-19T17:30:00.000Z"], ["119-s-5289", "hearing_scheduled", "2026-11-24T15:15:00.000Z"],
    ["119-hr-22", "floor", null], ["119-hr-20", "out_of_committee", null], ["119-hr-21", "committee", null], ["119-hr-77", "committee", null], ["119-hr-23", "other_chamber", null]]);
  assert.ok(picked.every(b => b.system === "federal" && Object.keys(b).sort().join() === "billKey,hearingAt,place,system"));
  assert.deepEqual((await openWindowBills(2, NOW, db)).map(b => b.billKey), ["119-hr-10458", "119-hr-10307"]);
  assert.deepEqual(await openWindowBills(0, NOW, db), []);
});

/* ---------------------------------------- E. The pages, the run, the task --- */

test("both bill pages show the block at the top of Status, for every visitor who can see the page", () => {
  const block = read("components/changes/window-block.tsx");
  assert.match(block, /if \(!w\) return null;/, "nothing is rendered when nothing can be said");
  assert.match(block, /<h3>Can this bill still be changed\?<\/h3>/);
  for (const part of ["{w.where}", "{w.changes}", "{w.hearing}", "w.sources.map"]) assert.ok(block.includes(part), part);
  assert.match(block, /target="_blank" rel="noopener noreferrer"/);
  for (const page of ["app/bills/[id]/page.tsx", "app/texas/bills/[id]/page.tsx"]) {
    const src = read(page);
    assert.match(src, /import \{ billWindow \} from "@\/lib\/changes\/window-store"/, page);
    assert.match(src, /billWindow\(bill\.id\)\.catch\(\(\) => null\)/, `${page}: a failure shows nothing instead of breaking the page`);
    assert.match(src, /<h2>Status <OfficialBadge \/><\/h2>\s*<WindowBlock w=\{changeWindow\} \/>/, `${page}: first thing under Status`);
    assert.doesNotMatch(src, /(shared|canAnswer|access\.editor|access\.invite)[^\n]{0,40}<WindowBlock/, `${page}: not held back from any visitor who can see the page`);
    assert.ok(src.indexOf("if (!access.allowed) return") < src.indexOf("billWindow(bill.id)"), `${page}: the same access rule as the rest of the page comes first`);
  }
  const css = read("app/globals.css");
  assert.match(css, /\.bill-window \{[^}]*background: #f1f5f1;[^}]*overflow-wrap: anywhere;/);
});

test("the scheduled run checks hearings after the meetings are read, and a failure there never breaks it", () => {
  const tick = read("app/api/automation/tick/route.ts");
  const at = tick.indexOf('import("@/lib/changes/hearing-store")');
  assert.ok(at > tick.indexOf("runFederalIngest({ budgetMs: fedBudget"), "after the federal update, which reads the meetings");
  assert.ok(at < tick.indexOf("runTexasIngest({"), "and before the Texas update");
  const step = tick.slice(at, tick.indexOf("runTexasIngest({"));
  assert.match(step, /m\.ensureMeetingBillStubs\(\)\.catch\(\(\) => null\)/);
  assert.match(step, /m\.confirmHearings\(Date\.now\(\), Math\.min\(12_000,/);
  assert.match(step, /\}\)\.catch\(error => \(\{ ok: false, error:/);
  assert.match(tick, /return \{ \.\.\.federal, texas, loop, hearings, changes \};/);
  // Menu drafting starts last, in a request of its own, and a failure to start it never breaks the run.
  assert.match(tick, /const changes = await import\("@\/lib\/changes\/fire"\)\.then\(m => m\.fireChangeMenus\(origin\)\)\.catch\(\(\) => false\);/);
  // Meetings are matched to bills in one way everywhere.
  assert.match(read("lib/reminders.ts"), /meetings\.flatMap\(m => meetingBillIds\(m\)\)/);
  assert.match(read("lib/reminders.ts"), /bills: meetingBillIds\(m\)\.slice\(0, 12\)/);
  assert.doesNotMatch(read("lib/reminders.ts"), /m\.billIds/);
  const store = read("lib/changes/hearing-store.ts");
  assert.match(store, /"User-Agent": USER_AGENT/);
  assert.match(store, /const USER_AGENT = `\$\{BRAND\.userAgentName\}\//);
  assert.match(store, /AbortSignal\.timeout\(timeoutMs\)/);
});

test("the phone task set has 'Find out whether a bill can still be changed'", async () => {
  const { tasks } = await import("./e2e/tasks.mjs");
  const t = tasks.find(x => x.id === "window");
  assert.ok(t, "task id \"window\"");
  assert.equal(t.name, "Find out whether a bill can still be changed");
  assert.deepEqual(t.target, { taps: 2, seconds: 30 });
  assert.equal(tasks.filter(x => x.id === "window").length, 1);
  const src = read("tests/e2e/tasks.mjs");
  for (const sel of ["#window .window-where", "#window .window-changes", "#window .window-hearing"]) assert.ok(src.includes(sel), sel);
});

/* --------------------------------------------- F. No table, no migration --- */

test("confirmations live in the existing cursor store: no table and no migration of their own", t => {
  const store = read("lib/changes/hearing-store.ts");
  assert.match(store, /export const CONFIRMED_KEY = "hearings:confirmed";/);
  assert.match(store, /from\(ingestCursors\)/);
  for (const f of ["lib/changes/hearing-check.ts", "lib/changes/hearing-store.ts", "lib/changes/window.ts", "lib/changes/window-store.ts"])
    assert.doesNotMatch(read(f), /sqliteTable|create table|alter table|drop table/i, f);
  // No table or migration is named after this part of the feature.
  assert.doesNotMatch(read("db/schema.ts"), /sqliteTable\("[a-z_]*(hearing|window|confirm)[a-z_]*"/);
  const journal = JSON.parse(read("drizzle/meta/_journal.json")).entries.map(e => e.tag);
  assert.ok(!journal.some(tag => /hearing|window|confirm/.test(tag)), journal.join(", "));
  // While migration 0038 (the three approved tables) is the newest, nothing under db/schema.ts or drizzle/ may differ
  // from the commit that created them. A later phase with its own approved migration skips this part.
  const BASE = "0d9348b0e36167df8978dcab5f5bb39d324eb595";
  if (journal.at(-1) !== "0038_suggest_changes") return t.diagnostic("a later migration exists: the comparison with the Phase 2 foundation commit is skipped");
  let changed;
  try { changed = execFileSync("git", ["diff", "--stat", BASE, "--", "db/schema.ts", "drizzle"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    + execFileSync("git", ["status", "--porcelain", "--", "db/schema.ts", "drizzle"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return t.diagnostic("git or the Phase 2 foundation commit is not available here: the comparison is skipped"); }
  assert.equal(changed.trim(), "", "db/schema.ts and drizzle/ are unchanged since the three approved tables were created");
});
