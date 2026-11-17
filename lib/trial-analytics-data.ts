import { eventTotals } from "@/lib/events";
import { retentionCounts } from "@/lib/retention";
import { trialCounts } from "@/lib/trial";
import { trialAnalytics, TRIAL_EVENT_NAMES } from "@/lib/trial-analytics";

/** The trial numbers for Editor → Metrics and the health probe. Counts only (lib/trial-analytics.ts does the sums). */
export async function trialAnalyticsNow() {
  const [events7d, events28d, r, t] = await Promise.all([eventTotals(7, TRIAL_EVENT_NAMES).catch(() => []), eventTotals(28, TRIAL_EVENT_NAMES).catch(() => []),
    retentionCounts().catch(() => null), trialCounts().catch(() => null)]);
  return trialAnalytics({ events7d, events28d, standing: { weeklyActiveReaders: r?.weeklyActiveReaders, weeklyReturningReaders: r?.weeklyReturningReaders,
    invitesActive7d: t?.activeLast7Days, invitesReturning7d: t?.returningLast7Days, invitesUsed: t?.used, invites: t?.invites,
    readersFollowingMembers: r?.readersFollowingMembers, followsPerFollower: r?.followsPerFollower, readersFollowingBills: r?.readersFollowingBills, billFollows: r?.billFollows } });
}
