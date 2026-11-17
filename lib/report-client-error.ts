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
  // One report per error and browser tab: the codes already reported are kept in the tab only.
  const code = (digest ?? message.replace(/[^A-Za-z0-9]/g, "").slice(0, 24)) || "x";
  try {
    const seen = (window.sessionStorage.getItem("or_err") ?? "").split(",").filter(Boolean);
    if (seen.includes(code)) return;
    window.sessionStorage.setItem("or_err", [...seen, code].slice(-20).join(","));
  } catch { /* storage blocked: report anyway */ }
  try {
    void fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, keepalive: true, credentials: "same-origin",
      body: JSON.stringify({ route: routePattern(window.location.pathname), message, ...(digest ? { digest } : {}) }) }).catch(() => undefined);
  } catch { /* nothing to do */ }
}
