/**
 * Which queued lead the unattended job captures next. Newest-first alone let one
 * prolific office dominate the queue (both first-day captures came from the same
 * lane). Instead: prefer the lane that has gone longest without a capture, and
 * within that lane the newest lead. Lanes with no capture yet come first.
 */
export type QueuedLead = { id: string; lane: string; discoveredAt: number; canonicalUrl?: string };
export type FailedLead = { canonicalUrl: string; error: string | null; completedAt: number | null };

export const BLOCKED_HOST_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const BLOCKED_HOST_MIN_FAILURES = 2;

export function hostOf(url: string | undefined | null): string | null {
  try { return url ? new URL(url).hostname.toLowerCase() : null; } catch { return null; }
}

/**
 * Hosts that answered 403 (or an equivalent block) at least twice in the last
 * two weeks. Discovery keeps producing fresh leads from the same site, and in
 * October 2026 eight capture attempts in one week were spent on them. Blocked
 * hosts are skipped by the scheduler; a reviewer can still capture them by hand.
 */
export function blockedHosts(failed: readonly FailedLead[], now = Date.now()): Set<string> {
  const counts = new Map<string, number>();
  for (const lead of failed) {
    if (lead.completedAt === null || now - lead.completedAt > BLOCKED_HOST_WINDOW_MS) continue;
    if (!/\b(403|blocked|forbidden)\b/i.test(lead.error ?? "")) continue;
    const host = hostOf(lead.canonicalUrl);
    if (host) counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= BLOCKED_HOST_MIN_FAILURES).map(([host]) => host));
}

export function pickNextLead<T extends QueuedLead>(queued: readonly T[], lastCaptureByLane: ReadonlyMap<string, number>, skipHosts: ReadonlySet<string> = new Set()): T | undefined {
  const eligible = skipHosts.size ? queued.filter(l => { const h = hostOf(l.canonicalUrl); return !h || !skipHosts.has(h); }) : queued;
  if (!eligible.length) return undefined;
  const sorted = [...eligible].sort((a, b) => {
    const la = lastCaptureByLane.get(a.lane) ?? -Infinity, lb = lastCaptureByLane.get(b.lane) ?? -Infinity;
    if (la !== lb) return la - lb;                // lane least recently captured first
    if (a.lane !== b.lane) return a.lane.localeCompare(b.lane); // stable tie-break across lanes
    return b.discoveredAt - a.discoveredAt;        // newest lead within the lane
  });
  return sorted[0];
}
