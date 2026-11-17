import { cleanDigest, routePattern } from "./error-rules";

/**
 * Called by the error pages (app/error.tsx, app/global-error.tsx): tells the
 * site, once per browser tab and error, that a reader saw the error page.
 * Sends only the kind of page (no address, no query), a short message and the
 * framework's digest. Never throws and never blocks the page.
 */
export function reportClientError(error: (Error & { digest?: string }) | null | undefined) {
  if (typeof window === "undefined" || !error) return;
  const digest = cleanDigest(error.digest), message = String(error.message ?? "").split("\n")[0].slice(0, 200);
  try {
    const key = `or_err:${digest ?? message.slice(0, 60)}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
  } catch { /* storage blocked: report anyway */ }
  try {
    void fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, keepalive: true, credentials: "same-origin",
      body: JSON.stringify({ route: routePattern(window.location.pathname), message, ...(digest ? { digest } : {}) }) }).catch(() => undefined);
  } catch { /* nothing to do */ }
}
