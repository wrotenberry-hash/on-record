import { and, gte, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { eventCounts } from "@/db/schema";
import { isAutomated, utcDay } from "@/lib/event-dims";

/**
 * First-party, aggregate-only usage counting (owner decision 2026-11-15). Each
 * call adds one to a daily counter for (event, dimension). Nothing identifies a
 * reader, and no counter records which bill, issue or member was viewed. Bots
 * are skipped. A counting fault never affects the page.
 */
export async function countEvent(name: string, dimension = "", opts: { skipBotCheck?: boolean } = {}) {
  try {
    if (!opts.skipBotCheck) {
      const ua = (await headers()).get("user-agent");
      if (isAutomated(ua)) return;
    }
    await getDb().insert(eventCounts).values({ day: utcDay(), name, dim: dimension.slice(0, 80), n: 1 })
      .onConflictDoUpdate({ target: [eventCounts.day, eventCounts.name, eventCounts.dim], set: { n: sql`${eventCounts.n} + 1` } });
  } catch { /* counting is best-effort */ }
}

/** Totals for the last `days` days by event and dimension, for the health probe and the editor. */
export async function eventTotals(days = 7, names?: readonly string[]) {
  const since = utcDay(Date.now() - (days - 1) * 24 * 3600 * 1000);
  // With `names`, every row for those events is returned (no top-80 cut, which dropped small counts such as shares).
  const where = names?.length ? and(gte(eventCounts.day, since), inArray(eventCounts.name, [...names])) : gte(eventCounts.day, since);
  const rows = await getDb().select({ name: eventCounts.name, dim: eventCounts.dim, n: sql<number>`sum(${eventCounts.n})` })
    .from(eventCounts).where(where).groupBy(eventCounts.name, eventCounts.dim).orderBy(sql`sum(${eventCounts.n}) desc`).limit(names?.length ? 2000 : 80);
  return rows.map(r => ({ name: r.name, dim: r.dim, n: Number(r.n) }));
}
