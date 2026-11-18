/**
 * Mail-verified by postcard (owner, 18 Nov 2026; docs/CONSTITUENT_VOICE.md, point 4): the rules as pure functions.
 * No database, no network, no secret. The database side is lib/mail-verify/store.ts, the sender is
 * lib/mail-verify/sender.ts; all three are tested in tests/mail-verify.test.mjs.
 *
 *   1. The code: 6 characters, from an alphabet with no look-alikes (no 0 or O, no 1, I or L). It is printed on the
 *      postcard. The site keeps only a keyed hash of it. Case, spaces and dashes do not matter when it is typed.
 *   2. It works for 30 days, once, for the account it was sent for, at the address it was mailed to
 *      (lib/verify/residence.ts, `redeemDecision`).
 *   3. A postcard goes only to an account that has a matched home address and is not yet mail-verified there.
 *   4. At most 2 postcards per normalized address in any 365 days.
 *   5. A monthly spending cap: what was spent this month plus the next card must stay at or under it.
 *   6. The offer is made after the reader's third counted answer. It is optional, and costs the reader nothing.
 *
 * The first level is called "address-matched" everywhere. Only the second, after a mailed code, is "mail-verified".
 */
import { RESIDENCE } from "../verify/residence.ts";
import type { Tier } from "../constituent/rules.ts";

const DAY = 86400e3;

export const POSTCARD = {
  codeLength: 6, codeTtlMs: RESIDENCE.mailCodeTtlMs, perAddressYear: RESIDENCE.postcardsPerAddressYear, yearMs: 365 * DAY,
  /** The owner's cap, 18 Nov 2026: "capped at $100 a month until I raise it" (POSTCARD_MONTHLY_CAP_USD). */
  defaultCapUsd: 100,
  /** A second postcard to the same account can be asked for once the first is this old (it may have been lost). */
  askAgainAfterMs: 14 * DAY,
  /** "Prompted after the third counted vote." */
  offerAfterCountedVotes: 3,
} as const;

/* ───────────────────────────── 1. The code ───────────────────────────── */

/** 23 letters and 8 digits. Left out because they are read as each other: 0 and O; 1, I and L. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * A new code. Each character is drawn evenly from the alphabet: a random byte that would favour the first letters is
 * thrown away and drawn again. `random` fills an array with random bytes (the platform's generator unless a test passes its own).
 */
export function newCode(random: (bytes: Uint8Array) => Uint8Array = b => crypto.getRandomValues(b)): string {
  const n = CODE_ALPHABET.length, fair = 256 - (256 % n);
  let out = "";
  while (out.length < POSTCARD.codeLength) for (const b of random(new Uint8Array(16))) if (b < fair && out.length < POSTCARD.codeLength) out += CODE_ALPHABET[b % n];
  return out;
}

/** What the reader typed, as the code that was printed: capitals, no spaces or dashes. Null when it cannot be a code. */
export function normaliseCode(raw: unknown): string | null {
  const t = String(raw ?? "").toUpperCase().replace(/[\s\-_.·]+/g, "");
  return t.length === POSTCARD.codeLength && [...t].every(c => CODE_ALPHABET.includes(c)) ? t : null;
}

/** How the code is printed and shown: two groups of three, "K7M 2QX". */
export const displayCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/* ───────────────────────────── 3–5. May this postcard be sent? ───────────────────────────── */

/**
 * "off": the switch is off; nothing is shown, written or sent. "mock": a rehearsal; a row is written, nothing is mailed
 * and nothing is charged. "live": a real vendor mails the card. "not_ready": a vendor is named but something it needs
 * is missing, so nothing is shown, written or sent.
 */
export type PostcardMode = "off" | "mock" | "live" | "not_ready";
export type PostcardStatus = "queued" | "mock" | "sent" | "failed";

/** The cards that count toward the limits. A failed card was never mailed. A rehearsal card counts only in a rehearsal. */
export function countsTowardLimits(status: string, mode: PostcardMode): boolean {
  return status === "queued" || status === "sent" || (status === "mock" && mode === "mock");
}

/** At most 2 postcards to one address in any 365 days. `cardTimes`: when each card that counts was requested. */
export function addressLimit(cardTimes: readonly number[], now: number): { ok: true } | { ok: false; nextAllowedAt: number } {
  const inYear = cardTimes.filter(t => t > now - POSTCARD.yearMs).sort((a, b) => a - b);
  if (inYear.length < POSTCARD.perAddressYear) return { ok: true };
  // The next card is allowed when enough of the old ones are more than a year back.
  return { ok: false, nextAllowedAt: inYear[inYear.length - POSTCARD.perAddressYear] + POSTCARD.yearMs };
}

const cents = (usd: number) => Math.round(usd * 100);
/** The monthly cap: what was spent this month plus the next card must stay at or under it. Compared in whole cents. */
export function capAllows(spentThisMonthUsd: number, nextCostUsd: number, capUsd: number): boolean {
  return cents(spentThisMonthUsd) + cents(nextCostUsd) <= cents(capUsd);
}
/** The first instant of the calendar month (UTC) that `now` is in: "this month" for the cap and the editor's counts. */
export function monthStart(now: number): number { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); }
/** The first instant of the month after. */
export function monthEnd(now: number): number { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }

export type RequestRefusal = "off" | "not_ready" | "not_address_matched" | "already_mail_verified" | "no_address" | "under_review" | "already_requested" | "address_limit" | "cap_reached";
export type RequestFacts = {
  mode: PostcardMode;
  /** What the account has confirmed (lib/constituent/rules.ts, `tierOf`): only "address" may ask. */
  tier: Tier;
  /** Is the encrypted home address on file? Without it there is nowhere to mail to. */
  hasAddressOnFile: boolean;
  /** Is the account set aside for review? */
  held: boolean;
  /** When this account last asked for a card to its current address (a card that counts), or null. */
  lastRequestedAt: number | null;
  /** When each card that counts was requested for this normalized address, by any account. */
  cardsAtAddress: readonly number[];
  spentThisMonthUsd: number; nextCostUsd: number; capUsd: number; now: number;
};
export type RequestDecision = { ok: true } | { ok: false; reason: RequestRefusal; until?: number };

/** One answer, checked in this order. Nothing is written and nothing is sent unless it says ok. */
export function requestDecision(f: RequestFacts): RequestDecision {
  if (f.mode === "off") return { ok: false, reason: "off" };
  if (f.mode === "not_ready") return { ok: false, reason: "not_ready" };
  if (f.tier === "mail") return { ok: false, reason: "already_mail_verified" };
  if (f.tier !== "address") return { ok: false, reason: "not_address_matched" }; // a visitor, or an account with only a phone
  if (!f.hasAddressOnFile) return { ok: false, reason: "no_address" };
  if (f.held) return { ok: false, reason: "under_review" };
  if (f.lastRequestedAt !== null && f.now < f.lastRequestedAt + POSTCARD.askAgainAfterMs) return { ok: false, reason: "already_requested", until: f.lastRequestedAt + POSTCARD.askAgainAfterMs };
  const address = addressLimit(f.cardsAtAddress, f.now);
  if (!address.ok) return { ok: false, reason: "address_limit", until: address.nextAllowedAt };
  if (!capAllows(f.spentThisMonthUsd, f.nextCostUsd, f.capUsd)) return { ok: false, reason: "cap_reached" };
  return { ok: true };
}

/* ───────────────────────────── Who sees it, and the offer ───────────────────────────── */

/**
 * A rehearsal is for the editor alone: a reader is never told a postcard is coming when none will be mailed.
 * Readers see the postcard step only when a real vendor is ready.
 */
export function flowVisible(mode: PostcardMode, isEditor: boolean): boolean { return mode === "live" || (mode === "mock" && isEditor); }

/** The one-line offer under the voting box: after the third counted answer, until it is dismissed, asked for, or done. */
export function offerShown(i: { mode: PostcardMode; isEditor: boolean; tier: Tier; countedVotes: number; dismissed: boolean; cardOutstanding: boolean; held: boolean }): boolean {
  return flowVisible(i.mode, i.isEditor) && i.tier === "address" && !i.dismissed && !i.cardOutstanding && !i.held && i.countedVotes >= POSTCARD.offerAfterCountedVotes;
}
export const MAIL_OFFER_COOKIE = "or_mvo";
export const MAIL_OFFER_MAX_AGE_S = 400 * 24 * 3600;
export const MAIL_OFFER_LINE = "You have three counted answers. If you like, we can mail a postcard with a code to your home. Type the code in and your account becomes mail-verified. It is optional and free.";

/* ───────────────────────────── What the postcard says ───────────────────────────── */

/**
 * The words on the card. The site holds no name, so the card is addressed to "Current resident". A postcard can be
 * read by anyone who handles it, so it says nothing about bills, answers or politics: only the site's name and the code.
 */
export function postcardLines(i: { siteName: string; code: string; expiresAt: number }): { to: string; lines: string[] } {
  return { to: "Current resident", lines: [`Your code from ${i.siteName}`, displayCode(i.code),
    `Someone at this address asked ${i.siteName} to mail this code. To use it, sign in, open Account, and type it in by ${longDate(i.expiresAt)}.`,
    "If nobody here asked for it, you can throw this card away. The code works for one account only."] };
}

/**
 * The home address as it is stored (one line, written by lib/verify/flow.ts: "street, city, ST ZIP" and " #UNIT" when
 * there is a unit), split into the parts a mailing service asks for. Null when the line is not in that form.
 */
export function splitStoredAddress(line: string | null | undefined): { street: string; unit: string | null; city: string; state: string; zip: string } | null {
  const m = /^(.+),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)(?:\s+#([A-Z0-9]+))?$/.exec(String(line ?? "").trim());
  return m ? { street: m[1].trim(), city: m[2].trim(), state: m[3], zip: m[4], unit: m[5] ?? null } : null;
}

/* ───────────────────────────── What the reader is told ───────────────────────────── */

export const longDate = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

export type MailNote = RequestRefusal | "requested" | "test_requested" | "rate" | "send_failed" | "mail_verified" | "test_matched"
  | "code_format" | "code_wrong" | "code_used" | "code_expired" | "code_moved" | "code_rate" | "no_phone";
/** The notes that report something done; every other note is a refusal. */
export const MAIL_NOTE_OK: readonly MailNote[] = ["requested", "test_requested", "mail_verified", "test_matched"];

/**
 * The fixed line for each outcome. Nothing from the web address is shown as text: the page passes a note name, a time
 * and, in a rehearsal, a code that must be six characters of the alphabet above.
 */
export function mailNote(note: string | null | undefined, at?: number | null, testCode?: string | null): string | null {
  const on = at ? longDate(at) : null, code = normaliseCode(testCode);
  switch (note as MailNote) {
    case "requested": return `A postcard was requested${on ? ` on ${on}` : ""}. It can take about a week. When it arrives, type its code below.`;
    case "test_requested": return `Test mode: no postcard was mailed and nothing was charged.${code ? ` The code a real postcard would carry is ${displayCode(code)}.` : ""}`;
    case "mail_verified": return "Mail-verified. From now on your answers count in the mail-verified group for where you live.";
    case "test_matched": return "Test mode: the code matched. With a real postcard this account would now be mail-verified. Nothing was changed.";
    case "off": return "Postcards are not switched on.";
    case "not_ready": return "Postcards are not ready yet.";
    case "not_address_matched": return "Match your home address first. A postcard can only go to an account with a matched home address.";
    case "already_mail_verified": return "Your account is already mail-verified at this address.";
    case "no_address": return "We could not read the home address on your account. Save your home address again, then ask for a postcard.";
    case "under_review": return "Your account is waiting for a review. You can ask for a postcard once the review clears.";
    case "already_requested": return `A postcard is already on its way. It can take about a week.${on ? ` If it has not arrived, you can ask for one more on ${on}.` : ""}`;
    case "address_limit": return `Two postcards have already been requested for this address in the last year, which is the limit.${on ? ` The next one can be requested on ${on}.` : ""}`;
    case "cap_reached": return "Postcards are paused for the rest of this month. Your account stays address-matched and your answers still count. Try again next month.";
    case "rate": return "Too many requests today. Try again tomorrow.";
    case "send_failed": return "The postcard could not be sent. Try again later.";
    case "code_format": return "Enter the 6 characters from your postcard. The code uses letters and numbers. It never has a zero, a one, or the letters O, I or L.";
    case "code_wrong": return "That code did not match. Check the postcard and try again.";
    case "code_used": return "That code was already used.";
    case "code_expired": return "That code has expired. A code works for 30 days. You can ask for a new postcard.";
    case "code_moved": return "That code was mailed to an address that is no longer the one on your account. Ask for a postcard at your current address.";
    case "code_rate": return "Too many tries today. Try again tomorrow.";
    case "no_phone": return "Confirm your phone first.";
    default: return null;
  }
}

/** Why a code was refused (lib/verify/residence.ts), as a note. A code sent for another account reads the same as a wrong code. */
export function redeemNote(reason: "unknown" | "other_account" | "used" | "expired" | "moved" | "no_phone"): MailNote {
  return reason === "used" ? "code_used" : reason === "expired" ? "code_expired" : reason === "moved" ? "code_moved" : reason === "no_phone" ? "no_phone" : "code_wrong";
}
