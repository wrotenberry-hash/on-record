import { env } from "cloudflare:workers";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { researchDailyBudgets } from "@/db/schema";

/** Counts failed and successful starts; an atomic reservation bounds model spend. */
export async function reservePrivateResearch() {
  const raw = Number((env as unknown as { AUTOMATION_DAILY_LIMIT?: string }).AUTOMATION_DAILY_LIMIT ?? "2");
  const limit = Number.isSafeInteger(raw) ? Math.max(1, Math.min(raw, 5)) : 2;
  const day = new Date().toISOString().slice(0, 10);
  const db = getDb();
  await db.insert(researchDailyBudgets).values({ day, attempts: 0 }).onConflictDoNothing();
  const claimed = await db.update(researchDailyBudgets)
    .set({ attempts: sql`${researchDailyBudgets.attempts} + 1` })
    .where(and(eq(researchDailyBudgets.day, day), lt(researchDailyBudgets.attempts, limit)))
    .returning({ attempts: researchDailyBudgets.attempts });
  return { allowed: !!claimed.length, day, limit, attempts: claimed[0]?.attempts ?? limit };
}
