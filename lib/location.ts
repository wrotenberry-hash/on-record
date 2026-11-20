import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readerLocations } from "@/db/schema";
import { applyFollowDefaults } from "@/lib/follow-defaults";

/**
 * Round C: where a reader is, as district ids only ("TX", "TX-37", "TX-SD-14", "TX-HD-49"). Kept in a first-party
 * cookie (works without an account) and, for a signed-in reader or trial invite, in reader_locations so it follows
 * them to other devices. The street address used to find the districts is never stored.
 */
export const LOCATION_COOKIE = "or_loc";
/**
 * How the place was found. "zip": a ZIP code alone. "address": the Census Bureau matched a street address.
 * "nearby": the Census Bureau matched a cross street the reader gave in place of their own address. "pin": the reader
 * dropped a pin on a map and the Census Bureau named the districts at that spot. "picked": the reader chose the House
 * district themselves. The last three are the reader's own word for where they live (owner, 20 Nov 2026:
 * "Mark any account whose district was self-picked rather than matched, so those answers never count as
 * address-matched later"); counting never reads this place at all (lib/verify decides that from its own address match).
 */
export type PlaceSource = "zip" | "address" | "nearby" | "pin" | "picked";
export const SELF_PLACED: readonly PlaceSource[] = ["nearby", "pin", "picked"];
export const selfPlaced = (source: string | null | undefined) => source === "nearby" || source === "pin" || source === "picked";
export type Location = { state: string; congressional: string | null; stateUpper: string | null; stateLower: string | null; source: PlaceSource };

const ID = /^[A-Z]{2}(-(\d{2}|AL)|-(SD|HD)-\d{1,3})?$/;
export function encodeLocation(l: Location) { return [l.state, l.congressional ?? "", l.stateUpper ?? "", l.stateLower ?? "", l.source].join("|"); }
export function decodeLocation(v: string | null | undefined): Location | null {
  const [state, cd, su, sl, source] = String(v ?? "").split("|");
  if (!state || !/^[A-Z]{2}$/.test(state) || (source !== "zip" && source !== "address" && source !== "nearby" && source !== "pin" && source !== "picked")) return null;
  const ok = (x: string) => (x && ID.test(x) ? x : null);
  return { state, congressional: ok(cd), stateUpper: ok(su), stateLower: ok(sl), source };
}

export async function currentLocation(userId: string | null): Promise<Location | null> {
  if (userId) {
    const row = await getDb().select().from(readerLocations).where(eq(readerLocations.userId, userId)).get().catch(() => null);
    if (row) return { state: row.state, congressional: row.congressional, stateUpper: row.stateUpper, stateLower: row.stateLower, source: row.source as Location["source"] };
  }
  return decodeLocation((await cookies()).get(LOCATION_COOKIE)?.value);
}

/**
 * Server actions only. For a reader with an id, saving a place also applies the new-reader defaults
 * (lib/follow-defaults.ts): the first save follows the reader's own legislators and turns vote alerts on; a later
 * save follows only the legislators who are new with the new place. A fault there never stops the place from saving.
 */
export async function saveLocation(userId: string | null, l: Location) {
  (await cookies()).set(LOCATION_COOKIE, encodeLocation(l), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 24 * 3600 });
  if (!userId) return;
  const db = getDb(), now = Date.now();
  const before = await db.select().from(readerLocations).where(eq(readerLocations.userId, userId)).get().catch(() => null);
  await db.insert(readerLocations).values({ userId, ...l, updatedAt: now }).onConflictDoUpdate({ target: readerLocations.userId, set: { ...l, updatedAt: now } });
  await applyFollowDefaults(db, { userId, place: l, previous: before ?? null, now }).catch(() => null);
}

export async function clearLocation(userId: string | null) {
  (await cookies()).delete(LOCATION_COOKIE);
  if (userId) await getDb().delete(readerLocations).where(eq(readerLocations.userId, userId));
}
