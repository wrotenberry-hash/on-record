/**
 * The one line on where a bill stands, at the top of the bill page (owner, 21 Nov 2026): "The single visible line on
 * where the bill stands must also say whether it can still be changed, and the hearing date when one is confirmed.
 * Examples: 'In a Senate committee. It can still be changed. Hearing: Tuesday, Dec 1.' 'Passed the House, now in the
 * Senate. It can still be changed.' 'Became law on July 12, 2026. It can no longer be changed.' Keep it to one line
 * where possible, two at most. The full step-by-step history stays folded."
 *
 * It says nothing new: each part is a shorter form of a sentence lib/changes/window.ts already worked out from the
 * official record (`where`, `state`, and a hearing only when its date was confirmed against the chamber's own
 * calendar, which is what `hearingAt` means). Pure (one type import), so node's test runner loads it.
 */
import type { BillWindow } from "./types.ts";

type W = Pick<BillWindow, "place" | "state" | "where" | "changes" | "hearing" | "hearingAt" | "chamber">;

const firstSentence = (text: string) => { const m = text.trim().match(/^.*?[.!?](?=\s|$)/); return (m ? m[0] : text.trim()).trim(); };

/** Where the bill is, in a few words. */
export function shortWhere(w: Pick<W, "place" | "where" | "chamber">): string {
  const where = w.where.trim();
  if (w.place === "committee" || w.place === "hearing_scheduled") {
    // The chamber as the record gives it; a committee's own name does not always say ("Committee on Natural Resources").
    const chamber = w.chamber?.trim() || where.match(/\b(House|Senate)\b/)?.[1];
    return chamber ? `In a ${chamber} committee.` : "In committee.";
  }
  const stalledThere = where.match(/^Passed the ([A-Z][\w ]*?)(?: on [^.]+)?\. The ([A-Z][\w ]*?) has it, but\b/);
  if (stalledThere) return `Passed the ${stalledThere[1]}, now stalled in the ${stalledThere[2]}.`;
  const moved = where.match(/^Passed (the [A-Z][\w ]*?|one chamber)(?: on [^.]+)?\. The ([\w ]+?) has it now\./);
  if (moved) return `Passed ${moved[1]}, now in the ${moved[2]}.`;
  const stalled = where.match(/^Stalled(?: on the ([A-Z]\w+) floor)?/);
  if (stalled) return stalled[1] ? `Stalled on the ${stalled[1]} floor.` : "Stalled.";
  if (/^The .*Congress ended\b/.test(where)) return "Congress ended before it became law.";
  if (/^Did not pass both chambers before the session ended\b/.test(where)) return "Did not pass before the session ended.";
  const filed = where.match(/^Filed for .+?, which opens ([^.]+)\./);
  if (filed) return `Filed for the session that opens ${filed[1]}.`;
  return firstSentence(where);
}

/** Whether it can still be changed, in one short sentence. */
export function shortChange(w: Pick<W, "state" | "changes">): string {
  if (w.state === "open") return "It can still be changed.";
  if (w.state === "not_open_yet") return "It cannot be changed yet.";
  if (w.state === "closed") return "It can no longer be changed.";
  return /^It is not moving\b/.test(w.changes) ? "It can be changed only if it is taken up again." : "It can be changed only in a narrow way.";
}

/** "Hearing: Tuesday, Dec 1." Only for a meeting whose date was confirmed; null otherwise. */
export function shortHearing(w: Pick<W, "hearing" | "hearingAt">): string | null {
  if (!w.hearingAt) return null;
  const at = new Date(w.hearingAt);
  if (Number.isNaN(at.getTime())) return null;
  const zone = /\bCentral\b/.test(w.hearing) ? "America/Chicago" : "America/New_York";
  const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "short", day: "numeric" }).format(at);
  const what = /\bmarkup\b/i.test(w.hearing) ? "Vote on changes" : /\bhearing\b/i.test(w.hearing) ? "Hearing" : "Committee meeting";
  return `${what}: ${day}.`;
}

/** The whole line. */
export function standsLine(w: W): string {
  return [shortWhere(w), shortChange(w), shortHearing(w)].filter(Boolean).join(" ");
}
