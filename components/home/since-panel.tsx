import Link from "next/link";
import { shortDate } from "@/components/federal/badges";
import { previousVisit } from "@/lib/visits";
import { sinceItems } from "@/lib/since";
import { currentLocation } from "@/lib/location";
import { federalLegislators } from "@/lib/federal/legislators";
import { positionLine, voteKind } from "@/lib/federal/vote-kinds";

/** "Since you last visited": new votes by your legislators and the members you follow, followed bills that moved, Texas activity. */
export async function SincePanel({ userId }: { userId: string | null }) {
  const prev = await previousVisit(userId).catch(() => null);
  if (!prev) return null;
  const loc = await currentLocation(userId).catch(() => null);
  const mine = loc ? await federalLegislators(loc.state, loc.congressional).catch(() => null) : null;
  const ids = mine ? [...mine.senators.map(s => s.id), ...(mine.representative ? [mine.representative.id] : [])] : [];
  const s = await sinceItems(prev, userId, ids, loc?.state ?? null).catch(() => null);
  if (!s) return null;
  const nothing = !s.votes.length && !s.bills.length && !s.texasMoved;
  return <section className="since-panel" aria-label="Since you last visited">
    <h2>Since you last visited <span className="meta">({shortDate(prev)})</span></h2>
    {nothing ? <p className="meta">Nothing new from your legislators or the bills you follow yet.{!loc ? <> <Link href="/legislators">Add your ZIP</Link> to see your legislators here.</> : null}</p> : <ul className="result-list">
      {s.votes.slice(0, 5).map(v => <li key={`${v.rollCallId}-${v.memberId}`}><span><b>{v.name}</b>: {positionLine(v.position, voteKind(v.question, v.billTitle ?? v.title)).toLowerCase()}</span>
        {v.billId ? <Link href={`/bills/${v.billId}`}>{v.billTitle ?? v.title ?? v.question}</Link> : <span>{v.title ?? v.question}</span>}<span className="meta">{shortDate(v.votedAt)}</span></li>)}
      {s.votes.length > 5 && <li className="meta">and {s.votes.length - 5} more votes</li>}
      {s.bills.map(b => <li key={b.id}><Link href={`/bills/${b.id}`}>{b.title}</Link><span className="meta">Now: {b.stageLabel}{b.stageDate ? ` (${shortDate(b.stageDate)})` : ""}</span></li>)}
      {s.texasMoved > 0 && <li><Link href="/texas">{s.texasMoved} Texas bills moved</Link></li>}
    </ul>}
  </section>;
}
