/**
 * "Something wrong? Tell us": which page a report is about. Pure; tested in
 * tests/report-page.test.mjs. The footer link carries the kind of page (for
 * example "/bills/[id]"); the exact page comes from the browser's own Referer
 * header when it is from this site. Only the path is kept. The query is kept
 * for the few pages where it says which item is shown (a share card, a
 * comparison); it is dropped everywhere else, so search words and sign-in
 * tokens are never stored with a report.
 */
const KEEP_QUERY: Record<string, readonly string[]> = {
  "/share/card": ["t", "member", "roll", "bill", "kind", "pub", "issue"],
  "/compare": ["a", "b"],
  "/moving": ["issue"],
};
const MAX = 280;

/** A same-site path that is safe to store and to link back to, or null. */
export function safePagePath(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /[\u0000-\u001f]/.test(v)) return null;
  let url: URL;
  try { url = new URL(v, "https://site.invalid"); } catch { return null; }
  if (url.origin !== "https://site.invalid") return null;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/report" || path.startsWith("/report/") || path.startsWith("/api/") || path.startsWith("/editor")) return null;
  const keep = KEEP_QUERY[path] ?? [];
  const q = new URLSearchParams();
  for (const k of keep) { const val = url.searchParams.get(k); if (val && /^[A-Za-z0-9._-]{1,80}$/.test(val)) q.set(k, val); }
  const out = `${path}${q.size ? `?${q}` : ""}`;
  return out.length <= MAX ? out : path.slice(0, MAX);
}

/**
 * The page a report is about: the page the reader came from when the browser
 * says so and it is on this site, else the page named in the link, else home.
 */
export function reportPagePath(input: { queryPage?: string | null; referer?: string | null; host?: string | null }): string {
  const fromLink = safePagePath(input.queryPage);
  let fromReferer: string | null = null;
  try {
    if (input.referer && input.host) { const r = new URL(input.referer); if (r.host === input.host) fromReferer = safePagePath(`${r.pathname}${r.search}`); }
  } catch { /* not a URL */ }
  // The link names the kind of page ("/bills/[id]"); a real path from the same kind of page is better.
  if (fromReferer && (!fromLink || fromLink.includes("[") || fromLink === fromReferer.split("?")[0])) return fromReferer;
  return fromLink && !fromLink.includes("[") ? fromLink : fromReferer ?? (fromLink ?? "/");
}

/** The kind of page for the report's subject ("/bills/[id]"), from the link or worked out from the path. */
export function reportSubject(queryPage: string | null | undefined, path: string): string {
  const fromLink = safePagePath(queryPage);
  return (fromLink ?? path).split("?")[0].slice(0, 120);
}
