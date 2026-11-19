import { BRAND } from "./brand.ts";
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

/**
 * SHARED_PAGES_PUBLIC (owner's points 10 and 11, 18 Nov 2026). A second, narrower switch. OFF by default, and it
 * stays off until the owner turns it on: the hard stop is "nothing public beyond trial invites".
 *
 * Off (today): nothing changes. A visitor with no invite gets the private notice on every page and no card picture.
 *
 * On: three things open to a visitor with no invite, and nothing else.
 *   1. A bill's page, for a visitor who arrives through a share link (/s/<code>) about that bill. The link's code
 *      rides in the address (?s=<code>); it opens that one bill and no other. The page shows the record and the
 *      summary a trial reader would see. It has no vote box (a plain line says how to take part) and no reader's data.
 *   2. The picture of a card a reader has shared, so a link preview can show it.
 *   3. The 14 issue pages (/issues/<slug>), which then also appear in the sitemap.
 * Every other page, the issues index and every reader's own card stay private.
 *
 * It does not change PUBLIC_READ_ENABLED, which still means what it meant: everything readable by everyone.
 */
export const SHARED_PAGES_FLAG = "SHARED_PAGES_PUBLIC";
export function sharedPagesEnabled(value: string | undefined | null): boolean { return publicReadEnabled(value); }

/** What a visitor is asking for, as far as the narrower switch cares. */
export type EntryPage =
  | { kind: "bill"; billKey: string }
  | { kind: "issue" }
  /** `shared`: a reader has made a share link for exactly this card (lib/entry/store.ts, pictureShared). */
  | { kind: "picture"; shared: boolean }
  | { kind: "other" };

/**
 * May this page be shown, and is it the narrow "shared" view?
 * `base`: the present rule (lib/viewer.ts): public reading on, the signed-in editor, or a genuine trial invite.
 * `grant`: the bill the share link in the address is about, or null (lib/entry/store.ts, shareGrant).
 * A viewer the present rule lets in is never given the narrow view. With the switch off the answer is the present rule.
 */
export function entryAccess(input: { base: boolean; sharedPages: boolean; page: EntryPage; grant?: string | null }): { allowed: boolean; shared: boolean } {
  if (input.base) return { allowed: true, shared: false };
  if (!input.sharedPages) return { allowed: false, shared: false };
  const p = input.page;
  const open = p.kind === "issue" || (p.kind === "bill" && !!input.grant && input.grant === p.billKey) || (p.kind === "picture" && p.shared);
  return { allowed: open, shared: open };
}

/** The line that stands where the vote box would be, for a visitor reading one shared bill. */
export const TAKE_PART_LINE = "Residents answer Support, Oppose or Unsure on each bill, and counted answers are added into anonymous totals for their district. Taking part is by invitation for now.";
/** The note at the top of a page opened through a share link or from search. */
export const SHARED_VIEW_NOTE = `You are reading one page of ${BRAND.name}. The rest of the site is open by invitation for now.`;

/** Representations a human has rejected never appear in the public inventory. */
export const PUBLIC_INVENTORY_STATUSES = ["CANDIDATE", "APPROVED"] as const;

export function publiclyListable(status: string): boolean {
  return (PUBLIC_INVENTORY_STATUSES as readonly string[]).includes(status);
}

export const PUBLIC_READ_DISABLED_MESSAGE =
  `${BRAND.name} is in private review. Public records are not enabled on this deployment.`;

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

/**
 * Evidence-search notes are stored as "<ISO timestamp> | <query>: <summary>"
 * by the editor's apply-draft step. Readers get the query and summary; the
 * timestamp stays in the private record.
 */
export function displaySearchNote(text: string | null | undefined): string {
  return (text ?? "").replace(/^\s*\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*\|\s*/gm, "").trim();
}
