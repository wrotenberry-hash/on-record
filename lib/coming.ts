import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { officialCommitteeMembers, officialPoliticians, txCommitteeMembers } from "@/db/schema";
import { federalLegislators } from "@/lib/federal/legislators";
import { txLegislatorsFor } from "@/lib/texas/queries";
import type { Location } from "@/lib/location";
import type { ReaderScope } from "@/lib/coming-rules";

/**
 * What "My legislators" on /coming needs about the reader's saved place: their two senators and representative, the
 * committees those members sit on (official_committee_members), and for a Texas reader the committees their state
 * senator and representative sit on (tx_committee_members). Official records only.
 */
export type ReaderMembers = { scope: ReaderScope; federal: Array<{ id: string; fullName: string; role: string; officialUrl: string | null }>;
  /** Texas: whether the reader's state legislators are known, and whether any Texas committee memberships are loaded at all. */
  texas: { reader: boolean; stateLegislators: number; membershipsLoaded: boolean } };

export async function readerMembers(loc: Location | null): Promise<ReaderMembers> {
  const none: ReaderMembers = { scope: { chambers: [], committees: new Set(), txCommittees: new Set() }, federal: [], texas: { reader: false, stateLegislators: 0, membershipsLoaded: false } };
  if (!loc) return none;
  const db = getDb();
  const fed = await federalLegislators(loc.state, loc.congressional).catch(() => null);
  const members = fed ? [...fed.senators, ...(fed.representative ? [fed.representative] : [])] : [];
  const ids = members.map(m => m.id);
  const [seats, sites] = ids.length ? await Promise.all([
    db.select({ committeeId: officialCommitteeMembers.committeeId }).from(officialCommitteeMembers).where(inArray(officialCommitteeMembers.politicianId, ids)).catch(() => []),
    db.select({ id: officialPoliticians.id, officialUrl: officialPoliticians.officialUrl }).from(officialPoliticians).where(inArray(officialPoliticians.id, ids)).catch(() => []),
  ]) : [[], []];
  const texas = { reader: loc.state === "TX", stateLegislators: 0, membershipsLoaded: false };
  const txCommittees = new Set<string>();
  if (texas.reader) {
    const tx = await txLegislatorsFor(loc.stateUpper, loc.stateLower).catch(() => null);
    const people = [tx?.senator, tx?.representative].filter((p): p is NonNullable<typeof p> => !!p);
    texas.stateLegislators = people.length;
    texas.membershipsLoaded = !!(await db.select({ c: txCommitteeMembers.committeeId }).from(txCommitteeMembers).limit(1).get().catch(() => null));
    for (const p of people) for (const r of await db.select({ c: txCommitteeMembers.committeeId }).from(txCommitteeMembers).where(eq(txCommitteeMembers.personId, p.id)).catch(() => [])) txCommittees.add(r.c);
  }
  return { scope: { chambers: [...new Set(members.map(m => m.chamber))], committees: new Set(seats.map(s => s.committeeId)), txCommittees },
    federal: members.map(m => ({ id: m.id, fullName: m.fullName, role: m.role, officialUrl: sites.find(s => s.id === m.id)?.officialUrl ?? null })), texas };
}
