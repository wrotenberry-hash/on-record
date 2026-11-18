/**
 * Associations (owner, 18 Nov 2026; docs/CONSTITUENT_VOICE.md point 9): "May see totals only for their own verified
 * members, aggregates only." The rules as pure functions: no database, no network. The database side is
 * lib/associations/store.ts; both are tested in tests/associations.test.mjs.
 *
 * An association is made by the editor. Readers join it with a code. Its administrator sees, for each bill on which at
 * least 25 of its members have a counted answer, how many said Support, Oppose and Unsure, and nothing else: no list of
 * members, no place smaller than the whole membership, nothing about one person.
 *
 * "Their own verified members" is read as: members whose answer counts under the site's own rule (`voteCounts` in
 * lib/constituent/rules.ts). In words a person reads they are "counted members", because an address-matched account is
 * never called "verified".
 */
import { BRAND } from "../brand.ts";
import { groupLine, MIN_GROUP, MIN_SHOWN, NOT_SCIENTIFIC, shownTotals, voteCounts, type Counts, type Jurisdiction, type ScopeTotals, type ShownGroup, type VoteFacts } from "../constituent/rules.ts";

/* ───────────────────────────── The switch ───────────────────────────── */

/** Off unless ASSOCIATIONS_ENABLED is exactly "1". Off: no join form, no association page, no editor form. */
export const ASSOCIATIONS_FLAG = "ASSOCIATIONS_ENABLED";
export const associationsOn = (value: string | undefined | null) => (value ?? "").trim() === "1";

/* ───────────────────────────── Name, address of the page, status ───────────────────────────── */

export const NAME_MIN = 3, NAME_MAX = 80;
/** The name as typed, with runs of spaces closed up. Null when it is too short or too long. */
export function cleanName(raw: unknown): string | null {
  const t = String(raw ?? "").replace(/\s+/g, " ").trim();
  return t.length >= NAME_MIN && t.length <= NAME_MAX ? t : null;
}
/** "Texas Nurses' Association" → "texas-nurses-association". Letters and digits only; never empty. */
export function slugFor(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "") || "association";
}
/** The slug itself when it is free, else the first of slug-2, slug-3 … that is. */
export function freeSlug(base: string, taken: { has(s: string): boolean }): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export type AssociationStatus = "pending" | "active" | "closed";
/**
 * pending → active → closed, or pending → closed. Closed is final: closing removes every membership, so there is
 * nothing to reopen. Only an active association takes new members or shows totals.
 */
export function canMove(from: AssociationStatus, to: AssociationStatus): boolean {
  return (from === "pending" && (to === "active" || to === "closed")) || (from === "active" && to === "closed");
}
export const STATUS_WORD: Record<AssociationStatus, string> = { pending: "Not open yet", active: "Open", closed: "Closed" };

/* ───────────────────────────── The join code ───────────────────────────── */

/** No 0 or O, no 1, I or L: nothing that is misread when a code is passed on by hand. 31 characters. */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 10;
/** Ten characters, written "ABCDE-FGHJK". Each character is drawn evenly: bytes of 248 and above are thrown away. */
export function makeJoinCode(random: (n: number) => Uint8Array = n => crypto.getRandomValues(new Uint8Array(n))): string {
  let out = "";
  while (out.length < JOIN_CODE_LENGTH) for (const b of random(JOIN_CODE_LENGTH * 2)) if (b < 248 && out.length < JOIN_CODE_LENGTH) out += JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}
/** What is hashed: capitals, no spaces or dashes. "abcde fghjk" and "ABCDE-FGHJK" are one code. Null when it cannot be a code. */
export function normaliseJoinCode(raw: unknown): string | null {
  const c = String(raw ?? "").toUpperCase().replace(/[\s-]+/g, "");
  return c.length === JOIN_CODE_LENGTH && [...c].every(ch => JOIN_CODE_ALPHABET.includes(ch)) ? c : null;
}

/* ───────────────────────────── Sign-in for an administrator ───────────────────────────── */

export const ASSOC_LINK_TTL_MS = 30 * 60 * 1000;
export const ASSOC_SESSION_MS = 7 * 24 * 3600 * 1000;
/** Said after every request for a link, whether or not the address is on a list, so the form tells no one who is. */
export const LINK_REQUESTED = "If that address is listed as an administrator of an association, a sign-in link is on its way. The link works once, for 30 minutes.";
export const LINK_BAD_EMAIL = "Enter a full email address.";
export const LINK_TOO_MANY = "Too many requests from here. Try again in an hour.";
export const LINK_EXPIRED = "That sign-in link has expired or was already used. Ask for a new one below.";

export function signInEmail(associationName: string, link: string): { subject: string; text: string } {
  return { subject: `Your ${BRAND.name} sign-in link for ${associationName}`, text: [`Tap to open the totals for ${associationName} on ${BRAND.name}:`, "", link, "",
    "The link works once, for 30 minutes. If you did not ask for it, ignore this email; nothing changes.", "",
    `You will see totals only: how many counted members of ${associationName} said Support, Oppose or Unsure on a bill, from ${MIN_SHOWN} counted members. Never a name, and never one person's answer. ${NOT_SCIENTIFIC}`].join("\n") };
}

/* ───────────────────────────── What a member is told, and what the association is told ───────────────────────────── */

/** On the Account page, beside the join form. */
export const WHAT_AN_ASSOCIATION_SEES = `An association you join is shown totals only: how many of its counted members said Support, Oppose or Unsure on a bill, and only when at least ${MIN_SHOWN} of them have answered. `
  + "It is never shown your name, your email, whether you joined, or your own answer. Your answer is added only if it counts on the site: your account is address-matched or mail-verified, you live inside the bill's jurisdiction, "
  + "your account is at least 24 hours old, and nothing is under review. You can leave at any time.";
/** On the association's own page. */
export const WHAT_IS_COUNTED = `A bill is listed once at least ${MIN_SHOWN} counted members have answered it. A counted member has an address-matched or mail-verified account, lives inside the bill's jurisdiction, `
  + `has had the account for at least 24 hours, and has nothing under review. Mail-verified members are listed first. A group of fewer than ${MIN_GROUP} is shown by size only. `
  + "There is no list of members, no breakdown by place, and no way to see one person's answer.";

export const JOIN_NO_MATCH = "That code did not match an association. Check it and try again.";
export const JOIN_NOT_OPEN = "That association is not open to new members right now.";
export const JOIN_TOO_MANY = "Too many tries. Try again tomorrow.";
export const joinedMessage = (name: string) => `You joined ${name}.`;
export const alreadyMessage = (name: string) => `You are already a member of ${name}.`;
export const leftMessage = (name: string) => `You left ${name}. Your answers are no longer in its totals.`;

/** The number of members is shown only from 25. Below that the page says so and gives no number. */
export function memberCountLine(shownCount: number | null): string {
  return shownCount !== null && shownCount >= MIN_SHOWN ? `${shownCount} members have joined.` : `Fewer than ${MIN_SHOWN} members have joined so far.`;
}

/* ───────────────────────────── Totals for an association's members ───────────────────────────── */

/**
 * One bill's member totals: each member whose answer counts is added once, to the mail-verified or the address-matched
 * group. The rule is the site's own (`voteCounts`); nothing is decided here. There is no place in the result: a member
 * total is for the whole membership, never for a district.
 */
export function tallyMembers(rows: readonly VoteFacts[], j: Jurisdiction, now: number): ScopeTotals {
  const t: ScopeTotals = { mail: null, address: null };
  for (const r of rows) {
    const c = voteCounts(r, j, now);
    if (!c.counts) continue;
    const g: Counts = t[c.tier] ?? { support: 0, oppose: 0, unsure: 0 };
    g[r.answer]++; t[c.tier] = g;
  }
  return t;
}

const FEDERAL_TYPES: Record<string, string> = { hr: "H.R.", s: "S.", hres: "H.Res.", sres: "S.Res.", hjres: "H.J.Res.", sjres: "S.J.Res.", hconres: "H.Con.Res.", sconres: "S.Con.Res." };
export const federalLabel = (billType: string, number: number) => `${FEDERAL_TYPES[billType] ?? billType.toUpperCase()} ${number}`;

export type BillLabel = { label: string; title: string; url: string | null };
/** One bill as the association sees it. `groups` come from `shownTotals`: mail-verified first, a group under 5 without its answers. */
export type ViewRow = { billKey: string; label: string; title: string; url: string | null; voters: number; groups: ShownGroup[] };

/**
 * The whole of what an association may see: the bills with at least 25 counted member voters, each through
 * `shownTotals`. A bill below 25 is not in the list at all. The page and the file to download are both made from this
 * list and from nothing else.
 */
export function viewRows(totals: ReadonlyMap<string, ScopeTotals>, labels: ReadonlyMap<string, BillLabel>): ViewRow[] {
  const rows: ViewRow[] = [];
  for (const [billKey, t] of totals) {
    const s = shownTotals(t, "members");
    if (!s.show) continue;
    const l = labels.get(billKey);
    rows.push({ billKey, label: l?.label ?? billKey, title: l?.title ?? "", url: l?.url ?? null, voters: s.voters, groups: s.groups });
  }
  return rows.sort((a, b) => b.voters - a.voters || a.billKey.localeCompare(b.billKey));
}
/** The lines under a bill on the page: "Mail-verified, 31 voters: 20 support · 9 oppose · 2 unsure". */
export const rowLines = (r: ViewRow): string[] => r.groups.map(groupLine);

/* ───────────────────────────── The file to download ───────────────────────────── */

export const CSV_HEADER = ["bill", "official_title", "voters_on_this_bill", "group", "group_voters", "support", "oppose", "unsure", "note"] as const;
export const CSV_FILE = "association-totals.csv";
/** A cell that starts with =, +, - or @ would be run as a formula by a spreadsheet: it gets a leading apostrophe. Quotes are doubled. */
function cell(v: string | number): string {
  const s = typeof v === "number" ? String(v) : /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/**
 * The same totals as the page, one line for each group of each bill, and nothing more. A group of fewer than 5 has
 * "fewer than 5" for its size and empty cells for its answers, exactly as the page shows it.
 */
export function totalsCsv(rows: readonly ViewRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) for (const g of r.groups) lines.push([r.label, r.title, r.voters, g.label, g.counts ? g.voters : `fewer than ${MIN_GROUP}`,
    g.counts ? g.counts.support : "", g.counts ? g.counts.oppose : "", g.counts ? g.counts.unsure : "", NOT_SCIENTIFIC].map(cell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
