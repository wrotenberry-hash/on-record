import test from "node:test";
import assert from "node:assert/strict";
import { legiscanMasterListSession, legiscanVoteRows, parseLegiscanBill, parseLegiscanMasterList, parseLegiscanRollCall, parseLegiscanSessionPeople, parseOpenStatesCommitteePage,
  parseOpenStatesEventPage, parseOpenStatesEvents, txBillNumber, txEventBillIds, txEventSession } from "../lib/texas/parse.ts";
import { compareLastAction, matchTloCode, parseTloCommitteeList, parseTloHistory, parseTloMemberList, pickSpotCheck, tallyChecks, tloBillPages, tloCommitteeUrl, tloHearingUrl,
  tloMemberUrl } from "../lib/texas/tlo.ts";

/* ------------------------------------------------------------ Committees --- */

// Open States v3 /committees (openapi.json Committee and CommitteeMembership): parent_id is an opaque organization id.
const OS_COMMITTEES = { results: [
  { id: "ocd-organization/1", name: "Finance", classification: "committee", parent_id: "ocd-organization/2b3c4d5e-0000-4000-8000-000000000001", extras: {},
    memberships: [{ person_name: "Joan Huffman", role: "Chair", person: { id: "ocd-person/a", name: "Joan Huffman" } }, { person_name: "Joan Huffman", role: "member" }, { person_name: "", role: "member" }] },
  { id: "ocd-organization/3", name: " State Affairs ", classification: "committee", parent_id: "ocd-organization/2b3c4d5e-0000-4000-8000-000000000001", memberships: [] },
  { name: "no id" } ], pagination: { per_page: 20, page: 2, max_page: 2, total_items: 21 } };

test("committees: the chamber comes from the request, not a guess at the opaque parent id", () => {
  const p = parseOpenStatesCommitteePage(OS_COMMITTEES, "upper");
  assert.deepEqual(p.committees.map(c => [c.name, c.chamber]), [["Finance", "upper"], ["State Affairs", "upper"]]);
  assert.deepEqual(p.committees[0].members, [{ personId: "ocd-person/a", name: "Joan Huffman", role: "Chair" }], "a member counted once; nameless left out");
  assert.deepEqual([p.page, p.maxPage, p.total], [2, 2, 21]);
  assert.equal(parseOpenStatesCommitteePage(OS_COMMITTEES).committees[0].chamber, null, "without the chamber asked for, it stays unknown");
});

/* ---------------------------------------------------------------- Events --- */

// Open States v3 /events with include=agenda&include=participants&include=sources (openapi.json Event, EventAgendaItem, EventParticipant).
const OS_EVENTS = { results: [
  { id: "ocd-event/1", name: "Appropriations", start_date: "2027-02-03T08:00:00-06:00", end_date: "", all_day: false, status: "tentative", deleted: false, classification: "committee-meeting",
    location: { name: "E1.030", url: "" }, participants: [{ entity_type: "organization", name: "Appropriations", note: "host", organization: { name: "Appropriations", classification: "committee" } }],
    agenda: [{ description: "Bills", order: 1, related_entities: [{ entity_type: "bill", name: "HB 1", bill: { identifier: "HB 1" } }, { entity_type: "bill", name: "H.B. 2" }, { entity_type: "person", name: "JONES" }] },
      { description: "More", order: 2, related_entities: [{ entity_type: "bill", name: "HB1", bill: { identifier: "HB1" } }] }],
    sources: [{ url: "http://capitol.texas.gov/tlodocs/90R/schedules/html/C0302027020308001.HTM" }] },
  { id: "ocd-event/2", name: "Senate Finance", start_date: "2027-02-04T09:00:00-06:00", status: "cancelled", agenda: [] },
  { id: "ocd-event/3", name: "Senate Committee on Finance", start_date: "2027-02-05T09:00:00-06:00", status: "tentative", agenda: [], sources: [{ url: "https://senate.texas.gov/x" }] },
  { name: "no id" } ], pagination: { per_page: 20, page: 1, max_page: 3, total_items: 45 } };

test("events: each hearing keeps the bills on its agenda; cancelled ones are left out; every page is known", () => {
  const p = parseOpenStatesEventPage(OS_EVENTS);
  assert.deepEqual(p.events.map(e => e.id), ["ocd-event/1", "ocd-event/3"]);
  assert.deepEqual(p.cancelled, ["ocd-event/2"]);
  assert.deepEqual(p.events[0].bills, ["HB 1", "HB 2"], "bill numbers in one form, once each; people are not bills");
  assert.equal(p.events[0].committee, "Appropriations");
  assert.equal(p.events[1].chamber, "upper", "the chamber from the name when the participant does not say");
  assert.deepEqual([p.page, p.maxPage, p.total], [1, 3, 45]);
  assert.equal(parseOpenStatesEvents(OS_EVENTS).length, 2, "the old entry point still works");
  assert.equal(txBillNumber("sjr  03"), "SJR 3");
});

test("events: agenda bills become site bill ids in the session that holds the date (or the next one to start)", () => {
  assert.equal(txEventSession("2027-02-03T08:00:00-06:00").id, "90");
  assert.equal(txEventSession("2026-12-01T09:00:00-06:00").id, "90", "an interim hearing before the session counts toward the next one");
  assert.equal(txEventSession("2025-08-20T09:00:00-05:00").id, "892");
  assert.deepEqual(txEventBillIds(["HB 1", "S.B. 12"], "2027-02-03T08:00:00-06:00"), ["tx-90-hb1", "tx-90-sb12"]);
  assert.deepEqual(txEventBillIds(null, "2027-02-03"), []);
});

/* -------------------------------------------------------------- LegiScan --- */

// Hand-made from the LegiScan API manual (getMasterList, getBill, getRollCall, getSessionPeople).
const LS_MASTER = { status: "OK", masterlist: { session: { session_id: 2200, session_name: "89th Legislature 2nd Special Session" },
  "0": { bill_id: 1900001, number: "HB2", change_hash: "x", url: "https://legiscan.com/TX/bill/HB2/2025/X2", status_date: "2025-08-21", status: 2, last_action_date: "2025-08-21", last_action: "Passed", title: "Relating to item 2." } } };
const LS_BILL = { status: "OK", bill: { bill_id: 1900001, state: "TX", bill_number: "HB2", session_id: 2200, session: { session_id: 2200, year_start: 2025, year_end: 2025, special: 1, session_name: "89th Legislature 2nd Special Session" },
  votes: [{ roll_call_id: 9001, date: "2025-08-21", desc: "Passed to third reading", yea: 2, nay: 1, nv: 1, absent: 0, total: 4, passed: 1, chamber: "H", chamber_id: 73, url: "", state_link: "" },
    { roll_call_id: "bad", date: "2025-08-22" }] } };
const LS_ROLL = { status: "OK", roll_call: { roll_call_id: 9001, bill_id: 1900001, date: "2025-08-21", desc: "Passed to third reading", yea: 2, nay: 1, nv: 1, absent: 0, total: 4, passed: 1, chamber: "H", chamber_id: 73,
  votes: [{ people_id: 11, vote_id: 1, vote_text: "Yea" }, { people_id: 12, vote_id: 1, vote_text: "Yea" }, { people_id: 13, vote_id: 2, vote_text: "Nay" }, { people_id: 14, vote_id: 3, vote_text: "NV" }] } };
const LS_PEOPLE = { status: "OK", sessionpeople: { session: { session_id: 2200 }, people: [
  { people_id: 11, name: "Brad Buckley", role: "Rep", party: "R", district: "HD-054" }, { people_id: 12, name: "Gary VanDeaver", role: "Rep", district: "HD-001" },
  { people_id: 13, name: "Gina Hinojosa", role: "Rep", district: "HD-049" }, { people_id: 14, name: "Someone New", role: "Rep", district: "HD-150" } ] } };
const MEMBERS = [{ id: "ocd-person/hd54", chamber: "lower", district: "54" }, { id: "ocd-person/hd1", chamber: "lower", district: "1" }, { id: "ocd-person/hd49", chamber: "lower", district: "49" }];

test("LegiScan: master list keeps bill ids and its own session", () => {
  assert.equal(parseLegiscanMasterList(LS_MASTER)[0].billId, 1900001);
  assert.equal(parseLegiscanMasterList(LS_MASTER)[0].number, "HB 2");
  assert.equal(legiscanMasterListSession(LS_MASTER), 2200);
  assert.equal(legiscanMasterListSession({ status: "ERROR" }), null);
});

test("LegiScan: getBill then getRollCall become one recorded vote with each member placed by chamber and district", () => {
  const bill = parseLegiscanBill(LS_BILL), rc = parseLegiscanRollCall(LS_ROLL), people = parseLegiscanSessionPeople(LS_PEOPLE);
  assert.deepEqual(bill.rollCalls, [{ rollCallId: 9001, date: "2025-08-21", desc: "Passed to third reading", chamber: "lower" }]);
  assert.equal(bill.sessionId, 2200); assert.equal(bill.number, "HB 2");
  assert.deepEqual(rc.counts, { yes: 2, no: 1, "not voting": 1, absent: 0 });
  assert.deepEqual(people[0], { peopleId: 11, name: "Brad Buckley", chamber: "lower", district: "54" });
  const rows = legiscanVoteRows(rc, bill, { sessionId: 2200, number: "HB 2", siteBillId: "tx-892-hb2" }, people, MEMBERS);
  assert.equal(rows.vote.id, "legiscan-9001"); assert.equal(rows.vote.billId, "tx-892-hb2"); assert.equal(rows.vote.result, "pass"); assert.equal(rows.vote.chamber, "lower");
  assert.deepEqual(rows.vote.votes, [{ option: "yes", personId: "ocd-person/hd54", name: "Brad Buckley" }, { option: "yes", personId: "ocd-person/hd1", name: "Gary VanDeaver" },
    { option: "no", personId: "ocd-person/hd49", name: "Gina Hinojosa" }, { option: "not voting", personId: null, name: "Someone New" }]);
  assert.equal(rows.mismatch, false);
});

test("LegiScan: a vote is never filed under the wrong session or bill", () => {
  const bill = parseLegiscanBill(LS_BILL), rc = parseLegiscanRollCall(LS_ROLL), people = parseLegiscanSessionPeople(LS_PEOPLE);
  assert.equal(legiscanVoteRows(rc, bill, { sessionId: 2100, number: "HB 2", siteBillId: "tx-89-hb2" }, people, MEMBERS), null);
  assert.equal(legiscanVoteRows(rc, bill, { sessionId: 2200, number: "HB 3", siteBillId: "tx-892-hb3" }, people, MEMBERS), null);
  assert.equal(legiscanVoteRows({ ...rc, billId: 42 }, bill, { sessionId: 2200, number: "HB 2", siteBillId: "tx-892-hb2" }, people, MEMBERS), null);
  assert.equal(parseLegiscanBill({ status: "ERROR", alert: { message: "Unknown bill id" } }), null);
  assert.equal(parseLegiscanRollCall({ status: "OK", roll_call: { roll_call_id: 1 } }), null);
  // Counts that disagree with the member list are flagged, as for Open States votes.
  assert.equal(legiscanVoteRows({ ...rc, counts: { ...rc.counts, yes: 3 } }, bill, { sessionId: 2200, number: "HB2", siteBillId: "tx-892-hb2" }, people, MEMBERS).mismatch, true);
});

/* ------------------------------------------------- Texas Legislature Online --- */

// Trimmed from capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=HB1, read 17 Nov 2026.
const TLO_HISTORY = `<h1>History for 89(R) HB 1 by Bonnen</h1>
<div class="history">
	<div class="label"><b>Last Action:</b></div>
	<div class="data"><span id="lblLastAction">02/25/2025 H Referred to Appropriations: Feb 25 2025  3:35PM </span></div>
	<div class="label"><b>Caption Text:</b></div>
	<div class="data"><span id="lblCaptionText">General Appropriations Bill.</span></div>
</div>
<table border="1" class="actions"><thead><tr style="background-color: #d0d0d0"><th colspan="2" scope="col">Description</th></tr></thead>
			<tr>
				<td data-label="Action Chamber">H&nbsp;</td>
		        <td data-label="Action Description">&nbsp;<a href="http://journals.house.texas.gov/hjrnl/89r/pdf/89RDAY18FINAL.PDF#page=15" aria-label="x">Referred to Appropriations</a>&nbsp;</td>
				<td data-label="Action Comment" class="mobile">&nbsp;&nbsp;</td>
				<td data-label="Action Date">&nbsp;02/25/2025&nbsp;</td>
				<td data-label="Action Time">&nbsp;03:35 PM&nbsp;</td>
			</tr>
			<tr>
				<td data-label="Action Chamber">H&nbsp;</td>
		        <td data-label="Action Description">&nbsp;<a href="x">Read first time</a>&nbsp;</td>
				<td data-label="Action Date">&nbsp;02/25/2025&nbsp;</td>
				<td data-label="Action Time">&nbsp;&nbsp;</td>
			</tr>
			<tr>
				<td data-label="Action Chamber">H&nbsp;</td>
		        <td data-label="Action Description">&nbsp;Filed&nbsp;</td>
				<td data-label="Action Date">&nbsp;01/22/2025&nbsp;</td>
				<td data-label="Action Time">&nbsp;&nbsp;</td>
			</tr>
</table>`;
// The body TLO answers for a bill or session it does not have (a 302 to /home.aspx).
const TLO_MOVED = `<html><head><title>Object moved</title></head><body><h2>Object moved to <a href="/home.aspx?LegSess=90R&amp;Bill=HB10">here</a>.</h2></body></html>`;

test("TLO: a bill's official pages", () => {
  assert.deepEqual(tloBillPages("90", "HB 1"), { history: "https://capitol.texas.gov/BillLookup/History.aspx?LegSess=90R&Bill=HB1",
    text: "https://capitol.texas.gov/BillLookup/Text.aspx?LegSess=90R&Bill=HB1", actions: "https://capitol.texas.gov/BillLookup/Actions.aspx?LegSess=90R&Bill=HB1" });
  assert.equal(tloBillPages("892", "S.B. 3").history, "https://capitol.texas.gov/BillLookup/History.aspx?LegSess=892&Bill=SB3");
});

test("TLO: the history page's last action and actions", () => {
  const h = parseTloHistory(TLO_HISTORY);
  assert.equal(h.found, true); assert.equal(h.title, "History for 89(R) HB 1 by Bonnen"); assert.equal(h.caption, "General Appropriations Bill.");
  assert.deepEqual(h.lastAction, { date: "2025-02-25", chamber: "lower", text: "Referred to Appropriations" });
  assert.deepEqual(h.actions.map(a => [a.date, a.description, a.chamber]), [["2025-02-25", "Referred to Appropriations", "lower"], ["2025-02-25", "Read first time", "lower"], ["2025-01-22", "Filed", "lower"]]);
  assert.equal(h.actions[0].time, "03:35 PM");
  assert.equal(parseTloHistory(TLO_MOVED).found, false);
});

test("TLO: comparing the stored last action with the official one", () => {
  const h = parseTloHistory(TLO_HISTORY);
  assert.equal(compareLastAction({ date: "2025-02-25", description: "Referred to Appropriations" }, h), "agree");
  assert.equal(compareLastAction({ date: "2025-02-25", description: "Read first time" }, h), "agree", "another action listed on the same day");
  assert.equal(compareLastAction({ date: "2025-02-25", description: "Withdrawn from schedule" }, h), "same day, other action");
  assert.equal(compareLastAction({ date: "2025-01-22", description: "Filed" }, h), "feed behind");
  assert.equal(compareLastAction({ date: "2025-03-01", description: "Reported favorably" }, h), "feed ahead");
  assert.equal(compareLastAction({ date: null, description: null }, h), "nothing stored");
  assert.equal(compareLastAction({ date: "2025-02-25", description: "x" }, parseTloHistory(TLO_MOVED)), "not on TLO");
  assert.deepEqual(tallyChecks(["agree", "agree", "feed behind", "not on TLO", "same day, other action"]),
    { checked: 5, agree: 2, sameDayOtherAction: 1, mismatches: 1, feedBehind: 1, feedAhead: 0, notOnTlo: 1, nothingStored: 0 });
});

test("TLO: the spot check rotates through the most active bills, a few a day", () => {
  const bills = Array.from({ length: 40 }, (_, i) => `b${i}`);
  const a = pickSpotCheck(bills, "2026-11-17", 5), b = pickSpotCheck(bills, "2026-11-18", 5);
  assert.equal(a.length, 5); assert.equal(new Set(a).size, 5);
  assert.notDeepEqual(a, b);
  assert.ok([...a, ...b].every(x => Number(x.slice(1)) < 30), "only from the 30 most recently active");
  assert.deepEqual(pickSpotCheck(["x"], "2026-11-17", 5), ["x"]);
  assert.deepEqual(pickSpotCheck([], "2026-11-17", 5), []);
});

// Trimmed from capitol.texas.gov/Committees/CommitteesMbrs.aspx?Chamber=H and Members/Members.aspx?Chamber=H, read 17 Nov 2026.
const TLO_COMMITTEES = `<ul style="line-height: 0em"><li style="LINE-HEIGHT: 1.5em"><a class="CmteList" href="MembershipCmte.aspx?LegSess=89R&CmteCode=C020">Agriculture & Livestock</a></li></ul><ul style="line-height: 0em"><li style="LINE-HEIGHT: 1.5em"><a class="CmteList" href="MembershipCmte.aspx?LegSess=89R&CmteCode=C030">Appropriations</a></li></ul><li><a class="CmteList" href="MembershipCmte.aspx?LegSess=89R&CmteCode=C010">Appropriations - S/C on Article II</a></li>`;
const TLO_MEMBERS = `<ul class="column-list">
							<li>
								<a href='MemberInfo.aspx?Leg=89&Chamber=H&Code=A4395'>
									Alders
								</a>
							</li>
							<li>
								<a href='MemberInfo.aspx?Leg=89&Chamber=H&Code=A4295'>
									Lopez, Janie
								</a>
							</li>
							<li>
								<a href='MemberInfo.aspx?Leg=89&Chamber=H&Code=A2655'>
									Lopez, Ray
								</a>
							</li>
							<li>
								<a href='MemberInfo.aspx?Leg=89&Chamber=H&Code=A2150'>
									Anchía
								</a>
							</li></ul>`;

test("TLO: committee codes and pages; hearing pages from the notice, the committee, or the chamber", () => {
  const list = parseTloCommitteeList(TLO_COMMITTEES);
  assert.deepEqual(list, [{ code: "C020", name: "Agriculture & Livestock" }, { code: "C030", name: "Appropriations" }, { code: "C010", name: "Appropriations - S/C on Article II" }]);
  assert.equal(matchTloCode("House Committee on Appropriations", list), "C030");
  assert.equal(matchTloCode("Agriculture and Livestock", list), "C020");
  assert.equal(matchTloCode("Public Education", list), null);
  assert.equal(tloCommitteeUrl("90", "C030"), "https://capitol.texas.gov/Committees/MembershipCmte.aspx?LegSess=90R&CmteCode=C030");
  assert.deepEqual(tloHearingUrl({ sourceUrl: "http://capitol.texas.gov/tlodocs/90R/schedules/html/C0302027020308001.HTM" }),
    { url: "https://capitol.texas.gov/tlodocs/90R/schedules/html/C0302027020308001.HTM", kind: "notice" });
  assert.deepEqual(tloHearingUrl({ sourceUrl: "https://example.org/x", sessionId: "90", chamber: "lower", committeeCode: "C030" }),
    { url: "https://capitol.texas.gov/Committees/MeetingsByCmte.aspx?Leg=90&Chamber=H&CmteCode=C030", kind: "committee meetings" });
  assert.deepEqual(tloHearingUrl({ chamber: "upper" }), { url: "https://capitol.texas.gov/Committees/MeetingsUpcoming.aspx?Chamber=S", kind: "upcoming meetings" });
  assert.equal(tloHearingUrl({}), null, "no page is guessed");
});

test("TLO: member pages by last name, first name where two share one", () => {
  const list = parseTloMemberList(TLO_MEMBERS);
  assert.deepEqual(list.map(x => x.code), ["A4395", "A4295", "A2655", "A2150"]);
  assert.deepEqual(tloMemberUrl({ sessionId: "90", chamber: "lower", name: "John Bucy Alders", list }), { url: "https://capitol.texas.gov/Members/MemberInfo.aspx?Leg=90&Chamber=H&Code=A4395", matched: true });
  assert.equal(tloMemberUrl({ sessionId: "90", chamber: "lower", name: "Janie Lopez", list }).url.endsWith("Code=A4295"), true);
  assert.equal(tloMemberUrl({ sessionId: "90", chamber: "lower", name: "Rafael Anchia", list }).matched, true, "accents do not stop a match");
  assert.deepEqual(tloMemberUrl({ sessionId: "90", chamber: "lower", name: "Pat Lopez", list }), { url: "https://capitol.texas.gov/Members/Members.aspx?Leg=90&Chamber=H", matched: false });
  assert.equal(tloMemberUrl({ sessionId: "892", chamber: "upper", name: "Joan Huffman" }).url, "https://capitol.texas.gov/Members/Members.aspx?Leg=89&Chamber=S");
});
