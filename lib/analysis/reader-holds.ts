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
};

/** The listed bill ids that are well formed (anything else is ignored rather than put into a query). */
export function heldBillIds(): string[] { return Object.keys(READER_HOLDS).filter(id => /^[0-9]+-[a-z]+-[0-9]+$/.test(id)); }
