/**
 * Which queued lead the unattended job captures next. Newest-first alone let one
 * prolific office dominate the queue (both first-day captures came from the same
 * lane). Instead: prefer the lane that has gone longest without a capture, and
 * within that lane the newest lead. Lanes with no capture yet come first.
 */
export type QueuedLead = { id: string; lane: string; discoveredAt: number };

export function pickNextLead<T extends QueuedLead>(queued: readonly T[], lastCaptureByLane: ReadonlyMap<string, number>): T | undefined {
  if (!queued.length) return undefined;
  const sorted = [...queued].sort((a, b) => {
    const la = lastCaptureByLane.get(a.lane) ?? -Infinity, lb = lastCaptureByLane.get(b.lane) ?? -Infinity;
    if (la !== lb) return la - lb;                // lane least recently captured first
    if (a.lane !== b.lane) return a.lane.localeCompare(b.lane); // stable tie-break across lanes
    return b.discoveredAt - a.discoveredAt;        // newest lead within the lane
  });
  return sorted[0];
}
