import test from "node:test";
import assert from "node:assert/strict";
import { trialAnalytics, TRIAL_EVENT_NAMES, FLOW_STEPS, CONTACT_EVENTS, ANSWER_EVENTS } from "../lib/trial-analytics.ts";

const e = (name, dim, n) => ({ name, dim, n });

test("with no events every count is zero and every rate is null (shown as no data yet)", () => {
  const a = trialAnalytics({ events7d: [], events28d: [] });
  assert.deepEqual(a.last7d.onboarding, { started: 0, gaveZip: 0, completed: 0, completionPct: null });
  assert.deepEqual(a.last7d.flow, { landing: 0, zip: 0, address: 0, firstAnswer: 0, zipPctOfLanding: null, firstAnswerPctOfLanding: null });
  assert.equal(a.last7d.firstAnswer.within60sPct, null);
  assert.equal(a.last7d.firstAnswer.timed, 0);
  assert.equal(a.last7d.contact.taps, 0);
  assert.equal(a.last28d.weighIns.total, 0);
  assert.equal(a.weeklyReturn.returningPct, null);
  assert.equal(a.weeklyReturn.invitesReturningPct, null);
  assert.equal(a.followsNow.followsPerFollower, null);
});

test("onboarding completion counts trial readers and leaves the editor's own visits out", () => {
  const a = trialAnalytics({ events7d: [e("onboarding_start", "trial", 10), e("onboarding_start", "editor", 6), e("onboarding_zip", "trial", 8), e("onboarding_done", "trial", 7), e("onboarding_done", "editor", 6)], events28d: [] });
  assert.deepEqual(a.last7d.onboarding, { started: 10, gaveZip: 8, completed: 7, completionPct: 70 });
});

test("the flow funnel and time to first weigh-in", () => {
  const rows = [e("flow_landing", "", 40), e("flow_zip", "", 30), e("flow_address", "", 12), e("flow_first_answer", "", 20),
    e("first_answer_seconds", "under_60", 9), e("first_answer_seconds", "60_120", 6), e("first_answer_seconds", "120_300", 3), e("first_answer_seconds", "over_300", 2), e("first_answer_seconds", "garbage", 50)];
  const a = trialAnalytics({ events7d: rows, events28d: rows });
  assert.deepEqual(a.last7d.flow, { landing: 40, zip: 30, address: 12, firstAnswer: 20, zipPctOfLanding: 75, firstAnswerPctOfLanding: 50 });
  assert.deepEqual(a.last7d.firstAnswer.bands, { under_60: 9, "60_120": 6, "120_300": 3, over_300: 2 });
  assert.equal(a.last7d.firstAnswer.timed, 20, "an unknown band is not counted");
  assert.equal(a.last7d.firstAnswer.within60sPct, 45);
});

test("contact taps: totals, by kind of tap and by where the reader was; opening the panel is not a tap", () => {
  const rows = [e("contact_open", "bill", 12), e("contact_call", "bill", 3), e("contact_call", "member", 2), e("contact_form", "bill", 4), e("contact_copy", "tx_bill", 1), e("contact_email", "member", 5)];
  const a = trialAnalytics({ events7d: rows.slice(0, 3), events28d: rows });
  assert.equal(a.last7d.contact.taps, 5);
  assert.deepEqual(a.last28d.contact, { opened: 12, call: 5, form: 4, copy: 1, email: 5, taps: 15, byPlace: { bill: 7, tx_bill: 1, member: 7 } });
});

test("weigh-ins, follows and shares are added up per window", () => {
  const rows = [e("answer_support", "trial", 5), e("answer_oppose", "trial", 3), e("answer_unsure", "trial", 2), e("answer_support", "editor", 40),
    e("follow_add", "trial", 4), e("bill_follow_add", "trial", 2), e("issue_follow", "trial", 1), e("follow_add", "editor", 9),
    e("card_render", "vote:story", 6), e("card_render", "carousel:1", 5), e("share_native", "vote", 2), e("share_download", "bill", 1), e("share_copy", "vote", 3), e("share_video", "vote", 1), e("share_carousel", "carousel", 1)];
  const a = trialAnalytics({ events7d: rows, events28d: [] });
  assert.deepEqual(a.last7d.weighIns, { support: 5, oppose: 3, unsure: 2, total: 10 });
  assert.deepEqual(a.last7d.follows, { members: 4, bills: 2, issues: 1 });
  assert.deepEqual(a.last7d.shares, { cardsMade: 11, shareSheet: 2, downloads: 1, linkCopies: 3, videos: 1, carousels: 1, total: 8 });
});

test("weekly return comes from the standing counts, with a rate only when there is someone to divide by", () => {
  const a = trialAnalytics({ events7d: [], events28d: [], standing: { weeklyActiveReaders: 8, weeklyReturningReaders: 6, invitesActive7d: 5, invitesReturning7d: 2, invitesUsed: 9, invites: 25,
    readersFollowingMembers: 4, followsPerFollower: 2.5, readersFollowingBills: 1, billFollows: 3 } });
  assert.deepEqual(a.weeklyReturn, { activeReaders: 8, returningReaders: 6, returningPct: 75, invitesActive: 5, invitesReturning: 2, invitesReturningPct: 40, invitesUsed: 9, invites: 25 });
  assert.deepEqual(a.followsNow, { readersFollowingMembers: 4, followsPerFollower: 2.5, readersFollowingBills: 1, billFollows: 3 });
});

test("every counter the report reads is asked for by name", () => {
  for (const n of [...FLOW_STEPS, ...CONTACT_EVENTS, ...ANSWER_EVENTS, "first_answer_seconds", "onboarding_done", "share_copy", "follow_add"]) assert.ok(TRIAL_EVENT_NAMES.includes(n), n);
});

import { uptimeSummary, uptimeDim } from "../lib/uptime.ts";

test("uptime: hours in which the health probe answered, per day, today only up to now", () => {
  const now = Date.UTC(2026, 10, 17, 5, 30, 0); // 05:30 UTC: six hours of today have started
  assert.equal(uptimeDim(now), "h05");
  const rows = [{ day: "2026-11-17", dim: "h00", n: 4 }, { day: "2026-11-17", dim: "h01", n: 4 }, { day: "2026-11-17", dim: "h03", n: 3 }, { day: "2026-11-17", dim: "h04", n: 4 }, { day: "2026-11-17", dim: "h05", n: 2 },
    ...Array.from({ length: 24 }, (_, h) => ({ day: "2026-11-16", dim: `h${String(h).padStart(2, "0")}`, n: 4 })), { day: "2026-11-16", dim: "bogus", n: 99 }];
  const s = uptimeSummary(rows, now, 3);
  assert.deepEqual(s[0], { day: "2026-11-17", hoursAnswered: 5, hoursSoFar: 6, checks: 17, missedHours: ["02:00"] });
  assert.deepEqual(s[1], { day: "2026-11-16", hoursAnswered: 24, hoursSoFar: 24, checks: 96, missedHours: [] });
  assert.equal(s[2].hoursAnswered, 0);
  assert.equal(s[2].missedHours.length, 24);
  assert.equal(uptimeSummary([], now, 7).length, 7);
});
