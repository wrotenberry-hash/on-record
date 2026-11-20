/**
 * The public record of bill summaries hidden or corrected after a reading against their official sources (owner,
 * 20 Nov 2026: "Corrections page: list each summary that was corrected or hidden today, with one line on what was
 * wrong. Trial readers saw these, so the record should be public."). Shown on /corrections, newest first.
 *
 * One line a reader can follow: what the summary said, and what the official text says. Never a person's fault, never
 * a guess. An entry stays here after the summary is corrected; its `state` changes and the line is kept.
 * Pure (no imports), so node's test runner loads it and lib/analysis/reader-holds.ts can use the same words.
 */
export type SummaryCorrection = { billId: string; label: string; date: string; state: "hidden" | "corrected"; wrong: string };

export const SUMMARY_CORRECTIONS: SummaryCorrection[] = [
  { billId: "119-hr-7008", label: "H.R. 7008", date: "2026-11-20", state: "hidden",
    wrong: "It left out the bill's exceptions to the ban on buying stock. It left out that a mailed ballot without photo ID needs a sworn statement that the voter could not get one after reasonable efforts. It said military and overseas voters are exempt; the text exempts absent uniformed services voters only." },
  { billId: "119-hr-8823", label: "H.R. 8823", date: "2026-11-20", state: "hidden",
    wrong: "It said “speakers said” current rules may not stop payment on claims already sent in; one member said that, and two others said the authority already exists. It also did not make clear that the bill applies only to payments made 180 days or more after it becomes law." },
  { billId: "119-hr-8897", label: "H.R. 8897", date: "2026-11-20", state: "hidden",
    wrong: "A “today” line said passengers may use faster lanes only when their boarding pass shows they are eligible; the official record does not state that as today's rule (the bill makes it a duty only if the pilot program is started). The headline said the bill “lets airports test” family lines; the text says the agency's head may set up a pilot program at airports." },
  { billId: "119-hr-4464", label: "H.R. 4464", date: "2026-11-20", state: "hidden",
    wrong: "The headline and the question said the bill “requires” longer savings estimates. Under the text, the budget office acts only when committee leaders ask." },
  { billId: "119-hr-915", label: "H.R. 915", date: "2026-11-20", state: "hidden",
    wrong: "It gave a count of loans for part of 2026 without saying the year was not over. It stated as fact that small businesses can already use these loans for software; one member said so, while others described the law as unclear." },
  { billId: "119-hr-1013", label: "H.R. 1013", date: "2026-11-20", state: "hidden",
    wrong: "It said an employer “must” review and approve each investment choice in a government plan. Under the text that review is a condition for an exemption, not a duty. It also credited to “supporters” and “opponents” figures that one member on each side gave." },
  { billId: "119-hr-8483", label: "H.R. 8483", date: "2026-11-20", state: "corrected",
    wrong: "It said the bill “lets” the Barona Band add land; the text itself places the land in trust. It left out “in trust” and “approximately”, called the gambling ban existing when it is new, and described “casino-style” gambling, words the official record does not use." },
  { billId: "119-hr-9600", label: "H.R. 9600", date: "2026-11-20", state: "corrected",
    wrong: "It said the bill “lets” the memorial be placed; the text says it “shall be located” there. It used the terms “major memorial zone” and “Area One”, which the official record does not use, and one reason for the bill was credited to the wrong member." },
  // Owner, same day: "For H.R. 7757, 8278, 9770 and 2102, fetch the bill sections the saved sources lacked and finish the check. If a
  // core statement can't be verified against the text, hide the summary until it can." The other three were verified in full.
  { billId: "119-hr-9770", label: "H.R. 9770", date: "2026-11-20", state: "hidden",
    wrong: "A “today” line said new yearly spending laws could fund new projects; neither the bill's text nor the official record says that. It also said the stopgap ends when “a new full-year spending law” passes; the text says when an appropriation for the project or activity becomes law, which need not cover a full year." },
  // Owner, 20 Nov 2026: "Corrections page: yes, also list the 13 summaries hidden on 19 Nov." Each had been on show and was
  // hidden after a reading against its sources that day.
  { billId: "119-hr-1181", label: "H.R. 1181", date: "2026-11-19", state: "hidden", wrong: "It credited to Rep. Thompson a point that Rep. Frost made in the House debate." },
  { billId: "119-hr-9640", label: "H.R. 9640", date: "2026-11-19", state: "hidden", wrong: "The headline, the plain-English part and the question said the bill funds or gives $84 million; the bill only authorizes that amount, and money would still have to be provided." },
  { billId: "119-hr-3276", label: "H.R. 3276", date: "2026-11-19", state: "hidden", wrong: "The headline said the bill funds the program; the bill only authorizes $200,000 a year, and money would still have to be provided." },
  { billId: "119-hr-4219", label: "H.R. 4219", date: "2026-11-19", state: "hidden", wrong: "A point was credited to the committee report that was made in floor debate, not in the report." },
  { billId: "119-hr-9500", label: "H.R. 9500", date: "2026-11-19", state: "hidden", wrong: "The summary said “declared emergency” where the law it describes says a declared disaster." },
  { billId: "119-hr-4646", label: "H.R. 4646", date: "2026-11-19", state: "hidden", wrong: "The sponsor's figure of thousands of workers was stated as a fact rather than as what the sponsor said." },
  { billId: "119-hr-9497", label: "H.R. 9497", date: "2026-11-19", state: "hidden", wrong: "The summary gave 14 projects as settled where another member said 10 in the same debate." },
  { billId: "119-hr-8884", label: "H.R. 8884", date: "2026-11-19", state: "hidden", wrong: "It said Congress rejected a proposal that only a committee voted down, and gave 2022 where the last day to start was in 2021." },
  { billId: "119-hjres-213", label: "H.J.Res. 213", date: "2026-11-19", state: "hidden", wrong: "It called Rep. Rivas “he” with nothing in the record to support that, and credited the research service with a list that came from a floor statement." },
  { billId: "119-hr-1118", label: "H.R. 1118", date: "2026-11-19", state: "hidden", wrong: "The case for credited the sponsor with the research service's own description; it said no floor statements were found although the House debated the bill for forty minutes; and it gave examples (office equipment, repair services) that are not in the official record." },
  { billId: "119-hr-9612", label: "H.R. 9612", date: "2026-11-19", state: "hidden", wrong: "It said the bill keeps environmental review, hearings and inspections, but the bill strikes the three requirements specific to enrichment plants and keeps only the general law, the right to ask for a hearing and the power to inspect; it also credited the committee report's figures to supporters in the debate." },
  { billId: "119-s-307", label: "S. 307", date: "2026-11-19", state: "hidden", wrong: "It gave no case for the bill and said no statement of reasons was found in the official record, but the House debated it on August 31, 2026 and two members gave reasons; it also added “reporting” to what the national standards must cover, which the bill does not say." },
  { billId: "119-hr-2140", label: "H.R. 2140", date: "2026-11-19", state: "hidden", wrong: "The headline and the question said the bill funds the program; the bill only extends the permission to spend $100 million a year through fiscal year 2029, and money would still have to be provided." },
];

/** The entries, newest first; entries of one day keep the order they were written in. */
export function summaryCorrectionsList(): SummaryCorrection[] { return [...SUMMARY_CORRECTIONS].sort((a, b) => b.date.localeCompare(a.date)); }
/** What was wrong with each summary that is hidden now, by bill id: the hold's reason is the public line. */
export const HIDDEN_LINES: Record<string, string> = Object.fromEntries(SUMMARY_CORRECTIONS.filter(c => c.state === "hidden").map(c => [c.billId, c.wrong]));
export const correctionStateLine = (c: SummaryCorrection) => (c.state === "corrected" ? "Corrected and shown again" : "Hidden while it is corrected");
