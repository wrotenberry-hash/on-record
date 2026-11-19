/**
 * Aggregate social proof (owner, 18 Nov 2026, point 9). Pure; tested in tests/record.test.mjs.
 *
 * Before a reader answers a bill, the voting box may say only HOW MANY counted residents of their own district and
 * state have weighed in, and only once that place has 25 or more (`shownTotals`). It never says how they answered
 * (the split appears after the reader answers, as before), never names anyone, and below 25 it says nothing at all
 * about numbers. "Counted residents" are address-matched and mail-verified residents; the words are the site's own.
 */
import { isTerritory, placeName, shownTotals, type Jurisdiction, type ScopeTotals } from "./rules.ts";

/** A scope as a reader would say it: "TX-37", "Texas", "Texas Senate district 14", "Texas House district 49". */
export function scopeWords(scope: string): string {
  const d = /^([A-Z]{2})-(SD|HD)-(\w+)$/.exec(scope);
  if (d) return `${placeName(d[1]).replace(/^the /, "")} ${d[2] === "SD" ? "Senate" : "House"} district ${d[3]}`;
  return /^[A-Z]{2}$/.test(scope) ? placeName(scope) : scope;
}

/** "312 counted residents of TX-37 have weighed in on this bill." or null below 25. The number is the only thing it carries. */
export function weighedInLine(scope: string, t: ScopeTotals | null | undefined, kind: "state" | "district"): string | null {
  const s = shownTotals(t, kind);
  if (!s.show) return null;
  return `${s.voters.toLocaleString("en-US")} counted residents of ${scopeWords(scope)} have weighed in on this bill.`;
}

/**
 * The lines for one reader on one bill, the district first, then the state. A federal bill: the reader's congressional
 * district and state. A state bill: the reader's two state districts and the state, only for a reader who lives there.
 * Empty when the reader's place is not known, is a territory's own group, or no place has reached 25.
 */
export function socialProof(j: Jurisdiction, place: { state: string; congressional: string | null; stateUpper: string | null; stateLower: string | null } | null | undefined,
  totals: ReadonlyMap<string, ScopeTotals>): string[] {
  if (!place) return [];
  const line = (scope: string | null | undefined, kind: "state" | "district") => { const l = scope ? weighedInLine(scope, totals.get(scope), kind) : null; return l ? [l] : []; };
  if (j.level === "federal") return isTerritory(place.state) ? line(place.congressional, "district") : [...line(place.congressional, "district"), ...line(place.state, "state")];
  if (place.state !== j.code) return [];
  return [...line(place.stateUpper, "district"), ...line(place.stateLower, "district"), ...line(j.code, "state")];
}
