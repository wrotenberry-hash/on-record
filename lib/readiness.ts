/**
 * The test-ready checklist (owner, 17 Nov 2026; docs/TEST_READY_BUILD.md): one line per thing the owner asked for
 * before the trial opens, each PASS, FAIL or WAITING ON YOU, with the evidence in plain words.
 *
 * Pure: `readiness(input)` only reads the numbers it is given. The numbers come from the database
 * (lib/readiness-data.ts) and from the recorded results of the checks that are run by hand or by script
 * (lib/readiness-evidence.ts). Nothing here is ever marked PASS without a number or a recorded run behind it.
 */

export type CheckState = "pass" | "fail" | "owner";
export type Check = { id: string; group: number; label: string; state: CheckState; detail: string };

export const GROUPS: Record<number, string> = {
  1: "Brand", 2: "The first 60 seconds", 3: "Influence tools", 4: "Content coverage", 5: "Trust", 6: "Quality bar", 7: "Trial package",
};

/** A scripted run recorded in lib/readiness-evidence.ts. `null` = not run yet. */
export type RunEvidence = { ranOn: string; note?: string } | null;

export type ReadinessInput = {
  now: number;
  brand: { literalsLeft: number | null; testedWithOtherName: RunEvidence };
  flow: { e2e: (RunEvidence & { secondsToLegislators: number; secondsToFirstAnswer: number; taps: number }) | null; fiveLegislatorsForTexasAddress: boolean | null;
    comingUpWithAnswers: boolean | null; districtMessageShown: boolean | null; accountNotNeeded: boolean | null };
  influence: { federalMembers: number; federalWithPhoneOrForm: number; texasMembers: number; texasWithPhone: number; contactOnBillAndMemberPages: RunEvidence;
    hearingsStored: number; hearingsStepLive: boolean; townHallsLine: boolean; voicePage: RunEvidence };
  content: { bills90d: number; passing90d: number; held90d: number; primersReviewed: number; primersWaiting: number;
    txSenators: number; txRepresentatives: number; txCommittees: number; txCalendarDates: number; txReadyForSession: boolean | null; txNotReadyWhy: string };
  trust: { methodology: RunEvidence; pledge: RunEvidence; correctionsLog: boolean; about: RunEvidence; founderText: boolean; contactEmail: boolean; privacyDraft: RunEvidence; termsDraft: RunEvidence; legalReviewed: boolean };
  quality: { e2e: (RunEvidence & { passed: number; total: number; failing: string[]; waitingOnOwner?: string[] }) | null; axe: (RunEvidence & { pages: number; violations: number }) | null;
    speed: (RunEvidence & { slowestMs: number; slowestPage: string }) | null; errorMonitoring: boolean; breakageNow: boolean; uptimeCheck: RunEvidence;
    feedbackPrompt: boolean; somethingWrongLink: RunEvidence; analytics: RunEvidence };
  trial: { invites: number; welcomeScreen: boolean; bookingLink: boolean; summariesShownToTrial: boolean };
};

const yes = (ok: boolean | null | undefined, pass: string, fail: string): Pick<Check, "state" | "detail"> => ({ state: ok ? "pass" : "fail", detail: ok ? pass : fail });
const ran = (e: RunEvidence, what: string, missing: string): Pick<Check, "state" | "detail"> =>
  e ? { state: "pass", detail: `${what} Checked ${e.ranOn}.${e.note ? ` ${e.note}` : ""}` } : { state: "fail", detail: missing };

export function readiness(i: ReadinessInput): Check[] {
  const c: Check[] = [], add = (id: string, group: number, label: string, r: Pick<Check, "state" | "detail">) => c.push({ id, group, label, ...r });

  // 1. Brand
  add("brand.config", 1, "The product name is one setting", i.brand.literalsLeft === 0 && i.brand.testedWithOtherName
    ? { state: "pass", detail: `No page, card, email or tag spells the name out; all read one setting. Tried with another name on ${i.brand.testedWithOtherName.ranOn}.` }
    : { state: "fail", detail: i.brand.literalsLeft === null ? "Not checked yet." : `${i.brand.literalsLeft} places still spell the name out.` });

  // 2. The first 60 seconds
  const f = i.flow.e2e;
  add("flow.sixty", 2, "ZIP to legislators to first answer within 60 seconds", f
    ? { state: f.secondsToLegislators <= 60 && f.secondsToFirstAnswer <= 60 ? "pass" : "fail", detail: `Scripted first-time reader on a phone: legislators after ${f.secondsToLegislators} s, first answer after ${f.secondsToFirstAnswer} s, ${f.taps} taps. Checked ${f.ranOn}. A person will be slower than a script; try it by hand.` }
    : { state: "fail", detail: "Not measured yet." });
  add("flow.five", 2, "All five legislators with their latest meaningful vote", yes(i.flow.fiveLegislatorsForTexasAddress, "A Texas street address returns both senators, the representative, the state senator and the state representative, each with one plain line.", "Not shown yet for a Texas address."));
  add("flow.coming", 2, "\"What's coming up\" with Support / Oppose in one tap", yes(i.flow.comingUpWithAnswers, "Upcoming votes on the reader's issues come first; one tap saves an answer.", "Not built or not verified yet."));
  add("flow.district", 2, "\"See how your district compares\" with the under-25 message", yes(i.flow.districtMessageShown, "Shows the district total from 25 verified answers, and says so plainly below that.", "Not shown yet."));
  add("flow.noaccount", 2, "No account until following, counted votes or alerts", yes(i.flow.accountNotNeeded, "A trial reader finds legislators and answers without signing in.", "Not verified yet."));

  // 3. Influence tools
  const fedShare = i.influence.federalMembers ? i.influence.federalWithPhoneOrForm / i.influence.federalMembers : 0;
  add("influence.contact", 3, "Contact your legislator on every bill and vote", i.influence.contactOnBillAndMemberPages && fedShare >= 0.95
    ? { state: "pass", detail: `${i.influence.federalWithPhoneOrForm} of ${i.influence.federalMembers} members of Congress have an official phone or contact form on record${i.influence.texasMembers ? `; ${i.influence.texasWithPhone} of ${i.influence.texasMembers} Texas legislators have an office phone` : ""}. The message is editable and nothing is sent by the site.` }
    : { state: "fail", detail: !i.influence.contactOnBillAndMemberPages ? "The contact block is not on the pages yet." : `Only ${i.influence.federalWithPhoneOrForm} of ${i.influence.federalMembers} members of Congress have contact details loaded (the next update loads them).` });
  add("influence.hearings", 3, "Hearings and town halls calendar", i.influence.hearingsStepLive && i.influence.townHallsLine
    ? { state: "pass", detail: `${i.influence.hearingsStored} upcoming committee meetings on record, filtered to the reader's legislators. No official source lists town halls, and the page says so.` }
    : { state: "fail", detail: "Committee hearings are not loading yet." });
  add("influence.voice", 3, "\"Your voice\" page", ran(i.influence.voicePage, "Lists the reader's answers, how their legislators voted on each bill, and the district's view.", "Not built yet."));

  // 4. Content coverage
  const cov = i.content;
  add("content.coverage", 4, "Every bill voted on in the last 90 days has a passing summary", cov.bills90d > 0 && cov.passing90d >= cov.bills90d
    ? { state: "pass", detail: `${cov.passing90d} of ${cov.bills90d} bills.` }
    : { state: "fail", detail: `${cov.passing90d} of ${cov.bills90d} bills have a summary that passed every check${cov.held90d ? `; ${cov.held90d} are written but held for review` : ""}.` });
  add("content.primers", 4, "Explainers for the 10 most common subjects", cov.primersReviewed >= 10
    ? { state: "pass", detail: `${cov.primersReviewed} approved explainers.` }
    : cov.primersReviewed + cov.primersWaiting >= 10 ? { state: "owner", detail: `${cov.primersReviewed} approved; ${cov.primersWaiting} written and waiting for your approval.` }
    : { state: "fail", detail: `${cov.primersReviewed} approved, ${cov.primersWaiting} waiting for approval; 10 are needed.` });
  const txSeats = cov.txSenators + cov.txRepresentatives;
  add("content.texas", 4, "Texas: legislators, committees and the 2027 calendar", txSeats >= 175 && cov.txCommittees >= 30 && cov.txCalendarDates >= 4
    ? { state: "pass", detail: `${cov.txSenators} senators and ${cov.txRepresentatives} representatives, ${cov.txCommittees} committees, ${cov.txCalendarDates} key dates for the 2027 session.` }
    : { state: "fail", detail: `${cov.txSenators} senators, ${cov.txRepresentatives} representatives, ${cov.txCommittees} committees, ${cov.txCalendarDates} key dates loaded.` });
  add("content.texasBills", 4, "Texas bill coverage live by 12 Jan 2027", cov.txReadyForSession === null ? { state: "fail", detail: "Not checked yet." } : yes(cov.txReadyForSession, "The update is set to follow the 2027 session's bills as they are filed.", cov.txNotReadyWhy || "Not ready."));

  // 5. Trust
  add("trust.method", 5, "Methodology: sources, summaries, numbers", ran(i.trust.methodology, "One page covers where facts come from, how summaries are written and checked, and how every number is counted.", "Still covers claim checking only."));
  add("trust.pledge", 5, "Nonpartisan pledge", ran(i.trust.pledge, "Published, and each line matches how the site works.", "Not written yet."));
  add("trust.corrections", 5, "Corrections log", yes(i.trust.correctionsLog, "Open to trial readers; fixed reports appear on it.", "Not available."));
  add("trust.about", 5, "About page", !i.trust.about ? { state: "fail", detail: "Not rewritten yet." }
    : i.trust.founderText && i.trust.contactEmail ? { state: "pass", detail: "Describes the product; your text and contact address are in." }
    : { state: "owner", detail: `Rewritten. Still needs from you: ${[!i.trust.founderText && "your founder text", !i.trust.contactEmail && "a contact email (PUBLIC_CONTACT_EMAIL)"].filter(Boolean).join(" and ")}.` });
  add("trust.legal", 5, "Privacy policy and terms", !(i.trust.privacyDraft && i.trust.termsDraft) ? { state: "fail", detail: "Drafts not written yet." }
    : i.trust.legalReviewed ? { state: "pass", detail: "Reviewed and in force." } : { state: "owner", detail: "Plain-English drafts are on the site, marked as drafts. They need your legal review." });

  // 6. Quality bar
  const e = i.quality.e2e;
  const waiting = e?.waitingOnOwner ?? [];
  add("quality.e2e", 6, "Usability tasks on a phone", e ? { state: e.passed === e.total ? "pass" : !e.failing.length && e.passed + waiting.length === e.total ? "owner" : "fail",
    detail: `${e.passed} of ${e.total} tasks pass at phone width. Checked ${e.ranOn}.${e.failing.length ? ` Failing: ${e.failing.join("; ")}.` : ""}${waiting.length ? ` Waiting for summaries to be shown to readers: ${waiting.join("; ")}.` : ""}` } : { state: "fail", detail: "The suite has not been run yet." });
  const a = i.quality.axe;
  add("quality.a11y", 6, "Accessibility (WCAG AA)", a ? { state: a.violations === 0 ? "pass" : "fail", detail: `${a.violations} problems on ${a.pages} pages. Checked ${a.ranOn}.` } : { state: "fail", detail: "Not checked yet." });
  const s = i.quality.speed;
  add("quality.speed", 6, "Pages usable in under 2 seconds", s ? { state: s.slowestMs < 2000 ? "pass" : "fail", detail: `Slowest page: ${s.slowestPage}, ${(s.slowestMs / 1000).toFixed(1)} s on a slowed-down phone. Checked ${s.ranOn}.${s.note ? ` ${s.note}` : ""}` } : { state: "fail", detail: "Not measured yet." });
  add("quality.errors", 6, "Error alerts only for real breakage", !i.quality.errorMonitoring ? { state: "fail", detail: "Not recording errors yet." }
    : i.quality.breakageNow ? { state: "fail", detail: "Recording errors, and something is broken right now. See What's next." } : { state: "pass", detail: "Errors are counted; you are told only when the same fault repeats or a key step fails. Nothing is broken now." });
  add("quality.uptime", 6, "Uptime check", ran(i.quality.uptimeCheck, "An outside check opens the site every 30 minutes and tells you if it is down.", "Not set up yet."));
  add("quality.feedback", 6, "Feedback prompt and \"Something wrong?\" on every page", i.quality.feedbackPrompt && i.quality.somethingWrongLink
    ? { state: "pass", detail: `One question after a reader's third visit; a report link at the foot of every page feeds the corrections queue. Checked ${i.quality.somethingWrongLink.ranOn}.` }
    : { state: "fail", detail: "The report link is not on every page yet." });
  add("quality.analytics", 6, "Trial numbers (totals only)", ran(i.quality.analytics, "Onboarding completion, time to first answer, weekly return, follows, shares and contact taps are on Editor → Metrics.", "Time to first answer and contact taps are not counted yet."));

  // 7. Trial package
  add("trial.invites", 7, "25 invite links", yes(i.trial.invites >= 25, `${i.trial.invites} links are ready on Editor → Trial invites. None has been sent.`, `${i.trial.invites} links exist; 25 are needed.`));
  add("trial.welcome", 7, "Welcome screen", yes(i.trial.welcomeScreen, "An invite opens on a short page: what to try and how to give feedback.", "Not built yet."));
  add("trial.booking", 7, "Booking link for 15-minute calls", i.trial.bookingLink ? { state: "pass", detail: "Your booking link is on the welcome screen." } : { state: "owner", detail: "The button is built. Paste your booking link into Vercel as TRIAL_BOOKING_URL (2 minutes)." });
  add("trial.summaries", 7, "Passing summaries are shown to trial readers", i.trial.summariesShownToTrial
    ? { state: "pass", detail: "Trial readers see every summary that passed; held ones stay hidden." }
    : cov.passing90d > 0 ? { state: "owner", detail: `${cov.passing90d} summaries have passed every check. Showing them to trial readers is your decision.` }
    : { state: "fail", detail: "No summary has passed every check yet, so there is nothing to show." });
  return c;
}

export function readinessTotals(checks: readonly Check[]) {
  const n = (s: CheckState) => checks.filter(x => x.state === s).length;
  return { pass: n("pass"), fail: n("fail"), owner: n("owner"), total: checks.length,
    /** Everything Claude can do is done: only the owner's own steps remain. */
    builtAndVerified: n("fail") === 0, readyToOpen: n("fail") === 0 && n("owner") === 0 };
}
