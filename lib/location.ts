import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readerLocations } from "@/db/schema";

/**
 * Round C: where a reader is, as district ids only ("TX", "TX-37", "TX-SD-14", "TX-HD-49"). Kept in a first-party
 * cookie (works without an account) and, for a signed-in reader or trial invite, in reader_locations so it follows
 * them to other devices. The street address used to find the districts is never stored.
 */
export const LOCATION_COOKIE = "or_loc";
export type Location = { state: string; congressional: string | null; stateUpper: string | null; stateLower: string | null; source: "zip" | "address" };

const ID = /^[A-Z]{2}(-(\d{2}|AL)|-(SD|HD)-\d{1,3})?$/;
export function encodeLocation(l: Location) { return [l.state, l.congressional ?? "", l.stateUpper ?? "", l.stateLower ?? "", l.source].join("|"); }
export function decodeLocation(v: string | null | undefined): Location | null {
  const [state, cd, su, sl, source] = String(v ?? "").split("|");
  if (!state || !/^[A-Z]{2}$/.test(state) || (source !== "zip" && source !== "address")) return null;
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

/** Server actions only. */
export async function saveLocation(userId: string | null, l: Location) {
  (await cookies()).set(LOCATION_COOKIE, encodeLocation(l), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 24 * 3600 });
  if (userId) await getDb().insert(readerLocations).values({ userId, ...l, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: readerLocations.userId, set: { ...l, updatedAt: Date.now() } });
}

export async function clearLocation(userId: string | null) {
  (await cookies()).delete(LOCATION_COOKIE);
  if (userId) await getDb().delete(readerLocations).where(eq(readerLocations.userId, userId));
}
