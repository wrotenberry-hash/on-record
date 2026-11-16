/**
 * Round J: real-person verification rules. Pure (no imports), tested in
 * tests/verify.test.mjs. Everything that decides whether a position counts
 * lives here so the rules can be read in one place.
 *
 * Tier 0 visitor: private Support/Oppose only, never counted.
 * Tier 1 real person: verified email, bot challenge at sign-up, SMS code on a
 *   mobile number that is not VoIP and not used by another account.
 * Tier 2 district-matched: Tier 1 plus an address the Census geocoder places
 *   in a congressional district.
 * Tier 3 verified constituent (mailed postcard): designed, not built.
 */

export type Tier = 0 | 1 | 2;
export const ACCOUNT_MIN_AGE_MS = 24 * 3600 * 1000;
/** Totals are shown only from this many answers (the existing n ≥ 25 rule). */
export const MIN_SHOWN = 25;

export type ProfileFacts = { emailVerifiedAt: number | null; signupChallengeAt: number | null; phoneHash: string | null; phoneVerifiedAt: number | null;
  districtId: string | null; addressMatchedAt: number | null };

export function tierFor(p: ProfileFacts | null | undefined): Tier {
  if (!p || !p.emailVerifiedAt || !p.signupChallengeAt || !p.phoneHash || !p.phoneVerifiedAt) return 0;
  return p.districtId && p.addressMatchedAt ? 2 : 1;
}

/** Whether a position counts now. Quarantined positions never count until the editor clears them. */
export function positionCounts(input: { tier: number; accountCreatedAt: number; quarantined: boolean; now: number }) {
  return input.tier >= 1 && !input.quarantined && input.now - input.accountCreatedAt >= ACCOUNT_MIN_AGE_MS;
}
/** When a new account's answers start counting. */
export function countsFrom(accountCreatedAt: number) { return accountCreatedAt + ACCOUNT_MIN_AGE_MS; }

/** US numbers only, to E.164. Accepts "(512) 555-0100", "512-555-0100", "+1 512 555 0100". */
export function normalisePhone(raw: string): string | null {
  const digits = String(raw ?? "").replace(/[^\d+]/g, "");
  const d = digits.startsWith("+") ? digits.slice(1) : digits;
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d.length === 10 ? d : null;
  if (!ten || !/^[2-9]\d{2}[2-9]\d{6}$/.test(ten)) return null;
  return `+1${ten}`;
}

/** Twilio Lookup line types. Only real mobile lines can verify: no VoIP, virtual, toll-free, pager or unknown. */
export const ACCEPTED_LINE_TYPES = ["mobile", "personal"] as const;
export function lineTypeAccepted(type: string | null | undefined) { return (ACCEPTED_LINE_TYPES as readonly string[]).includes(String(type ?? "")); }

/** IPv4 /24 or IPv6 /48: the "range" that rate limits and cluster checks group by. */
export function ipRange(ip: string | null | undefined): string | null {
  const v = String(ip ?? "").split(",")[0].trim();
  if (!v) return null;
  const v4 = v.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (v.includes(":")) {
    const head = v.split("::")[0].split(":").filter(Boolean);
    const groups = [...head, "0", "0", "0"].slice(0, 3).map(g => g.toLowerCase().replace(/^0+(?=.)/, ""));
    return `${groups.join(":")}::/48`;
  }
  return null;
}

export function emailDomain(email: string) { return email.split("@")[1]?.toLowerCase() ?? ""; }
/** A domain or any parent domain on the list (sub.mailinator.com is mailinator.com). */
export function isDisposable(domain: string, list: { has(d: string): boolean }) {
  const parts = domain.toLowerCase().split(".");
  for (let i = 0; i < parts.length - 1; i++) if (list.has(parts.slice(i).join("."))) return true;
  return false;
}

/** Reason text compared after case, punctuation and spacing are removed. Short reasons are not compared. */
export function normaliseReason(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return t.length >= 20 ? t : null;
}
export const REASON_MAX = 280;
export function cleanReason(raw: unknown): string | null {
  const t = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, REASON_MAX);
  return t.length ? t : null;
}

export function looksLikePoBox(address: string) { return /\b(p\.?\s*o\.?\s*box|post\s+office\s+box|pmb\b)/i.test(address); }

/** Congressional district id from a Census geocoder match: "TX-07", "VT-AL" (at large), null when absent. */
export function districtFromCensus(match: unknown): { districtId: string; state: string } | null {
  const geos = (match as { geographies?: Record<string, Record<string, unknown>[]> })?.geographies;
  if (!geos) return null;
  const state = String(geos["States"]?.[0]?.["STUSAB"] ?? "").toUpperCase();
  const cdLayer = Object.entries(geos).find(([k]) => /Congressional Districts/i.test(k))?.[1]?.[0];
  if (!state || !/^[A-Z]{2}$/.test(state) || !cdLayer) return null;
  const code = Object.entries(cdLayer).find(([k]) => /^CD\d{3}$/.test(k))?.[1];
  const n = String(code ?? "").padStart(2, "0");
  if (!/^\d{2}$/.test(n)) return null;
  return { districtId: `${state}-${n === "00" || n === "98" ? "AL" : n}`, state };
}
/** The district id of a House member (district 0 or null is at large). */
export function memberDistrictId(state: string, district: number | null | undefined) {
  return `${state.toUpperCase()}-${!district ? "AL" : String(district).padStart(2, "0")}`;
}

/** Rate limits (owner defaults, logged as O-32). Windows in ms. */
export const LIMITS = {
  vote_account_hour: { max: 30, windowMs: 3600e3 }, vote_account_day: { max: 200, windowMs: 86400e3 },
  vote_device_hour: { max: 60, windowMs: 3600e3 }, vote_ip_hour: { max: 150, windowMs: 3600e3 },
  link_ip_hour: { max: 10, windowMs: 3600e3 }, link_device_hour: { max: 5, windowMs: 3600e3 },
  sms_account_day: { max: 3, windowMs: 86400e3 }, sms_ip_day: { max: 15, windowMs: 86400e3 },
  address_account_day: { max: 5, windowMs: 86400e3 },
  // Round G: per-reader limits on making cards, logging shares and reporting problems.
  card_device_hour: { max: 120, windowMs: 3600e3 }, card_ip_hour: { max: 600, windowMs: 3600e3 },
  share_device_hour: { max: 60, windowMs: 3600e3 }, report_device_day: { max: 10, windowMs: 86400e3 }, report_ip_day: { max: 40, windowMs: 86400e3 },
} as const;
export type LimitName = keyof typeof LIMITS;

/** Anomaly thresholds (O-33). */
export const ANOMALY = {
  surgeWindowMs: 3600e3, surgeFloor: 25, districtSurgeFloor: 15, surgeMultiple: 10, baselineMs: 7 * 86400e3,
  youngAccountMs: 7 * 86400e3, clusterWindowMs: 86400e3, ipClusterAccounts: 5, deviceClusterAccounts: 3,
  sameReasonAccounts: 3, sameReasonWindowMs: 7 * 86400e3,
} as const;

/** A surge: positions in the last hour at or above the floor and at least 10× the hourly baseline. */
export function isSurge(lastHour: number, baselineCount: number, floor: number) {
  const hourlyBaseline = baselineCount / (ANOMALY.baselineMs / ANOMALY.surgeWindowMs);
  return lastHour >= floor && lastHour >= ANOMALY.surgeMultiple * hourlyBaseline;
}

/** "Real people: 31 support · 12 oppose" or the not-enough line. */
export function totalsLine(label: string, t: { support: number; oppose: number } | null | undefined) {
  const n = (t?.support ?? 0) + (t?.oppose ?? 0);
  return n >= MIN_SHOWN ? `${label}: ${t!.support} support · ${t!.oppose} oppose` : `${label}: fewer than ${MIN_SHOWN} so far`;
}

/** Verification costs (O-34): Twilio US list prices, Oct 2026: Verify $0.05 per success + $0.0083 per SMS (counted per send, so a failed attempt is over-counted); Lookup line type $0.008. */
export const COST_USD = { sms_send: 0.0583, lookup: 0.008 } as const;
export const monthKey = (ms: number) => new Date(ms).toISOString().slice(0, 7);

/** Blocked-account and quarantine reasons, as shown on the transparency note. */
export const REASON_LABEL: Record<string, string> = {
  disposable_email: "Disposable email address", bot_challenge: "Failed the bot check", voip_number: "Phone was VoIP, virtual or not mobile",
  phone_reused: "Phone already used by another account", rate_limited: "Too many attempts", bill_surge: "Sudden surge on one bill",
  district_surge: "Sudden surge in one district", ip_cluster: "Many new accounts from one network", device_cluster: "Many accounts from one device",
  same_reason: "Identical reason text across accounts",
};
