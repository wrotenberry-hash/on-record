/**
 * Summaries taken off show after being read against their own official sources (owner, 19 Nov 2026: "Read the six newly
 * shown summaries against their sources and fix or hide any that fail"). Each passed every automatic check and still
 * misstates a detail. A bill listed here is hidden from readers by the gate itself, whatever its stored status says, so
 * hiding needs no change to stored data; the editor still sees the summary, with the reason. Remove a line when the
 * summary has been rewritten and read again. Bill ids are lower case, as stored ("119-hr-1181").
 */
export const READER_HOLDS: Record<string, string> = {
  // Rewritten by generator b12 on 20 Nov 2026 and read again: the earlier mistake (a point by Rep. Frost credited to Rep. Thompson) is gone; these are new.
  "119-hr-1181": "It credits “the committee minority” with a statement about California, New York and Colorado that Rep. Waters and Rep. Moore made on the floor; it says a purchase record would still show the business, which no source says; and it calls a report to Congress “annual” and “public”, which the bill does not.",
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
  // 19 Nov 2026, late: found on show and not yet read when the list of what is on show was checked against the list of what had been read.
  "119-s-307": "It gives no case for the bill and says no statement of reasons was found in the official record, but the House debated it on August 31, 2026 and two members gave reasons; it also adds “reporting” to what the national standards must cover, which the bill does not say.",
  "119-hr-2140": "The headline and the question say the bill funds the program; the bill only extends the permission to spend $100 million a year through fiscal year 2029, and money would still have to be provided.",
  // 20 Nov 2026, the five-summary trial of generator b12 (owner: "at least 4 of the 5 … passed every check AND your own read"): the three
  // that passed every automatic check, and the first resolution written, each read against its sources. In all four the reasons for
  // and against now carry the source's exact words under the right name; the mistakes are elsewhere on the page.
  "119-hr-7128": "It credits the case against to “the committee minority”, but the report's dissenting views are one member's (Rep. John Rose, of the majority party), and the same member is then given as a second voice; it also calls a Treasury report “yearly” and “public” where the law makes it every two years, to two committees.",
  "119-sjres-197": "It says the agency expects prices 1.2 to 2.4 percent lower in 2027 and leaves out that this is before normal yearly increases (the rule elsewhere gives 1.2 to 1.8 percent); it states an agency estimate of $130 million as a fact; and it describes bronze plans in words none of its sources uses.",
  "119-hconres-93": "The headline and the question say the resolution “requires” the President to withdraw forces; the text and the research service say it “directs” him, and no source says that binds. Several lines drop the condition the text attaches to the defence exception, and it predicts deployments ending, which no source says.",
};

/** The listed bill ids that are well formed (anything else is ignored rather than put into a query). */
export function heldBillIds(): string[] { return Object.keys(READER_HOLDS).filter(id => /^[0-9]+-[a-z]+-[0-9]+$/.test(id)); }
