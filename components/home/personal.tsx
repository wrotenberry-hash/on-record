import Link from "next/link";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBills, officialMemberVotes, officialPoliticians, officialRollCalls, userFollows } from "@/db/schema";
import { currentLocation } from "@/lib/location";
import { federalLegislators } from "@/lib/federal/legislators";
import { pickedIssues } from "@/lib/reader-issues";
import { movingThisWeek } from "@/lib/federal/bill-depth";
import { positionLine, voteKind } from "@/lib/federal/vote-kinds";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";
import { shortDate, billLabel } from "@/components/federal/badges";

const clock = () => Date.now();

/** Personalized home (Round D): this week from your legislators, and bills moving on your issues. From official data. */
export async function PersonalHome({ userId }: { userId: string | null }) {
  const db = getDb(), now = clock();
  const [loc, issues] = await Promise.all([currentLocation(userId).catch(() => null), pickedIssues(userId).catch(() => [])]);
  if (!loc && !issues.length) return <section className="start-cta"><b>Make this page yours in under a minute.</b> <Link className="cta" href="/start">Add your ZIP and three issues</Link></section>;
  const fed = loc ? await federalLegislators(loc.state, loc.congressional).catch(() => null) : null;
  const follows = userId ? (await db.select({ id: userFollows.politicianId }).from(userFollows).where(eq(userFollows.userId, userId))).map(r => r.id) : [];
  const ids = [...new Set([...(fed?.senators.map(s => s.id) ?? []), ...(fed?.representative ? [fed.representative.id] : []), ...follows])];
  const votes = ids.length ? await db.select({ rollCallId: officialRollCalls.id, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question, title: officialRollCalls.title, billId: officialRollCalls.billId,
    billTitle: officialBills.title, billType: officialBills.billType, number: officialBills.number, name: officialPoliticians.fullName, memberId: officialPoliticians.id, position: officialMemberVotes.position })
    .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId)).innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId))
    .leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId)).where(and(inArray(officialMemberVotes.politicianId, ids), gte(officialRollCalls.votedAt, now - 7 * 86400e3)))
    .orderBy(desc(officialRollCalls.votedAt)).limit(8) : [];
  const moving = issues.length ? (await Promise.all(issues.map(i => movingThisWeek(i, now, 4).catch(() => [])))).flat().filter((b, i, a) => a.findIndex(x => x.id === b.id) === i).slice(0, 6) : [];
  // Round E: each legislator's latest vote on a bill (not a nomination), so "how did my senator vote on the latest bill" takes no taps.
  const mine = [...(fed?.senators ?? []), ...(fed?.representative ? [fed.representative] : [])];
  const latestBill = (await Promise.all(mine.map(m => db.select({ rollCallId: officialRollCalls.id, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question, title: officialRollCalls.title, billId: officialRollCalls.billId,
    billTitle: officialBills.title, billType: officialBills.billType, number: officialBills.number, position: officialMemberVotes.position })
    .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId)).innerJoin(officialBills, eq(officialBills.id, officialRollCalls.billId))
    .where(eq(officialMemberVotes.politicianId, m.id)).orderBy(desc(officialRollCalls.votedAt)).limit(1).get().then(v => v ? { m, v } : null).catch(() => null)))).filter(Boolean) as { m: { id: string; fullName: string; role: string }; v: { rollCallId: string; votedAt: number; question: string; title: string | null; billId: string | null; billTitle: string; billType: string; number: number; position: string } }[];
  return <section className="personal">
    {latestBill.length > 0 && <div className="fed-section"><h2>Your legislators&apos; latest votes on bills</h2>
      <ul className="result-list">{latestBill.map(({ m, v }) => <li key={m.id}><span><Link href={`/politicians/${m.id}`}><b>{m.fullName}</b></Link> <span className="meta">({m.role})</span> · {positionLine(v.position, voteKind(v.question, v.billTitle ?? v.title)).toLowerCase()}</span>
        <Link href={`/bills/${v.billId}`}>{billLabel(v.billType, v.number)}: {v.billTitle}</Link><span className="meta">{shortDate(v.votedAt)} · {v.question}</span></li>)}</ul></div>}
    {ids.length > 0 && <div className="fed-section"><h2>This week from your legislators</h2>
      {votes.length ? <ul className="result-list">{votes.map(v => <li key={`${v.rollCallId}-${v.memberId}`}><span><Link href={`/politicians/${v.memberId}`}><b>{v.name}</b></Link> · {positionLine(v.position, voteKind(v.question, v.billTitle ?? v.title)).toLowerCase()}</span>
        {v.billId ? <Link href={`/bills/${v.billId}`}>{v.billType ? `${billLabel(v.billType, v.number!)}: ` : ""}{v.billTitle ?? v.title}</Link> : <span>{v.title ?? v.question}</span>}<span className="meta">{shortDate(v.votedAt)}</span></li>)}</ul>
        : <p className="meta">No recorded votes by your legislators in the last 7 days.</p>}
      <p className="meta"><Link href="/legislators">Your legislators</Link> · <Link href="/recap">This week&apos;s recap card</Link></p></div>}
    {issues.length > 0 && <div className="fed-section"><h2>Moving on your issues</h2>
      <p className="meta">{issues.map(i => ISSUE_CATEGORIES.find(c => c.slug === i)?.name).filter(Boolean).join(" · ")} · <Link href="/start?step=2">change</Link></p>
      {moving.length ? <ul className="result-list">{moving.map(b => <li key={b.id}><Link href={`/bills/${b.id}`}><span className="bill-tag">{billLabel(b.billType, b.number)}</span> {b.title}</Link><span className="meta">{b.latestActionText ?? ""}{b.latestActionAt ? ` (${shortDate(b.latestActionAt)})` : ""}</span></li>)}</ul>
        : <p className="meta">Nothing moved on these issues this week.</p>}</div>}
  </section>;
}
