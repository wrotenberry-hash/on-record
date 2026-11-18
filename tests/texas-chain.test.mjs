import test from "node:test";
import assert from "node:assert/strict";
import { chainDecision, chainLogLine, clearLimitForStart, lockAvailable, mayRequest, mayStart, paceWaitMs, readBudget, txChainSettings, utcDay } from "../lib/texas/chain.ts";
import { advanceSessionBills, billRequest, committeeWalkDue, eventsDue, needsFresh, nextEventStep, readSessionBills, waitingPages, EVENTS_EVERY_MS } from "../lib/texas/coverage.ts";

const NOW = Date.parse("2026-11-17T19:00:00Z"), DAY = 86400e3;

/* ---------------------------------------------------------------- Settings --- */

test("settings: safe defaults under Open States' free tier (250 a day, 10 a minute), clamped", () => {
  const s = txChainSettings({});
  assert.equal(s.dailyRequests, 200); assert.equal(s.perMinute, 8); assert.equal(s.perStart, 120); assert.equal(s.maxLinks, 10); assert.equal(s.linkMs, 240_000);
  assert.equal(s.tloCheck, true); assert.equal(s.tloBills, 5); assert.equal(s.legiscanDaily, 30);
  const t = txChainSettings({ TEXAS_DAILY_REQUESTS: "50", TEXAS_REQUESTS_PER_START: "500", TEXAS_REQUESTS_PER_MINUTE: "0", TEXAS_TLO_CHECK: "off", TEXAS_LINK_SECONDS: "999", TEXAS_CHAIN_MAX: "abc" });
  assert.equal(t.dailyRequests, 50); assert.equal(t.perStart, 50, "a start never gets more than the day"); assert.equal(t.perMinute, 1); assert.equal(t.tloCheck, false);
  assert.equal(t.linkMs, 270_000, "a link stays inside the host's five minutes"); assert.equal(t.maxLinks, 10);
});

/* ------------------------------------------------------------ Budget and pace --- */

test("budget: counts carry within a UTC day and reset on the next, which also clears a 429", () => {
  const raw = JSON.stringify({ day: "2026-11-17", used: 150, legiscan: 3, tlo: 5, limitedAt: NOW - 1000, lastAt: NOW - 500 });
  const b = readBudget(raw, NOW);
  assert.deepEqual([b.used, b.legiscan, b.tlo, b.limitedAt], [150, 3, 5, NOW - 1000]);
  const next = readBudget(raw, Date.parse("2026-11-18T00:00:01Z"));
  assert.deepEqual([next.day, next.used, next.limitedAt, next.lastAt], ["2026-11-18", 0, null, NOW - 500], "the pace still holds across midnight");
  assert.equal(readBudget("not json", NOW).used, 0);
  assert.equal(utcDay(NOW), "2026-11-17");
});

test("pace: evenly spaced, so no clock minute goes over the limit", () => {
  assert.equal(paceWaitMs(null, NOW, 8), 0);
  assert.equal(paceWaitMs(NOW, NOW, 8), 7750);
  assert.equal(paceWaitMs(NOW - 10_000, NOW, 8), 0);
  // Any 60 s window holds at most perMinute requests when they are spaced like this.
  let t = 0; const times = [];
  for (let i = 0; i < 40; i++) { t += paceWaitMs(times.at(-1) ?? null, t, 8); times.push(t); }
  for (const start of times) assert.ok(times.filter(x => x >= start && x < start + 60_000).length <= 8);
});

test("mayRequest: stops for a 429, the day's budget, this start's share, this run's cap, and time", () => {
  const s = txChainSettings({}), b = readBudget(null, NOW), r = { runUsed: 0, runCap: 12, startUsed: 0, now: NOW, deadline: NOW + 60_000, waitMs: 0 };
  assert.deepEqual(mayRequest(b, s, r), { ok: true });
  assert.equal(mayRequest({ ...b, limitedAt: NOW }, s, r).reason, "rate limited");
  assert.equal(mayRequest({ ...b, used: 200 }, s, r).reason, "daily budget");
  assert.equal(mayRequest(b, s, { ...r, startUsed: 120 }).reason, "start budget");
  assert.equal(mayRequest(b, s, { ...r, runUsed: 12 }).reason, "run budget");
  assert.equal(mayRequest(b, s, { ...r, waitMs: 55_000 }).reason, "time", "a request that would have to wait past the deadline does not go out");
});

test("mayStart: after a 429, chain links and manual runs wait; a scheduled start 30 minutes later may try", () => {
  const s = txChainSettings({}), b = { ...readBudget(null, NOW), limitedAt: NOW };
  assert.equal(mayStart(b, s, "chain", NOW + 3600e3).ok, false);
  assert.equal(mayStart(b, s, "manual", NOW + 3600e3).ok, false);
  assert.equal(mayStart(b, s, "scheduled", NOW + 10 * 60e3).ok, false);
  assert.equal(mayStart(b, s, "scheduled", NOW + 31 * 60e3).ok, true);
  assert.equal(clearLimitForStart(b, "scheduled").limitedAt, null);
  assert.equal(clearLimitForStart(b, "chain").limitedAt, NOW);
  assert.equal(mayStart({ ...readBudget(null, NOW), used: 200 }, s, "scheduled", NOW).ok, false, "a used-up day stops every start");
});

/* -------------------------------------------------------------------- Lock --- */

test("lock: one run at a time; an expired lock or one reserved for the same chain can be taken", () => {
  assert.equal(lockAvailable(null, NOW, null), true);
  assert.equal(lockAvailable("", NOW, "c1"), true);
  const held = JSON.stringify({ owner: "a", chain: "c1", until: NOW + 60_000 });
  assert.equal(lockAvailable(held, NOW, null), false);
  assert.equal(lockAvailable(held, NOW, "c2"), false);
  assert.equal(lockAvailable(held, NOW, "c1"), true, "the next link of the same chain");
  assert.equal(lockAvailable(held, NOW + 61_000, "c2"), true, "a run that died leaves an expiring lock");
});

/* ---------------------------------------------------------- Chain decision --- */

test("chain: continues only when a link ran out of time with work and budget left", () => {
  const base = { link: 1, maxLinks: 10, stoppedBy: "time", workLeft: true, dailyLeft: 100, startLeft: 50 };
  assert.deepEqual(chainDecision(base), { next: true, reason: "work and budget left" });
  assert.equal(chainDecision({ ...base, workLeft: false, stoppedBy: "nothing left" }).reason, "nothing left to load");
  assert.match(chainDecision({ ...base, stoppedBy: "rate limited" }).reason, /429/);
  assert.equal(chainDecision({ ...base, stoppedBy: "daily budget", dailyLeft: 0 }).next, false);
  assert.equal(chainDecision({ ...base, startLeft: 0 }).reason, "this start's share of the budget is used");
  assert.equal(chainDecision({ ...base, link: 10 }).reason, "link limit (10) reached");
  assert.equal(chainDecision({ ...base, stoppedBy: "error" }).next, false);
  assert.equal(chainDecision({ ...base, stoppedBy: "busy" }).reason, "another Texas load is running");
  const line = chainLogLine(3, { status: "PARTIAL", requests: 28, usedToday: 84, daily: 200, bills: 540, waiting: { 90: 300, 892: 0 }, stoppedBy: "time", decision: chainDecision(base) });
  assert.equal(line, "TX_CHAIN link 3 | PARTIAL | requests 28 (today 84 of 200) | bills 540 | waiting 90: 300, 892: 0 | stopped by time | continues");
});

/* ------------------------------------------------- Bills, newest first --- */

const page = (updated, maxPage, total = null) => ({ count: updated.length, updated, maxPage, total });

test("bills: a pass reads newest first; its top becomes the next pass's mark", () => {
  let s = readSessionBills(null);
  assert.deepEqual(billRequest(s, "main"), { since: null, page: 1 });
  assert.equal(needsFresh(s), false, "page 1 already is the newest");
  let step = advanceSessionBills(s, "main", page(["2026-11-17T10:00:00", "2026-11-17T09:00:00"], 3, 60));
  s = step.state;
  assert.equal(step.done, false); assert.equal(step.waiting, 40); assert.deepEqual(s.main, { top: "2026-11-17T10:00:00", page: 2 });
  assert.equal(needsFresh(s), true);
  step = advanceSessionBills(s, "main", page(["2026-11-16T09:00:00"], 3, 60)); s = step.state;
  step = advanceSessionBills(s, "main", page(["2026-11-15T09:00:00"], 3, 60)); s = step.state;
  assert.equal(step.done, true); assert.equal(s.mark, "2026-11-17T10:00:00"); assert.deepEqual(s.main, { top: null, page: 1 }); assert.equal(s.waiting, 0);
  assert.deepEqual(billRequest(s, "main"), { since: "2026-11-17T10:00:00", page: 1 });
});

test("bills: during a long pass, a fresh pass reads what was filed since it began, and the mark covers both", () => {
  let s = advanceSessionBills(readSessionBills(null), "main", page(["2026-11-17T10:00:00"], 50, 1000)).state;
  assert.deepEqual(billRequest(s, "fresh"), { since: "2026-11-17T10:00:00", page: 1 });
  let f = advanceSessionBills(s, "fresh", page(["2026-11-18T08:00:00", "2026-11-17T10:00:00"], 2, 25));
  assert.equal(f.done, false); s = f.state;
  assert.deepEqual(billRequest(s, "fresh"), { since: "2026-11-17T10:00:00", page: 2 });
  f = advanceSessionBills(s, "fresh", page(["2026-11-17T11:00:00"], 2, 25)); s = f.state;
  assert.equal(f.done, true); assert.equal(s.freshMark, "2026-11-18T08:00:00"); assert.equal(s.fresh, null);
  assert.equal(s.main.page, 2, "the main pass keeps its place");
  assert.deepEqual(billRequest(s, "fresh"), { since: "2026-11-18T08:00:00", page: 1 }, "the next fresh pass starts where this one reached");
  // The main pass ends (a page past the end counts as the end): everything up to the fresh mark is stored.
  const end = advanceSessionBills(s, "main", page([], 2, null));
  assert.equal(end.done, true); assert.equal(end.state.mark, "2026-11-18T08:00:00");
  assert.equal(waitingPages(301), 16);
});

test("bills: a saved place survives bad or old cursor values", () => {
  assert.deepEqual(readSessionBills("{bad"), { mark: null, main: { top: null, page: 1 }, fresh: null, freshMark: null, waiting: null });
  const s = readSessionBills(JSON.stringify({ mark: "2026-11-17T10:00:00.123456", main: { top: "2026-11-17 11:00:00", page: 4 }, waiting: 60 }));
  assert.equal(s.mark, "2026-11-17T10:00:00"); assert.deepEqual(s.main, { top: "2026-11-17T11:00:00", page: 4 }); assert.equal(s.waiting, 60);
});

/* ------------------------------------------------ Committees and hearings --- */

test("committees: the first build's rows with no chamber start a full walk at once (not after a week)", () => {
  const base = { walking: false, lastFullRead: NOW - 2 * DAY, stored: 20, chamberUnknown: 20, now: NOW };
  assert.equal(committeeWalkDue(base), true);
  assert.equal(committeeWalkDue({ ...base, chamberUnknown: 0 }), false);
  assert.equal(committeeWalkDue({ ...base, chamberUnknown: 0, lastFullRead: NOW - 8 * DAY }), true);
  assert.equal(committeeWalkDue({ ...base, stored: 0, chamberUnknown: 0 }), true);
  assert.equal(committeeWalkDue({ ...base, lastFullRead: NOW - 3600e3 }), false, "a source that sends nothing cannot make it loop");
  assert.equal(committeeWalkDue({ ...base, walking: true, lastFullRead: NOW }), true);
});

test("hearings: every page is read, every six hours", () => {
  assert.equal(eventsDue(null, NOW - EVENTS_EVERY_MS - 1, NOW), true);
  assert.equal(eventsDue(null, NOW - 60_000, NOW), false);
  assert.equal(eventsDue({ startedAt: NOW, page: 2, stored: 20 }, NOW, NOW), true);
  const w = { startedAt: NOW, page: 1, stored: 0 };
  assert.deepEqual(nextEventStep(w, { count: 20, maxPage: 3 }), { startedAt: NOW, page: 2, stored: 20 });
  assert.equal(nextEventStep({ ...w, page: 3 }, { count: 5, maxPage: 3 }), "done");
  assert.equal(nextEventStep({ ...w, page: 4 }, { count: 0, maxPage: 3, pastEnd: true }), "done");
});
