import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * /record leads to "Your record", which keeps its first address, /voice (owner, 18 Nov 2026, point 5). This file shows
 * nothing itself: the page it leads to checks who is reading, so a visitor with no invite gets the private notice there.
 */
export default function RecordRedirect() {
  redirect("/voice");
}
