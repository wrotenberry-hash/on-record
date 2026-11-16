import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { SharePanel } from "@/components/share/share-panel";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { recapFor } from "@/lib/recap";
import { positionLine, voteKind } from "@/lib/federal/vote-kinds";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your weekly recap · On Record", robots: { index: false, follow: false } };

export default async function RecapPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/recap" access={access} page="/recap">{null}</PublicShell>;
  const r = await recapFor(await currentAppUserId()).catch(() => null);
  return <PublicShell current="/recap" access={access} page="/recap">
    <section className="fed-page">
      <div className="eyebrow">WEEKLY RECAP <OfficialBadge /></div>
      <h1>Your legislators this week</h1>
      {!r ? <p><Link className="cta" href="/start">Add your ZIP</Link> to see your legislators&apos; week.</p> : <>
        {r.rows.length ? <ul className="result-list">{r.rows.slice(0, 12).map(v => <li key={`${v.rollCallId}-${v.name}`}><span><b>{v.full}</b> · {positionLine(v.position, voteKind(v.question, v.billTitle ?? v.title)).toLowerCase()}</span>
          {v.billId ? <Link href={`/bills/${v.billId}`}>{v.billTitle ?? v.title}</Link> : <span>{v.title ?? v.question}</span>}<span className="meta">{shortDate(v.votedAt)}</span></li>)}</ul>
          : <p className="meta">No recorded votes by your legislators in the last 7 days.</p>}
        <h2>Share the recap</h2>
        <SharePanel imageBase="/api/cards/recap?v=1" filename="on-record-recap" defaultCaption="My legislators' votes this week, from the official record." />
      </>}
    </section>
  </PublicShell>;
}
