import "./flow.css";
import Link from "next/link";
import { getDb } from "@/db";
import { billLabel, shortDate } from "@/components/federal/badges";
import { previousVisit } from "@/lib/visits";
import { currentLocation } from "@/lib/location";
import { federalLegislators } from "@/lib/federal/legislators";
import { MemberVoteRow } from "@/components/bills/member-vote-row";
import { billRowsFor } from "@/lib/bill-row-store";
import { STAGE_LABEL, type StageKey } from "@/lib/federal/depth-parse";
import { followedBillsMovedSince, followedMemberIds, memberVotesSince, texasBillsMovedSince } from "@/lib/flow/card-store";
import { CAUGHT_UP, caughtUp, endOfList } from "@/lib/flow/cards";

const VOTES = 5, BILLS = 5;

/**
 * "Since you last visited": new votes by your legislators and the members you follow, and followed bills that moved.
 * It sits near the top of the home screen (owner, 18 Nov 2026, point 6). When nothing is newer than the reader's last
 * visit it says "You're caught up." once, in calm words. Otherwise it lists what is new, at most five of each, says
 * how many more there are and where they are, and ends with a line. A first visit shows nothing: there is nothing to
 * be caught up with yet. Texas activity is a count with a link, and does not decide whether the reader is caught up.
 */
export async function SincePanel({ userId }: { userId: string | null }) {
  const prev = await previousVisit(userId).catch(() => null);
  if (!prev) return null;
  const db = getDb(), sinceDay = new Date(prev).toISOString().slice(0, 10);
  const loc = await currentLocation(userId).catch(() => null);
  const mine = loc ? await federalLegislators(loc.state, loc.congressional).catch(() => null) : null;
  const ids = [...(mine ? [...mine.senators.map(s => s.id), ...(mine.representative ? [mine.representative.id] : [])] : []), ...(await followedMemberIds(db, userId).catch(() => []))];
  const s = await Promise.all([memberVotesSince(db, ids, prev, VOTES), followedBillsMovedSince(db, userId, sinceDay, BILLS), loc?.state === "TX" ? texasBillsMovedSince(db, sinceDay) : 0]).catch(() => null);
  if (!s) return null;
  const [votes, bills, texasMoved] = s;
  const voteRows = await billRowsFor(votes.rows.map(v => ({ billId: v.billId, title: v.billTitle, number: v.billType ? billLabel(v.billType, v.number!) : null })));
  const done = caughtUp({ previousVisit: prev, newVotes: votes.total, newBills: bills.total });
  const votesEnd = endOfList(votes.rows.length, votes.total, { one: "vote", many: "votes" }), billsEnd = endOfList(bills.rows.length, bills.total, { one: "bill", many: "bills" });
  const texas = texasMoved > 0 ? <Link href="/texas">{texasMoved === 1 ? "One Texas bill moved" : `${texasMoved} Texas bills moved`}</Link> : null;
  return <section className="since-panel" aria-label="Since you last visited">
    <h2>Since you last visited <span className="meta">({shortDate(prev)})</span></h2>
    {done ? <p className="meta caught-up"><b>{CAUGHT_UP}</b> Nothing new from your legislators or the bills you follow since then.{texas ? <> In the Texas Legislature: {texas}.</> : null}
      {!loc ? <> <Link href="/legislators">Add your address</Link> to see your legislators here.</> : null}</p> : <>
      <ul className="result-list">
        {votes.rows.map(v => <MemberVoteRow key={v.key} v={v} row={v.billId ? voteRows.get(v.billId) : null} />)}
        {bills.rows.map(b => <li key={b.id}><Link href={`/bills/${b.id}`}>{b.title}</Link><span className="meta">Now: {STAGE_LABEL[b.stage as StageKey] ?? b.stage}{b.stageDate ? ` (${shortDate(b.stageDate)})` : ""}</span></li>)}
        {texas && <li>{texas}</li>}
      </ul>
      <p className="list-end">
        {votesEnd.more > 0 ? <>{votesEnd.text} <Link className="more-link" href="/following">The rest are on your Following page</Link> </> : null}
        {billsEnd.more > 0 ? <>{billsEnd.text} Open a bill you follow to see where it stands. </> : null}
        {votesEnd.more + billsEnd.more === 0 ? `That is everything new since ${shortDate(prev)}.` : null}</p>
    </>}
  </section>;
}
