import { fireLink } from "@/lib/chain-fire";

/**
 * Starts the menu-drafting run from the scheduled update (owner, 20 Nov 2026). It is a separate request so that menus
 * have their own time allowance and do not take time from summaries. One request, never a chain: the drafting run
 * does not start another run. Same secret as the scheduled update; without it nothing is started.
 */
export async function fireChangeMenus(origin: string): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !origin || process.env.CHANGES_PAUSED === "1") return false;
  return (await fireLink(`${origin}/api/automation/changes`, secret, "CHANGE_MENUS start")).ok;
}
