/**
 * Summaries the owner has told Claude to approve on his behalf (the same decision as Editor → Bill summaries →
 * Approve). Claude holds no editor key, so the decision is written here with the owner's words and applied by the
 * scheduled update (lib/analysis/owner-approvals-store.ts). One line per bill; nothing is approved that is not listed,
 * and a line does nothing once it has been applied. Pure: no imports.
 */
export const OWNER_APPROVED: Record<string, string> = {
  "119-hr-9576": "Owner, 20 Nov 2026: “Approve number 3” (put H.R. 9576 back on show). It was taken down on 19 Nov by the weekly re-check's wrong rules, then read against its sources: one small point (the headline says “Creates” for a unit that already exists).",
};

/** The listed bill ids that are well formed (anything else is ignored). */
export function ownerApprovedIds(): string[] { return Object.keys(OWNER_APPROVED).filter(id => /^[0-9]+-[a-z]+-[0-9]+$/.test(id)); }
