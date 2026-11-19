import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisBillSummaries } from "@/db/schema";
import { getCursor, setCursor } from "@/lib/federal/ingest";
import { readerVisible } from "@/lib/analysis/publish-gate";

/**
 * Writes the summaries that went on show recently to the function's own log again, each beside its official sources,
 * so they can be read against those sources (19 Nov 2026: the lines written when a summary is made are kept by the
 * host for about an hour, and six summaries went on show without that reading).
 *
 * It answers with counts and bill numbers only: the summaries and sources go to the log, which only the owner's host
 * account can read. It makes no model call and changes nothing. Like the health probe it needs no sign-in, so it is
 * paced: at most one run every 10 minutes, at most 6 summaries a run (?skip=6 reads the next six).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const EVERY_MS = 10 * 60 * 1000, PER_RUN = 6, CURSOR = "review:relog";

export async function GET(request: Request) {
  const db = getDb(), now = Date.now(), last = Number(await getCursor(db, CURSOR)) || 0;
  if (now - last < EVERY_MS) return Response.json({ service: "on-record", ran: false, nextAfter: new Date(last + EVERY_MS).toISOString() }, { headers: { "Cache-Control": "no-store" } });
  await setCursor(db, CURSOR, String(now));
  const url = new URL(request.url), skip = Math.max(0, Math.min(60, Number(url.searchParams.get("skip")) || 0)), hours = Math.max(1, Math.min(24 * 14, Number(url.searchParams.get("hours")) || 36));
  // ?which=recheck: instead, the summaries the weekly re-check took down by the wrong rules before 19 Nov 2026 and that are
  // still down, so they can be read against their sources before an editor puts them back.
  const recheck = url.searchParams.get("which") === "recheck";
  const rows = recheck ? [] : await db.select({ billId: analysisBillSummaries.billId }).from(analysisBillSummaries)
    .where(and(readerVisible(), eq(analysisBillSummaries.status, "visible"), gte(analysisBillSummaries.createdAt, now - hours * 3600_000)))
    .orderBy(desc(analysisBillSummaries.createdAt)).limit(PER_RUN).offset(skip);
  const ids = recheck ? (await import("@/lib/analysis/quality").then(m => m.wronglyHeldBillIds()).catch(() => [] as string[])).slice(skip, skip + PER_RUN) : rows.map(r => r.billId);
  const { relogSources } = await import("@/lib/analysis/generate");
  const sources = await relogSources(ids, 70_000).catch(() => ({ logged: [] as string[], missing: ids }));
  const packets = await import("@/lib/analysis/report").then(m => m.logReviewPackets(ids, 30_000)).catch(() => ({ logged: 0, lines: 0 }));
  console.log(`REVIEW_RELOG | ${ids.length} summaries ${recheck ? "taken down by the old re-check" : `on show from the last ${hours} hours`} (skip ${skip}) | sources ${sources.logged.length} | packets ${packets.logged}`);
  return Response.json({ service: "on-record", ran: true, summaries: ids.length, sourcesLogged: sources.logged, sourcesMissing: sources.missing.length, packetsLogged: packets.logged }, { headers: { "Cache-Control": "no-store" } });
}
