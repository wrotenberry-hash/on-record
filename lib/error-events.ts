import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { errorEvents } from "@/db/schema";
import { utcDay } from "@/lib/event-dims";
import { breakage, cleanDigest, cleanMessage, isExpectedError, routeFromFile, routePattern, topErrors, withRouteType, ERROR_KINDS_PER_DAY, OTHER_ERRORS, type ErrorRow, type ErrorSource } from "@/lib/error-rules";

/**
 * The site's own error log (table error_events): one row per day, source, route
 * pattern and short message, with a count and the first and last time. No URL
 * query, cookie, header or reader is ever written. Rules: lib/error-rules.ts.
 */
export async function recordError(input: { source: ErrorSource; route: string; message: unknown; digest?: unknown }, now = Date.now()) {
  try {
    const db = getDb(), day = utcDay(now), digest = cleanDigest(input.digest);
    const route = input.route.startsWith("/") || input.route === "other" ? input.route.slice(0, 100) : routePattern(input.route);
    let message = cleanMessage(input.message);
    if (digest && input.source === "client") message = `${message.slice(0, 200 - digest.length - 10)} (digest ${digest})`;
    const key = and(eq(errorEvents.day, day), eq(errorEvents.source, input.source), eq(errorEvents.route, route), eq(errorEvents.message, message));
    const have = await db.select({ n: errorEvents.n }).from(errorEvents).where(key).get();
    if (!have) {
      const kinds = Number((await db.select({ n: sql<number>`count(*)` }).from(errorEvents).where(eq(errorEvents.day, day)).get())?.n ?? 0);
      if (kinds >= ERROR_KINDS_PER_DAY) message = OTHER_ERRORS;
    }
    await db.insert(errorEvents).values({ day, source: input.source, route, message, n: 1, firstAt: now, lastAt: now })
      .onConflictDoUpdate({ target: [errorEvents.day, errorEvents.source, errorEvents.route, errorEvents.message], set: { n: sql`${errorEvents.n} + 1`, lastAt: now } });
    return true;
  } catch { return false; } // recording an error must never cause another
}

/** From instrumentation.ts: one server error, by the route file Next names and whether it was a page, a route or an action. */
export async function recordServerError(error: unknown, context: { routePath?: string; routeType?: string }) {
  if (isExpectedError(error)) return false;
  const message = error instanceof Error ? `${error.name && error.name !== "Error" ? `${error.name}: ` : ""}${error.message}` : String(error);
  return recordError({ source: "server", route: withRouteType(routeFromFile(context.routePath), context.routeType), message });
}

export async function errorRowsSince(since: number): Promise<ErrorRow[]> {
  const rows = await getDb().select().from(errorEvents).where(gte(errorEvents.lastAt, since));
  return rows.map(r => ({ day: r.day, source: r.source, route: r.route, message: r.message, n: Number(r.n), firstAt: Number(r.firstAt), lastAt: Number(r.lastAt) }));
}

/** For the health probe and the editor: the last 24 hours in counts, the three most frequent errors, and whether it is real breakage. */
export async function errorsReport(now = Date.now()) {
  const rows = await errorRowsSince(now - 2 * 86400e3);
  const b = breakage(rows, now);
  return { last24h: b.last24h, top: topErrors(rows, now, 3).map(t => ({ source: t.source, route: t.route, message: t.message, n: t.n, lastAt: new Date(t.lastAt).toISOString() })),
    breakage: b.broken, reasons: b.reasons };
}

/** For the monitoring run: the reasons when the site is really broken, else null. */
export async function siteBreakage(now = Date.now()): Promise<string[] | null> {
  const b = breakage(await errorRowsSince(now - 2 * 86400e3), now);
  return b.broken ? b.reasons : null;
}
