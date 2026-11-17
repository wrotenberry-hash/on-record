import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBillCosponsors, officialBills, officialPoliticians } from "@/db/schema";
import { districtsFromCensus, stateForZip, type Districts } from "@/lib/federal/depth-parse";
import { congressForYear } from "@/lib/federal/parse";
import { censusCongress } from "@/lib/flow/rules";

/**
 * Round A: an address or ZIP to all of a reader's legislators. The address goes
 * to the Census Bureau geocoder (official, no key) and is not stored here; a
 * ZIP alone gives the state's senators and the state's House members to choose
 * from, because a ZIP can cross districts. State legislators come from the
 * Texas tables (Round H) once they exist.
 */
const CENSUS = () => process.env.CENSUS_GEOCODER_BASE?.trim() || "https://geocoding.geo.census.gov";

/**
 * One address → its districts. The Census Bureau's "current" map can run ahead of the Congress that is sitting: on
 * 17 Nov 2026 it already answered with the 120th Congress map (Texas redrawn) while the 119th was still in office,
 * which would have named the wrong representative. So when the map is not the sitting Congress's, the House district
 * is asked for again from the vintage that holds the sitting map; if that cannot be found the House district is left
 * empty (the caller offers a choice) rather than guessed. State districts come from the current map.
 */
export async function geocodeAddress(address: string, now = Date.now()): Promise<{ ok: true; districts: Districts } | { ok: false; reason: "unreachable" | "no_match" }> {
  const ask = async (vintage: string) => {
    const q = new URLSearchParams({ address, benchmark: "Public_AR_Current", vintage, layers: "all", format: "json" });
    const res = await fetch(`${CENSUS()}/geocoder/geographies/onelineaddress?${q}`, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
    if (!res.ok) throw new Error(`census ${res.status}`);
    return ((await res.json()) as { result?: { addressMatches?: unknown[] } }).result?.addressMatches?.[0];
  };
  try {
    const match = await ask("Current_Current");
    const d = districtsFromCensus(match);
    if (!d) return { ok: false, reason: "no_match" };
    const year = new Date(now).getUTCFullYear(), sitting = congressForYear(year), used = censusCongress(match);
    if (d.congressional && used !== null && used !== sitting) {
      d.congressional = null;
      for (const vintage of [`ACS${year - 1}_Current`, `ACS${year - 2}_Current`]) {
        const older = await ask(vintage).catch(() => undefined);
        if (older && censusCongress(older) === sitting) { d.congressional = districtsFromCensus(older)?.congressional ?? null; break; }
      }
    }
    return { ok: true, districts: d };
  } catch { return { ok: false, reason: "unreachable" }; }
}

export type Legislator = { id: string; fullName: string; party: string; state: string; district: number | null; chamber: string; role: string; level: "federal" | "state" };

const role = (p: { chamber: string; state: string; district: number | null }) => p.chamber === "senate" ? `U.S. Senator, ${p.state}` : `U.S. Representative, ${p.state}${p.district ? `-${p.district}` : " at large"}`;

/** Current federal members for a state, and the House member for a district when it is known. */
export async function federalLegislators(state: string, congressionalDistrict: string | null) {
  const rows = await getDb().select().from(officialPoliticians).where(and(eq(officialPoliticians.state, state.toUpperCase()), eq(officialPoliticians.isCurrent, 1)));
  const senators = rows.filter(r => r.chamber === "senate").sort((a, b) => a.lastName.localeCompare(b.lastName));
  const house = rows.filter(r => r.chamber === "house").sort((a, b) => (a.district ?? 0) - (b.district ?? 0));
  const n = congressionalDistrict?.split("-")[1];
  const rep = n ? house.find(h => (n === "AL" ? !h.district : h.district === Number(n))) ?? null : null;
  const out = (p: typeof rows[number]): Legislator => ({ id: p.id, fullName: p.fullName, party: p.party, state: p.state, district: p.district, chamber: p.chamber, role: role(p), level: "federal" });
  return { senators: senators.map(out), representative: rep ? out(rep) : null, houseChoices: rep ? [] : house.map(out) };
}

export async function legislatorsForAddress(address: string) {
  const g = await geocodeAddress(address);
  if (!g.ok) return g;
  const fed = await federalLegislators(g.districts.state, g.districts.congressional);
  return { ok: true as const, districts: g.districts, ...fed };
}

export async function legislatorsForZip(zip: string) {
  const state = stateForZip(zip);
  if (!state) return { ok: false as const, reason: "bad_zip" as const };
  return { ok: true as const, state, ...(await federalLegislators(state, null)) };
}

/** Sponsor's party and cosponsors by party (current cosponsors; withdrawn ones listed apart). Official, from govinfo bill status. */
export async function cosponsorPartyCounts(billId: string) {
  const db = getDb();
  const [rows, withdrawn, sponsor] = await Promise.all([
    db.select({ party: officialPoliticians.party, n: sql<number>`count(*)` }).from(officialBillCosponsors)
      .innerJoin(officialPoliticians, eq(officialPoliticians.id, officialBillCosponsors.politicianId))
      .where(and(eq(officialBillCosponsors.billId, billId), isNull(officialBillCosponsors.withdrawnDate))).groupBy(officialPoliticians.party),
    db.select({ n: sql<number>`count(*)` }).from(officialBillCosponsors).where(and(eq(officialBillCosponsors.billId, billId), sql`${officialBillCosponsors.withdrawnDate} is not null`)).get(),
    db.select({ party: officialPoliticians.party, name: officialPoliticians.fullName, id: officialPoliticians.id }).from(officialBills)
      .innerJoin(officialPoliticians, eq(officialPoliticians.id, officialBills.sponsorId)).where(eq(officialBills.id, billId)).get(),
  ]);
  const byParty = Object.fromEntries(rows.map(r => [r.party, Number(r.n)]));
  return { sponsor: sponsor ?? null, byParty, total: rows.reduce((s, r) => s + Number(r.n), 0), withdrawn: Number(withdrawn?.n ?? 0) };
}
