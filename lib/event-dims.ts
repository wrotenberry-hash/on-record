/**
 * Dimensions for the aggregate usage counts (lib/events.ts). Pure; tested in
 * tests/trial.test.mjs. A count's dimension never contains an id: member, bill
 * and issue pages are counted by page type, not by which one was viewed.
 */
export type Audience = "public" | "trial" | "editor" | "closed";

const TEMPLATES: Array<[RegExp, string]> = [
  [/^\/politicians\/[^/]+$/, "/politicians/[id]"],
  [/^\/bills\/[^/]+$/, "/bills/[id]"],
  [/^\/issues\/[^/]+$/, "/issues/[slug]"],
  [/^\/records\/[^/]+$/, "/records/[id]"],
];

/** A path with every id replaced by its route parameter. Unknown paths collapse to "other". */
export function pageTemplate(path: string): string {
  const p = (path.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  for (const [re, t] of TEMPLATES) if (re.test(p)) return t;
  return ["/", "/politicians", "/issues", "/following", "/records", "/method", "/about", "/corrections"].includes(p) ? p : "other";
}

export function dim(audience: Audience, template: string) { return `${audience}:${template}`; }

const BOT = /bot|crawl|spider|slurp|preview|fetch|monitor|headless|lighthouse|curl|wget|python-requests|httpclient|node-fetch|vercel-screenshot|facebookexternalhit|embedly/i;
/** Automated clients are not counted. An empty user agent counts as automated. */
export function isAutomated(userAgent: string | null | undefined) { return !userAgent || BOT.test(userAgent); }

export function utcDay(ms = Date.now()) { return new Date(ms).toISOString().slice(0, 10); }
