/**
 * Finite design on the two legislature dashboards (owner, 18 Nov 2026, point 6). Pure; tested in
 * tests/dashboard-end.test.mjs.
 *
 * Every list on /dashboard and /dashboard/texas is capped (`capList`) and ends with a line that says it is the end
 * (`listEnd`). Each page closes with one calm line, "You're caught up.", and the time its figures were last updated
 * (`dashboardClose`). Nothing here makes a new figure or a new chart, and the wording is the same for every member
 * and party: a line says how many rows there are, never anything about who is in them.
 */

/** The most rows each kind of list may show. A list already cut by its query (the three "most" lists, the committees) keeps that cut. */
export const DASH_CAPS = { top: 10, stall: 15, leaders: 20, changes: 5, chairs: 150, issues: 20, history: 8, sessions: 20 } as const;

export type Capped<T> = { rows: T[]; shown: number; total: number };
/** The first `cap` rows, with how many there were in all. */
export function capList<T>(rows: readonly T[] | null | undefined, cap: number): Capped<T> {
  const all = rows ?? [];
  return { rows: all.slice(0, cap), shown: Math.min(all.length, cap), total: all.length };
}

/**
 * The line that ends a list.
 *   every row is shown                    "That is all 10."            (one row: "That is the only one.")
 *   a "most" list cut at its cap           "Those are the 10 highest of 34. The list stops here."
 *   the same, total not on file            "Those are the 10 highest. The list stops here."
 *   any other list cut at its cap          "Those are 150 of 163. The list stops here."
 * `what` names the rows ("issues", "committees") when that reads better. An empty list gets no line: the page already
 * says why it is empty.
 */
export function listEnd(i: { shown: number; total?: number | null; top?: boolean; what?: string }): string {
  const n = i.shown, what = i.what ? ` ${i.what}` : "";
  if (n <= 0) return "";
  const total = typeof i.total === "number" && Number.isFinite(i.total) ? i.total : null;
  const cut = total !== null ? total > n : !!i.top;
  if (!cut) return n === 1 ? "That is the only one." : `That is all ${n}${what}.`;
  if (i.top) return `Those are the ${n} highest${total !== null ? ` of ${total}` : ""}. The list stops here.`;
  return `Those are ${n} of ${total}${what}. The list stops here.`;
}

export const CAUGHT_UP = "You're caught up.";
/**
 * The line that closes a dashboard. `updated` is the time the figures were last updated, already written out for the
 * reader ("Nov 18, 2:10 PM ET"); `updatedAt` is the same time in milliseconds; `previousVisit` is when this reader was
 * last on the site before this visit (lib/visits.ts keeps the time only, never a page), or null.
 * When the figures are older than that visit, the line says nothing has changed since; otherwise only that this is
 * everything on the page.
 */
export function dashboardClose(i: { updated: string | null; updatedAt: number | null | undefined; previousVisit: number | null | undefined }): { head: string; text: string } {
  if (!i.updated || !i.updatedAt) return { head: CAUGHT_UP, text: "That is everything on this page. The time of the last update is not on file." };
  if (i.previousVisit && i.updatedAt <= i.previousVisit) return { head: CAUGHT_UP, text: `These figures have not changed since your last visit. They were last updated ${i.updated}.` };
  return { head: CAUGHT_UP, text: `That is everything on this page. The figures were last updated ${i.updated}.` };
}

/** The latest of several read times (milliseconds); null when none is on file. */
export function latestTime(...times: Array<number | null | undefined>): number | null {
  const real = times.filter((t): t is number => typeof t === "number" && Number.isFinite(t) && t > 0);
  return real.length ? Math.max(...real) : null;
}
