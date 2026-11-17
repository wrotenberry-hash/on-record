/** How many back-to-back summary runs one trigger may start (each is up to four minutes). The spend cap usually ends the chain first. */
export const SUMMARY_CHAIN_MAX = Math.max(0, Math.min(40, Number(process.env.ANALYSIS_CHAIN_MAX ?? "16") || 0));

/**
 * Start the next link. The call is not waited for: it runs as its own function for up to five minutes. The four-second
 * wait only makes sure the request has left before this function ends (the same way the owner's "Run the update now" starts a run).
 */
export async function fireSummaryChain(origin: string, link: number): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !origin || SUMMARY_CHAIN_MAX < 1) return false;
  try { await fetch(`${origin}/api/automation/summaries?chain=${link}`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(4000), cache: "no-store" }); }
  catch { /* expected: the next link keeps running after this request stops waiting */ }
  return true;
}
