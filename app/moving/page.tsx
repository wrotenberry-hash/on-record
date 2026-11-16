import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { AnalysisBadge, OfficialBadge, billLabel, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { movingThisWeek } from "@/lib/federal/bill-depth";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";
import { STAGE_LABEL, type StageKey } from "@/lib/federal/depth-parse";
import { Glossed } from "@/components/ui/glossed";

export const dynamic = "force-dynamic";
export const metadata = { title: "Moving this week · On Record", robots: { index: false, follow: false } };

/** Bills with an official action in the last 7 days or on a floor schedule this week, filterable by the 14 issues. */
export default async function MovingPage({ searchParams }: { searchParams: Promise<{ issue?: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/moving" access={access} page="/moving">{null}</PublicShell>;
  const raw = (await searchParams).issue ?? null;
  const issue = ISSUE_CATEGORIES.some(c => c.slug === raw) ? raw : null;
  const rows = await movingThisWeek(issue).catch(() => []);
  return <PublicShell current="/moving" access={access} page="/moving">
    <section className="fed-page">
      <div className="eyebrow">MOVING THIS WEEK <OfficialBadge /></div>
      <h1>{issue ? `${ISSUE_CATEGORIES.find(c => c.slug === issue)!.name}: moving this week` : "Bills moving this week"}</h1>
      <p className="meta">Bills with an official action in the last 7 days or on the House or Senate floor schedule this week.</p>
      <ul className="chip-row" aria-label="Filter by issue"><li><Link href="/moving" aria-current={!issue ? "page" : undefined}>All</Link></li>
        {ISSUE_CATEGORIES.map(c => <li key={c.slug}><Link href={`/moving?issue=${c.slug}`} aria-current={issue === c.slug ? "page" : undefined}>{c.name}</Link></li>)}</ul>
      {rows.length ? <ul className="result-list">{rows.map(b => <li key={b.id}>
        <Link href={`/bills/${b.id}`}><span className="bill-tag">{billLabel(b.billType, b.number)}</span> {b.title}</Link>
        {b.headline && <span className="vote-headline">{b.headline} <AnalysisBadge /></span>}
        <span className="meta">{b.onFloor ? <span className="on-floor">On the {b.onFloor.split(",").map(c => (c === "senate" ? "Senate" : "House")).join(" and ")} floor this week</span> : null} {b.stage ? `${STAGE_LABEL[b.stage as StageKey] ?? b.stage} · ` : ""}{b.latestActionText ? <Glossed text={b.latestActionText} /> : null}{b.latestActionAt ? ` (${shortDate(b.latestActionAt)})` : ""}</span>
      </li>)}</ul> : <p className="meta">Nothing moved this week{issue ? " on this issue" : ""}. Congress may be out of session; see the latest votes on <Link href="/politicians">Politicians</Link>.</p>}
    </section>
  </PublicShell>;
}
