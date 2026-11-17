/**
 * "What's coming" rules (test-ready build, 17 Nov 2026). Pure; tested in tests/meetings.test.mjs.
 *   - how a time is shown: Eastern for Congress, Central for Texas, always labelled;
 *   - which items "My legislators" keeps: floor items in the reader's legislators' chambers, and hearings of committees
 *     those legislators sit on;
 *   - which view opens first.
 */
export type ComingLevel = "Congress" | "Texas";
const ZONE: Record<ComingLevel, { tz: string; name: string }> = { Congress: { tz: "America/New_York", name: "Eastern" }, Texas: { tz: "America/Chicago", name: "Central" } };

/**
 * "Tue, Nov 24 · 10:00 AM Eastern" for Congress, "… Central" for Texas. A date with no time of day (or a stamp of exactly
 * midnight UTC, which is how a date without a time arrives) shows the day and says the time is not listed, rather than
 * a wrong evening hour the day before.
 */
export function whenLabel(start: string, level: ComingLevel): string {
  const z = ZONE[level], dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(start.trim());
  const ms = Date.parse(dateOnly ? `${start.trim()}T12:00:00Z` : start);
  if (!Number.isFinite(ms)) return "Time not listed";
  const noTime = dateOnly || /T00:00:00(\.000)?Z$/.test(start.trim());
  const day = new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: noTime ? "UTC" : z.tz });
  if (noTime) return `${day} · time not listed`;
  return `${day} · ${new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: z.tz })} ${z.name}`;
}

export type ComingKind = "floor" | "hearing";
export type Matchable = { kind: ComingKind; where: ComingLevel; chamber?: string | null; committeeCodes?: readonly string[]; txCommitteeId?: string | null };
/** What "My legislators" knows about the reader: their federal members' chambers and committees, and their Texas members' committees. */
export type ReaderScope = { chambers: readonly string[]; committees: ReadonlySet<string>; txCommittees: ReadonlySet<string> };
export const EMPTY_SCOPE: ReaderScope = { chambers: [], committees: new Set(), txCommittees: new Set() };

/**
 * Whether an item belongs to the reader's legislators.
 *   Floor item in Congress: its chamber is one a legislator of theirs sits in.
 *   Hearing in Congress: one of the committees (or subcommittees) holding it has a legislator of theirs as a member.
 *   Hearing in Texas: it was matched to a committee one of their state legislators sits on.
 * A hearing that cannot be tied to a committee is never claimed as theirs.
 */
export function isMine(item: Matchable, scope: ReaderScope): boolean {
  if (item.where === "Texas") return !!item.txCommitteeId && scope.txCommittees.has(item.txCommitteeId);
  if (item.kind === "floor") return !!item.chamber && scope.chambers.includes(item.chamber);
  return (item.committeeCodes ?? []).some(c => scope.committees.has(c));
}
export function mineOnly<T extends Matchable>(items: readonly T[], scope: ReaderScope): T[] { return items.filter(i => isMine(i, scope)); }

export type ComingView = "mine" | "all";
/** The view to show: what the reader asked for, else "My legislators" when they have a place saved and something matches, else "Everything". */
export function comingView(asked: string | null | undefined, hasPlace: boolean, matches: number): ComingView {
  if (asked === "mine" || asked === "all") return asked;
  return hasPlace && matches > 0 ? "mine" : "all";
}

const squash = (s: string) => ` ${s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(committee|on|the|of|select|standing)\b/g, " ").replace(/\s+/g, " ").trim()} `;
/**
 * The Texas committee a hearing belongs to, from the hearing's name. The Texas event record carries no committee id, so
 * this matches on the committee's name: the name must appear whole in the hearing's name, and when the hearing names a
 * chamber ("House …", "Senate …") it must be the committee's chamber. The longest matching name wins; no match is null.
 */
export function txCommitteeFor(eventName: string, committees: ReadonlyArray<{ id: string; name: string; chamber: string | null }>): string | null {
  const e = squash(eventName);
  const says = /\bhouse\b/.test(e) ? "lower" : /\bsenate\b/.test(e) ? "upper" : null;
  let best: { id: string; len: number } | null = null;
  for (const c of committees) {
    const n = squash(c.name).replace(/ (house|senate) /g, " ");
    if (n.trim().length < 3 || !e.includes(n)) continue;
    if (says && (c.chamber === "upper" || c.chamber === "lower") && c.chamber !== says) continue;
    if (!best || n.length > best.len) best = { id: c.id, len: n.length };
  }
  return best?.id ?? null;
}

/** When a reminder goes out: the day before a hearing, an hour before the Monday of a floor week (as before). */
export function remindAtFor(item: { kind?: ComingKind; where: ComingLevel; whenMs: number }) {
  return item.kind === "hearing" || item.where === "Texas" ? item.whenMs - 86400e3 : item.whenMs - 3600e3;
}
