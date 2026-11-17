/**
 * The Texas loader, back to back (17 Nov 2026). Pure rules for the daily request budget, pacing, the lock that keeps
 * two loaders from running at once, and whether the chain goes on; plus the one call that starts the next link.
 * No `@/` imports, so tests/texas-chain.test.mjs loads it directly.
 *
 * Open States' published limits (api-v3 source, api/auth.py, read 17 Nov 2026): the default (free) key tier allows
 * 10 requests a minute and 250 a day; "bronze" 40 a minute and 1,000 a day. The day is counted on the API's own clock
 * (we assume UTC). The defaults below stay under the free tier: 200 a day, 8 a minute.
 */

export type TxChainSettings = {
  /** Open States requests a day, shared by the scheduled update and the chain (TEXAS_DAILY_REQUESTS, default 200). */
  dailyRequests: number;
  /** At most this many Open States requests in any minute (TEXAS_REQUESTS_PER_MINUTE, default 8). */
  perMinute: number;
  /** One start of the chain may use at most this many requests, so the evening start still has some (TEXAS_REQUESTS_PER_START, default 120). */
  perStart: number;
  /** Links one start may run (TEXAS_CHAIN_MAX, default 10). */
  maxLinks: number;
  /** How long one link loads (TEXAS_LINK_SECONDS, default 240; the host stops a function at 300). */
  linkMs: number;
  /** LegiScan requests a day for recorded votes Open States does not have (TEXAS_LEGISCAN_DAILY, default 30). */
  legiscanDaily: number;
  /** The daily Texas Legislature Online spot check: on unless TEXAS_TLO_CHECK=off. */
  tloCheck: boolean;
  /** Bills the spot check reads each day (TEXAS_TLO_CHECK_BILLS, default 5). */
  tloBills: number;
};

const num = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(v ?? "");
  return v != null && v.trim() !== "" && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
};
export function txChainSettings(env: Record<string, string | undefined> = process.env): TxChainSettings {
  const dailyRequests = num(env.TEXAS_DAILY_REQUESTS, 200, 1, 45_000);
  return {
    dailyRequests,
    perMinute: num(env.TEXAS_REQUESTS_PER_MINUTE, 8, 1, 300),
    perStart: Math.min(dailyRequests, num(env.TEXAS_REQUESTS_PER_START, Math.min(120, dailyRequests), 1, 45_000)),
    maxLinks: num(env.TEXAS_CHAIN_MAX, 10, 0, 40),
    linkMs: num(env.TEXAS_LINK_SECONDS, 240, 15, 270) * 1000,
    legiscanDaily: num(env.TEXAS_LEGISCAN_DAILY, 30, 0, 900),
    tloCheck: !/^(off|false|0|no)$/i.test((env.TEXAS_TLO_CHECK ?? "").trim()),
    tloBills: num(env.TEXAS_TLO_CHECK_BILLS, 5, 0, 25),
  };
}

/* ------------------------------------------------------------------ Budget --- */

/** Kept in the cursor "tx:budget". Counts reset when the UTC day changes. */
export type TxBudget = { day: string; used: number; legiscan: number; tlo: number; limitedAt: number | null; lastAt: number | null };
export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export function readBudget(raw: string | null, now: number): TxBudget {
  const day = utcDay(now);
  let v: Partial<TxBudget> | null = null;
  try { v = raw ? JSON.parse(raw) as Partial<TxBudget> : null; } catch { v = null; }
  const lastAt = typeof v?.lastAt === "number" ? v.lastAt : null;
  if (!v || v.day !== day) return { day, used: 0, legiscan: 0, tlo: 0, limitedAt: null, lastAt };
  const n = (x: unknown) => (typeof x === "number" && x >= 0 ? Math.floor(x) : 0);
  return { day, used: n(v.used), legiscan: n(v.legiscan), tlo: n(v.tlo), limitedAt: typeof v.limitedAt === "number" ? v.limitedAt : null, lastAt };
}

/**
 * How long to wait before the next Open States request. Requests are spaced evenly (60 s / perMinute, plus a quarter
 * second of slack), which keeps every clock minute under the limit; `lastAt` is kept in the cursor so the spacing
 * holds across links.
 */
export function paceWaitMs(lastAt: number | null, now: number, perMinute: number): number {
  if (lastAt == null) return 0;
  const gap = Math.ceil(60_000 / Math.max(1, perMinute)) + 250;
  return Math.max(0, lastAt + gap - now);
}

export type RequestCheck = { ok: true } | { ok: false; reason: "rate limited" | "daily budget" | "start budget" | "run budget" | "time" };
/** May one more Open States request go out? `runUsed`/`runCap` are this run's own; `startUsed` is this start's (all links). */
export function mayRequest(b: TxBudget, s: TxChainSettings, r: { runUsed: number; runCap: number; startUsed: number; now: number; deadline: number; waitMs: number }): RequestCheck {
  if (b.limitedAt) return { ok: false, reason: "rate limited" };
  if (b.used >= s.dailyRequests) return { ok: false, reason: "daily budget" };
  if (r.startUsed >= s.perStart) return { ok: false, reason: "start budget" };
  if (r.runUsed >= r.runCap) return { ok: false, reason: "run budget" };
  // Keep eight seconds back for storing what the last request returned.
  if (r.now + r.waitMs > r.deadline - 8000) return { ok: false, reason: "time" };
  return { ok: true };
}

export type StartKind = "scheduled" | "chain" | "manual";
/**
 * May a run start? After a 429 the rest of that day is off for chain links and manual runs; the next scheduled start
 * (at least 30 minutes later) may try again, because the per-minute limit clears in a minute and a scheduled start
 * is twice a day at most. A new UTC day clears it (readBudget).
 */
export function mayStart(b: TxBudget, s: TxChainSettings, kind: StartKind, now: number): { ok: true } | { ok: false; reason: string } {
  if (b.limitedAt && !(kind === "scheduled" && now - b.limitedAt >= 30 * 60_000))
    return { ok: false, reason: "Open States answered 429 (too many requests) today; loading waits for the next day or the next scheduled start" };
  if (b.used >= s.dailyRequests) return { ok: false, reason: `today's ${s.dailyRequests} Open States requests are used` };
  return { ok: true };
}
/** A scheduled start that is allowed after a 429 clears the mark, so its own requests can go out. */
export const clearLimitForStart = (b: TxBudget, kind: StartKind): TxBudget => (kind === "scheduled" && b.limitedAt ? { ...b, limitedAt: null } : b);

/* -------------------------------------------------------------------- Lock --- */

/** Kept in the cursor "tx:lock". `chain` lets the next link of the same start take the lock its predecessor reserved. */
export type TxLock = { owner: string; chain: string | null; until: number };
export function readLock(raw: string | null): TxLock | null {
  try { const v = raw ? JSON.parse(raw) as Partial<TxLock> : null; return v && typeof v.owner === "string" && typeof v.until === "number" ? { owner: v.owner, chain: typeof v.chain === "string" ? v.chain : null, until: v.until } : null; }
  catch { return null; }
}
/** The same rule the database applies when taking the lock (ingest.ts): free, expired, or reserved for this chain. */
export function lockAvailable(raw: string | null, now: number, chain: string | null): boolean {
  const l = readLock(raw);
  return !l || l.until < now || (!!chain && l.chain === chain);
}

/* ------------------------------------------------------------ Chain decision --- */

export type StoppedBy = "time" | "nothing left" | "rate limited" | "daily budget" | "start budget" | "run budget" | "error" | "busy" | "not allowed" | "no key";
export type ChainDecision = { next: boolean; reason: string };
/** After a link: call the next one only when this one ran out of time with work and budget left. */
export function chainDecision(i: { link: number; maxLinks: number; stoppedBy: StoppedBy; workLeft: boolean; dailyLeft: number; startLeft: number }): ChainDecision {
  if (i.stoppedBy === "error") return { next: false, reason: "stopped on an error" };
  if (i.stoppedBy === "rate limited") return { next: false, reason: "Open States answered 429; waits for the next day or the next scheduled start" };
  if (i.stoppedBy === "busy") return { next: false, reason: "another Texas load is running" };
  if (i.stoppedBy === "not allowed" || i.stoppedBy === "no key") return { next: false, reason: i.stoppedBy };
  if (i.dailyLeft <= 0 || i.stoppedBy === "daily budget") return { next: false, reason: "today's request budget is used" };
  if (i.startLeft <= 0 || i.stoppedBy === "start budget") return { next: false, reason: "this start's share of the budget is used" };
  if (!i.workLeft) return { next: false, reason: "nothing left to load" };
  if (i.link >= i.maxLinks) return { next: false, reason: `link limit (${i.maxLinks}) reached` };
  if (i.stoppedBy !== "time" && i.stoppedBy !== "run budget") return { next: false, reason: i.stoppedBy };
  return { next: true, reason: "work and budget left" };
}

/** The one log line per link. */
export function chainLogLine(link: number, r: { status: string; requests: number; usedToday: number; daily: number; bills: number; waiting: Record<string, number>; stoppedBy: string; decision: ChainDecision }) {
  const waiting = Object.entries(r.waiting).map(([s, n]) => `${s}: ${n}`).join(", ") || "none";
  return `TX_CHAIN link ${link} | ${r.status} | requests ${r.requests} (today ${r.usedToday} of ${r.daily}) | bills ${r.bills} | waiting ${waiting} | stopped by ${r.stoppedBy} | ${r.decision.next ? "continues" : `ends: ${r.decision.reason}`}`;
}

/**
 * Start the next link. Not waited for: it runs as its own function for up to five minutes; the four-second wait only
 * makes sure the request has left (the same way lib/analysis/chain.ts hands over). `start` is "scheduled" only for
 * the first link the scheduled update starts.
 */
export async function fireTexasChain(origin: string, link: number, opts: { chain?: string; start?: StartKind; startUsed?: number } = {}): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !origin || txChainSettings().maxLinks < 1) return false;
  const q = new URLSearchParams({ chain: String(link), start: opts.start ?? (link === 1 ? "scheduled" : "chain") });
  if (opts.chain) q.set("id", opts.chain);
  if (opts.startUsed) q.set("used", String(opts.startUsed));
  try { await fetch(`${origin}/api/automation/texas?${q}`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(4000), cache: "no-store" }); }
  catch { /* expected: the next link keeps running after this request stops waiting */ }
  return true;
}
