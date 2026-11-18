import { fireLink } from "@/lib/chain-fire";

/** How many back-to-back summary runs one trigger may start (each is up to four minutes). The spend cap usually ends the chain first. */
export const SUMMARY_CHAIN_MAX = Math.max(0, Math.min(40, Number(process.env.ANALYSIS_CHAIN_MAX ?? "16") || 0));

/**
 * Start the next link. The call is not waited for: it runs as its own function for up to five minutes. What became of
 * the request is logged ("SUMMARY_CHAIN hand-over to link n | …"), and a request that never left is tried once more
 * (lib/chain-fire.ts).
 */
export async function fireSummaryChain(origin: string, link: number): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !origin || SUMMARY_CHAIN_MAX < 1) return false;
  return (await fireLink(`${origin}/api/automation/summaries?chain=${link}`, secret, `SUMMARY_CHAIN hand-over to link ${link}`)).ok;
}
