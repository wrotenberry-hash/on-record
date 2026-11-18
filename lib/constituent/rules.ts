/**
 * Resident voting (owner, 18 Nov 2026; docs/CONSTITUENT_VOICE.md): the rules as pure functions. No database, no
 * network. The database side is lib/constituent/store.ts; both are tested in tests/constituent.test.mjs.
 *
 * Residents answer Support, Oppose or Unsure on a bill. A single answer is private. An answer that counts is added,
 * without a name, to totals that anyone can see. Whether it counts is decided here, each time totals are rebuilt.
 */
import type { Districts } from "../verify/residence.ts";

export type Answer = "support" | "oppose" | "unsure";
export const ANSWERS: readonly Answer[] = ["support", "oppose", "unsure"];
export const REASON_MAX = 280;

/* ───────────────────────────── The promise ───────────────────────────── */

/** Owner's wording, 18 Nov 2026. It replaces "Only you see this. It is never shown to anyone else or added up into a poll." */
export const PROMISE = "Your individual vote is private. Counted votes are added into anonymous totals.";
export const NOT_SCIENTIFIC = "Not a scientific poll.";
export const NOT_ENOUGH_DISTRICT = "Not enough constituents yet — share this bill.";
export const NOT_ENOUGH = "Not enough voters yet.";

/* ───────────────────────────── Tiers, named honestly ───────────────────────────── */

/**
 * "address": address-matched. A text-message code, and a home address the official geocoder placed. Never called "verified".
 * "mail": mail-verified. Address-matched plus a code from a postcard mailed to that address.
 * "phone": a text-message code only. Can read, follow and save a private position; counted in no total.
 */
export type Tier = "none" | "phone" | "address" | "mail";
export const TIER_NAME: Record<Tier, string> = { none: "Visitor", phone: "Phone confirmed", address: "Address-matched", mail: "Mail-verified" };
export const TIER_MEANS: Record<Tier, string> = {
  none: "You can read, follow and save a private position. Your answers are not counted in any total.",
  phone: "You can read, follow and save a private position. Your answers are not counted in any total until your home address is matched.",
  address: "Your answers count in the totals for where you live, in the address-matched group.",
  mail: "Your answers count in the totals for where you live, in the mail-verified group.",
};
export type CountedTier = "mail" | "address";
export const COUNTED_TIERS: readonly CountedTier[] = ["mail", "address"]; // mail-verified first, wherever both are shown

export function tierOf(a: { emailVerifiedAt: number | null; phoneVerifiedAt: number | null; hasHome: boolean; mailVerified: boolean } | null | undefined): Tier {
  if (!a || !a.emailVerifiedAt || !a.phoneVerifiedAt) return "none";
  if (!a.hasHome) return "phone";
  return a.mailVerified ? "mail" : "address";
}

/* ───────────────────────────── Jurisdiction ───────────────────────────── */

export type Jurisdiction = { code: string; level: "federal" | "state" };
export const FEDERAL: Jurisdiction = { code: "US", level: "federal" };
const STATE_NAMES: Record<string, string> = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "the District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
const TERRITORY_NAMES: Record<string, string> = { PR: "Puerto Rico", GU: "Guam", VI: "the U.S. Virgin Islands", AS: "American Samoa", MP: "the Northern Mariana Islands" };
export const isState = (code: string | null | undefined) => !!code && code in STATE_NAMES;
export const isTerritory = (code: string | null | undefined) => !!code && code in TERRITORY_NAMES;
export const placeName = (code: string) => STATE_NAMES[code] ?? TERRITORY_NAMES[code] ?? code;
export const TERRITORIES_SCOPE = "US-TERR";

/**
 * May a person whose home is in `homeState` weigh in on a bill of this jurisdiction?
 * Federal: any state or DC; a territory too, counted as its own group. State bill: that state only.
 * "unknown": no home address on the account, so nothing can be said either way (a private position can still be saved).
 */
export type Standing = "eligible" | "territory" | "outside" | "unknown";
export function standing(j: Jurisdiction, homeState: string | null | undefined): Standing {
  if (!homeState) return "unknown";
  if (j.level === "federal") return isState(homeState) ? "eligible" : isTerritory(homeState) ? "territory" : "outside";
  return homeState === j.code ? "eligible" : "outside";
}
/** The plain line shown in place of the vote buttons to someone outside the bill's jurisdiction. */
export function whoCanWeighIn(j: Jurisdiction): string {
  return j.level === "federal" ? "People who live in a U.S. state, the District of Columbia or a U.S. territory can weigh in on this bill. You can still read it and see the totals."
    : `People who live in ${placeName(j.code)} can weigh in on this bill. You can still read it and see the totals.`;
}

/* ───────────────────────────── Does an answer count, and where ───────────────────────────── */

export const ACCOUNT_MIN_AGE_MS = 24 * 3600 * 1000;
export type VoteFacts = {
  answer: Answer;
  /** false: given before the promise changed, and the reader has not chosen to count it. */
  consent: boolean; tier: Tier; accountCreatedAt: number | null;
  /** The districts the account lived in when this answer first had a home. Never updated by a later move. */
  home: Districts | null; quarantined: boolean; held: boolean;
};
export type NotCounted = "no_consent" | "not_address_matched" | "too_new" | "no_home" | "outside_jurisdiction" | "under_review";
export function voteCounts(v: VoteFacts, j: Jurisdiction, now: number): { counts: true; tier: CountedTier; scopes: string[] } | { counts: false; why: NotCounted } {
  if (!v.consent) return { counts: false, why: "no_consent" };
  if (v.tier !== "address" && v.tier !== "mail") return { counts: false, why: "not_address_matched" };
  if (v.accountCreatedAt === null || now - v.accountCreatedAt < ACCOUNT_MIN_AGE_MS) return { counts: false, why: "too_new" };
  if (!v.home) return { counts: false, why: "no_home" };
  const s = standing(j, v.home.state);
  if (s !== "eligible" && s !== "territory") return { counts: false, why: "outside_jurisdiction" };
  if (v.quarantined || v.held) return { counts: false, why: "under_review" };
  return { counts: true, tier: v.tier, scopes: scopesFor(j, v.home) };
}

/**
 * The totals an answer is added to: one of each kind, never two.
 * Federal bill: the nation (the states and DC), the state, the congressional district. A territory resident is counted
 * in the territories group, the territory and its district instead of the nation.
 * State bill: the state, the state senate district, the state house district.
 */
export function scopesFor(j: Jurisdiction, home: Districts): string[] {
  if (j.level === "federal") return [isTerritory(home.state) ? TERRITORIES_SCOPE : "US", home.state, home.congressional];
  return [home.state, home.stateUpper, home.stateLower].filter((x): x is string => !!x);
}

export type Counts = { support: number; oppose: number; unsure: number };
export const voters = (c: Counts | null | undefined) => (c ? c.support + c.oppose + c.unsure : 0);
/** One bill's totals, keyed "scope|tier". */
export function tally(rows: readonly VoteFacts[], j: Jurisdiction, now: number): Map<string, Counts> {
  const out = new Map<string, Counts>();
  for (const r of rows) {
    const c = voteCounts(r, j, now);
    if (!c.counts) continue;
    for (const scope of c.scopes) {
      const k = `${scope}|${c.tier}`, t = out.get(k) ?? { support: 0, oppose: 0, unsure: 0 };
      t[r.answer]++; out.set(k, t);
    }
  }
  return out;
}

/* ───────────────────────────── What may be shown ───────────────────────────── */

export const MIN_SHOWN = 25;
/** A group this small is not broken out by answer: with one or two voters the numbers would give their answers away. */
export const MIN_GROUP = 5;
export type ScopeTotals = { mail: Counts | null; address: Counts | null };
export type ShownGroup = { tier: CountedTier; label: string; voters: number; counts: Counts | null };
export type Shown = { show: true; voters: number; groups: ShownGroup[]; label: string } | { show: false; message: string };

/**
 * A total is shown only from 25 counted voters, mail-verified and address-matched together. Then each group is listed
 * separately, mail-verified first, with its number of voters; a group of fewer than 5 shows its size only.
 */
export function shownTotals(t: ScopeTotals | null | undefined, kind: "nation" | "state" | "district" | "members"): Shown {
  const all = voters(t?.mail) + voters(t?.address);
  if (all < MIN_SHOWN) return { show: false, message: kind === "district" ? NOT_ENOUGH_DISTRICT : NOT_ENOUGH };
  const groups = COUNTED_TIERS.map(tier => ({ tier, c: t?.[tier] ?? null })).filter(g => voters(g.c) > 0)
    .map(g => ({ tier: g.tier, label: TIER_NAME[g.tier], voters: voters(g.c), counts: voters(g.c) >= MIN_GROUP ? g.c : null }));
  return { show: true, voters: all, groups, label: NOT_SCIENTIFIC };
}
/** "Mail-verified, 31 voters: 20 support · 9 oppose · 2 unsure" or "Mail-verified: fewer than 5 voters". */
export function groupLine(g: ShownGroup): string {
  return g.counts ? `${g.label}, ${g.voters} voters: ${g.counts.support} support · ${g.counts.oppose} oppose · ${g.counts.unsure} unsure` : `${g.label}: fewer than ${MIN_GROUP} voters`;
}

/** One place's total as a single line, for beside a legislator's vote: the two groups, mail-verified first, or the not-enough line. */
export function scopeLine(scope: string, t: ScopeTotals | null | undefined, kind: "nation" | "state" | "district" = "district"): string {
  const s = shownTotals(t, kind);
  return s.show ? `${scope}, ${s.voters} voters: ${s.groups.map(groupLine).join("; ")}` : `${scope}: ${s.message}`;
}

/* ───────────────────────────── A legislator's own district ───────────────────────────── */

/**
 * The total that stands beside a legislator's vote: a U.S. senator's state, a U.S. representative's district, a state
 * senator's or state representative's district. `district` is the number as the record gives it (null or 0: at large).
 */
export function scopeForMember(m: { level: "federal" | "state"; chamber: "upper" | "lower"; state: string; district: string | number | null }): string {
  const st = m.state.toUpperCase(), n = m.district === null || m.district === "" ? null : String(m.district).replace(/^0+(?=\d)/, "");
  if (m.level === "federal") return m.chamber === "upper" ? st : `${st}-${!n || n === "0" ? "AL" : n.padStart(2, "0")}`;
  return `${st}-${m.chamber === "upper" ? "SD" : "HD"}-${n ?? ""}`;
}

/* ───────────────────────────── Earlier answers ───────────────────────────── */

/** Answers given under the old promise stay uncounted until the reader chooses, once, on their next visit. */
export function legacyPrompt(pending: number, choice: "count" | "private" | null): string | null {
  if (!pending || choice) return null;
  return `You answered ${pending} bill${pending === 1 ? "" : "s"} before answers were added into totals. Those answers were private, and still are. Do you want them counted in the anonymous totals from now on?`;
}
