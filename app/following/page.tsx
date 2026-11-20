import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, memberLine, shortDate } from "@/components/federal/badges";
import { VoteList } from "@/components/federal/vote-row";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { followedPoliticians, lastFederalRun, recentVotes } from "@/lib/federal/queries";
import { UpdateNow } from "./update-now";
import { brandTitle } from "@/lib/brand";
import { TexasFollows, texasFollowsOf } from "@/components/home/texas-follows"; // Texas legislators can be followed too (persuasion and retention round, point 2)

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Following"), robots: { index: false, follow: false } };

export default async function FollowingPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/following" access={access}>{null}</PublicShell>;
  const userId = await currentAppUserId();
  const people = userId ? await followedPoliticians(userId) : [], texas = await texasFollowsOf(userId);
  const [feeds, run] = await Promise.all([Promise.all(people.map(async p => ({ p, votes: await recentVotes(p.id, 15) }))), lastFederalRun()]);
  return <PublicShell current="/following" access={access}>
    <section className="fed-page">
      <div className="eyebrow">YOUR FOLLOWS <OfficialBadge /></div>
      <h1>Following</h1>
      <div className="run-line"><span>Votes last updated: {run ? `${shortDate(run.startedAt)}, ${new Date(run.startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} Eastern` : "not yet"}{access.editor && run ? ` · ${run.status.toLowerCase()}` : ""}</span>{access.editor && <UpdateNow />}</div>
      {!people.length && !texas.length && <p className="empty-note">You are not following anyone yet. <Link href="/politicians">Find a politician</Link> and tap Follow.</p>}
      {feeds.map(({ p, votes }) => <article key={p.id} className="follow-card">
        <h2><Link href={`/politicians/${p.id}`}>{p.fullName}</Link></h2><p className="meta">{memberLine(p)}</p>
        {votes.length ? <VoteList votes={votes} take={5} /> : <p className="meta">No recorded votes stored yet.</p>}
        <p><Link href={`/politicians/${p.id}`}>All recent votes →</Link></p>
      </article>)}
      <TexasFollows people={texas} />
    </section>
  </PublicShell>;
}
