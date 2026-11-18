/**
 * Recorded results for the Texas checklist (lib/texas-readiness.ts): checks that are run by script or by hand, with
 * the day they were run. Hand-maintained by the lead after each run; `null` or `false` means not done yet.
 */
import type { TexasReadinessInput } from "./texas-readiness.ts";

export const TX_EVIDENCE: Pick<TexasReadinessInput, "address" | "votes"> & { summaries: Pick<TexasReadinessInput["summaries"], "built" | "pdfReader" | "pageDrawsThem" | "goldApproved">; dashboardPage: TexasReadinessInput["dashboard"]["page"] } = {
  address: { fiveFromAddress: { ranOn: "18 Nov 2026", note: "Phone task: a street address returns both U.S. senators, the U.S. representative, the state senator and the state representative (with a local stand-in for the Census service and test rows)." },
    liveGeocoder: { ranOn: "17 Nov 2026", note: "The live Census service returned Senate district 14 and House district 49 for 1100 Congress Ave, Austin." } },
  votes: { rulesFromRealHistories: { ranOn: "17 Nov 2026", note: "Built from the official 2025 histories of S.B. 1, H.B. 2 and S.B. 500." },
    phoneTasks: { ranOn: "18 Nov 2026", note: "Phone tasks: a recorded vote lists the senator under Yes; a voice vote shows the label, no member list and no position." } },
  summaries: { built: { ranOn: "18 Nov 2026", note: "48 tests on real 2025 documents from Texas Legislature Online; no real model call has been made yet." }, pdfReader: false, pageDrawsThem: false, goldApproved: false },
  dashboardPage: { ranOn: "17 Nov 2026", note: "Seen at phone width with data and with none." },
};
