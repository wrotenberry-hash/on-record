/**
 * Anonymous read access is a deliberate, reversible switch, separate from the
 * hosting platform's audience setting. When the Site audience is widened so a
 * scheduler can reach `/api/automation/tick`, nothing here becomes readable by
 * anonymous visitors unless `PUBLIC_READ_ENABLED` is also set on the Site.
 */
export const PUBLIC_READ_FLAG = "PUBLIC_READ_ENABLED";

export function publicReadEnabled(value: string | undefined | null): boolean {
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

/** Representations a human has rejected never appear in the public inventory. */
export const PUBLIC_INVENTORY_STATUSES = ["CANDIDATE", "APPROVED"] as const;

export function publiclyListable(status: string): boolean {
  return (PUBLIC_INVENTORY_STATUSES as readonly string[]).includes(status);
}

export const PUBLIC_READ_DISABLED_MESSAGE =
  "On Record is in private review. Public records are not enabled on this deployment.";
