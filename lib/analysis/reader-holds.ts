/**
 * Summaries taken off show after being read against their own official sources (owner, 19 Nov 2026: "Read the six newly
 * shown summaries against their sources and fix or hide any that fail"). Each passed every automatic check and still
 * misstates a detail. A bill listed here is hidden from readers by the gate itself, whatever its stored status says, so
 * hiding needs no change to stored data; the editor still sees the summary, with the reason. Remove a line when the
 * summary has been rewritten and read again. Bill ids are lower case, as stored ("119-hr-1181").
 */
import { HIDDEN_LINES } from "./summary-corrections.ts";

export const READER_HOLDS: Record<string, string> = {
  // Every summary readers had seen and that is hidden now: the reason is the line shown on the corrections page
  // (lib/analysis/summary-corrections.ts). 19 Nov 2026: thirteen, after the first readings against their sources.
  // 20 Nov 2026: seven more, after all 18 on show were read claim by claim (owner: "Hide now the summaries with a core
  // misstatement"); H.R. 8483 and H.R. 9600 were hidden with them and are back, corrected, on the owner's yes.
  ...HIDDEN_LINES,
  // Rewritten by generator b12 on 20 Nov 2026 and read again: the earlier mistake (a point by Rep. Frost credited to Rep. Thompson) is gone; these are new.
  "119-hr-1181": "It credits “the committee minority” with a statement about California, New York and Colorado that Rep. Waters and Rep. Moore made on the floor; it says a purchase record would still show the business, which no source says; and it calls a report to Congress “annual” and “public”, which the bill does not.",
  // The trial of generator b12 (20 Nov 2026): never on show in this wording.
  "119-hr-7128": "It credits the case against to “the committee minority”, but the report's dissenting views are one member's (Rep. John Rose, of the majority party), and the same member is then given as a second voice; it also calls a Treasury report “yearly” and “public” where the law makes it every two years, to two committees.",
  "119-sjres-197": "It says the agency expects prices 1.2 to 2.4 percent lower in 2027 and leaves out that this is before normal yearly increases (the rule elsewhere gives 1.2 to 1.8 percent); it states an agency estimate of $130 million as a fact; and it describes bronze plans in words none of its sources uses.",
};

/** The listed bill ids that are well formed (anything else is ignored rather than put into a query). */
export function heldBillIds(): string[] { return Object.keys(READER_HOLDS).filter(id => /^[0-9]+-[a-z]+-[0-9]+$/.test(id)); }
