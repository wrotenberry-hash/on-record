import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { SharePanel } from "@/components/share/share-panel";
import { viewerAccess } from "@/lib/viewer";
import { voteCardFor } from "@/lib/cards";

export const dynamic = "force-dynamic";
export const metadata = { title: "Share a vote · On Record", robots: { index: false, follow: false } };

/** Share one recorded vote as an image. The card is built from the record only. */
export default async function ShareVotePage({ params }: { params: Promise<{ member: string; roll: string }> }) {
  const access = await viewerAccess();
  const { member, roll } = await params;
  if (!access.allowed) return <PublicShell current="/politicians" access={access} page="/share/vote">{null}</PublicShell>;
  if (!/^[A-Z]\d{6}$/.test(member) || !/^[a-z0-9-]{5,40}$/.test(roll)) notFound();
  const data = await voteCardFor(member, roll);
  if (!data) notFound();
  return <PublicShell current="/politicians" access={access} page="/share/vote">
    <section className="fed-page">
      <p className="crumbs"><Link href={`/politicians/${member}`}>← {data.member}</Link></p>
      <div className="eyebrow">SHARE A VOTE</div>
      <h1>Share how {data.member} voted</h1>
      <p className="meta">The card shows the vote as recorded, what kind of vote it was, the date, the bill&apos;s one-line summary labelled Analysis, and the official source. Your caption goes beside it.</p>
      <SharePanel imageBase={`/api/cards/vote?member=${member}&roll=${roll}`} filename={`on-record-${member}-${roll}`} defaultCaption="" />
    </section>
  </PublicShell>;
}
