/**
 * A reader's legislators, read straight from the database: their own (from the place on file) and the members they
 * follow. Database handle first, no request and no secret, so tests/loop.test.mjs runs it against a temporary
 * database. The same for every member: nothing here reads a party.
 */
import { and, eq, inArray } from "drizzle-orm";
import { accountResidences, officialPoliticians, readerAccounts, readerLocations, txPeople, userFollows } from "../../db/schema.ts";
import type { Db } from "../verify/residence-store.ts";
import type { Chamber, LoopMember } from "./rules.ts";

export type Place = { state: string; congressional: string | null; stateUpper: string | null; stateLower: string | null };
export type Member = LoopMember & { level: "federal" | "state"; name: string };

/** The reader's place: the home address on a counted account when there is one, else the place they looked up. District codes only. */
export async function placeOf(db: Db, userId: string): Promise<Place | null> {
  const home = await db.select({ state: accountResidences.stateCode, congressional: accountResidences.congressional, stateUpper: accountResidences.stateUpper, stateLower: accountResidences.stateLower })
    .from(accountResidences).innerJoin(readerAccounts, eq(readerAccounts.id, accountResidences.accountId)).where(eq(readerAccounts.appUserId, userId)).get();
  if (home) return home;
  const loc = await db.select().from(readerLocations).where(eq(readerLocations.userId, userId)).get();
  return loc ? { state: loc.state, congressional: loc.congressional, stateUpper: loc.stateUpper, stateLower: loc.stateLower } : null;
}

type Fed = typeof officialPoliticians.$inferSelect;
type Tx = typeof txPeople.$inferSelect;
const fed = (p: Fed): Member => ({ id: p.id, level: "federal", name: p.fullName, chamber: p.chamber === "senate" ? "senate" : "house", short: `${p.chamber === "senate" ? "Sen." : "Rep."} ${p.fullName}` });
const tx = (p: Tx): Member => { const chamber: Chamber = p.chamber === "upper" ? "upper" : "lower"; return { id: p.id, level: "state", name: p.name, chamber, short: `${chamber === "upper" ? "State Sen." : "State Rep."} ${p.name}` }; };

/**
 * The reader's own legislators, in the site's fixed order: the two U.S. senators (by last name), the U.S.
 * representative, then the state senator and state representative where the state's members are on file (Texas).
 */
export async function ownLegislators(db: Db, place: Place | null): Promise<Member[]> {
  if (!place) return [];
  const rows = await db.select().from(officialPoliticians).where(and(eq(officialPoliticians.state, place.state.toUpperCase()), eq(officialPoliticians.isCurrent, 1)));
  const senators = rows.filter(r => r.chamber === "senate").sort((a, b) => a.lastName.localeCompare(b.lastName));
  const n = place.congressional?.split("-")[1];
  const rep = n ? rows.find(r => r.chamber === "house" && (n === "AL" ? !r.district : r.district === Number(n))) : undefined;
  const out = [...senators, ...(rep ? [rep] : [])].map(fed);
  const num = (d: string | null) => d?.split("-").pop() ?? null;
  for (const [chamber, district] of [["upper", num(place.stateUpper)], ["lower", num(place.stateLower)]] as const) {
    if (!district || place.state.toUpperCase() !== "TX") continue;
    const p = await db.select().from(txPeople).where(and(eq(txPeople.chamber, chamber), eq(txPeople.district, district), eq(txPeople.isCurrent, 1))).get();
    if (p) out.push(tx(p));
  }
  return out;
}

/** The members a reader follows (user_follows holds a member of Congress's id or a Texas legislator's id). */
export async function followedMembers(db: Db, userId: string): Promise<Member[]> {
  const ids = (await db.select({ id: userFollows.politicianId }).from(userFollows).where(eq(userFollows.userId, userId))).map(r => r.id);
  return membersById(db, ids);
}

export async function membersById(db: Db, ids: readonly string[]): Promise<Member[]> {
  const out: Member[] = [], unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 90) {
    const part = unique.slice(i, i + 90);
    out.push(...(await db.select().from(officialPoliticians).where(inArray(officialPoliticians.id, part))).map(fed));
    out.push(...(await db.select().from(txPeople).where(inArray(txPeople.id, part))).map(tx));
  }
  return unique.flatMap(id => out.filter(m => m.id === id).slice(0, 1));
}

/** Own legislators first, then followed members not already listed. */
export async function everyoneFor(db: Db, userId: string): Promise<{ place: Place | null; members: Member[] }> {
  const place = await placeOf(db, userId);
  const [own, followed] = await Promise.all([ownLegislators(db, place), followedMembers(db, userId)]);
  return { place, members: [...own, ...followed.filter(f => !own.some(o => o.id === f.id))] };
}
