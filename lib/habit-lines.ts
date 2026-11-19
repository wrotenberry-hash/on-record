/**
 * The four measures of the persuasion and retention round (owner, 18 Nov 2026, point 12), in plain sentences for the
 * What's next page and the health probe: week-two return rate, weekly email open rate, share rate per bill view, and
 * the share of loop-closing notices that brought a reader back. Totals only; no figure here names or follows a person.
 * Pure: no imports.
 */
export type HabitInput = {
  weekTwo: { cohort: number; returned: number; rate: number | null; stillInFirstTwoWeeks: number; line: string } | null;
  loop: { week: string; weeklyEmailsSent: number; weeklyOpens: number; weeklyOpenRate: number | null; noticeDays: number; noticesSent: number; noticeReturns: number; noticeReturnRate: number | null } | null;
  share: { last7: { billViews: number; sharesStarted: number; rate: number | null }; last28: { billViews: number; sharesStarted: number; rate: number | null } } | null;
  readerEmailReady: boolean;
};
export type HabitLine = { key: "weekTwo" | "emailOpens" | "shareRate" | "noticeReturn"; label: string; value: string; note: string };

const pct = (r: number | null) => (r === null ? "" : `${Math.round(r * 100)}%`);
const UNKNOWN = "Could not be read just now.";

export function habitLines(h: HabitInput): HabitLine[] {
  const share = (w: { billViews: number; sharesStarted: number; rate: number | null }, days: number) => w.billViews
    ? `${w.sharesStarted} ${w.sharesStarted === 1 ? "share" : "shares"} started from ${w.billViews} bill-page ${w.billViews === 1 ? "view" : "views"} in the last ${days} days (${w.rate !== null && w.rate < 0.005 && w.sharesStarted ? "under 1%" : pct(w.rate)})`
    : `no reader has opened a bill page in the last ${days} days`;
  return [
    { key: "weekTwo", label: "Week-two return rate", value: h.weekTwo ? h.weekTwo.line : UNKNOWN,
      note: "Of trial readers whose first two weeks are over, how many came back during days 8 to 14. Your own visits as editor are not counted." },
    { key: "emailOpens", label: "Weekly email open rate",
      value: !h.loop ? UNKNOWN : h.loop.weeklyEmailsSent
        ? `${h.loop.weeklyOpens} of ${h.loop.weeklyEmailsSent} weekly emails were opened in week ${h.loop.week} (${pct(h.loop.weeklyOpenRate)}).`
        : h.readerEmailReady ? "No weekly email has been sent yet." : "No weekly email has been sent yet: emails to readers wait for the site's own sending address.",
      note: "Counted with a random one-time mark in each email that is not linked to a reader. Mail apps that load pictures ahead of time push the number up; apps that block pictures push it down." },
    { key: "shareRate", label: "Share rate per bill view",
      value: h.share ? `${share(h.share.last7, 7)[0].toUpperCase()}${share(h.share.last7, 7).slice(1)}; ${share(h.share.last28, 28)}.` : UNKNOWN,
      note: "A share is counted when a reader opens the share screen from a bill page. Views by trial readers only; a reload counts again." },
    { key: "noticeReturn", label: "Readers who return after a loop-closing notice",
      value: !h.loop ? UNKNOWN : h.loop.noticesSent
        ? `${h.loop.noticeReturns} of ${h.loop.noticesSent} notices sent in the last ${h.loop.noticeDays} days were followed back to the site (${pct(h.loop.noticeReturnRate)}).`
        : `No notice has been sent in the last ${h.loop.noticeDays} days. A notice goes out when a bill a reader answered or follows gets a floor vote, passes, fails, is signed or is vetoed.`,
      note: "Counted when the link in a notice is followed, with a random one-time mark that is not linked to a reader." },
  ];
}
