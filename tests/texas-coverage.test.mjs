import test from "node:test";
import assert from "node:assert/strict";
import { advanceBillCursor, billUpdatedAts, committeeRequestCap, matchLegiscanSession, nextCommitteeStep, osSecond, parseOpenStatesSessions, peoplePageKinds, peopleRefreshMs,
  planSessions, readBillCursor, readCommitteeWalk, seatLine, startCommitteeWalk, TX_SEATS, TX_SEATS_TOTAL, txCoverageView, txReadiness, txSeatCoverage } from "../lib/texas/coverage.ts";
import { isCommitteeChair, parseOpenStatesCommitteePage, parseOpenStatesCommittees, TX_SESSIONS } from "../lib/texas/parse.ts";

const everyone = (skipUpper = [], skipLower = []) => [
  ...Array.from({ length: 31 }, (_, i) => ({ chamber: "upper", district: String(i + 1) })).filter(p => !skipUpper.includes(p.district)),
  ...Array.from({ length: 150 }, (_, i) => ({ chamber: "lower", district: String(i + 1) })).filter(p => !skipLower.includes(p.district))];

test("seats: 31 senators and 150 representatives expected", () => {
  assert.deepEqual(TX_SEATS, { upper: 31, lower: 150 }); assert.equal(TX_SEATS_TOTAL, 181);
  const full = txSeatCoverage(everyone());
  assert.equal(full.filled, 181); assert.equal(full.notInSource, 0);
  assert.equal(seatLine(full), "All 181 seats have a member on file: 31 senators and 150 representatives.");
});

test("seats: 178 of 181 names the missing districts and never calls them vacant", () => {
  const c = txSeatCoverage(everyone(["9"], ["12", "85"]));
  assert.equal(c.senators, 30); assert.equal(c.representatives, 148); assert.equal(c.filled, 178); assert.equal(c.notInSource, 3);
  assert.deepEqual(c.missing, { upper: ["9"], lower: ["12", "85"] });
  const line = seatLine(c);
  assert.equal(line, "178 of 181 seats have a member on file: 30 of 31 senators and 148 of 150 representatives. 3 seats are not in the source's list (Senate district 9; House districts 12 and 85). The list does not say whether a missing seat is empty or just not updated yet.");
  assert.doesNotMatch(line, /vacan/i);
  assert.match(seatLine(txSeatCoverage(everyone([], ["7"]))), /^180 of 181 .* 1 seat is not in the source's list \(House district 7\)\./);
  assert.equal(seatLine(txSeatCoverage([])), "The list of Texas legislators has not loaded yet.");
  // Many missing: the count, without a long list of districts.
  const few = seatLine(txSeatCoverage(everyone([], Array.from({ length: 20 }, (_, i) => String(i + 1)))));
  assert.match(few, /20 seats are not in the source's list\. The list/);
});

test("seats: a district counts once; odd rows are reported, not counted", () => {
  const c = txSeatCoverage([...everyone(), { chamber: "lower", district: "5" }, { chamber: "lower", district: "151" }, { chamber: "upper", district: "At-Large" }, { chamber: "executive", district: "1" }, { chamber: "upper", district: " 3 " }]);
  assert.equal(c.filled, 181); assert.deepEqual(c.doubled.sort(), ["lower-5", "upper-3"]); assert.deepEqual(c.unexpected, ["lower-151", "upper-At-Large", "executive-1"]);
});

test("people page: why a listed record was not stored", () => {
  const k = peoplePageKinds({ results: [
    { id: "ocd-person/a", name: "A", current_role: { org_classification: "lower", district: "54" } },
    { id: "ocd-person/s", name: "S", current_role: { org_classification: "upper", district: 14 } },
    { id: "ocd-person/g", name: "Governor", current_role: { org_classification: "executive" } },
    { id: "ocd-person/x", name: "X", current_role: { org_classification: "lower" } },
    { id: "ocd-person/n", name: "N" }], pagination: { total_items: 183, max_page: 4 } });
  assert.deepEqual(k, { listed: 5, legislators: 2, other: 2, noDistrict: 1, total: 183 });
  assert.deepEqual(peoplePageKinds(null), { listed: 0, legislators: 0, other: 0, noDistrict: 0, total: null });
  assert.deepEqual(peoplePageKinds({ results: "no" }), { listed: 0, legislators: 0, other: 0, noDistrict: 0, total: null });
});

test("the member list is re-read daily around the start of a regular session, weekly otherwise", () => {
  const DAY = 86400e3;
  assert.equal(peopleRefreshMs("2026-11-17"), 7 * DAY);
  assert.equal(peopleRefreshMs("2027-01-10"), 7 * DAY);
  assert.equal(peopleRefreshMs("2027-01-11"), DAY);
  assert.equal(peopleRefreshMs("2027-01-12"), DAY);
  assert.equal(peopleRefreshMs("2027-02-11"), DAY);
  assert.equal(peopleRefreshMs("2027-02-12"), 7 * DAY);
  assert.equal(peopleRefreshMs("2025-08-16"), 7 * DAY); // a called session does not seat new members
});

test("sessions the source lists", () => {
  const src = parseOpenStatesSessions({ id: "ocd-jurisdiction/country:us/state:tx/government", name: "Texas", legislative_sessions: [
    { identifier: "89", name: "89th Legislature (2025)", classification: "primary", start_date: "2025-01-14", end_date: "2025-06-02" },
    { identifier: "892", name: "89th Legislature, 2nd Called Session", classification: "special", start_date: "2025-08-15", end_date: "" },
    { name: "no identifier" }, null] });
  assert.deepEqual(src.map(s => s.identifier), ["89", "892"]);
  assert.deepEqual(src[1], { identifier: "892", name: "89th Legislature, 2nd Called Session", classification: "special", start: "2025-08-15", end: null });
  assert.deepEqual(parseOpenStatesSessions(null), []); assert.deepEqual(parseOpenStatesSessions({ legislative_sessions: {} }), []);
});

test("which sessions to load: the upcoming one first, and it is reported when the source does not have it", () => {
  const src = ids => ids.map(identifier => ({ identifier, name: identifier, classification: null, start: null, end: null }));
  // The list has not been read: ask for our own ids.
  assert.deepEqual(planSessions("2026-11-17", null).map(p => [p.id, p.sourceId]), [["90", "90"], ["892", "892"]]);
  assert.deepEqual(planSessions("2026-11-17", []).map(p => [p.id, p.sourceId]), [["90", "90"], ["892", "892"]]);
  // Read, and the 90th is not there yet: no request is spent on it and the probe can say so.
  assert.deepEqual(planSessions("2026-11-17", src(["88", "89", "891", "892"])).map(p => [p.id, p.sourceId]), [["90", null], ["892", "892"]]);
  // Read, and the 90th is there.
  assert.deepEqual(planSessions("2026-11-17", src(["89", "892", "90"])).map(p => [p.id, p.sourceId, p.known]), [["90", "90", true], ["892", "892", true]]);
  // From opening day only the 90th is loaded.
  assert.deepEqual(planSessions("2027-01-12", src(["892", "90"])).map(p => p.id), ["90"]);
  // The source's own names for recent regular sessions: "89R", "90R" (as on 17 Nov 2026).
  assert.deepEqual(planSessions("2026-11-17", src(["88", "881", "89R", "891", "892", "90R"])).map(p => [p.id, p.sourceId, p.known]), [["90", "90R", true], ["892", "892", true]]);
  assert.deepEqual(planSessions("2027-02-01", src(["89R", "892", "90R"])).map(p => [p.id, p.sourceId]), [["90", "90R"]]);
  // A called session the site has no dates for is loaded first and flagged; older sessions the site does not list are ignored.
  const summer = planSessions("2027-07-10", src(["85", "881", "90", "901"]));
  assert.deepEqual(summer.map(p => [p.id, p.known]), [["901", false], ["90", true]]);
  assert.equal(summer[0].name, "90th Legislature, 1st Called Session");
  assert.deepEqual(planSessions("2027-09-01", src(["90", "901", "902"])).map(p => p.id), ["902", "901", "90"]);
});

test("committees: one page parsed with the chamber that was asked for", () => {
  const page = { results: [
    { id: "ocd-organization/1", name: " Public Education ", classification: "committee", parent_id: "ocd-organization/8ab1-uuid",
      memberships: [{ person_name: "Brad Buckley", role: "Chair", person: { id: "ocd-person/a" } }, { person_name: "Diego Bernal", role: "Vice Chair", person: null }, { person_name: "Brad Buckley", role: "member" }, { role: "member" }] },
    { id: "ocd-organization/2", name: "Ways & Means", classification: "committee", parent_id: "ocd-organization/8ab1-uuid" },
    { name: "no id" }], pagination: { page: 2, max_page: 3, total_items: 54, per_page: 20 } };
  const p = parseOpenStatesCommitteePage(page, "lower");
  assert.equal(p.page, 2); assert.equal(p.maxPage, 3); assert.equal(p.total, 54);
  assert.deepEqual(p.committees.map(c => [c.id, c.name, c.chamber, c.members.length]), [["ocd-organization/1", "Public Education", "lower", 2], ["ocd-organization/2", "Ways & Means", "lower", 0]]);
  assert.deepEqual(p.committees[0].members[1], { personId: null, name: "Diego Bernal", role: "Vice Chair" });
  // The real parent_id is an opaque id: without the chamber asked for, the chamber is unknown rather than guessed.
  assert.equal(parseOpenStatesCommitteePage(page).committees[0].chamber, null);
  assert.equal(parseOpenStatesCommittees(page).length, 2);
  assert.deepEqual(parseOpenStatesCommitteePage(null, "upper"), { committees: [], page: 1, maxPage: 1, total: null });
  assert.equal(isCommitteeChair("Chair"), true); assert.equal(isCommitteeChair("chairman"), true); assert.equal(isCommitteeChair("Vice Chair"), false); assert.equal(isCommitteeChair("member"), false);
});

test("committees: every page of every chamber, a few a run, the place kept between runs", () => {
  let w = startCommitteeWalk(1000);
  assert.deepEqual(w, { startedAt: 1000, chamber: "upper", page: 1, stored: 0 });
  w = nextCommitteeStep(w, { count: 20, maxPage: 2 }); assert.deepEqual(w, { startedAt: 1000, chamber: "upper", page: 2, stored: 20 });
  // The place survives a run ending here.
  assert.deepEqual(readCommitteeWalk(JSON.stringify(w)), w);
  w = nextCommitteeStep(w, { count: 6, maxPage: 2 }); assert.deepEqual(w, { startedAt: 1000, chamber: "lower", page: 1, stored: 26 });
  w = nextCommitteeStep(w, { count: 20, maxPage: 3 }); w = nextCommitteeStep(w, { count: 20, maxPage: 3 });
  assert.equal(w.page, 3);
  w = nextCommitteeStep(w, { count: 14, maxPage: 3 }); assert.deepEqual(w, { startedAt: 1000, chamber: "legislature", page: 1, stored: 80 });
  assert.equal(nextCommitteeStep(w, { count: 0, maxPage: 1 }), "done"); // no joint committees is not an error
  // A page past the end (the list got shorter) moves on to the next chamber.
  assert.deepEqual(nextCommitteeStep({ startedAt: 1, chamber: "upper", page: 3, stored: 40 }, { count: 0, maxPage: 1, pastEnd: true }), { startedAt: 1, chamber: "lower", page: 1, stored: 40 });
  // An empty page never loops.
  assert.deepEqual(nextCommitteeStep({ startedAt: 1, chamber: "upper", page: 1, stored: 0 }, { count: 0, maxPage: 5 }), { startedAt: 1, chamber: "lower", page: 1, stored: 0 });
  for (const bad of [null, "", "{", "{}", JSON.stringify({ startedAt: 1, chamber: "senate", page: 1 }), JSON.stringify({ startedAt: 1, chamber: "upper", page: 0 })]) assert.equal(readCommitteeWalk(bad), null);
  // Requests a run: at most 3, at least 1 when the budget allows, leaving room for events and bills.
  assert.equal(committeeRequestCap(12), 3); assert.equal(committeeRequestCap(7), 2); assert.equal(committeeRequestCap(5), 1); assert.equal(committeeRequestCap(2), 1); assert.equal(committeeRequestCap(1), 0);
});

test("bills: timestamps in the form updated_since takes", () => {
  assert.equal(osSecond("2026-11-16T05:12:33.123456+00:00"), "2026-11-16T05:12:33");
  assert.equal(osSecond("2026-11-16T05:12:33Z"), "2026-11-16T05:12:33");
  assert.equal(osSecond("2026-11-16T05:12:33.9"), "2026-11-16T05:12:33"); // no zone: taken as UTC
  assert.equal(osSecond("2026-11-16 05:12:33"), "2026-11-16T05:12:33");
  assert.equal(osSecond("2026-11-15T23:12:33-06:00"), "2026-11-16T05:12:33");
  assert.equal(osSecond(""), null); assert.equal(osSecond(null), null); assert.equal(osSecond("soon"), null);
  assert.deepEqual(billUpdatedAts({ results: [{ updated_at: "2026-11-16T05:12:33.5+00:00" }, { id: "x" }, null] }), { count: 3, updated: ["2026-11-16T05:12:33"] });
  assert.deepEqual(billUpdatedAts(null), { count: 0, updated: [] });
  assert.deepEqual(readBillCursor(null, null), { since: null, page: 1 });
  assert.deepEqual(readBillCursor("2026-11-16T21:40:12", "3"), { since: "2026-11-16T21:40:12", page: 3 }); // the cursor format already in production
  assert.deepEqual(readBillCursor("garbage", "0"), { since: null, page: 1 });
});

test("bills: each page moves the watermark forward, so the next run carries on", () => {
  const run = "2026-11-17T13:00:00.000Z", at = s => `2026-11-1${s}`;
  // First run, nothing stored: page 1 of 59; the watermark moves to the newest bill on the page.
  let r = advanceBillCursor({ since: null, page: 1 }, { count: 20, updated: [at("0T01:00:00"), at("0T01:00:05"), at("0T02:30:00")], maxPage: 59 }, run);
  assert.deepEqual(r, { cursor: { since: at("0T02:30:00"), page: 1 }, caughtUp: false, remainingPages: 58 });
  // Next request starts from that watermark (page 1 again).
  r = advanceBillCursor(r.cursor, { count: 20, updated: [at("0T02:30:00"), at("1T09:00:00")], maxPage: 58 }, run);
  assert.deepEqual(r.cursor, { since: at("1T09:00:00"), page: 1 }); assert.equal(r.remainingPages, 57);
  // A whole page inside the watermark's second: take the next page rather than the same one again.
  r = advanceBillCursor({ since: at("1T09:00:00"), page: 1 }, { count: 20, updated: Array(20).fill(at("1T09:00:00")), maxPage: 4 }, run);
  assert.deepEqual(r, { cursor: { since: at("1T09:00:00"), page: 2 }, caughtUp: false, remainingPages: 3 });
  r = advanceBillCursor(r.cursor, { count: 20, updated: [at("1T09:00:00"), at("1T09:00:07")], maxPage: 4 }, run);
  assert.deepEqual(r.cursor, { since: at("1T09:00:07"), page: 1 });
  // The last page: caught up, and the watermark steps one second past the newest bill.
  r = advanceBillCursor({ since: at("1T09:00:07"), page: 1 }, { count: 7, updated: [at("6T20:00:00")], maxPage: 1 }, run);
  assert.deepEqual(r, { cursor: { since: at("6T20:00:01"), page: 1 }, caughtUp: true, remainingPages: 0 });
  // …but not past this run's own second, where a bill could still be written.
  r = advanceBillCursor({ since: null, page: 1 }, { count: 1, updated: ["2026-11-17T13:00:00"], maxPage: 1 }, run);
  assert.deepEqual(r.cursor, { since: "2026-11-17T13:00:00", page: 1 });
  // Nothing new: stay where we are; with no watermark yet, start from this run.
  assert.deepEqual(advanceBillCursor({ since: at("6T20:00:01"), page: 1 }, { count: 0, updated: [], maxPage: 1 }, run), { cursor: { since: at("6T20:00:01"), page: 1 }, caughtUp: true, remainingPages: 0 });
  assert.deepEqual(advanceBillCursor({ since: null, page: 1 }, { count: 0, updated: [], maxPage: 1 }, run).cursor, { since: "2026-11-17T13:00:00", page: 1 });
  // The source sent no updated_at: walk the pages, then start from this run's time.
  r = advanceBillCursor({ since: null, page: 1 }, { count: 20, updated: [], maxPage: 2 }, run);
  assert.deepEqual(r, { cursor: { since: null, page: 2 }, caughtUp: false, remainingPages: 1 });
  assert.deepEqual(advanceBillCursor(r.cursor, { count: 3, updated: [], maxPage: 2 }, run), { cursor: { since: "2026-11-17T13:00:00", page: 1 }, caughtUp: true, remainingPages: 0 });
});

test("bills: a long list is finished in a bounded number of requests", () => {
  // 1,176 bills, 30 of them written in the same second, read 20 at a time oldest first.
  const all = Array.from({ length: 1176 }, (_, i) => new Date(Date.UTC(2026, 10, 9, 15, 0, 0) + (i < 30 ? 0 : i) * 1000).toISOString().slice(0, 19)).sort();
  let cur = { since: null, page: 1 }, requests = 0, stored = new Set(), caught = false;
  while (!caught && requests < 200) {
    const from = all.filter(t => !cur.since || t >= cur.since), maxPage = Math.max(1, Math.ceil(from.length / 20)), slice = from.slice((cur.page - 1) * 20, cur.page * 20);
    requests++;
    slice.forEach((t, i) => stored.add(`${t}#${all.indexOf(t) + (t === all[0] ? (cur.page - 1) * 20 + i : 0)}`));
    const r = advanceBillCursor(cur, { count: slice.length, updated: slice, maxPage }, "2026-11-17T13:00:00Z");
    cur = r.cursor; caught = r.caughtUp;
  }
  assert.equal(caught, true);
  assert.ok(requests <= 64, `took ${requests} requests`); // 59 pages of new bills, plus a few for the repeated second
  assert.equal(stored.size, 1176);
  assert.equal(cur.since, new Date(Date.parse(`${all[all.length - 1]}Z`) + 1000).toISOString().slice(0, 19));
});

test("LegiScan: a session it does not list is never filed under another one", () => {
  const list = [{ session_id: 2200, year_start: 2027, special: 0, session_name: "90th Legislature Regular Session" }, { session_id: 2150, year_start: 2025, special: 1, session_name: "89th Legislature 2nd Called Session" },
    { session_id: 2140, year_start: 2025, special: 1, session_name: "89th Legislature 1st Called Session" }, { session_id: 2100, year_start: 2025, special: 0, session_name: "89th Legislature Regular Session" }];
  const s = id => TX_SESSIONS.find(x => x.id === id);
  assert.equal(matchLegiscanSession(list, s("90")).session_id, 2200);
  assert.equal(matchLegiscanSession(list, s("89")).session_id, 2100);
  assert.equal(matchLegiscanSession(list, s("892")).session_id, 2150);
  assert.equal(matchLegiscanSession(list, s("891")).session_id, 2140);
  assert.equal(matchLegiscanSession(list.slice(1), s("90")), null); // not listed yet: nothing, not the newest other session
  assert.equal(matchLegiscanSession([], s("90")), null);
  assert.equal(matchLegiscanSession([{ year_start: 2027, special: 0 }], s("90")), null); // no id
});

test("ready for the session: yes only when the upcoming session's bills are in", () => {
  const base = { today: "2026-11-17", openStates: true, legiscan: false, billsBySession: { "892": 100 }, newestActionDate: null, sourceSessions: null, backlogPages: {},
    lastRun: { status: "COMPLETE", startedAt: "2026-11-17T13:00:00.000Z" }, nowMs: Date.parse("2026-11-17T15:00:00Z") };
  // What production reports today: 100 bills of the last called session, none for the 90th, no LegiScan key.
  const today = txReadiness(base);
  assert.equal(today.readyForSession, false); assert.equal(today.session, "90");
  assert.deepEqual(today.reasons, ["No bills are stored for the 90th Legislature, Regular Session yet."]);
  assert.ok(today.notes.some(n => /LegiScan key .* is not set\. It is optional/.test(n)));
  // The source's list was read and has no 90th session.
  const src = ids => ids.map(identifier => ({ identifier, name: identifier, classification: null, start: null, end: null }));
  assert.deepEqual(txReadiness({ ...base, sourceSessions: src(["89", "892"]) }).reasons, ["Open States does not list the 90th Legislature, Regular Session yet, so it has no bills to give for it.", "No bills are stored for the 90th Legislature, Regular Session yet."]);
  // Bills in, list read, small backlog: ready, with a note.
  const ok = txReadiness({ ...base, billsBySession: { "892": 100, "90": 1500 }, newestActionDate: "2026-11-16", sourceSessions: src(["892", "90"]), backlogPages: { "90": 3 } });
  assert.equal(ok.readyForSession, true); assert.deepEqual(ok.reasons, []); assert.ok(ok.notes.some(n => /about 3 more pages/.test(n)));
  // A large backlog is not ready.
  assert.match(txReadiness({ ...base, billsBySession: { "90": 200 }, backlogPages: { "90": 70 } }).reasons[0], /still loading: about 70 more pages of 20 bills/);
  // No key at all.
  assert.match(txReadiness({ ...base, openStates: false }).reasons[0], /OPENSTATES_API_KEY/);
  // A failed or stale run.
  assert.ok(txReadiness({ ...base, billsBySession: { "90": 5 }, lastRun: { status: "FAILED", startedAt: "2026-11-17T13:00:00.000Z" } }).reasons.includes("The last Texas update failed."));
  assert.ok(txReadiness({ ...base, billsBySession: { "90": 5 }, lastRun: { status: "COMPLETE", startedAt: "2026-11-14T13:00:00.000Z" } }).reasons.includes("The Texas update has not run in the last two days."));
  assert.ok(txReadiness({ ...base, billsBySession: { "90": 5 }, lastRun: null }).reasons.includes("The Texas update has never run."));
  // On opening day the old session's bills do not count, and stale actions are caught while in session.
  const jan = { ...base, today: "2027-01-12", nowMs: Date.parse("2027-01-12T20:00:00Z"), lastRun: { status: "COMPLETE", startedAt: "2027-01-12T13:00:00.000Z" } };
  assert.equal(txReadiness({ ...jan, billsBySession: { "892": 100, "89": 9000 } }).readyForSession, false);
  assert.equal(txReadiness({ ...jan, billsBySession: { "90": 2400 }, newestActionDate: "2027-01-11" }).readyForSession, true);
  assert.match(txReadiness({ ...jan, today: "2027-02-20", nowMs: Date.parse("2027-02-20T20:00:00Z"), lastRun: { status: "COMPLETE", startedAt: "2027-02-20T13:00:00.000Z" }, billsBySession: { "90": 2400 }, newestActionDate: "2027-01-11" }).reasons[0], /newest bill action on file is from 2027-01-11/);
  // A called session the site has no dates for is a note, with what to do.
  assert.ok(txReadiness({ ...jan, today: "2027-07-10", billsBySession: { "90": 9000 }, newestActionDate: "2027-06-20", sourceSessions: src(["90", "901"]) }).notes.some(n => /90th Legislature, 1st Called Session \(901\).*TX_SESSIONS/.test(n)));
});

test("what the page says is covered follows the data", () => {
  const v = (today, bills) => txCoverageView(today, bills);
  // Today in production: only the last called session's bills are stored.
  let c = v("2026-11-17", { "892": 100 });
  assert.equal(c.shown.id, "892"); assert.equal(c.shownCount, 100);
  assert.equal(c.line, "The Legislature is not in session. Bills filed ahead of the 2027 session have not loaded here yet; the last session's bills are shown.");
  // Once prefiled bills are stored.
  c = v("2026-11-17", { "892": 100, "90": 1500 });
  assert.equal(c.shown.id, "90"); assert.equal(c.line, "The Legislature is not in session. Bills filed ahead of the 2027 session appear here as they are filed.");
  // Nothing at all.
  assert.deepEqual(v("2026-11-17", {}), { shown: null, shownCount: 0, line: "The Legislature is not in session. No Texas bills have loaded here yet." });
  // In session with its bills, and in session without them (never silently the old session).
  c = v("2027-01-12", { "892": 100, "90": 2400 });
  assert.equal(c.shown.id, "90"); assert.equal(c.line, "The Legislature is in session. Bills appear here as they are filed and as they move.");
  c = v("2027-01-12", { "892": 100 });
  assert.equal(c.shown.id, "892"); assert.equal(c.line, "The Legislature is in session, but this session's bills have not loaded here yet; bills from the 89th Legislature, 2nd Called Session are shown.");
  assert.equal(v("2027-01-12", {}).line, "The Legislature is in session, but its bills have not loaded here yet.");
  // After the session, with no later one known.
  c = v("2027-07-01", { "90": 9000 });
  assert.equal(c.shown.id, "90"); assert.equal(c.line, "The Legislature is not in session; the last session's bills are shown.");
});
