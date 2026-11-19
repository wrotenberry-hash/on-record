/**
 * Summaries taken off show after being read against their own official sources (owner, 19 Nov 2026: "Read the six newly
 * shown summaries against their sources and fix or hide any that fail"). Each passed every automatic check and still
 * misstates a detail. A bill listed here is hidden from readers by the gate itself, whatever its stored status says, so
 * hiding needs no change to stored data; the editor still sees the summary, with the reason. Remove a line when the
 * summary has been rewritten and read again. Bill ids are lower case, as stored ("119-hr-1181").
 */
export const READER_HOLDS: Record<string, string> = {
  "119-hr-1181": "The case against credits Rep. Thompson with a point Rep. Frost made (that financial institutions already use store codes to detect crimes).",
  "119-hr-9640": "The headline, the plain-English part and the question say the bill funds or gives $84 million; the bill only authorizes that amount, and money would still have to be provided.",
  // Owner, 19 Nov 2026 ("Yes to all"): the seven of the twenty on show whose reading against the sources found a detail stated wrongly.
  "119-hr-3276": "The headline says the bill funds the program; the bill only authorizes $200,000 a year, and money would still have to be provided.",
  "119-hr-4219": "A point is credited to the committee report that was made in floor debate, not in the report.",
  "119-hr-9500": "The summary says “declared emergency” where the law it describes says a declared disaster.",
  "119-hr-4646": "The sponsor's figure of thousands of workers is stated as a fact rather than as what the sponsor said.",
  "119-hr-9497": "The summary gives 14 projects as settled where another member said 10 in the same debate.",
  "119-hr-8884": "It says Congress rejected a proposal that only a committee voted down, and gives 2022 where the last day to start was in 2021.",
  "119-hjres-213": "It calls Rep. Rivas “he” with no source for that, and credits the research service with a list that came from a floor statement.",
  // 19 Nov 2026, late: two summaries the weekly re-check had taken down by the wrong rules, read against their sources
  // before anyone puts them back. Listed here so that approving them in the review queue does not show them.
  "119-hr-1118": "The case for credits the sponsor with the research service's own description; it says no floor statements were found although the House debated the bill for forty minutes; and it gives examples (office equipment, repair services) no source gives.",
  "119-hr-9612": "It says the bill keeps environmental review, hearings and inspections, but the bill strikes the three requirements specific to enrichment plants and keeps only the general law, the right to ask for a hearing and the power to inspect; it also credits the committee report's figures to supporters in the debate.",
};

/** The listed bill ids that are well formed (anything else is ignored rather than put into a query). */
export function heldBillIds(): string[] { return Object.keys(READER_HOLDS).filter(id => /^[0-9]+-[a-z]+-[0-9]+$/.test(id)); }
