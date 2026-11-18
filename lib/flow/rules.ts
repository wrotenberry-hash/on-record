/**
 * The first 60 seconds: the small rules around the legislators' cards. Where a ZIP code lands, which coming votes are
 * listed first, what the district comparison says, and the time-to-first-answer bucket. Pure; tests/flow.test.mjs.
 */
import { MIN_SHOWN, totalsLine } from "../verify/rules.ts";

/* ------------------------------------------------------------------- the place --- */

/** lib/data/zip-districts.json (built by scripts/build-zip-districts.mjs from the Census relationship file). */
export type ZipTable = { congress: number; districts: Record<string, string> };

/** ZIP → the House districts that hold some of its land, e.g. "78660" → ["TX-10", "TX-17", "TX-35", "TX-37"]. */
export function zipIndex(table: ZipTable): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [district, zips] of Object.entries(table.districts)) for (const z of zips.split(" ")) { if (z) out.set(z, [...(out.get(z) ?? []), district]); }
  for (const v of out.values()) v.sort();
  return out;
}

/**
 * The ZIP table describes one Congress's map. Once a new Congress is seated (and until the table is rebuilt for it) the
 * table must not name a district: a redrawn state would get the wrong representative. Then only the state is known
 * from a ZIP, and the reader chooses a district or adds a street address.
 */
export function zipIndexFor(table: ZipTable, sittingCongress: number): Map<string, string[]> {
  return table.congress === sittingCongress ? zipIndex(table) : new Map();
}

/** The five digits of what was typed ("78701", "78701-1234", " 78701 "), or null. */
export function cleanZip(raw: unknown): string | null {
  const m = String(raw ?? "").trim().match(/^(\d{5})(?:[-\s]?\d{4})?$/);
  return m ? m[1] : null;
}

export type ZipPlace = { state: string; congressional: string | null; choices: string[] };

/**
 * Where a ZIP code is. One district: that district. Several: the reader chooses (never guessed). A ZIP the Census
 * table does not list (a post-office-box ZIP, say) still gives its state from the USPS prefix, with no district.
 * null when the ZIP is not a US ZIP at all.
 */
export function placeForZip(zip: string, index: ReadonlyMap<string, string[]>, stateForPrefix: (zip: string) => string | null): ZipPlace | null {
  const districts = index.get(zip) ?? [], states = [...new Set(districts.map(d => d.split("-")[0]))], byPrefix = stateForPrefix(zip);
  const state = byPrefix && (!states.length || states.includes(byPrefix)) ? byPrefix : states[0] ?? null;
  if (!state) return null;
  return { state, congressional: districts.length === 1 ? districts[0] : null, choices: districts.length > 1 ? districts : [] };
}

/** The Congress whose map a Census geocoder match used ("119th Congressional Districts" → 119), or null. */
export function censusCongress(match: unknown): number | null {
  const geos = (match as { geographies?: Record<string, Array<Record<string, unknown>>> } | null)?.geographies;
  if (!geos) return null;
  const entry = Object.entries(geos).find(([k]) => /Congressional Districts/i.test(k));
  if (!entry) return null;
  const fromRow = Number(entry[1]?.[0]?.["CDSESSN"]), fromName = Number(entry[0].match(/(\d{3})(?:st|nd|rd|th)/i)?.[1]);
  return Number.isInteger(fromRow) && fromRow > 0 ? fromRow : Number.isInteger(fromName) && fromName > 0 ? fromName : null;
}

/** What the reader is told when the place cannot be found. Their typing stays in the form. */
export const PLACE_ERRORS = {
  need_zip: "Enter your 5-digit ZIP code.",
  unknown_zip: "We could not find that ZIP code. Check the five digits.",
  no_match: "The Census Bureau could not place that street address. Check the house number and street name, or clear the street box to use your ZIP code alone.",
  unreachable: "The Census Bureau’s address service did not answer. Try again in a minute, or clear the street box to use your ZIP code alone.",
  closed: "This page is open to invited readers only.",
} as const;
export type PlaceError = keyof typeof PLACE_ERRORS;

/* ------------------------------------------------------------------ what is next --- */

/**
 * The bill record for a bill named on a floor schedule, so a reader can open it and answer before the vote (the same
 * kind of starter record a bill gets when it is first seen in a roll call; the bill step fills in the rest). The House
 * schedule gives the bill's title; the Senate page gives only a sentence around the number, so the number stands in.
 */
export function floorBillStub(item: { billId: string | null; chamber: string; label: string; description: string | null }): { id: string; congress: number; billType: string; number: number; title: string } | null {
  const m = String(item.billId ?? "").match(/^(\d{2,3})-([a-z]+)-(\d+)$/);
  if (!m) return null;
  const described = item.chamber === "house" ? String(item.description ?? "").replace(/\s+/g, " ").trim().replace(/,? as amended$/i, "") : "";
  return { id: m[0], congress: Number(m[1]), billType: m[2], number: Number(m[3]), title: (described || item.label.trim() || m[0]).slice(0, 500) };
}

/** Bills on the reader's chosen issues first, then the rest; the given order (soonest first) is kept inside each group. */
export function orderByIssues<T extends { issues: readonly string[] }>(items: readonly T[], picked: readonly string[]): Array<T & { onIssue: boolean }> {
  const mine = new Set(picked);
  const tagged = items.map(i => ({ ...i, onIssue: i.issues.some(s => mine.has(s)) }));
  return [...tagged.filter(i => i.onIssue), ...tagged.filter(i => !i.onIssue)];
}

/* ---------------------------------------------------------- district comparison --- */

export type CompareState = "off" | "no_district" | "below" | "shown";

/**
 * The line under "See how your district compares" for one bill. A total is shown only from MIN_SHOWN (25) counted
 * answers; below that the reader is told why, never a number. With verification off nothing is counted at all.
 */
export function districtCompareLine(i: { enabled: boolean; district: string | null; totals: { support: number; oppose: number; unsure?: number } | null | undefined }): { state: CompareState; text: string } {
  if (!i.enabled) return { state: "off", text: `Counting is not switched on yet, so no answer is added to a total today. Your individual vote stays private either way. Totals will show once ${MIN_SHOWN} counted residents of your district have answered.` };
  if (!i.district) return { state: "no_district", text: "Pick your House district above to see how your district compares." };
  const n = (i.totals?.support ?? 0) + (i.totals?.oppose ?? 0) + (i.totals?.unsure ?? 0);
  if (n < MIN_SHOWN) return { state: "below", text: "Not enough constituents yet — share this bill." };
  return { state: "shown", text: totalsLine(`In ${i.district}`, i.totals) };
}

/** The small print under the buttons: who sees an answer, and when it counts. True to lib/verify (tier 2 for a district). */
export function answerPrivacyLine(verificationOn: boolean): string {
  return verificationOn
    ? "Your individual vote is private. Counted votes are added into anonymous totals: yours counts once your home address is matched."
    : "Your individual vote is private. Counting is not switched on yet, so no answer is added to a total today.";
}

/* ------------------------------------------------------- time to first weigh-in --- */

export const FIRST_VISIT_COOKIE = "or_first";
export type AnswerBucket = "under_60" | "60_120" | "120_300" | "over_300";

/** Seconds from the first look at the landing form to the first answer, as a bucket. null when the cookie is missing or wrong. */
export function answerBucket(firstSeenSeconds: unknown, nowMs: number): AnswerBucket | null {
  const first = Number(firstSeenSeconds);
  if (!/^\d{9,11}$/.test(String(firstSeenSeconds ?? "")) || !Number.isFinite(first)) return null;
  const s = Math.floor(nowMs / 1000) - first;
  if (s < 0) return null;
  return s < 60 ? "under_60" : s < 120 ? "60_120" : s < 300 ? "120_300" : "over_300";
}
