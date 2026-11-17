"use client";
import { BRAND } from "@/lib/brand";

/** Round E: last-resort error page when the whole layout fails. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body style={{ fontFamily: "Arial, sans-serif", padding: 24, background: "#f7f6f2", color: "#172224" }}>
    <h1>{BRAND.name} did not load.</h1><p>Please try again in a moment.</p>
    <button type="button" onClick={() => reset()} style={{ minHeight: 44, padding: "10px 20px" }}>Try again</button>
  </body></html>;
}
