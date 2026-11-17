/**
 * Uptime as the app can see it. Pure; tested in tests/trial-analytics.test.mjs.
 * Every answer of the public health probe adds one to a daily counter for the
 * hour it came in ("health_probe", "h00" … "h23" UTC). An outside checker asks
 * every 30 minutes (.github/workflows/uptime.yml), so an hour with no answer
 * is an hour the site did not answer or was not asked. Nothing is stored about
 * who asked.
 */
export const UPTIME_EVENT = "health_probe";
export const uptimeDim = (ms: number) => `h${String(new Date(ms).getUTCHours()).padStart(2, "0")}`;

export type UptimeRow = { day: string; dim: string; n: number };
export type UptimeDay = { day: string; hoursAnswered: number; hoursSoFar: number; checks: number; missedHours: string[] };

/** One line per day, newest first, for the last `days` days. Today counts only the hours that have started. */
export function uptimeSummary(rows: readonly UptimeRow[], now: number, days = 7): UptimeDay[] {
  const out: UptimeDay[] = [];
  const today = new Date(now).toISOString().slice(0, 10);
  for (let i = 0; i < days; i++) {
    const day = new Date(now - i * 86400e3).toISOString().slice(0, 10);
    const hoursSoFar = day === today ? new Date(now).getUTCHours() + 1 : 24;
    const byHour = new Map<string, number>();
    for (const r of rows) if (r.day === day && /^h([01]\d|2[0-3])$/.test(r.dim)) byHour.set(r.dim, (byHour.get(r.dim) ?? 0) + Number(r.n || 0));
    const hours = Array.from({ length: hoursSoFar }, (_, h) => `h${String(h).padStart(2, "0")}`);
    const missed = hours.filter(h => !(byHour.get(h) ?? 0));
    out.push({ day, hoursAnswered: hoursSoFar - missed.length, hoursSoFar, checks: [...byHour.values()].reduce((a, b) => a + b, 0), missedHours: missed.map(h => `${h.slice(1)}:00`) });
  }
  return out;
}
