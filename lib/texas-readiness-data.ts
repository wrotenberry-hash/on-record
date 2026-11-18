import { getDb } from "@/db";
import { txSessionStats } from "@/db/schema";
import { texasCounts } from "@/lib/texas/ingest";
import { txSummaryCounts } from "@/lib/texas/summaries";
import { TX_PRIMERS } from "@/lib/texas/primers";
import { readStoredCounts, TX_HISTORY_SESSIONS } from "@/lib/texas/history-parse";
import { txToday } from "@/lib/texas/calendar";
import { TX_EVIDENCE } from "@/lib/texas-readiness-evidence";
import { texasReadiness, texasTotals, type TexasReadinessInput } from "@/lib/texas-readiness";
import type { Check } from "@/lib/readiness";

/** The Texas checklist with today's numbers (docs/TEXAS_BUILD.md). Used by Editor → What's next and the health probe. */
export async function texasReadinessNow(now = Date.now()): Promise<{ checks: Check[]; totals: ReturnType<typeof texasTotals> }> {
  const today = txToday(now);
  const [t, sums, stats] = await Promise.all([texasCounts(now).catch(() => null), txSummaryCounts().catch(() => null), getDb().select().from(txSessionStats).catch(() => [])]);
  // A past session counts as loaded only when its number of bills filed is an official figure.
  const wanted = TX_HISTORY_SESSIONS.filter(s => s.year <= 2025);
  const loaded = new Set(stats.filter(r => readStoredCounts(r.counts, r.source, r.retrievedAt).filed?.basis === "official").map(r => r.session));
  const tlo = t && typeof t.tloCheck === "object" ? t.tloCheck as Record<string, unknown> : null, num = (v: unknown) => (typeof v === "number" ? v : 0);
  const focus = t?.session.focus ?? "90", missing = t?.members.missingDistricts;
  const input: TexasReadinessInput = {
    today,
    data: { openStatesKey: !!t?.openStatesConfigured, legiscanKey: !!t?.legiscanConfigured, seatsFilled: t?.members.seatsFilled ?? 0, seatsExpected: t?.members.seatsExpected.total ?? 181,
      missingSeats: missing && typeof missing === "object" ? [missing.upper.length ? `Senate district ${missing.upper.join(", ")}` : "", missing.lower.length ? `House district ${missing.lower.join(", ")}` : ""].filter(Boolean).join("; ") : String(missing ?? ""),
      committees: t?.committees.total ?? 0, committeesChamberUnknown: t?.committees.chamberUnknown ?? 0, committeesReadAt: t?.committees.lastFullRead ?? null,
      bills2027: t?.billLoading[focus]?.stored ?? 0, bills2027Waiting: t?.billLoading[focus]?.waiting ?? null, newestFiling: t?.billLoading[focus]?.newestFiling ?? null,
      recordedVotes: t?.votes ?? 0, tallyMismatches: t?.tallyMismatches ?? 0, hearingsReadAt: t?.hearingsUpcoming.lastFullRead ?? null, hearingsUpcoming: t?.hearingsUpcoming.total ?? 0, hearingsWithBills: t?.hearingsUpcoming.withBills ?? 0,
      tloChecked: num(tlo?.checked), tloAgree: num(tlo?.agree) + num(tlo?.sameDayOtherAction), tloMismatches: num(tlo?.mismatches), lastRunStatus: t?.lastRun?.status ?? null, rateLimitedAt: t?.requestBudget.rateLimitedAt ?? null },
    address: TX_EVIDENCE.address,
    summaries: { ...TX_EVIDENCE.summaries, paused: sums?.paused ?? true, written: sums?.written ?? 0, passing: sums?.visible ?? 0, held: sums?.held ?? 0, readersSeeThem: !!sums?.readersSeeThem },
    votes: TX_EVIDENCE.votes,
    primers: { approved: TX_PRIMERS.filter(p => p.reviewed).length, waiting: TX_PRIMERS.filter(p => !p.reviewed).length },
    dashboard: { sessionsWanted: wanted.length, sessionsLoaded: wanted.filter(s => loaded.has(s.id)).length, missing: wanted.filter(s => !loaded.has(s.id)).map(s => s.name), page: TX_EVIDENCE.dashboardPage },
  };
  const checks = texasReadiness(input);
  return { checks, totals: texasTotals(checks, today) };
}
