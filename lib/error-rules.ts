/**
 * Error monitoring rules. Pure (no imports, no clock of its own); tested in
 * tests/error-rules.test.mjs. The site counts its own errors per day, route
 * pattern and short message (table error_events): never a URL query, a cookie,
 * a header or anything about a reader. `breakage` decides what is real
 * breakage, the only thing that is flagged to the owner.
 */
export type ErrorSource = "server" | "client";
export type ErrorRow = { day: string; source: ErrorSource; route: string; message: string; n: number; firstAt: number; lastAt: number };

export const ERROR_MESSAGE_MAX = 200;
export const ERROR_ROUTE_MAX = 80;
/** At most this many different (route, message) rows a day; the rest are folded into one "other errors" row. */
export const ERROR_KINDS_PER_DAY = 200;
export const OTHER_ERRORS = "other errors (too many different errors today)";
const HOUR = 3600e3, DAY = 24 * HOUR;
/** The same server error this many times within an hour on a reader page is breakage. */
export const REPEAT_THRESHOLD = 3;
/** …and so is the same server error this many times in 24 hours, however it was spread. */
export const REPEAT_DAY_THRESHOLD = 10;
/** The error page shown this many times in 24 hours is breakage. */
export const ERROR_PAGE_THRESHOLD = 3;

/** Path segments that are always an id or a token (a trial token is never stored). */
const ID_AFTER = new Set(["politicians", "bills", "issues", "records", "trial", "s", "members", "vote", "agreement", "cases"]);

/**
 * A request path as a route pattern: no query, no fragment, ids and tokens
 * replaced by "[id]". "/bills/119-hr-2347?c=1" becomes "/bills/[id]".
 */
export function routePattern(path: string | null | undefined): string {
  const raw = String(path ?? "").split(/[?#]/)[0].trim();
  if (!raw.startsWith("/")) return "other";
  const parts = raw.split("/").filter(Boolean).slice(0, 6);
  const out: string[] = [];
  for (const [i, part] of parts.entries()) {
    let p = part;
    try { p = decodeURIComponent(part); } catch { p = "%"; }
    const prev = parts[i - 1];
    const idLike = /^\[.*\]$/.test(p) ? false : (prev !== undefined && ID_AFTER.has(prev) && !(prev === "members" && parts[i - 2] !== "texas")) || /\d/.test(p) || p.length > 28 || !/^[a-z][a-z-]*$/.test(p);
    out.push(idLike || /^\[.*\]$/.test(p) ? "[id]" : p);
  }
  return (`/${out.join("/")}`).slice(0, ERROR_ROUTE_MAX);
}

/** The route file path Next reports ("/app/bills/[id]/page") as a pattern ("/bills/[id]"). */
export function routeFromFile(routePath: string | null | undefined): string {
  const p = String(routePath ?? "").replace(/^\/?app(?=\/|$)/, "").replace(/\/(page|route|layout|error|not-found)$/, "").replace(/\/\([^/]+\)/g, "") || "/";
  return routePattern(p.startsWith("/") ? p : `/${p}`);
}

/**
 * A short error message that is safe to keep: one line, at most 200 characters,
 * with links, email addresses, long numbers, ids and quoted values removed, so
 * that nothing a reader typed or was shown can end up in it and so that the same
 * fault always produces the same text.
 */
export function cleanMessage(raw: unknown): string {
  const text = String(raw ?? "").split("\n")[0]
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, "[email]")
    .replace(/(["'`])(?:(?!\1).){0,400}\1/g, "[value]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\binv_[a-z0-9.]+/gi, "[id]")
    .replace(/\b[0-9a-f]{16,}\b/gi, "[id]")
    .replace(/\b\d{3,}\b/g, "#")
    .replace(/\s+/g, " ").trim();
  return (text || "unknown error").slice(0, ERROR_MESSAGE_MAX);
}

/** A digest as Next gives it (a short hash), or null. */
export function cleanDigest(raw: unknown): string | null {
  const d = String(raw ?? "").trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(d) ? d : null;
}

/**
 * Errors that are how the framework steers a request, or a visitor going away,
 * not faults: redirects, not-found, a request the browser dropped.
 */
export function isExpectedError(error: unknown): boolean {
  const e = error as { digest?: unknown; name?: unknown; message?: unknown; code?: unknown } | null;
  const digest = String(e?.digest ?? ""), name = String(e?.name ?? ""), message = String(e?.message ?? ""), code = String(e?.code ?? "");
  if (/^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING|NEXT_PRERENDER_INTERRUPTED|HANGING_PROMISE_REJECTION)/.test(digest)) return true;
  if (/^(NEXT_REDIRECT|NEXT_NOT_FOUND)/.test(message)) return true;
  if (name === "AbortError" || code === "ECONNRESET" || code === "ERR_STREAM_PREMATURE_CLOSE" || /^(aborted|The operation was aborted|Connection closed|socket hang up)/i.test(message)) return true;
  return false;
}

/** Requests no real reader sends: a form posted to an action that does not exist, a broken body, a malformed address. Recorded, never flagged. */
export function isNoise(message: string): boolean {
  return /Failed to find Server Action|Invalid Server Actions request|URI malformed|Unexpected end of (form|JSON)|Body exceeded|Invalid URL|Request body|Missing `?origin`? header/i.test(message);
}

/** Pages and routes a reader uses. The editor's own tools and the scheduler are watched elsewhere. */
export function isReaderRoute(route: string): boolean {
  return !/^\/(editor|api\/editor|api\/automation|api\/ingest|skip)(\/|$| )/.test(route);
}

const ACTION = " (action)";
/** Sign-in, invite, saving an answer, and the health probe: one error there is already breakage. */
export function isCriticalRoute(route: string): boolean {
  const action = route.endsWith(ACTION), base = action ? route.slice(0, -ACTION.length) : route;
  if (["/login", "/trial/[id]", "/account/verify", "/api/automation/health"].includes(base)) return true;
  return action && ["/bills/[id]", "/account", "/start"].includes(base);
}
/** How a server action's errors are named apart from the page's own ("/bills/[id] (action)"). */
export function withRouteType(route: string, routeType: string | null | undefined) { return routeType === "action" ? `${route}${ACTION}`.slice(0, ERROR_ROUTE_MAX + ACTION.length) : route; }

export type Breakage = { broken: boolean; reasons: string[]; last24h: { errors: number; kinds: number; errorPagesShown: number } };

/**
 * Is the site really broken? Looks only at the last 24 hours:
 *   1. any server error on a critical route (sign-in, invite, saving an answer, the health probe);
 *   2. the same server error (same route and message) on a reader page at least 3 times within an hour.
 *      The table keeps a count with its first and last time, so this is true when the count could not
 *      have happened any other way: 3 or more inside one hour, or more than 2 for every hour it spans.
 *      Because a later stray error widens that span, 10 or more of the same error in 24 hours also counts;
 *   3. the error page shown to readers 3 or more times.
 * One-off errors, the editor's own pages and requests no reader sends (noise) never count.
 */
export function breakage(rows: readonly ErrorRow[], now: number): Breakage {
  const recent = rows.filter(r => r.lastAt > now - DAY && r.lastAt <= now + HOUR && r.n > 0);
  // The same error can sit in two day rows around midnight: put them back together.
  const merged = new Map<string, ErrorRow>();
  for (const r of recent) {
    const k = `${r.source}|${r.route}|${r.message}`, m = merged.get(k);
    merged.set(k, m ? { ...m, n: m.n + r.n, firstAt: Math.min(m.firstAt, r.firstAt), lastAt: Math.max(m.lastAt, r.lastAt) } : { ...r });
  }
  const list = [...merged.values()], reasons: string[] = [];
  const times = (n: number) => (n === 1 ? "once" : `${n} times`);
  for (const r of list.filter(x => x.source === "server" && !isNoise(x.message))) {
    if (isCriticalRoute(r.route)) { reasons.push(`${r.route} failed ${times(r.n)}: ${r.message}`); continue; }
    if (!isReaderRoute(r.route)) continue;
    const hours = Math.max(1, Math.ceil((r.lastAt - Math.max(r.firstAt, now - DAY)) / HOUR));
    if (r.n > (REPEAT_THRESHOLD - 1) * hours) reasons.push(`${r.route} failed ${times(r.n)} within ${hours === 1 ? "an hour" : `${hours} hours`}: ${r.message}`);
    else if (r.n >= REPEAT_DAY_THRESHOLD) reasons.push(`${r.route} failed ${times(r.n)} in the last 24 hours: ${r.message}`);
  }
  const shown = list.filter(x => x.source === "client" && isReaderRoute(x.route)).reduce((n, x) => n + x.n, 0);
  if (shown >= ERROR_PAGE_THRESHOLD) reasons.push(`Readers saw the error page ${shown} times in the last 24 hours.`);
  return { broken: reasons.length > 0, reasons: reasons.slice(0, 5), last24h: { errors: list.reduce((n, x) => n + x.n, 0), kinds: list.length, errorPagesShown: shown } };
}

/** The most frequent errors of the last 24 hours, for the probe and the editor. */
export function topErrors(rows: readonly ErrorRow[], now: number, limit = 3) {
  const recent = rows.filter(r => r.lastAt > now - DAY);
  const merged = new Map<string, { source: ErrorSource; route: string; message: string; n: number; lastAt: number }>();
  for (const r of recent) { const k = `${r.source}|${r.route}|${r.message}`, m = merged.get(k); merged.set(k, m ? { ...m, n: m.n + r.n, lastAt: Math.max(m.lastAt, r.lastAt) } : { source: r.source, route: r.route, message: r.message, n: r.n, lastAt: r.lastAt }); }
  return [...merged.values()].sort((a, b) => b.n - a.n || b.lastAt - a.lastAt).slice(0, limit);
}
