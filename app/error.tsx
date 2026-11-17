"use client";
import { useEffect } from "react";
import Link from "next/link";
import { reportClientError } from "@/lib/report-client-error";

/** Round E: a plain error state. No technical detail is shown; the reader can retry or go home. */
export default function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Counts that the error page was shown (kind of page and a short message only), so real breakage can be flagged.
  useEffect(() => { reportClientError(error); }, [error]);
  return <main className="state-page" role="alert">
    <div className="state-brand">ON <span>RECORD</span></div>
    <h1>This page did not load.</h1>
    <p>Something went wrong on our side. The record itself is safe; try again in a moment.</p>
    <div className="share-actions"><button type="button" onClick={() => reset()}>Try again</button><Link className="secondary-link" href="/">Go to the home page</Link></div>
  </main>;
}
