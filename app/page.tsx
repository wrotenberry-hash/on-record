import Link from "next/link";
import { redirect } from "next/navigation";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import { PublicShell } from "@/components/public/public-shell";
import { AnalysisBadge, OfficialBadge } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { RightNow } from "@/components/home/right-now";
import { SincePanel } from "@/components/home/since-panel";

export const dynamic = "force-dynamic";

/**
 * The home page leads with the voting record (owner decision 2026-11-15); the
 * claim record follows. Public readers and invite-only trial readers see it.
 * With public reading off, the editor and anonymous visitors go to the private
 * checking instrument, as before.
 */
export default async function Home() {
  const publicRead = publicReadEnabled(process.env[PUBLIC_READ_FLAG]);
  const access = await viewerAccess();
  if (!publicRead && !access.invite) redirect("/editor");
  const userId = await currentAppUserId().catch(() => null);
  return <PublicShell current="/" access={access} page="/">
    <RightNow />
    <SincePanel userId={userId} />
    <section className="landing">
      <div className="eyebrow">THE CONGRESSIONAL RECORD, IN PLAIN WORDS</div>
      <h1>Talk is cheap. The record isn&apos;t.</h1>
      <p className="lede">See how every senator and representative voted, what each bill would do, and the strongest case for and against it. Every section says where it came from: copied from government records, or written by AI and checked. No scores, no grades.</p>
      <div className="landing-actions"><Link className="cta" href="/legislators">Find your legislators</Link><Link href="/briefing">Today&apos;s briefing</Link><Link href="/issues">Browse by issue</Link></div>
      <div className="landing-grid">
        <div><b>Every recorded vote <OfficialBadge /></b><p>House and Senate roll calls, copied from the House Clerk and senate.gov, each with a link to its source and a plain line on what the vote was for.</p></div>
        <div><b>Bills in plain words <AnalysisBadge /></b><p>What a bill would do, who it affects and what we don&apos;t know, cited to its sections. Written by AI, checked by fixed rules, and sampled by a person.</p></div>
        <div><b>Follow your members</b><p>Follow the people who represent you and see their latest votes in one place.</p></div>
        <div><b>No grades</b><p>On Record shows what officials did. It does not score, rate or rank anyone, and the case for and against each bill gets equal space.</p></div>
      </div>
      <p className="landing-note">Separately, On Record checks what politicians say against the evidence, one claim at a time, with a person reviewing every record. <Link href="/method">How a claim is checked</Link>.</p>
    </section>
  </PublicShell>;
}
