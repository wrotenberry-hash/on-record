import { BRAND } from "@/lib/brand";

/**
 * The product name as drawn in every top bar and on the error pages: the last word is set apart in a <span>, which the
 * `.brand span` and `.state-brand span` rules in app/globals.css style ("ON" + "RECORD"). A one-word name is drawn
 * whole, without the span, so it keeps the wordmark's main colour. The name comes from lib/brand.ts; no hooks, so
 * server and client pages can both use it.
 */
export function Wordmark() {
  const { lead, tail } = BRAND.wordmark;
  return lead ? <>{`${lead} `}<span>{tail}</span></> : <>{tail}</>;
}
