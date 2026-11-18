/**
 * One person, one residence (owner instruction, 18 Nov 2026). The rules, in one place, as pure functions:
 * no database, no network. The database side is lib/verify/residence-store.ts; both are tested in tests/residence.test.mjs.
 *
 *   1. One account per phone number (only a keyed hash is kept). After an account is deleted its number cannot be
 *      attached to a new account for 90 days.
 *   2. One active home address per account. A new address replaces the old one, at most once every 90 days. So an
 *      account is in exactly one congressional district, one state senate district and one state house district.
 *   3. At most 6 counted accounts per normalized address. Where the official address database shows several units, a
 *      unit number is required. Over the cap, an account can read and follow but is not counted until reviewed.
 *   4. A mailed code is redeemed once, by the account it was sent for. Redeeming it removes mail-verified status from
 *      any other account verified at a different address with the same phone hash.
 *   5. Signals for review (set aside, never deleted): one device or network setting up accounts at many addresses, a
 *      cluster of new accounts in one district right before a vote, repeated address changes.
 *   6. An answer counts in the districts the account lived in when the answer first had a home. A later move does not
 *      carry it along.
 */
const DAY = 86400e3;

export const RESIDENCE = {
  changeEveryMs: 90 * DAY, phoneHoldMs: 90 * DAY, householdCap: 6, mailCodeTtlMs: 30 * DAY, postcardsPerAddressYear: 2,
  /** One device setting homes at this many different addresses in 30 days; one network range at this many in 7 days. */
  deviceAddresses: 3, deviceWindowMs: 30 * DAY, networkAddresses: 6, networkWindowMs: 7 * DAY,
  /** The third change of address inside a year, or three refused tries inside 30 days. */
  changesPerYear: 3, changesWindowMs: 365 * DAY, refusedTries: 3, refusedWindowMs: 30 * DAY,
  /** Accounts under 7 days old arriving in one district within 72 hours: at least 10, and at least 5 times the usual rate, with a vote within 7 days. */
  cluster: { windowMs: 3 * DAY, floor: 10, multiple: 5, baselineMs: 28 * DAY, youngMs: 7 * DAY, voteWithinMs: 7 * DAY },
} as const;

export type Districts = { congressional: string; state: string; stateUpper: string | null; stateLower: string | null };
export type HoldKind = "household_cap" | "device_addresses" | "network_addresses" | "district_cluster" | "address_changes";

/* ───────────────────────────── Address normalisation ───────────────────────────── */

const UNIT_WORD = "apartment|apt|unit|suite|ste|room|rm|building|bldg|lot|trailer|trlr|space|spc|floor|fl|number|no";
const UNIT_AT = new RegExp(`(?:,|\\s)\\s*(?:(?:${UNIT_WORD})\\b\\.?|#)\\s*#?\\s*[a-z0-9][a-z0-9 -]*$`, "i");
const clean = (v: string) => v.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** "Apt. 4-B", "#4b", "unit 4 B" are the same unit: letters and digits only, the word for the unit dropped. Empty is no unit. */
export function normaliseUnit(raw: string | null | undefined): string | null {
  const t = clean(String(raw ?? "")).split(" ").filter(w => w && !new RegExp(`^(?:${UNIT_WORD})$`, "i").test(w)).join("");
  return t || null;
}

/** A unit typed at the end of the street line ("1100 Congress Ave Apt 4") is taken off it. A separate unit field wins. */
export function splitUnit(street: string, unit?: string | null): { street: string; unit: string | null } {
  const m = UNIT_AT.exec(street);
  const typed = normaliseUnit(unit);
  if (!m) return { street: street.trim(), unit: typed };
  return { street: street.slice(0, m.index).trim(), unit: typed ?? normaliseUnit(m[0]) };
}

/**
 * The normalized address two accounts share when they live in the same home. `building` is the official form of the
 * street address (the Census Bureau's matched address, or the Postal Service's when that check is on), so "Avenue" and
 * "Ave." are one address; the ZIP is cut to five digits.
 */
export function normaliseResidence(officialAddress: string, unit: string | null | undefined): { building: string; address: string; unit: string | null } {
  const building = clean(officialAddress.replace(/(\d{5})-\d{4}\b/, "$1"));
  const u = normaliseUnit(unit);
  return { building, unit: u, address: u ? `${building} | ${u}` : building };
}

/* ───────────────────────────── 1. Phone ───────────────────────────── */

/** Can this phone hash be attached to this account now? */
export function phoneAvailable(input: { takenByOtherAccount: boolean; heldUntil: number | null; now: number }): { ok: true } | { ok: false; reason: "taken" | "held"; until?: number } {
  if (input.takenByOtherAccount) return { ok: false, reason: "taken" };
  if (input.heldUntil !== null && input.heldUntil > input.now) return { ok: false, reason: "held", until: input.heldUntil };
  return { ok: true };
}
export const phoneHoldUntil = (deletedAt: number) => deletedAt + RESIDENCE.phoneHoldMs;

/* ───────────────────────────── 2. One address, changed at most every 90 days ───────────────────────────── */

export type AddressDecision = { ok: true; kind: "first" | "same" | "change" } | { ok: false; reason: "too_soon"; nextAllowedAt: number };
export function canSetAddress(current: { addressKey: string; setAt: number } | null, nextAddressKey: string, now: number): AddressDecision {
  if (!current) return { ok: true, kind: "first" };
  if (current.addressKey === nextAddressKey) return { ok: true, kind: "same" };
  const nextAllowedAt = current.setAt + RESIDENCE.changeEveryMs;
  return now >= nextAllowedAt ? { ok: true, kind: "change" } : { ok: false, reason: "too_soon", nextAllowedAt };
}

/* ───────────────────────────── 3. Household cap and unit numbers ───────────────────────────── */

/** `countedAtAddress` is how many OTHER accounts already count at this normalized address. */
export function householdDecision(countedAtAddress: number): "counted" | "over_cap" { return countedAtAddress >= RESIDENCE.householdCap ? "over_cap" : "counted"; }

/** What the official address database said. `null` means it was not asked or could not say. */
export type AddressAuthority = { multiUnit: boolean | null; unitConfirmed: boolean | null };
export function unitDecision(authority: AddressAuthority | null, hasUnit: boolean): "ok" | "unit_required" | "unit_not_found" {
  if (!authority) return "ok";
  if (!hasUnit && authority.multiUnit === true) return "unit_required";
  if (hasUnit && authority.unitConfirmed === false) return "unit_not_found";
  return "ok";
}

/**
 * The Postal Service's answer (Addresses API 3.3.1, read 18 Nov 2026) in the terms above. DPVConfirmation: "Y" confirmed
 * for the street number and the unit if one was given; "D" the unit is missing; "S" a unit was given but is not
 * confirmed; "N" not confirmed. Correction code 32: "more information is needed (such as an apartment, suite, or box number)".
 */
export function authorityFromUsps(body: unknown): (AddressAuthority & { found: boolean; standard: string | null }) | null {
  const b = body as { address?: Record<string, unknown>; additionalInfo?: Record<string, unknown>; corrections?: Array<{ code?: unknown }> } | null;
  if (!b || typeof b !== "object" || !b.additionalInfo) return null;
  const dpv = String(b.additionalInfo.DPVConfirmation ?? ""), needsMore = (b.corrections ?? []).some(c => String(c?.code ?? "") === "32");
  const a = b.address ?? {}, part = (k: string) => String(a[k] ?? "").trim();
  const standard = part("streetAddress") ? [part("streetAddress"), part("city"), part("state"), part("ZIPCode")].filter(Boolean).join(", ") : null;
  if (dpv === "D" || (needsMore && dpv !== "Y" && dpv !== "S")) return { found: true, multiUnit: true, unitConfirmed: null, standard };
  if (dpv === "S") return { found: true, multiUnit: true, unitConfirmed: false, standard };
  if (dpv === "Y") return { found: true, multiUnit: part("secondaryAddress") ? true : false, unitConfirmed: part("secondaryAddress") ? true : null, standard };
  if (dpv === "N") return { found: false, multiUnit: null, unitConfirmed: null, standard };
  return null;
}

/* ───────────────────────────── 4. Mailed codes ───────────────────────────── */

export type MailCode = { accountId: string; addressKey: string; expiresAt: number; redeemedAt: number | null };
export type RedeemRefusal = "unknown" | "other_account" | "used" | "expired" | "moved" | "no_phone";
/** A code works once, for the account it was sent for, while that account still lives at the address it was mailed to. */
export function redeemDecision(code: MailCode | null, account: { id: string; addressKey: string | null; phoneHash: string | null }, now: number): { ok: true } | { ok: false; reason: RedeemRefusal } {
  if (!code) return { ok: false, reason: "unknown" };
  if (code.accountId !== account.id) return { ok: false, reason: "other_account" };
  if (code.redeemedAt !== null) return { ok: false, reason: "used" };
  if (now > code.expiresAt) return { ok: false, reason: "expired" };
  if (!account.addressKey || account.addressKey !== code.addressKey) return { ok: false, reason: "moved" };
  if (!account.phoneHash) return { ok: false, reason: "no_phone" };
  return { ok: true };
}
/** The other accounts that lose mail-verified status when this one is verified: same phone hash, a different address. */
export function mailRevocations(existing: ReadonlyArray<{ accountId: string; addressKey: string; phoneHash: string; revokedAt: number | null }>,
  redeemed: { accountId: string; addressKey: string; phoneHash: string }): string[] {
  return existing.filter(v => v.revokedAt === null && v.accountId !== redeemed.accountId && v.phoneHash === redeemed.phoneHash && v.addressKey !== redeemed.addressKey).map(v => v.accountId);
}

/* ───────────────────────────── 5. Signals for review ───────────────────────────── */

export function manyAddressesSignal(kind: "device" | "network", distinctAddresses: number): boolean {
  return distinctAddresses >= (kind === "device" ? RESIDENCE.deviceAddresses : RESIDENCE.networkAddresses);
}
export function addressChangesSignal(input: { changesInYear: number; refusedInMonth: number }): boolean {
  return input.changesInYear >= RESIDENCE.changesPerYear || input.refusedInMonth >= RESIDENCE.refusedTries;
}
/** `recent`: new accounts that arrived in the district in the last 72 hours; `baseline`: the same over the 28 days before. */
export function districtClusterSignal(input: { recent: number; baseline: number; voteSoon: boolean }): boolean {
  const c = RESIDENCE.cluster, usual = input.baseline / (c.baselineMs / c.windowMs);
  return input.voteSoon && input.recent >= c.floor && input.recent >= c.multiple * usual;
}

/* ───────────────────────────── 6. Where an answer counts ───────────────────────────── */

/** An answer keeps the first home it was given. Only an answer with no home yet takes the account's current one. */
export function stampFor<T extends Districts>(existing: T | null, current: T | null): T | null { return existing ?? current; }

// Counting itself (who counts, in which totals, under which tier) is lib/constituent/rules.ts.

/** Plain words for each reason an account is set aside (editor screen, transparency note, the reader's own account page). */
export const HOLD_LABEL: Record<HoldKind, string> = {
  household_cap: "More than six accounts at one address", device_addresses: "One device set up accounts at several addresses",
  network_addresses: "One network set up accounts at many addresses", district_cluster: "Many new accounts in one district just before a vote",
  address_changes: "Repeated address changes",
};
