import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMeetingList, parseMeetingDetail, detailsDue, isUpcoming, isoUtc, meetingListUrl, meetingDetailUrl, meetingPageUrl, meetingId, meetingKindLine,
  meetingStatusNote, billIdLabel, MEETING_LIST_LIMIT } from "../lib/federal/meetings-parse.ts";
import { whenLabel, isMine, mineOnly, comingView, txCommitteeFor, remindAtFor, EMPTY_SCOPE } from "../lib/coming-rules.ts";

// Hand-made fixtures that follow the Library of Congress documentation of the committee-meeting endpoint (not captures).
const fx = name => JSON.parse(readFileSync(new URL(`./fixtures/federal/${name}`, import.meta.url), "utf8"));
const BASE = "https://api.congress.gov/v3";

test("the list gives each meeting once, with its update time, and ignores what it cannot read", () => {
  const { items, count } = parseMeetingList(fx("committee-meeting-list-119-house.json"));
  assert.deepEqual(items.map(i => i.eventId), ["119501", "119488", "119502", "118001"]);
  assert.deepEqual(items[0], { eventId: "119501", congress: 119, chamber: "house", updateDate: "2026-11-17T14:02:11.000Z" });
  assert.equal(count, 2713);
  for (const bad of [null, undefined, "", 7, [], {}, { committeeMeetings: "x" }, { committeeMeetings: [{ eventId: "../etc" }] }]) assert.deepEqual(parseMeetingList(bad), { items: [], count: null });
  assert.equal(parseMeetingList({ committeeMeetings: [{ eventId: 5, chamber: "NoChamber" }] }).items[0].chamber, "joint");
});

test("a House hearing: committee, type, status, time, room and related bills", () => {
  const m = parseMeetingDetail(fx("committee-meeting-detail-house-hearing.json"));
  assert.equal(m.id, "119-house-119501");
  assert.equal(m.chamber, "house");
  assert.deepEqual(m.committeeCodes, ["HSII24"], "the subcommittee's code in the committee lists' spelling");
  assert.equal(m.committeeName, "House Natural Resources Subcommittee on Indian and Insular Affairs");
  assert.equal(m.meetingType, "Hearing");
  assert.equal(m.status, "Scheduled");
  assert.equal(m.startsAt, "2026-11-24T15:00:00.000Z");
  assert.equal(m.location, "Room 1324, Longworth House Office Building");
  assert.deepEqual(m.billIds, ["119-hr-1246", "119-hr-1532", "119-sjres-88"], "each bill once; a nomination is not a bill");
  assert.match(m.title, /^Legislative hearing on: •H\.R\. 1246 \(Rep\. Hageman\)/, "the official title is kept as written");
  assert.equal(m.url, "https://www.congress.gov/event/119th-congress/house-event/119501");
});

test("a Senate meeting with fields left out still reads, using the list item it came from", () => {
  const raw = fx("committee-meeting-detail-senate.json");
  assert.equal(parseMeetingDetail(raw), null, "without a congress and chamber from anywhere it is not stored");
  const m = parseMeetingDetail(raw, { congress: 119, chamber: "senate", eventId: "336120" });
  assert.equal(m.id, "119-senate-336120");
  assert.deepEqual(m.committeeCodes, ["SSFI", "SSFI10"]);
  assert.equal(m.committeeName, "Senate Finance Committee; Senate Finance Subcommittee on Health Care");
  assert.equal(m.location, null);
  assert.deepEqual(m.billIds, []);
  assert.equal(m.status, "Postponed");
  assert.equal(m.url, "https://www.congress.gov/event/119th-congress/senate-event/336120");
});

test("a field meeting has an address; a canceled markup keeps its status; bills may sit in a container", () => {
  const m = parseMeetingDetail(fx("committee-meeting-detail-field-markup.json"));
  assert.equal(m.location, "Lubbock Memorial Civic Center, 1501 Mac Davis Ln, Lubbock, TX, 79401");
  assert.equal(m.meetingType, "Markup");
  assert.equal(meetingStatusNote(m.status), "Canceled");
  assert.deepEqual(m.committeeCodes, ["HSAG"]);
  assert.deepEqual(m.billIds, ["119-hr-7254"]);
});

test("the detail parser never throws and never stores a meeting without a time or a title", () => {
  for (const bad of [null, undefined, "", 3, [], {}, { committeeMeeting: null }, { committeeMeeting: [] }, { committeeMeeting: "x" }]) assert.equal(parseMeetingDetail(bad), null);
  const base = { eventId: "1", congress: 119, chamber: "House", title: "A hearing", date: "2026-11-24T15:00:00Z" };
  assert.ok(parseMeetingDetail({ committeeMeeting: base }));
  assert.equal(parseMeetingDetail({ committeeMeeting: { ...base, date: undefined } }), null);
  assert.equal(parseMeetingDetail({ committeeMeeting: { ...base, date: "soon" } }), null);
  assert.equal(parseMeetingDetail({ committeeMeeting: { ...base, title: "" } }), null);
  assert.equal(parseMeetingDetail({ committeeMeeting: { ...base, title: "", committees: [{ name: "House Rules Committee", systemCode: "hsru00" }] } }).title, "House Rules Committee");
  assert.equal(parseMeetingDetail({ committeeMeeting: { ...base, location: { room: "WEBEX", building: "----------" } } }).location, "Held online");
  assert.equal(parseMeetingDetail({ committeeMeeting: { ...base, location: { address: "Town Hall, 1 Main St, Laredo, TX" } } }).location, "Town Hall, 1 Main St, Laredo, TX");
  assert.equal(parseMeetingDetail({ committeeMeeting: { ...base, title: "Hearing on <b>water</b>" } }).title, "Hearing on water");
  assert.equal(parseMeetingDetail({ committeeMeeting: { ...base, committees: "none", relatedItems: "none", location: 4 } }).committeeCodes.length, 0);
});

test("timestamps are read as UTC, with or without a zone", () => {
  assert.equal(isoUtc("2026-11-24T15:00:00Z"), "2026-11-24T15:00:00.000Z");
  assert.equal(isoUtc("2026-11-24T10:00:00-05:00"), "2026-11-24T15:00:00.000Z");
  assert.equal(isoUtc("2026-11-24T15:00:00"), "2026-11-24T15:00:00.000Z");
  assert.equal(isoUtc("2026-11-24"), "2026-11-24T00:00:00.000Z");
  for (const bad of ["", "next week", null, undefined, {}, "2026-13-45T99:00:00Z"]) assert.equal(isoUtc(bad), null);
});

test("request addresses follow the documented paths", () => {
  assert.equal(meetingListUrl(BASE, 119, "house"), `${BASE}/committee-meeting/119/house?format=json&limit=${MEETING_LIST_LIMIT}&offset=0`);
  assert.equal(meetingListUrl(BASE, 119, "senate", { since: "2026-11-07T12:34:56.789Z", offset: 250 }), `${BASE}/committee-meeting/119/senate?format=json&limit=250&offset=250&fromDateTime=2026-11-07T12:34:56Z`);
  assert.equal(meetingDetailUrl(BASE, 119, "house", "119501"), `${BASE}/committee-meeting/119/house/119501?format=json`);
  assert.equal(meetingPageUrl(118, "house", "115538"), "https://www.congress.gov/event/118th-congress/house-event/115538");
  assert.equal(meetingPageUrl(121, "senate", "1"), "https://www.congress.gov/event/121st-congress/senate-event/1");
  assert.equal(meetingPageUrl(112, "house", "1"), "https://www.congress.gov/event/112th-congress/house-event/1");
  assert.equal(meetingId(119, "house", "119501"), "119-house-119501");
});

test("only new or updated meetings are read again, newest update first, within the cap", () => {
  const { items } = parseMeetingList(fx("committee-meeting-list-119-house.json"));
  const at = iso => Date.parse(iso);
  assert.deepEqual(detailsDue(items, new Map(), 119, "house", 10).map(i => i.eventId), ["119502", "119501", "119488", "118001"]);
  assert.deepEqual(detailsDue(items, new Map(), 119, "house", 2).map(i => i.eventId), ["119502", "119501"]);
  const stored = new Map([["119-house-119502", at("2026-11-17T18:00:00Z")], ["119-house-119501", at("2026-11-17T09:00:00Z")], ["119-house-119488", at("2026-11-17T09:00:00Z")], ["119-house-118001", at("2026-03-01T00:00:00Z")]]);
  assert.deepEqual(detailsDue(items, stored, 119, "house", 10).map(i => i.eventId), ["119501"], "only the one updated after it was stored");
  assert.deepEqual(detailsDue(items, stored, 119, "house", 0), []);
  assert.deepEqual(detailsDue([{ eventId: "9", congress: null, chamber: null, updateDate: null }], new Map([["119-senate-9", 5]]), 119, "senate", 5), [], "a stored meeting with no update time is left alone");
});

test("upcoming means from now to 21 days ahead", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  assert.equal(isUpcoming("2026-11-17T10:00:00.000Z", now), true, "a meeting that started two hours ago is still shown");
  assert.equal(isUpcoming("2026-11-17T08:00:00.000Z", now), false);
  assert.equal(isUpcoming("2026-12-08T11:00:00.000Z", now), true);
  assert.equal(isUpcoming("2026-12-09T11:00:00.000Z", now), false);
  assert.equal(isUpcoming("nonsense", now), false);
});

test("meeting kinds and bill labels are in plain words", () => {
  assert.equal(meetingKindLine("Hearing"), "Hearing: members question witnesses");
  assert.equal(meetingKindLine("Markup"), "Markup: the committee debates, changes and votes on bills");
  assert.equal(meetingKindLine("Meeting"), "Committee meeting");
  assert.equal(meetingKindLine(null), "Committee meeting");
  assert.equal(meetingStatusNote("Scheduled"), null);
  assert.equal(meetingStatusNote("Rescheduled"), "Rescheduled");
  assert.equal(billIdLabel("119-hr-1532"), "H.R. 1532");
  assert.equal(billIdLabel("119-sjres-88"), "S.J.Res. 88");
});

test("times are Eastern for Congress and Central for Texas, and say so", () => {
  assert.equal(whenLabel("2026-11-24T15:00:00.000Z", "Congress"), "Tue, Nov 24 · 10:00 AM Eastern");
  assert.equal(whenLabel("2026-07-14T14:30:00.000Z", "Congress"), "Tue, Jul 14 · 10:30 AM Eastern", "daylight time in summer");
  assert.equal(whenLabel("2027-01-20T08:00:00-06:00", "Texas"), "Wed, Jan 20 · 8:00 AM Central");
  assert.equal(whenLabel("2027-01-20T14:00:00Z", "Texas"), "Wed, Jan 20 · 8:00 AM Central");
  assert.equal(whenLabel("2026-11-25T01:30:00.000Z", "Congress"), "Tue, Nov 24 · 8:30 PM Eastern", "an evening meeting stays on its own day");
  for (const level of ["Congress", "Texas"]) assert.match(whenLabel("2026-11-24T15:00:00.000Z", level), / (Eastern|Central)$/);
});

test("a date with no time of day is not turned into a wrong hour", () => {
  assert.equal(whenLabel("2026-11-24T00:00:00.000Z", "Congress"), "Tue, Nov 24 · time not listed");
  assert.equal(whenLabel("2026-11-24T00:00:00Z", "Texas"), "Tue, Nov 24 · time not listed");
  assert.equal(whenLabel("2027-01-20", "Texas"), "Wed, Jan 20 · time not listed");
  assert.equal(whenLabel("whenever", "Congress"), "Time not listed");
});

const scope = { chambers: ["senate", "house"], committees: new Set(["HSAG", "SSFI10"]), txCommittees: new Set(["ocd-organization/pe"]) };
const items = [
  { key: "f1", kind: "floor", where: "Congress", chamber: "house" },
  { key: "f2", kind: "floor", where: "Congress", chamber: "senate" },
  { key: "h1", kind: "hearing", where: "Congress", chamber: "house", committeeCodes: ["HSAG"] },
  { key: "h2", kind: "hearing", where: "Congress", chamber: "house", committeeCodes: ["HSAG15"] },
  { key: "h3", kind: "hearing", where: "Congress", chamber: "senate", committeeCodes: ["SSFI", "SSFI10"] },
  { key: "h4", kind: "hearing", where: "Congress", chamber: "senate", committeeCodes: [] },
  { key: "t1", kind: "hearing", where: "Texas", txCommitteeId: "ocd-organization/pe" },
  { key: "t2", kind: "hearing", where: "Texas", txCommitteeId: "ocd-organization/fin" },
  { key: "t3", kind: "hearing", where: "Texas", txCommitteeId: null },
];

test("My legislators keeps their chambers' floor items and their committees' hearings", () => {
  assert.deepEqual(mineOnly(items, scope).map(i => i.key), ["f1", "f2", "h1", "h3", "t1"]);
  assert.equal(isMine(items[3], scope), false, "sitting on the full committee does not put a member in a subcommittee's hearing");
  assert.equal(isMine(items[5], scope), false, "a hearing with no committee is never claimed");
  assert.equal(isMine(items[8], scope), false, "a Texas hearing that could not be matched is never claimed");
});

test("a reader with senators only gets Senate floor items; a reader with no place gets nothing", () => {
  const senateOnly = { chambers: ["senate"], committees: new Set(), txCommittees: new Set() };
  assert.deepEqual(mineOnly(items, senateOnly).map(i => i.key), ["f2"]);
  assert.deepEqual(mineOnly(items, EMPTY_SCOPE), []);
});

test("the first view is My legislators only with a saved place and something to show", () => {
  assert.equal(comingView(undefined, true, 3), "mine");
  assert.equal(comingView(undefined, true, 0), "all");
  assert.equal(comingView(undefined, false, 3), "all");
  assert.equal(comingView(null, false, 0), "all");
  assert.equal(comingView("all", true, 3), "all", "the reader's own choice wins");
  assert.equal(comingView("mine", false, 0), "mine");
  assert.equal(comingView("everything", true, 2), "mine", "an unknown value falls back to the rule");
});

test("a Texas hearing is tied to a committee only by its whole name and chamber", () => {
  const committees = [{ id: "pe", name: "Public Education", chamber: "lower" }, { id: "ed", name: "Education", chamber: "upper" }, { id: "hed", name: "Higher Education", chamber: "lower" },
    { id: "fin", name: "Senate Committee on Finance", chamber: "upper" }, { id: "app", name: "Appropriations", chamber: null }];
  assert.equal(txCommitteeFor("House Public Education: public hearing", committees), "pe");
  assert.equal(txCommitteeFor("Senate Education", committees), "ed");
  assert.equal(txCommitteeFor("House Committee on Higher Education", committees), "hed", "the longest name wins, and the Senate's Education committee is not taken for a House one");
  assert.equal(txCommitteeFor("Senate Finance", committees), "fin");
  assert.equal(txCommitteeFor("Finance", committees), "fin");
  assert.equal(txCommitteeFor("House Appropriations - S/C on Articles I, IV & V", committees), "app");
  assert.equal(txCommitteeFor("House Calendars", committees), null);
  assert.equal(txCommitteeFor("House Finance", committees), null, "a House hearing is never matched to a Senate committee");
  assert.equal(txCommitteeFor("Coeducation forum", committees), null, "part of a word is not a match");
  assert.equal(txCommitteeFor("", committees), null);
  assert.equal(txCommitteeFor("House Public Education", []), null);
});

test("a hearing's reminder goes out the day before; a floor item's an hour before its Monday", () => {
  const t = Date.parse("2026-11-24T15:00:00Z");
  assert.equal(remindAtFor({ kind: "hearing", where: "Congress", whenMs: t }), t - 86400e3);
  assert.equal(remindAtFor({ kind: "hearing", where: "Texas", whenMs: t }), t - 86400e3);
  assert.equal(remindAtFor({ kind: "floor", where: "Congress", whenMs: t }), t - 3600e3);
  assert.equal(remindAtFor({ where: "Texas", whenMs: t }), t - 86400e3);
});
