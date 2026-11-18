/**
 * Handing over to the next back-to-back run (bill summaries: lib/analysis/chain.ts; Texas loading: lib/texas/chain.ts).
 *
 * 18 Nov 2026: the summaries chain stopped after its fourth link with nothing in the log to say why, because a
 * hand-over that failed and one that worked looked the same. The next run is a request this function does not wait
 * for: it runs for minutes. So after a short wait there are three outcomes, and each is logged:
 *   - still running when the wait ends: the request was accepted and the next run is under way (the normal case);
 *   - answered straight away: the next run ended at once (nothing to do, busy, or refused by the host): the status is logged;
 *   - failed before it was accepted (no connection): tried once more after a pause.
 * Pure except for the request itself; `request` and `pause` can be replaced in tests.
 */
export type FireOutcome = { state: "running" } | { state: "answered"; status: number; body: string } | { state: "failed"; error: string };

export function describeFire(label: string, tries: FireOutcome[]): string {
  const last = tries[tries.length - 1], again = tries.length > 1 ? ` (after ${tries.length - 1} failed ${tries.length === 2 ? "try" : "tries"})` : "";
  const what = !last ? "not sent" : last.state === "running" ? "accepted; the next run is under way"
    // 18 Nov, 19:00 run: the host stops a run that starts the next run after about five in a row (508, "Infinite loop
    // detected"). That is the host's own safeguard and is not worked around: the rest waits for the next scheduled update.
    : last.state === "answered" && last.status === 508 ? "stopped by the host's limit on back-to-back runs (508); the rest waits for the next scheduled update"
    : last.state === "answered" ? `answered at once with ${last.status}${last.body ? `: ${last.body.slice(0, 160)}` : ""}`
    : `did not start: ${last.error.slice(0, 160)}`;
  return `${label} | ${what}${again}`;
}

/** True when the request is still open after the wait: that is the sign the next run was accepted. */
const timedOut = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

export async function fireOnce(url: string, secret: string, waitMs: number, request: typeof fetch = fetch): Promise<FireOutcome> {
  try {
    const res = await request(url, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(waitMs), cache: "no-store" });
    return { state: "answered", status: res.status, body: (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300) };
  } catch (e) {
    return timedOut(e) ? { state: "running" } : { state: "failed", error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

/**
 * Sends the hand-over, logs one line, and returns whether the next run started or answered. A request that failed
 * before it was accepted is tried once more; one that was answered is not (the answer is the next run's own decision).
 */
export async function fireLink(url: string, secret: string, label: string,
  o: { waitMs?: number; pauseMs?: number; request?: typeof fetch; pause?: (ms: number) => Promise<void>; log?: (line: string) => void } = {}): Promise<{ ok: boolean; tries: FireOutcome[] }> {
  const waitMs = o.waitMs ?? 4000, pause = o.pause ?? (ms => new Promise<void>(r => setTimeout(r, ms))), log = o.log ?? (line => console.log(line));
  const tries: FireOutcome[] = [await fireOnce(url, secret, waitMs, o.request)];
  if (tries[0].state === "failed") { await pause(o.pauseMs ?? 2000); tries.push(await fireOnce(url, secret, waitMs, o.request)); }
  const last = tries[tries.length - 1];
  log(describeFire(label, tries));
  return { ok: last.state === "running" || (last.state === "answered" && last.status >= 200 && last.status < 300), tries };
}
