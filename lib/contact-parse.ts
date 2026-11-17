/**
 * Pure parsers for how to reach a legislator through official channels
 * (test-ready build, 17 Nov 2026). No database, no network, no imports, so
 * node --test loads this file directly (tests/contact.test.mjs).
 *
 * Federal: the congress-legislators "current" file carries each member's
 * Washington phone, office address, website and (mostly senators) contact
 * form in the latest term; a second file lists district offices. Checked
 * against the live files on 2026-11-17.
 *
 * Texas: Open States v3 /people with include=offices and include=links.
 * Written from the documented response shape; every field is guarded because
 * it could not be checked against the live API (no key locally).
 */

export const DISTRICT_OFFICES_URL = "https://unitedstates.github.io/congress-legislators/legislators-district-offices.json";

export type ParsedContact = { memberId: string; phone: string | null; contactFormUrl: string | null; officeAddress: string | null;
  districtPhone: string | null; districtAddress: string | null; email: string | null; websiteUrl: string | null };

const text = (v: unknown, max = 300): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/** A web address only when it is a well-formed http(s) link; a typo such as "hhttps://…" is dropped, never guessed at. */
export function cleanUrl(v: unknown): string | null {
  const s = text(v, 500);
  if (!s || !/^https?:\/\//i.test(s)) return null;
  try { const u = new URL(s); return u.hostname.includes(".") ? u.toString() : null; } catch { return null; }
}

/** A phone number as printed (an extension is dropped), kept only when it holds a full US number (10 digits, or 11 starting with 1). */
export function cleanPhone(v: unknown): string | null {
  const s = text(v, 40)?.replace(/[\s,;]*(x|ext\.?|extension)\s*\d+$/i, "").trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits[0] === "1") ? s : null;
}

export function cleanEmail(v: unknown): string | null {
  const s = text(v, 120);
  return s && /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(s) ? s : null;
}

/* ------------------------------------------------------------ Federal --- */

type TermJson = { type?: string; state?: string; phone?: unknown; contact_form?: unknown; address?: unknown; url?: unknown };
type LegislatorJson = { id?: { bioguide?: string }; terms?: TermJson[] };

/**
 * One contact row per sitting member, from each member's latest term: the same
 * members parseLegislators (lib/federal/parse.ts) keeps. District fields are
 * filled in afterwards from the district-offices file.
 */
export function parseFederalContacts(data: unknown): ParsedContact[] {
  if (!Array.isArray(data)) return [];
  return (data as LegislatorJson[]).flatMap((p): ParsedContact[] => {
    const term = p?.terms?.[p.terms.length - 1], id = p?.id?.bioguide;
    if (!term || !id || (term.type !== "sen" && term.type !== "rep") || !term.state) return [];
    return [{ memberId: id, phone: cleanPhone(term.phone), contactFormUrl: cleanUrl(term.contact_form), officeAddress: text(term.address),
      districtPhone: null, districtAddress: null, email: null, websiteUrl: cleanUrl(term.url) }];
  });
}

type OfficeJson = { address?: unknown; suite?: unknown; building?: unknown; city?: unknown; state?: unknown; zip?: unknown; phone?: unknown };

/** The district-offices file: for each member, the first office that lists a phone (else the first office). */
export function parseDistrictOffices(data: unknown): Map<string, { phone: string | null; address: string | null }> {
  const out = new Map<string, { phone: string | null; address: string | null }>();
  if (!Array.isArray(data)) return out;
  for (const entry of data as Array<{ id?: { bioguide?: string }; offices?: OfficeJson[] }>) {
    const id = entry?.id?.bioguide, offices = Array.isArray(entry?.offices) ? entry.offices : [];
    if (!id || !offices.length) continue;
    const office = offices.find(o => cleanPhone(o?.phone)) ?? offices[0];
    const street = [text(office?.building), text(office?.address), text(office?.suite)].filter(Boolean).join(", ");
    const cityLine = [text(office?.city), [text(office?.state), text(office?.zip)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const address = [street, cityLine].filter(Boolean).join(", ") || null;
    const phone = cleanPhone(office?.phone);
    if (phone || address) out.set(id, { phone, address });
  }
  return out;
}

/** Adds each member's district office to their contact row. Members without one keep nulls. */
export function withDistrictOffices(contacts: ParsedContact[], offices: Map<string, { phone: string | null; address: string | null }>): ParsedContact[] {
  return contacts.map(c => { const o = offices.get(c.memberId); return o ? { ...c, districtPhone: o.phone, districtAddress: o.address } : c; });
}

/* -------------------------------------------------------------- Texas --- */

type OsOffice = { name?: unknown; classification?: unknown; address?: unknown; voice?: unknown };
type OsPerson = { id?: string; name?: string; email?: unknown; current_role?: { org_classification?: string; district?: string | number } | null;
  offices?: OsOffice[] | null; links?: Array<{ url?: unknown; note?: unknown }> | null };

/** Open States prints an address on several lines or with semicolons; one line with commas reads better in small type. */
const oneLine = (v: unknown) => text(typeof v === "string" ? v.replace(/\s*[;\n\r]+\s*/g, ", ") : v);
const officeKind = (o: OsOffice) => { const s = `${typeof o?.classification === "string" ? o.classification : ""} ${typeof o?.name === "string" ? o.name : ""}`.toLowerCase();
  return /district/.test(s) ? "district" : /capitol|primary/.test(s) ? "capitol" : "other"; };
/** Only the Legislature's own sites count as an official website (house.texas.gov, senate.texas.gov, capitol.texas.gov). */
const texasGov = (v: unknown) => { const u = cleanUrl(v); try { return u && /(^|\.)texas\.gov$/i.test(new URL(u).hostname) ? u : null; } catch { return null; } };

/**
 * Open States /people?jurisdiction=tx&include=offices&include=links: the Capitol
 * office (phone and address), the first district office, the email on record
 * and the member's page on the Legislature's site. A person with nothing on
 * record gets no row. Same people filter as parseOpenStatesPeople.
 */
export function parseOpenStatesContacts(data: unknown): ParsedContact[] {
  const results = (data as { results?: OsPerson[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((p): ParsedContact[] => {
    const c = p?.current_role?.org_classification;
    if (!p?.id || typeof p.id !== "string" || !p.name || (c !== "upper" && c !== "lower") || p.current_role?.district == null) return [];
    const offices = (Array.isArray(p.offices) ? p.offices : []).filter(o => o && typeof o === "object");
    const capitol = offices.find(o => officeKind(o) === "capitol") ?? offices.find(o => officeKind(o) === "other") ?? null;
    const district = offices.find(o => officeKind(o) === "district") ?? null;
    const website = (Array.isArray(p.links) ? p.links : []).map(l => texasGov(l?.url)).find(Boolean) ?? null;
    const row: ParsedContact = { memberId: p.id, phone: cleanPhone(capitol?.voice), contactFormUrl: null, officeAddress: oneLine(capitol?.address),
      districtPhone: cleanPhone(district?.voice), districtAddress: oneLine(district?.address), email: cleanEmail(p.email), websiteUrl: website };
    return row.phone || row.officeAddress || row.districtPhone || row.districtAddress || row.email || row.websiteUrl ? [row] : [];
  });
}
