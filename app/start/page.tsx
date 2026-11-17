import Link from "next/link";
import "@/components/home/flow.css";
import { PublicShell } from "@/components/public/public-shell";
import { Landing } from "@/components/home/landing";
import { LegislatorCards } from "@/components/home/legislator-cards";
import { ComingUp } from "@/components/home/coming-up";
import { DistrictCompare } from "@/components/home/district-compare";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { currentLocation } from "@/lib/location";
import { isActionRerender, rememberedZip } from "@/lib/flow/zip";
import { countEvent } from "@/lib/events";
import { brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Your legislators"), robots: { index: false, follow: false } };

/**
 * The first 60 seconds (owner, 17 Nov 2026), on one page: your legislators with each one's most recent meaningful vote
 * in a plain line, then "Here's what's coming up that affects you" with one-tap answers, then "See how your district
 * compares". A newcomer (no place saved) gets the landing form first; `?change=1` brings the form back.
 * No email sign-in is needed here: a trial reader's invite (or the editor's sign-in) is enough.
 */
export default async function StartPage({ searchParams }: { searchParams: Promise<{ change?: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/start" access={access} page="/start">{null}</PublicShell>;
  const userId = await currentAppUserId();
  const loc = await currentLocation(userId).catch(() => null);
  const synced = !!access.invite || !!access.editor;
  if (!loc || (await searchParams).change === "1") {
    if (!loc && !(await isActionRerender())) { await countEvent("onboarding_start", access.audience); await countEvent("flow_landing", access.audience); }
    return <PublicShell current="/start" access={access} page="/start"><Landing next="/start" zip={(await rememberedZip()) ?? ""} keptWith={access.editor ? "editor" : access.invite ? "invite" : null} /></PublicShell>;
  }
  return <PublicShell current="/start" access={access} page="/start">
    <section className="fed-page flow">
      <h1>Your legislators</h1>
      <p className="meta">Each one’s most recent vote on a bill, from the official record. <Link href="/start?change=1">Change ZIP or address</Link></p>
      <LegislatorCards loc={loc} next="/start" />
      <ComingUp userId={userId} loc={loc} canAnswer={synced} />
      <DistrictCompare userId={userId} loc={loc} />
      <p className="flow-finish">Want alerts when they vote? <Link href="/account#alerts">Follow your legislators</Link><br />
        <Link href="/voice">See your voice</Link> · <Link href="/">Go to your home page</Link></p>
    </section>
  </PublicShell>;
}
