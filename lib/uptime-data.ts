import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { eventCounts } from "@/db/schema";
import { countEvent } from "@/lib/events";
import { utcDay } from "@/lib/event-dims";
import { UPTIME_EVENT, uptimeDim, uptimeSummary } from "@/lib/uptime";

/** Called by the health probe on every answer: one more for this hour. A daily counter, nothing about the caller. */
export async function noteProbeAnswered(now = Date.now()) { await countEvent(UPTIME_EVENT, uptimeDim(now), { skipBotCheck: true }); }

export async function uptimeNow(now = Date.now(), days = 7) {
  const rows = await getDb().select({ day: eventCounts.day, dim: eventCounts.dim, n: eventCounts.n }).from(eventCounts)
    .where(and(eq(eventCounts.name, UPTIME_EVENT), gte(eventCounts.day, utcDay(now - (days - 1) * 86400e3))));
  return uptimeSummary(rows.map(r => ({ day: r.day, dim: r.dim, n: Number(r.n) })), now, days);
}
