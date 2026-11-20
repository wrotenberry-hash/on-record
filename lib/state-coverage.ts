/**
 * What a reader outside Texas sees where state content would be (owner, 20 Nov 2026, before invites go outside Texas:
 * "If it shows anything empty or Texas-specific, replace it with one line"). Pure: no database, no network.
 *
 * The site holds one state's legislature (Texas). Congress is covered for every state. A reader whose saved place is
 * in another state is shown this one line in place of state legislators, state hearings and the Texas strip, and is
 * not shown the Texas section in the menu.
 */
export const STATE_COMING = "State coverage starts with Texas. Your state is coming.";
/** The states whose legislature the site covers. Adding a state here is the only change the wording needs. */
export const COVERED_STATES: readonly string[] = ["TX"];

/** "covered": a reader in a covered state. "coming": a reader whose saved place is in another state. "unknown": no place saved yet. */
export type Coverage = "covered" | "coming" | "unknown";
export function stateCoverage(state: string | null | undefined): Coverage {
  const s = String(state ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) return "unknown";
  return COVERED_STATES.includes(s) ? "covered" : "coming";
}
/** From the place cookie's value ("CA|CA-11|||address"): the state is its first part. */
export const coverageFromPlaceCookie = (value: string | null | undefined): Coverage => stateCoverage(String(value ?? "").split("|")[0]);
