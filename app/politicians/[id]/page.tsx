import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, memberLine, shortDate } from "@/components/federal/badges";
import { FollowButton } from "@/components/federal/follow-button";
import { VoteRow } from "@/components/federal/vote-row";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { followedIds, getPolitician, recentVotes } from "@/lib/federal/queries";

export const dynamic = "force-dynamic";

export default async function PoliticianPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await viewerAccess();
  const { id } = await params;
  if (!access.allowed) return <PublicShell current="/politicians" access={access}>{null}</PublicShell>;
  const p = await getPolitician(id);
  if (!p) notFound();
  const [votes, followed] = await Promise.all([recentVotes(p.id, 10), currentAppUserId().then(followedIds)]);
  return <PublicShell current="/politicians" access={access}>
    <section className="fed-page">
      <p className="crumbs"><Link href="/politicians">← All politicians</Link></p>
      <div className="member-head">
        <div><div className="eyebrow">{memberLine(p)}</div><h1>{p.fullName}</h1>
          <p className="meta">{p.isCurrent ? `Term ends ${shortDate(p.termEnd)}` : "No longer serving"}{p.officialUrl && <> · <a href={p.officialUrl} target="_blank" rel="noopener noreferrer">Official site</a></>}</p></div>
        <FollowButton politicianId={p.id} following={followed.has(p.id)} canFollow={!!access.editor} />
      </div>
      <h2>Last {votes.length || 10} votes <OfficialBadge /></h2>
      {votes.length ? <ul className="vote-list">{votes.map(v => <VoteRow key={v.rollCallId} v={v} />)}</ul>
        : <p className="empty-note">No recorded votes stored yet. Votes load with each scheduled update.</p>}
      <p className="source-line">Votes are copied from the {p.chamber === "senate" ? "Senate's roll-call records (senate.gov)" : "House Clerk's roll-call records (clerk.house.gov)"}; each links to its source. Member details from the congress-legislators project, retrieved {shortDate(p.retrievedAt)}.</p>
    </section>
  </PublicShell>;
}
