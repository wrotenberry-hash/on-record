/**
 * Week-two return rate (owner, 18 Nov 2026, persuasion and retention round, point 12).
 *
 * Of the readers whose first two weeks are over, how many came back during their second week (days 8 to 14).
 * One fact is kept per reader: the time of their first visit and, once, that they came back in week two
 * (`reader_setup.firstSeenAt`, `weekTwoAt`). Never which days or pages. The editor's own visits are not counted.
 *
 * Rules are pure; the database functions take the db handle first so tests run them against a temporary database.
 */
import { eq, sql } from "drizzle-orm";
import { appUsers, readerSetup } from "../db/schema.ts";

const DAY = 86_400_000;


/** True during the reader's second week: from the start of day 8 to the end of day 14 after their first visit. */
export function inWeekTwo(firstSeenAt: number, now: number): boolean { return now >= firstSeenAt + 7 * DAY && now < firstSeenAt + 14 * DAY; }

export type WeekTwo = { cohort: number; returned: number; rate: number | null; stillInFirstTwoWeeks: number; line: string };
/** The rate over readers whose second week has ended. Readers still inside their first two weeks are counted apart. */
export function weekTwoRate(rows: Array<{ firstSeenAt: number; weekTwoAt: number | null }>, now: number): WeekTwo {
  const done = rows.filter(r => now >= r.firstSeenAt + 14 * DAY), returned = done.filter(r => r.weekTwoAt != null).length;
  const waiting = rows.length - done.length, rate = done.length ? returned / done.length : null;
  const line = done.length ? `${returned} of ${done.length} readers came back in their second week (${Math.round((rate ?? 0) * 100)}%).${waiting ? ` ${waiting} more are still in their first two weeks.` : ""}`
    : waiting ? `No reader has finished a second week yet; ${waiting} ${waiting === 1 ? "is" : "are"} in their first two weeks.` : "No reader has visited yet.";
  return { cohort: done.length, returned, rate, stillInFirstTwoWeeks: waiting, line };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Called on each visit by a trial reader. Writes the first-visit time once and the week-two mark once. */
export async function noteVisit(db: any, userId: string, now: number): Promise<{ firstSeenAt: number; weekTwo: boolean }> {
  let row = await db.select().from(readerSetup).where(eq(readerSetup.userId, userId)).get();
  if (!row) {
    // A reader from before this table existed: their account's creation time is their first visit.
    const user = await db.select({ createdAt: appUsers.createdAt }).from(appUsers).where(eq(appUsers.id, userId)).get();
    await db.insert(readerSetup).values({ userId, firstSeenAt: Math.min(user?.createdAt ?? now, now) }).onConflictDoNothing();
    row = await db.select().from(readerSetup).where(eq(readerSetup.userId, userId)).get();
  }
  if (row.weekTwoAt == null && inWeekTwo(row.firstSeenAt, now)) {
    await db.update(readerSetup).set({ weekTwoAt: now }).where(eq(readerSetup.userId, userId));
    return { firstSeenAt: row.firstSeenAt, weekTwo: true };
  }
  return { firstSeenAt: row.firstSeenAt, weekTwo: row.weekTwoAt != null };
}

/** For the What's next page: trial readers only (the editor's own account is left out). */
export async function weekTwoMeasure(db: any, now: number): Promise<WeekTwo> {
  const rows = await db.select({ firstSeenAt: readerSetup.firstSeenAt, weekTwoAt: readerSetup.weekTwoAt }).from(readerSetup)
    .innerJoin(appUsers, eq(appUsers.id, readerSetup.userId)).where(sql`${appUsers.kind} = 'public'`);
  return weekTwoRate(rows, now);
}
