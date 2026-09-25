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

/**
 * The incoming inventory (machine-captured, unreviewed) stays hidden from the
 * public until this many human-reviewed CHECKING records have been published,
 * even with PUBLIC_READ_ENABLED set. Founder decision of 2026-09-25.
 */
export const PUBLIC_INVENTORY_MIN_PUBLISHED = 20;

export function inventoryVisible(publicRead: boolean, publishedCount: number): boolean {
  return publicRead && Number.isInteger(publishedCount) && publishedCount >= PUBLIC_INVENTORY_MIN_PUBLISHED;
}

export const INVENTORY_WITHHELD_REASON = "INVENTORY_WITHHELD";

/** Characters kept on each side of the exact representation in a public record. */
export const PUBLIC_PASSAGE_RADIUS = 600;

/**
 * Public records show the passage around the exact representation, not the whole
 * captured communication. The full capture stays in the private editorial record.
 * Boundaries move outward to whitespace so words are not cut, and an ellipsis marks
 * each side that was trimmed. If the quote is not found, the opening of the
 * capture is shown instead so the record is never empty.
 */
export function passageAround(originalContent: string, exactText: string, radius = PUBLIC_PASSAGE_RADIUS): string {
  const content = originalContent ?? "";
  const quoteStart = exactText ? content.indexOf(exactText) : -1;
  const quoteEnd = quoteStart >= 0 ? quoteStart + exactText.length : 0;
  let start = quoteStart >= 0 ? Math.max(0, quoteStart - radius) : 0;
  let end = quoteStart >= 0 ? Math.min(content.length, quoteEnd + radius) : Math.min(content.length, 2 * radius);
  while (start > 0 && !/\s/.test(content[start - 1])) start--;
  while (end < content.length && !/\s/.test(content[end])) end++;
  const passage = content.slice(start, end).trim();
  return `${start > 0 ? "… " : ""}${passage}${end < content.length ? " …" : ""}`;
}
