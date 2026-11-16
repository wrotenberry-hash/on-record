import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readerVisits } from "@/db/schema";

/**
 * Round H "Since you last visited": the time of the reader's previous visit, kept in a first-party cookie (works
 * without an account) and, for trial readers, in reader_visits so it syncs across devices. Times only, never pages.
 * A visit starts after 30 minutes away.
 */
export const VISIT_COOKIE = "or_lv";
const GAP_MS = 30 * 60 * 1000;
export function nextVisit(cookie: string | null | undefined, now: number) {
  const [last, prev] = String(cookie ?? "").split("|").map(Number);
  if (!Number.isFinite(last) || last <= 0) return { last: now, previous: null as number | null };
  return now - last > GAP_MS ? { last: now, previous: last } : { last: now, previous: Number.isFinite(prev) && prev > 0 ? prev : null };
}

export async function recordVisit(userId: string | null, now = Date.now()) {
  const jar = await cookies();
  let v = nextVisit(jar.get(VISIT_COOKIE)?.value, now);
  if (userId) {
    const row = await getDb().select().from(readerVisits).where(eq(readerVisits.userId, userId)).get();
    if (row) { const s = nextVisit(`${row.lastSeenAt}|${row.previousSeenAt ?? ""}`, now); v = { last: now, previous: Math.max(s.previous ?? 0, v.previous ?? 0) || null }; }
    await getDb().insert(readerVisits).values({ userId, lastSeenAt: now, previousSeenAt: v.previous }).onConflictDoUpdate({ target: readerVisits.userId, set: { lastSeenAt: now, previousSeenAt: v.previous } });
  }
  jar.set(VISIT_COOKIE, `${v.last}|${v.previous ?? ""}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 24 * 3600 });
  return v;
}

/** The previous visit (server components read it; the marker updates it). */
export async function previousVisit(userId: string | null): Promise<number | null> {
  if (userId) { const row = await getDb().select().from(readerVisits).where(eq(readerVisits.userId, userId)).get().catch(() => null); if (row?.previousSeenAt) return row.previousSeenAt; }
  const [, prev] = String((await cookies()).get(VISIT_COOKIE)?.value ?? "").split("|").map(Number);
  return Number.isFinite(prev) && prev > 0 ? prev : null;
}
