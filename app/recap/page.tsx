import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, billLabel } from "@/components/federal/badges";
import { SharePanel } from "@/components/share/share-panel";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { recapFor } from "@/lib/recap";
import { MemberVoteRow } from "@/components/bills/member-vote-row";
import { billRowsFor } from "@/lib/bill-row-store";
import { BRAND, brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Your weekly recap"), robots: { index: false, follow: false } };

export default async function RecapPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/recap" access={access} page="/recap">{null}</PublicShell>;
  const r = await recapFor(await currentAppUserId()).catch(() => null);
  const rows = await billRowsFor((r?.rows ?? []).slice(0, 12).map(v => ({ billId: v.billId, title: v.billTitle, number: v.billType ? billLabel(v.billType, v.number!) : null })));
  return <PublicShell current="/recap" access={access} page="/recap">
    <section className="fed-page">
      <div className="eyebrow">WEEKLY RECAP <OfficialBadge /></div>
      <h1>Your legislators this week</h1>
      {!r ? <p><Link className="cta" href="/start">Add your ZIP</Link> to see your legislators&apos; week.</p> : <>
        {r.rows.length ? <ul className="result-list">{r.rows.slice(0, 12).map(v => <MemberVoteRow key={`${v.rollCallId}-${v.name}`} v={{ ...v, name: v.full }} row={v.billId ? rows.get(v.billId) : null} />)}</ul>
          : <p className="meta">No recorded votes by your legislators in the last 7 days.</p>}
        <h2>Share the recap</h2>
        <SharePanel imageBase="/api/cards/recap?v=1" filename={`${BRAND.fileSlug}-recap`} defaultCaption="My legislators' votes this week, from the official record." />
      </>}
    </section>
  </PublicShell>;
}
