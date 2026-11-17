import Link from "next/link";
import { redirect } from "next/navigation";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import { PublicShell } from "@/components/public/public-shell";
import { AnalysisBadge, OfficialBadge } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { RightNow } from "@/components/home/right-now";
import { SincePanel } from "@/components/home/since-panel";
import { PersonalHome } from "@/components/home/personal";
import { Landing } from "@/components/home/landing";
import { currentLocation } from "@/lib/location";
import { pickedIssues } from "@/lib/reader-issues";
import { countEvent } from "@/lib/events";
import { isActionRerender } from "@/lib/flow/zip";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * The home page leads with the voting record (owner decision 2026-11-15); the
 * claim record follows. Public readers and invite-only trial readers see it.
 * With public reading off, the editor and anonymous visitors go to the private
 * checking instrument, as before (the editor sees the same first-minute flow at /start).
 *
 * Owner, 17 Nov 2026: a newcomer (no place saved yet) gets one screen: the tagline, one sentence and one form
 * (ZIP, optional street address). The form leads straight to /start: their legislators, what is coming up, and how
 * their district compares. A returning reader gets their personal home, with what is coming up near the top.
 */
export default async function Home() {
  const publicRead = publicReadEnabled(process.env[PUBLIC_READ_FLAG]);
  const access = await viewerAccess();
  if (!publicRead && !access.invite) redirect("/editor");
  const userId = await currentAppUserId().catch(() => null);
  const [loc, issues] = await Promise.all([currentLocation(userId).catch(() => null), pickedIssues(userId).catch(() => [] as string[])]);
  const newcomer = !loc, canAnswer = !!access.invite || !!access.editor;
  if (newcomer && !(await isActionRerender())) { await countEvent("onboarding_start", access.audience); await countEvent("flow_landing", access.audience); }
  const about = <div className="landing-grid">
    <div><b>Every recorded vote <OfficialBadge /></b><p>House and Senate roll calls, copied from the House Clerk and senate.gov, each with a link to its source and a plain line on what the vote was for.</p></div>
    <div><b>Bills in plain words <AnalysisBadge /></b><p>What a bill would do, who it affects and what we don&apos;t know, cited to its sections. Written by AI, checked by fixed rules, and sampled by a person.</p></div>
    <div><b>Follow your members</b><p>Follow the people who represent you and see their latest votes in one place.</p></div>
    <div><b>No grades</b><p>{BRAND.name} shows what officials did. It does not score, rate or rank anyone, and the case for and against each bill gets equal space.</p></div>
  </div>;
  const note = <p className="landing-note">Separately, {BRAND.name} checks what politicians say against the evidence, one claim at a time, with a person reviewing every record. <Link href="/method">How a claim is checked</Link>.</p>;
  return <PublicShell current="/" access={access} page="/">
    {newcomer ? <>
      <Landing next="/start" keptWith={access.editor ? "editor" : access.invite ? "invite" : null} />
      {issues.length > 0 && <PersonalHome userId={userId} canAnswer={canAnswer} />}
      <SincePanel userId={userId} />
      <RightNow />
      <section className="landing">{about}{note}</section>
    </> : <>
      <PersonalHome userId={userId} canAnswer={canAnswer} />
      <SincePanel userId={userId} />
      <RightNow />
      <section className="landing">
        <div className="eyebrow">THE CONGRESSIONAL RECORD, IN PLAIN WORDS</div>
        <h1>{BRAND.tagline}</h1>
        <p className="lede">See how every senator and representative voted, what each bill would do, and the strongest case for and against it. Every section says where it came from: copied from government records, or written by AI and checked. No scores, no grades.</p>
        <div className="landing-actions"><Link className="cta" href="/legislators">Your legislators</Link><Link href="/briefing">Today&apos;s briefing</Link><Link href="/issues">Browse by issue</Link></div>
        {about}{note}
      </section>
    </>}
  </PublicShell>;
}
