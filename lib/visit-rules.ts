/** Pure visit rule (tested): a new visit starts after 30 minutes away; "previous" is the last visit before it. */
const GAP_MS = 30 * 60 * 1000;
export function nextVisit(cookie: string | null | undefined, now: number) {
  const [last, prev] = String(cookie ?? "").split("|").map(Number);
  if (!Number.isFinite(last) || last <= 0) return { last: now, previous: null as number | null };
  return now - last > GAP_MS ? { last: now, previous: last } : { last: now, previous: Number.isFinite(prev) && prev > 0 ? prev : null };
}

