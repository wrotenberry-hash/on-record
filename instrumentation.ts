import type { Instrumentation } from "next";

/**
 * Error monitoring without an outside service. Next calls `onRequestError` for
 * every error it catches on the server (a page, a route handler, a server
 * action). One row per day, route pattern and short message is counted in
 * error_events (lib/error-events.ts). Never stored: the address with its
 * query, cookies, headers or anything about the reader; the request object is
 * not even passed on. Redirects and not-found are not errors and are skipped.
 * What counts as real breakage is decided later, in lib/error-rules.ts.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  // The database client needs Node; written this way so the other runtime's bundle leaves the import out.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { recordServerError } = await import("./lib/error-events");
      await recordServerError(error, { routePath: context.routePath, routeType: context.routeType });
    } catch { /* recording an error must never cause another */ }
  }
};
