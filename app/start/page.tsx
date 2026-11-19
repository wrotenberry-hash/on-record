import Link from "next/link";
import "@/components/home/flow.css";
import { PublicShell } from "@/components/public/public-shell";
import { Landing } from "@/components/home/landing";
import { YourLegislatorsBlock } from "@/components/home/legislator-cards";
import { IssuesStep } from "@/components/home/issues-step";
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
 * The first screen after the address (owner, 17 and 18 Nov 2026), on one page: "Your five legislators" (or the honest
 * count), each with a photo, the party as a word and their last three meaningful votes in plain lines; what the reader
 * now follows and whether vote alerts are on; one step to pick up to three issues; then "Here's what's coming up that
 * affects you" with one-tap answers and "See how your district compares". A newcomer (no place saved) gets the
 * landing form first; `?change=1` brings the form back.
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
      <YourLegislatorsBlock loc={loc} userId={userId} next="/start" level={1} canFollow={synced}><Link href="/start?change=1">Change address or ZIP</Link></YourLegislatorsBlock>
      {synced && <IssuesStep userId={userId} />}
      <ComingUp userId={userId} loc={loc} canAnswer={synced} />
      <DistrictCompare userId={userId} loc={loc} />
      <p className="flow-finish"><Link href="/voice">See your record</Link> · <Link href="/">Go to your home page</Link></p>
    </section>
  </PublicShell>;
}
