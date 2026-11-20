import "./flow.css";
import Link from "next/link";
import { EarlierAnswers } from "@/components/voice/earlier-answers";
import { getDb } from "@/db";
import { currentLocation } from "@/lib/location";
import { federalLegislators } from "@/lib/federal/legislators";
import { pickedIssues } from "@/lib/reader-issues";
import { movingThisWeek } from "@/lib/federal/bill-depth";
import { MemberVoteRows } from "@/components/bills/member-vote-row";
import { billRowsFor } from "@/lib/bill-row-store";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";
import { shortDate, billLabel } from "@/components/federal/badges";
import { YourLegislatorsBlock } from "@/components/home/legislator-cards";
import { IssuesStep } from "@/components/home/issues-step";
import { ComingUp } from "@/components/home/coming-up";
import { followedMemberIds, memberVotesSince } from "@/lib/flow/card-store";
import { endOfList } from "@/lib/flow/cards";

const clock = () => Date.now();
const WEEK_VOTES = 8, MOVING = 6, MOVING_READ = 40;

/**
 * Personalized home (Round D): this week from your legislators, and bills moving on your issues. From official data.
 * Owner, 17 Nov 2026: it opens with the reader's legislators and, right under them, what is coming up with one-tap
 * answers. Owner, 18 Nov 2026: the heading counts the legislators ("Your five legislators"), each card has the last
 * three votes, the follows and the alert setting are stated under the cards, issues are asked for once as a second
 * step, and every list is capped and ends with a line that says how many more there are and where they are.
 */
export async function PersonalHome({ userId, canAnswer = false }: { userId: string | null; canAnswer?: boolean }) {
  const db = getDb(), now = clock();
  const [loc, issues] = await Promise.all([currentLocation(userId).catch(() => null), pickedIssues(userId).catch(() => [])]);
  if (!loc && !issues.length) return <section className="start-cta"><b>Make this page yours in under a minute.</b> <Link className="cta" href="/start">Add your address and three issues</Link></section>;
  const fed = loc ? await federalLegislators(loc.state, loc.congressional).catch(() => null) : null;
  const follows = await followedMemberIds(db, userId).catch(() => [] as string[]);
  const ids = [...new Set([...(fed?.senators.map(s => s.id) ?? []), ...(fed?.representative ? [fed.representative.id] : []), ...follows])];
  const week = await memberVotesSince(db, ids, now - 7 * 86400e3, WEEK_VOTES).catch(() => ({ rows: [], total: 0 }));
  const weekRows = await billRowsFor(week.rows.map(v => ({ billId: v.billId, title: v.billTitle, number: v.billType ? billLabel(v.billType, v.number!) : null })));
  const weekEnd = endOfList(week.rows.length, week.total, { one: "vote", many: "votes" });
  const lists = issues.length ? await Promise.all(issues.map(i => movingThisWeek(i, now, MOVING_READ).catch(() => []))) : [];
  const allMoving = lists.flat().filter((b, i, a) => a.findIndex(x => x.id === b.id) === i), moving = allMoving.slice(0, MOVING);
  const movingEnd = endOfList(moving.length, allMoving.length, { one: "bill", many: "bills" }, lists.some(l => l.length >= MOVING_READ));
  const mine = issues.flatMap(i => { const c = ISSUE_CATEGORIES.find(x => x.slug === i); return c ? [c] : []; });
  return <section className="personal">
    <EarlierAnswers userId={canAnswer ? userId : null} back="/" />
    {loc && <div className="fed-section"><YourLegislatorsBlock loc={loc} userId={userId} next="/" canFollow={canAnswer}><Link href="/start?change=1">Change address or ZIP</Link></YourLegislatorsBlock></div>}
    {loc && canAnswer && <IssuesStep userId={userId} />}
    <ComingUp userId={userId} loc={loc} canAnswer={canAnswer} limit={3} />
    {ids.length > 0 && <div className="fed-section"><h2>This week from your legislators</h2>
      {week.rows.length ? <><ul className="result-list"><MemberVoteRows votes={week.rows} rows={weekRows} linkMember /></ul>
        <p className="list-end">{weekEnd.text}{weekEnd.more > 0 ? <> <Link className="more-link" href="/following">The rest are on your Following page</Link></> : null}</p></>
        : <p className="meta">No recorded votes by your legislators in the last 7 days.</p>}
      <p className="meta"><Link href="/legislators">Your legislators</Link> · <Link href="/recap">This week&apos;s recap card</Link></p></div>}
    {issues.length > 0 && <div className="fed-section"><h2>Moving on your issues</h2>
      <p className="meta">{mine.map(c => c.name).join(" · ")} · <Link href="/start#coming-up">change</Link></p>
      {moving.length ? <><ul className="result-list">{moving.map(b => <li key={b.id}><Link href={`/bills/${b.id}`}><span className="bill-tag">{billLabel(b.billType, b.number)}</span> {b.title}</Link><span className="meta">{b.latestActionText ?? ""}{b.latestActionAt ? ` (${shortDate(b.latestActionAt)})` : ""}</span></li>)}</ul>
        <p className="list-end">{movingEnd.text}{movingEnd.more > 0 ? <> The rest are on each issue’s page: {mine.map((c, i) => <span key={c.slug}>{i > 0 ? ", " : ""}<Link className="more-link" href={`/issues/${c.slug}`}>{c.name}</Link></span>)}</> : null}</p></>
        : <p className="meta">Nothing moved on these issues this week.</p>}</div>}
  </section>;
}
