import { getDb } from "@/db";
import { readerEmailReady } from "@/lib/mailer";
import { habitLines, type HabitLine } from "@/lib/habit-lines";

/** The four measures, read from the database now. Each part fails on its own: one that cannot be read says so. */
export async function habitNow(now = Date.now()): Promise<{ lines: HabitLine[]; at: number }> {
  const db = getDb();
  const [weekTwo, loop, share] = await Promise.all([
    import("@/lib/week-two").then(m => m.weekTwoMeasure(db, now)).catch(() => null),
    import("@/lib/loop/run").then(m => m.loopNumbers(now)).catch(() => null),
    import("@/lib/entry/store").then(m => m.shareMeasures(db, now)).catch(() => null),
  ]);
  return { lines: habitLines({ weekTwo, loop, share, readerEmailReady: readerEmailReady() }), at: now };
}
