/**
 * Which email addresses unlock the office dashboard, and what each one proves (owner, 18 Nov 2026, point 7:
 * "unlocked by verifying an official government email ... list the domains you use").
 *
 * ONE list, written to be read: OFFICE_DOMAINS. Pure: no imports, no database, no network; tested in
 * tests/office.test.mjs. The database side (which senator a Senate address names, which member an address on file
 * belongs to) is lib/office/store.ts.
 *
 * What an address proves comes in two strengths:
 *   - it names ONE office: the dashboard opens as soon as the emailed link is used;
 *   - it names only the chamber the person works for: the person says which member, and the editor confirms before
 *     anything is shown ("review").
 * The rule is the same for every member and every party. Nothing here reads a party.
 */

export type OfficeRuleId = "us-senate-office" | "us-senate" | "us-house" | "tx-senate" | "tx-house";

export type OfficeDomainRule = {
  id: OfficeRuleId;
  /** The domain as a person would write it. */
  domain: string;
  level: "federal" | "state"; chamber: "upper" | "lower";
  /** The state of a state legislature; null for Congress. */
  state: string | null;
  /** The body the address belongs to, in plain words. */
  body: string;
  /** What an address on this domain proves. */
  proves: string;
  /** What it does not prove. Empty when the address names one office. */
  doesNotProve: string;
  /** What happens next. */
  then: string;
  /** true: the address itself names one office. false: the person picks the member and the editor confirms. */
  namesOffice: boolean;
};

const PICK = "The person chooses the member they work for. The editor confirms it before the dashboard opens.";

export const OFFICE_DOMAINS: readonly OfficeDomainRule[] = [
  { id: "us-senate-office", domain: "<senator>.senate.gov", level: "federal", chamber: "upper", state: null, body: "U.S. Senate", namesOffice: true,
    proves: "The address is in one senator's own office. The part before senate.gov is the name of that senator's official website (for example cornyn.senate.gov), and the site matches it against the official website on file for each sitting senator.",
    doesNotProve: "",
    then: "The dashboard for that senator's state opens as soon as the emailed link is used. No review." },
  { id: "us-senate", domain: "senate.gov, and any other <name>.senate.gov", level: "federal", chamber: "upper", state: null, body: "U.S. Senate", namesOffice: false,
    proves: "The person works for the U.S. Senate. An address at senate.gov itself, or at a name that is not a sitting senator's website (a committee or a Senate support office), does not belong to one senator.",
    doesNotProve: "Which senator's office, if any.", then: PICK },
  { id: "us-house", domain: "mail.house.gov", level: "federal", chamber: "lower", state: null, body: "U.S. House of Representatives", namesOffice: false,
    proves: "The person works for the U.S. House. Members' offices, committees and House support offices all use this one domain, and an address is the person's own name.",
    doesNotProve: "Which member's office.", then: PICK },
  { id: "tx-senate", domain: "senate.texas.gov", level: "state", chamber: "upper", state: "TX", body: "Texas Senate", namesOffice: false,
    proves: "The person works for the Texas Senate. Addresses are usually the person's own name (first.last), and staff of every senator and committee share the domain.",
    doesNotProve: "Which senator's office.",
    then: `${PICK} One exception: a link sent to the senator's own official address, as the official record lists it, opens that senator's dashboard without review.` },
  { id: "tx-house", domain: "house.texas.gov", level: "state", chamber: "lower", state: "TX", body: "Texas House of Representatives", namesOffice: false,
    proves: "The person works for the Texas House. Addresses are usually the person's own name (first.last), and staff of every representative and committee share the domain.",
    doesNotProve: "Which representative's office.",
    then: `${PICK} One exception: a link sent to the representative's own official address, as the official record lists it, opens that representative's dashboard without review.` },
];

export const officeRule = (id: OfficeRuleId): OfficeDomainRule => OFFICE_DOMAINS.find(r => r.id === id)!;

/** A full address in lower case, or null. Stricter than a reader's sign-in: the part after the @ must be a plain host name. */
export function officeEmail(raw: unknown): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  return /^[^\s@"<>(),;:\\]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(e) && e.length <= 254 ? e : null;
}
export const domainOf = (email: string) => email.slice(email.lastIndexOf("@") + 1);

/**
 * The part of the list a domain falls under, before any lookup: which chamber it is, and for a Senate address the name
 * in front of senate.gov. Null: the domain is not on the list and the address is refused.
 * Exact matches only: "mail.house.gov.example.com", "notsenate.gov" and "x.mail.house.gov" are refused.
 */
export type DomainMatch = { ruleId: Exclude<OfficeRuleId, "us-senate-office">; senateLabel: string | null };
export function matchDomain(domain: string): DomainMatch | null {
  const d = domain.trim().toLowerCase();
  if (d === "mail.house.gov") return { ruleId: "us-house", senateLabel: null };
  if (d === "senate.texas.gov") return { ruleId: "tx-senate", senateLabel: null };
  if (d === "house.texas.gov") return { ruleId: "tx-house", senateLabel: null };
  if (d === "senate.gov") return { ruleId: "us-senate", senateLabel: null };
  const m = d.match(/^([a-z0-9]([a-z0-9-]*[a-z0-9])?)\.senate\.gov$/);
  if (m && m[1] !== "www") return { ruleId: "us-senate", senateLabel: m[1] };
  return null;
}

/** "https://www.cornyn.senate.gov/contact" → "cornyn". Null when the address is not a senator's own site on senate.gov. */
export function senateSiteLabel(officialUrl: string | null | undefined): string | null {
  if (!officialUrl) return null;
  let host: string;
  try { host = new URL(officialUrl).hostname.toLowerCase(); } catch { return null; }
  const m = host.replace(/^www\./, "").match(/^([a-z0-9]([a-z0-9-]*[a-z0-9])?)\.senate\.gov$/);
  return m && m[1] !== "www" ? m[1] : null;
}

/** What the official record on file says about one address. Filled in by lib/office/store.ts. */
export type OfficeFacts = {
  /** The sitting senator whose own website name is the name in front of senate.gov ("fed:<id>"), if there is one. */
  senatorForLabel: string | null;
  /** The member, in the chamber the domain belongs to, whose own official address on file is exactly this address. */
  memberForAddress: string | null;
};
export type OfficeProof = { proven: true; memberKey: string; ruleId: OfficeRuleId; how: "senate_office_domain" | "members_own_address" } | { proven: false; ruleId: OfficeRuleId };

/** Does the address itself name one office? If not, the person picks the member and the account waits for the editor. */
export function officeProof(match: DomainMatch, facts: OfficeFacts): OfficeProof {
  if (match.ruleId === "us-senate" && match.senateLabel && facts.senatorForLabel) return { proven: true, memberKey: facts.senatorForLabel, ruleId: "us-senate-office", how: "senate_office_domain" };
  if (facts.memberForAddress) return { proven: true, memberKey: facts.memberForAddress, ruleId: match.ruleId, how: "members_own_address" };
  return { proven: false, ruleId: match.ruleId };
}

/**
 * The status of an account once its emailed link has been used. "active" only when the address names the office the
 * account is for; otherwise "review" until the editor confirms.
 */
export function statusOnConfirm(accountMemberKey: string, proof: OfficeProof): "active" | "review" {
  return proof.proven && proof.memberKey === accountMemberKey ? "active" : "review";
}

/** Plain words for the editor: why this account is, or is not, waiting. */
export function proofLine(proof: OfficeProof): string {
  if (!proof.proven) return `${officeRule(proof.ruleId).proves} It does not prove: ${officeRule(proof.ruleId).doesNotProve.replace(/\.$/, "").toLowerCase()}.`;
  return proof.how === "senate_office_domain" ? "The address is on this senator's own office domain." : "The address is this member's own official address, as the official record lists it.";
}
