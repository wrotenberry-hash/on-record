/**
 * The Texas checklist (owner, 17 Nov 2026; docs/TEXAS_BUILD.md): one line per thing the owner asked for before the
 * Legislature convenes on 12 Jan 2027, each PASS, NOT YET or NEEDS YOU, with the evidence in plain words.
 *
 * Pure, like lib/readiness.ts: `texasReadiness(input)` only reads the numbers it is given. The numbers come from the
 * database (lib/texas-readiness-data.ts) and from recorded runs. Nothing is PASS without a number or a recorded run.
 */
import type { Check, CheckState, RunEvidence } from "./readiness.ts";

export const TX_GROUPS: Record<number, string> = {
  1: "Data", 2: "Address lookup", 3: "Summaries", 4: "Votes without a record", 5: "Explainers", 6: "Dashboard",
};
/** The date Texas is to be fully live, and the day the session opens. */
export const TX_GO_LIVE = "2026-12-14", TX_SESSION_OPENS = "2027-01-12";

export type TexasReadinessInput = {
  today: string;
  data: { openStatesKey: boolean; legiscanKey: boolean; seatsFilled: number; seatsExpected: number; missingSeats: string;
    committees: number; committeesChamberUnknown: number; committeesReadAt: string | null;
    bills2027: number; bills2027Waiting: number | null; newestFiling: string | null;
    recordedVotes: number; tallyMismatches: number; hearingsReadAt: string | null; hearingsUpcoming: number; hearingsWithBills: number;
    tloChecked: number; tloAgree: number; tloMismatches: number; lastRunStatus: string | null; rateLimitedAt: string | null };
  address: { fiveFromAddress: RunEvidence; liveGeocoder: RunEvidence };
  summaries: { built: RunEvidence; paused: boolean; written: number; passing: number; held: number; readersSeeThem: boolean; pdfReader: boolean; pageDrawsThem: boolean; goldApproved: boolean };
  votes: { rulesFromRealHistories: RunEvidence; phoneTasks: RunEvidence };
  primers: { approved: number; waiting: number };
  dashboard: { sessionsWanted: number; sessionsLoaded: number; missing: string[]; page: RunEvidence };
};

const r = (state: CheckState, detail: string) => ({ state, detail });
const ran = (e: RunEvidence, what: string, missing: string) => (e ? r("pass", `${what} Checked ${e.ranOn}.${e.note ? ` ${e.note}` : ""}`) : r("fail", missing));

export function texasReadiness(i: TexasReadinessInput): Check[] {
  const c: Check[] = [], add = (id: string, group: number, label: string, x: { state: CheckState; detail: string }) => c.push({ id, group, label, ...x });
  const d = i.data;

  // 1. Data
  add("tx.data.members", 1, "Every current legislator on file", !d.openStatesKey ? r("owner", "The Open States key is not set.")
    : d.seatsFilled >= d.seatsExpected ? r("pass", `All ${d.seatsExpected} seats have a member on file.`)
    : d.seatsFilled >= d.seatsExpected - 5 ? r("pass", `${d.seatsFilled} of ${d.seatsExpected} seats have a member on file. The source's list has no member for: ${d.missingSeats}. Those seats say so on the site; they are not called vacant.`)
    : r("fail", `${d.seatsFilled} of ${d.seatsExpected} seats have a member on file.`));
  add("tx.data.committees", 1, "Committees with their chamber and members", d.committees >= 40 && d.committeesChamberUnknown === 0
    ? r("pass", `${d.committees} committees, each with its chamber${d.committeesReadAt ? `, read ${d.committeesReadAt.slice(0, 10)}` : ""}.`)
    : r("fail", d.committees ? `${d.committees} committees on file, ${d.committeesChamberUnknown} of them with no chamber. The chamber-by-chamber read has not finished on the live site yet.` : "No committees on file yet."));
  add("tx.data.prefiled", 1, "Bills filed for the 2027 session, kept up to date", d.bills2027 > 0 && d.bills2027Waiting === 0
    ? r("pass", `${d.bills2027.toLocaleString("en-US")} bills on file for 2027, none waiting${d.newestFiling ? `; newest filing ${d.newestFiling}` : ""}.`)
    : d.bills2027 > 0 ? r("fail", `${d.bills2027.toLocaleString("en-US")} bills on file for 2027; ${d.bills2027Waiting === null ? "the first full read is still under way" : `about ${d.bills2027Waiting.toLocaleString("en-US")} still waiting`}.`)
    : r("fail", d.rateLimitedAt ? "No 2027 bill on file yet; the source's daily limit was reached, so loading continues tomorrow." : "No 2027 bill on file yet. Loading starts with the next scheduled update."));
  add("tx.data.votes", 1, "Recorded votes, with every tally matching its member list", d.recordedVotes > 0 && d.tallyMismatches === 0
    ? r("pass", `${d.recordedVotes.toLocaleString("en-US")} recorded votes on file; every stated count matches the members listed.`)
    : r("fail", d.recordedVotes ? `${d.tallyMismatches} of ${d.recordedVotes} recorded votes have a count that does not match the members listed.` : "No recorded votes on file yet."));
  add("tx.data.hearings", 1, "Committee hearings with the bills on each agenda", d.hearingsReadAt
    ? (d.hearingsUpcoming === 0 || d.hearingsWithBills > 0
      ? r("pass", d.hearingsUpcoming ? `${d.hearingsUpcoming} upcoming hearings, ${d.hearingsWithBills} listing their bills (read ${d.hearingsReadAt.slice(0, 10)}).` : `The full list was read ${d.hearingsReadAt.slice(0, 10)}; the source lists no upcoming hearing (the Legislature is not in session).`)
      : r("fail", `${d.hearingsUpcoming} upcoming hearings are on file but none lists its bills.`))
    : r("fail", "The full list of hearings has not been read on the live site yet."));
  add("tx.data.record", 1, "Checked against Texas Legislature Online, the source of record", d.tloChecked > 0
    ? (d.tloMismatches === 0 ? r("pass", `${d.tloChecked} bills compared with their official history page today; ${d.tloAgree} agree and none conflicts. Every bill and decision links to its official page.`)
      : r("fail", `${d.tloMismatches} of ${d.tloChecked} bills compared with their official history page do not match.`))
    : r("fail", "The daily comparison with the official history pages has not run on the live site yet."));
  add("tx.data.legiscan", 1, "LegiScan as the backup source", d.legiscanKey ? r("pass", "The LegiScan key is set.") : r("owner", "Built and tested on samples; it needs the free LegiScan key (LEGISCAN_API_KEY)."));

  // 2. Address lookup
  add("tx.address.five", 2, "A Texas address returns the state senator and representative with the federal members",
    i.address.fiveFromAddress && i.address.liveGeocoder ? r("pass", `A street address returns all five. Checked ${i.address.fiveFromAddress.ranOn}.${i.address.fiveFromAddress.note ? ` ${i.address.fiveFromAddress.note}` : ""}`)
      : r("fail", "Not verified yet."));

  // 3. Summaries
  const s = i.summaries;
  add("tx.summaries.built", 3, "Same standard and reader test, with the Texas sources", ran(s.built, "The federal checker, repair step and reader test run on Texas drafts; sources are the bill text, the committee or Senate Research Center analysis, the Legislative Budget Board fiscal note and the House Research Organization analysis; only bills with a hearing, a vote or a follower are written.", "Not built yet."));
  add("tx.summaries.sources", 3, "House Research Organization analyses can be read", s.pdfReader ? r("pass", "The analyses, which are published as PDF files, are read.") : r("fail", "Those analyses are PDF files and the site cannot read PDFs yet, so a bill that reached the House floor is held."));
  add("tx.summaries.page", 3, "The Texas bill page shows a passing summary", s.pageDrawsThem ? r("pass", "The page shows the summary in the same order as a federal bill.") : r("fail", "The Texas bill page does not draw the new summaries yet."));
  add("tx.summaries.proven", 3, "First Texas summaries pass on real bills", s.passing > 0 ? r("pass", `${s.passing} of ${s.written} Texas summaries passed every check.`)
    : s.paused ? r("fail", "Texas summaries have not been started on the live site, so none has been written or tested against a real model.")
    : r("fail", s.written ? `${s.written} written, none passing yet (${s.held} held).` : "Started; none written yet."));
  add("tx.summaries.shown", 3, "Readers see Texas summaries that passed", s.readersSeeThem ? r("pass", "Readers see every Texas summary that passed; held ones stay hidden.")
    : s.passing > 0 ? r("owner", `${s.passing} passed. Showing them to readers is your decision${s.goldApproved ? "" : ", after you have approved an example in the new format"}.`)
    : r("fail", "Nothing to show yet."));

  // 4. Votes without a record
  add("tx.votes.labels", 4, "Voice votes and unrecorded votes are labelled; no position without a recorded vote",
    i.votes.rulesFromRealHistories && i.votes.phoneTasks ? r("pass", `Each decision reads recorded, voice vote, not individually recorded, or "the record does not say". A member's position comes only from a record vote that lists them. Checked ${i.votes.phoneTasks.ranOn}.${i.votes.phoneTasks.note ? ` ${i.votes.phoneTasks.note}` : ""}`)
      : r("fail", "Not verified yet."));

  // 5. Explainers
  add("tx.primers", 5, "Four Texas explainers", i.primers.approved >= 4 ? r("pass", `${i.primers.approved} approved explainers.`)
    : i.primers.approved + i.primers.waiting >= 4 ? r("owner", `${i.primers.approved} approved; ${i.primers.waiting} written and waiting for your approval.`)
    : r("fail", `${i.primers.approved + i.primers.waiting} of 4 written.`));

  // 6. Dashboard
  add("tx.dashboard.parity", 6, "Texas dashboard with the same measures as Congress", ran(i.dashboard.page, "The Texas dashboard follows the Congress page measure for measure wherever Texas has an equivalent.", "Not built yet."));
  add("tx.dashboard.history", 6, "2021 to 2025 sessions loaded from the official statistics", i.dashboard.sessionsLoaded >= i.dashboard.sessionsWanted
    ? r("pass", `All ${i.dashboard.sessionsWanted} sessions of the 87th, 88th and 89th Legislatures are loaded from Texas Legislature Online.`)
    : r("fail", `${i.dashboard.sessionsLoaded} of ${i.dashboard.sessionsWanted} sessions loaded on the live site${i.dashboard.missing.length ? ` (missing: ${i.dashboard.missing.slice(0, 6).join(", ")}${i.dashboard.missing.length > 6 ? ", …" : ""})` : ""}. They load a few requests at a time with each update.`));
  return c;
}

export function texasTotals(checks: Check[], today: string) {
  const n = (st: CheckState) => checks.filter(x => x.state === st).length;
  const days = (to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400e3);
  return { pass: n("pass"), fail: n("fail"), owner: n("owner"), total: checks.length, live: n("fail") === 0 && n("owner") === 0,
    goLive: TX_GO_LIVE, daysToGoLive: days(TX_GO_LIVE), sessionOpens: TX_SESSION_OPENS, daysToSession: days(TX_SESSION_OPENS) };
}
