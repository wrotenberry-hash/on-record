"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

/** Round E: last-resort error page when the whole layout fails. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError(error); }, [error]);
  return <html lang="en"><body style={{ fontFamily: "Arial, sans-serif", padding: 24, background: "#f7f6f2", color: "#172224" }}>
    <h1>On Record did not load.</h1><p>Please try again in a moment.</p>
    <button type="button" onClick={() => reset()} style={{ minHeight: 44, padding: "10px 20px" }}>Try again</button>
  </body></html>;
}
