import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { SharePanel } from "@/components/share/share-panel";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { agreementCardFor } from "@/lib/cards";
import { BRAND, brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Share my agreement"), robots: { index: false, follow: false } };

/** Share your own agreement with a member on one issue. Private until you share it. */
export default async function ShareAgreementPage({ params }: { params: Promise<{ member: string; issue: string }> }) {
  const access = await viewerAccess();
  const { member, issue } = await params;
  if (!access.allowed) return <PublicShell current="/politicians" access={access} page="/share/agreement">{null}</PublicShell>;
  const userId = await currentAppUserId();
  if (!userId || !/^[A-Z]\d{6}$/.test(member) || !/^[a-z-]{3,40}$/.test(issue)) notFound();
  const data = await agreementCardFor(userId, member, issue);
  if (!data) notFound();
  return <PublicShell current="/politicians" access={access} page="/share/agreement">
    <section className="fed-page">
      <p className="crumbs"><Link href={`/politicians/${member}`}>← {data.member}</Link></p>
      <div className="eyebrow">SHARE MY OWN COMPARISON</div>
      <h1>Share how your views compare with {data.member}&apos;s votes</h1>
      <p className="meta">This is private until you share it. The card carries one count: on how many bills they voted the way you answered. It is your own comparison, not a grade or score of the legislator. Left out: procedural votes, bills with no recorded vote on passing, and your Unsure answers.</p>
      <SharePanel imageBase={`/api/cards/agreement?member=${member}&issue=${issue}`} filename={`${BRAND.fileSlug}-${member}-${issue}`} defaultCaption="" />
    </section>
  </PublicShell>;
}
