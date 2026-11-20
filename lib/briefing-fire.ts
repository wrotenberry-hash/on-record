import { fireLink } from "@/lib/chain-fire";

/**
 * Starts the briefing-item reader tests from the scheduled update (owner, 20 Nov 2026: "Each inline item must pass the
 * average-reader test on its own"). It is a separate request so the tests have their own time allowance and take none
 * from summaries or the evening briefing. One request, never a chain: the test run does not start another run. Same
 * secret as the scheduled update; without it nothing is started.
 */
export async function fireBriefingTests(origin: string): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !origin || process.env.ANALYSIS_PAUSED === "1") return false;
  return (await fireLink(`${origin}/api/automation/briefing-tests`, secret, "BRIEF_ITEM_TESTS start")).ok;
}
