import test from "node:test";
import assert from "node:assert/strict";
import { texasReadiness, texasTotals, TX_GROUPS, TX_GO_LIVE, TX_SESSION_OPENS } from "../lib/texas-readiness.ts";

const run = { ranOn: "18 Nov 2026" };
const base = () => ({
  today: "2026-11-18",
  data: { openStatesKey: true, legiscanKey: false, seatsFilled: 178, seatsExpected: 181, missingSeats: "Senate district 22; House district 1, 93", committees: 20, committeesChamberUnknown: 20, committeesReadAt: null,
    bills2027: 0, bills2027Waiting: null, newestFiling: null, recordedVotes: 194, tallyMismatches: 0, hearingsReadAt: null, hearingsUpcoming: 0, hearingsWithBills: 0, tloChecked: 0, tloAgree: 0, tloMismatches: 0, lastRunStatus: "COMPLETE", rateLimitedAt: null },
  address: { fiveFromAddress: run, liveGeocoder: run },
  summaries: { built: run, paused: true, written: 0, passing: 0, held: 0, readersSeeThem: false, pdfReader: false, pageDrawsThem: false, goldApproved: false },
  votes: { rulesFromRealHistories: run, phoneTasks: run },
  primers: { approved: 0, waiting: 4 },
  dashboard: { sessionsWanted: 10, sessionsLoaded: 0, missing: ["87th Legislature, Regular Session"], page: run },
});
const state = (checks, id) => checks.find(c => c.id === id)?.state;

test("the day the Texas instruction arrived: nothing that is not loaded or proven reads as a pass", () => {
  const c = texasReadiness(base());
  assert.equal(state(c, "tx.data.members"), "pass", "178 of 181, with the missing seats named");
  assert.match(c.find(x => x.id === "tx.data.members").detail, /Senate district 22/);
  for (const id of ["tx.data.committees", "tx.data.prefiled", "tx.data.hearings", "tx.data.record", "tx.summaries.sources", "tx.summaries.page", "tx.summaries.proven", "tx.summaries.shown", "tx.dashboard.history"])
    assert.equal(state(c, id), "fail", id);
  assert.equal(state(c, "tx.data.legiscan"), "owner");
  assert.equal(state(c, "tx.primers"), "owner");
  const t = texasTotals(c, "2026-11-18");
  assert.equal(t.live, false);
  assert.equal(t.goLive, TX_GO_LIVE); assert.equal(t.sessionOpens, TX_SESSION_OPENS);
  assert.equal(t.daysToGoLive, 26); assert.equal(t.daysToSession, 55);
  assert.equal(t.pass + t.fail + t.owner, t.total);
});

test("everything loaded, proven and approved is fully live", () => {
  const i = base();
  Object.assign(i.data, { legiscanKey: true, committees: 73, committeesChamberUnknown: 0, committeesReadAt: "2026-11-20T00:00:00Z", bills2027: 2140, bills2027Waiting: 0, newestFiling: "2026-11-19",
    hearingsReadAt: "2026-11-20T00:00:00Z", tloChecked: 5, tloAgree: 5 });
  Object.assign(i.summaries, { paused: false, written: 5, passing: 4, held: 1, readersSeeThem: true, pdfReader: true, pageDrawsThem: true, goldApproved: true });
  i.primers = { approved: 4, waiting: 0 }; i.dashboard = { ...i.dashboard, sessionsLoaded: 10, missing: [] };
  const c = texasReadiness(i);
  assert.deepEqual(c.filter(x => x.state !== "pass").map(x => x.id), []);
  assert.equal(texasTotals(c, "2026-12-14").live, true);
});

test("the lines that must never pass on a guess", () => {
  const i = base();
  // A count that disagrees with the member list is a failure even with thousands of votes on file.
  Object.assign(i.data, { recordedVotes: 5000, tallyMismatches: 1 });
  assert.equal(state(texasReadiness(i), "tx.data.votes"), "fail");
  // Bills on file but still loading is not "kept up to date".
  Object.assign(i.data, { bills2027: 900, bills2027Waiting: 300 });
  assert.equal(state(texasReadiness(i), "tx.data.prefiled"), "fail");
  // Hearings on file with no agenda bills means the agenda read is not working.
  Object.assign(i.data, { hearingsReadAt: "2026-11-20T00:00:00Z", hearingsUpcoming: 12, hearingsWithBills: 0 });
  assert.equal(state(texasReadiness(i), "tx.data.hearings"), "fail");
  // A mismatch with the official history page is a failure.
  Object.assign(i.data, { tloChecked: 5, tloAgree: 4, tloMismatches: 1 });
  assert.equal(state(texasReadiness(i), "tx.data.record"), "fail");
  // Passing summaries are the owner's to release, not shown by default.
  Object.assign(i.summaries, { paused: false, written: 5, passing: 3, held: 2 });
  assert.equal(state(texasReadiness(i), "tx.summaries.shown"), "owner");
  // Without a recorded phone run, the vote labels and the address lookup do not pass.
  i.votes.phoneTasks = null; i.address.fiveFromAddress = null;
  const c = texasReadiness(i);
  assert.equal(state(c, "tx.votes.labels"), "fail"); assert.equal(state(c, "tx.address.five"), "fail");
});

test("every check sits in a named group", () => {
  for (const c of texasReadiness(base())) assert.ok(TX_GROUPS[c.group], c.id);
});
