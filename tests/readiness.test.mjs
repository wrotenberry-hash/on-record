// The test-ready checklist (owner, 17 Nov 2026): pass / fail / waiting on the owner, never PASS without evidence.
import test from "node:test";
import assert from "node:assert/strict";
import { GROUPS, readiness, readinessTotals } from "../lib/readiness.ts";
import { EVIDENCE } from "../lib/readiness-evidence.ts";

const run = { ranOn: "17 Nov 2026" };
const nothing = { now: 0, brand: EVIDENCE.brand, flow: EVIDENCE.flow,
  influence: { federalMembers: 539, federalWithPhoneOrForm: 0, texasMembers: 178, texasWithPhone: 0, contactOnBillAndMemberPages: null, hearingsStored: 0, hearingsStepLive: false, townHallsLine: false, voicePage: null },
  content: { bills90d: 120, passing90d: 1, held90d: 4, primersReviewed: 5, primersWaiting: 6, txSenators: 31, txRepresentatives: 147, txCommittees: 20, txCalendarDates: 0, txReadyForSession: null, txNotReadyWhy: "" },
  trust: { methodology: null, pledge: null, correctionsLog: true, about: null, founderText: false, contactEmail: false, privacyDraft: null, termsDraft: null, legalReviewed: false },
  quality: { e2e: null, axe: null, speed: null, errorMonitoring: false, breakageNow: false, uptimeCheck: null, feedbackPrompt: true, somethingWrongLink: null, analytics: null },
  trial: { invites: 25, welcomeScreen: true, bookingLink: false, summariesShownToTrial: false } };
const everything = { now: 0, brand: { literalsLeft: 0, testedWithOtherName: run },
  flow: { e2e: { ...run, secondsToLegislators: 6, secondsToFirstAnswer: 14, taps: 3 }, fiveLegislatorsForTexasAddress: true, comingUpWithAnswers: true, districtMessageShown: true, accountNotNeeded: true },
  influence: { federalMembers: 539, federalWithPhoneOrForm: 539, texasMembers: 181, texasWithPhone: 181, contactOnBillAndMemberPages: run, hearingsStored: 40, hearingsStepLive: true, townHallsLine: true, voicePage: run },
  content: { bills90d: 120, passing90d: 120, held90d: 0, primersReviewed: 11, primersWaiting: 0, txSenators: 31, txRepresentatives: 150, txCommittees: 60, txCalendarDates: 8, txReadyForSession: true, txNotReadyWhy: "" },
  trust: { methodology: run, pledge: run, correctionsLog: true, about: run, founderText: true, contactEmail: true, privacyDraft: run, termsDraft: run, legalReviewed: true },
  quality: { e2e: { ...run, passed: 21, total: 21, failing: [] }, axe: { ...run, pages: 30, violations: 0 }, speed: { ...run, slowestMs: 900, slowestPage: "/dashboard" }, errorMonitoring: true, breakageNow: false,
    uptimeCheck: run, feedbackPrompt: true, somethingWrongLink: run, analytics: run },
  trial: { invites: 25, welcomeScreen: true, bookingLink: true, summariesShownToTrial: true } };

test("with nothing verified, nothing passes on trust alone", () => {
  const c = readiness(nothing), t = readinessTotals(c);
  assert.equal(t.readyToOpen, false); assert.equal(t.builtAndVerified, false);
  assert.deepEqual(c.filter(x => x.state === "pass").map(x => x.id).sort(), ["trial.invites", "trial.welcome", "trust.corrections"]);
  assert.match(c.find(x => x.id === "content.coverage").detail, /1 of 120 bills/);
  assert.equal(c.find(x => x.id === "content.primers").state, "owner", "written explainers wait for the owner's approval");
  assert.equal(c.find(x => x.id === "trial.booking").state, "owner");
});

test("everything verified and the owner's steps done: ready to open", () => {
  const c = readiness(everything), t = readinessTotals(c);
  assert.deepEqual(c.filter(x => x.state !== "pass").map(x => x.id), []);
  assert.equal(t.readyToOpen, true);
  assert.ok(c.every(x => GROUPS[x.group] && x.detail.length > 10));
  assert.deepEqual([...new Set(c.map(x => x.group))], [1, 2, 3, 4, 5, 6, 7], "every one of the owner's seven points has at least one line");
});

test("the owner's own steps are told apart from what is still to build", () => {
  const c = readiness({ ...everything, trust: { ...everything.trust, legalReviewed: false, founderText: false }, trial: { ...everything.trial, bookingLink: false } }), t = readinessTotals(c);
  assert.equal(t.builtAndVerified, true); assert.equal(t.readyToOpen, false);
  assert.deepEqual(c.filter(x => x.state === "owner").map(x => x.id), ["trust.about", "trust.legal", "trial.booking"]);
  const slow = readiness({ ...everything, quality: { ...everything.quality, speed: { ...run, slowestMs: 2600, slowestPage: "/dashboard" }, breakageNow: true } });
  assert.deepEqual(slow.filter(x => x.state === "fail").map(x => x.id), ["quality.speed", "quality.errors"]);
});
