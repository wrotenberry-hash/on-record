import type { Metadata } from "next";
import Link from "next/link";
import { memberMeta } from "@/lib/seo";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { AnalysisBadge, OfficialBadge, OpinionBadge, billLabel, memberLine, shortDate } from "@/components/federal/badges";
import { FollowButton } from "@/components/federal/follow-button";
import { VoteRow } from "@/components/federal/vote-row";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { followedIds, getPolitician, recentVotes, sponsorships } from "@/lib/federal/queries";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";
import { agreementWith } from "@/lib/opinions";
import { agreementLine } from "@/lib/agreement";
import { verificationConfig } from "@/lib/verify/config";
import { scopeTotals } from "@/lib/verify/store";
import { MIN_SHOWN, memberDistrictId, totalsLine } from "@/lib/verify/rules";
import { getDb } from "@/db";
import { sentimentTotals } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Names reach only viewers allowed to see the page; anyone else gets the site name. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  if (!(await viewerAccess()).allowed) return { title: "On Record" };
  const p = await getPolitician((await params).id);
  return p ? { ...memberMeta(p), alternates: { canonical: `/politicians/${p.id}` } } : { title: "Not found · On Record" };
}

/**
 * A member's record: latest votes, the same votes grouped by the 14 issues, and
 * the bills they sponsored or cosponsored. Everything is copied from official
 * records; On Record adds no grade, score or tally of its own.
 */
export default async function PoliticianPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await viewerAccess();
  const { id } = await params;
  if (!access.allowed) return <PublicShell current="/politicians" access={access} page="/politicians/[id]">{null}</PublicShell>;
  const p = await getPolitician(id);
  if (!p) notFound();
  const [votes, followed, sponsor] = await Promise.all([recentVotes(p.id, 80), currentAppUserId().then(followedIds), sponsorships(p.id).catch(() => ({ sponsored: [], cosponsored: [] }))]);
  const latest = votes.slice(0, 10);
  const canAnswer = !!access.editor || !!access.invite;
  const userId = canAnswer ? await currentAppUserId() : null;
  const agreement = userId ? await agreementWith(userId, p.id).catch(() => ({ rows: [], answered: 0 })) : null;
  // Round J: what verified readers say on the bills this member voted on. District-matched readers in the
  // member's own district (House) or state (Senate) lead; real people nationally follow. Never a rating.
  const constituents = verificationConfig().enabled ? await (async () => {
    const scope = p.chamber === "senate" ? p.state : memberDistrictId(p.state, p.district);
    const billIds = [...new Set(votes.map(v => v.billId).filter((b): b is string => !!b))];
    const local = await scopeTotals(scope, billIds).catch(() => []);
    const national = billIds.length ? await getDb().select().from(sentimentTotals).where(and(eq(sentimentTotals.scope, "US"), eq(sentimentTotals.tierGroup, "real"), inArray(sentimentTotals.billId, billIds))).catch(() => []) : [];
    const rows = billIds.map(id => ({ id, local: local.find(t => t.billId === id) ?? null, national: national.find(t => t.billId === id) ?? null, vote: votes.find(v => v.billId === id)! }))
      .filter(r => (r.local && r.local.support + r.local.oppose >= MIN_SHOWN) || (r.national && r.national.support + r.national.oppose >= MIN_SHOWN)).slice(0, 6);
    return { scope, rows };
  })() : null;
  const issueName = (slug: string) => ISSUE_CATEGORIES.find(c => c.slug === slug)?.name ?? "Not sorted into an issue";
  const byIssue = ISSUE_CATEGORIES.map(c => ({ ...c, votes: votes.filter(v => v.issueSlug === c.slug) })).filter(g => g.votes.length);
  const unsorted = votes.filter(v => !v.issueSlug);
  const activeCo = sponsor.cosponsored.filter(c => !c.withdrawnDate);
  const withdrawn = sponsor.cosponsored.filter(c => c.withdrawnDate);
  const billLine = (b: { id: string; billType: string; number: number; title: string; headline: string | null }) => <>
    <Link href={`/bills/${b.id}`}><span className="bill-tag">{billLabel(b.billType, b.number)}</span> {b.title}</Link>
    {b.headline && <span className="vote-headline">{b.headline} <AnalysisBadge /></span>}</>;
  return <PublicShell current="/politicians" access={access} page="/politicians/[id]">
    <section className="fed-page">
      <p className="crumbs"><Link href="/politicians">← All politicians</Link></p>
      <div className="member-head">
        <div><div className="eyebrow">{memberLine(p)}</div><h1>{p.fullName}</h1>
          <p className="meta">{p.isCurrent ? `Term ends ${shortDate(p.termEnd)}` : "No longer serving"}{p.officialUrl && <> · <a href={p.officialUrl} target="_blank" rel="noopener noreferrer">Official site</a></>}</p></div>
        <FollowButton politicianId={p.id} following={followed.has(p.id)} canFollow={!!access.editor || !!access.invite} />
      </div>

      {agreement && <div className="fed-section your-view"><h2>You and {p.fullName} <OpinionBadge /></h2>
        {agreement.rows.length ? <><ul className="analysis-list">{agreement.rows.map(r => <li key={r.issueSlug}><b>{issueName(r.issueSlug)}:</b> {agreementLine(r)} <Link className="src-link" href={`/share/agreement/${p.id}/${r.issueSlug}`}>Share</Link></li>)}</ul>
          <p className="meta">From your own Support/Oppose answers and this member&apos;s votes on passing those bills; procedural votes are left out. Only you see this. It is your comparison, not a rating of the member by On Record.</p></>
          : <p className="meta">{agreement.answered ? "None of the bills you answered has a vote by this member on passing it yet." : "Say Support or Oppose on a bill page, and this shows how often this member's votes on passing those bills matched yours. Only you see it."}</p>}</div>}

      {constituents && <div className="fed-section sentiment"><h2>What verified readers say <OpinionBadge /></h2>
        {constituents.rows.length ? <ul className="analysis-list">{constituents.rows.map(r => <li key={r.id}><Link href={`/bills/${r.id}`}>{r.vote.billTitle ?? r.vote.title}</Link><br />
          <span className="lead">{totalsLine(`District-matched in ${constituents.scope}`, r.local)}</span><br /><span className="meta">{totalsLine("Real people, nationally", r.national)}</span></li>)}</ul>
          : <p className="meta">Not enough verified answers yet on bills {p.fullName} voted on: totals show from {MIN_SHOWN} answers.</p>}
        <p className="meta">District-matched readers matched an address to {constituents.scope}. Shown beside the record, never as a score.</p></div>}

      <h2>Latest votes <OfficialBadge /></h2>
      {latest.length ? <ul className="vote-list">{latest.map(v => <VoteRow key={v.rollCallId} v={v} memberId={p.id} />)}</ul>
        : <p className="empty-note">No recorded votes stored yet. Votes load with each scheduled update.</p>}
      <p className="meta">A procedural vote decides how or whether the chamber proceeds (for example ending debate). It is shown as such and never as a vote for or against the bill itself.</p>

      {votes.length > 0 && <><h2>Votes by issue <OfficialBadge /></h2>
        <p className="meta">The {votes.length} most recent recorded votes, grouped by the issue of the bill voted on. A bill can sit under one issue here: the first of its issues.</p>
        <div className="issue-groups">{byIssue.map(g => <details key={g.slug} className="issue-group"><summary><b>{g.name}</b> <span className="meta">{g.votes.length} vote{g.votes.length === 1 ? "" : "s"}</span></summary>
          <ul className="vote-list">{g.votes.map(v => <VoteRow key={v.rollCallId} v={v} />)}</ul></details>)}
          {unsorted.length > 0 && <details className="issue-group"><summary><b>Not sorted into an issue</b> <span className="meta">{unsorted.length} (nominations, procedure, or bills without a topic yet)</span></summary>
            <ul className="vote-list">{unsorted.map(v => <VoteRow key={v.rollCallId} v={v} />)}</ul></details>}</div></>}

      <h2>Bills sponsored and cosponsored <OfficialBadge /></h2>
      <p className="meta">Bills in On Record&apos;s record (those with a recorded vote or recent action), from govinfo&apos;s bill status records. Not every bill this member has signed.</p>
      <div className="issue-groups">
        <details className="issue-group" open={sponsor.sponsored.length > 0 && sponsor.sponsored.length <= 5}><summary><b>Sponsored</b> <span className="meta">{sponsor.sponsored.length} bill{sponsor.sponsored.length === 1 ? "" : "s"}</span></summary>
          {sponsor.sponsored.length ? <ul className="bill-list compact">{sponsor.sponsored.map(b => <li key={b.id}>{billLine(b)}{b.introducedAt && <small>Introduced {shortDate(b.introducedAt)}</small>}</li>)}</ul> : <p className="meta">None in the record.</p>}</details>
        <details className="issue-group"><summary><b>Cosponsored</b> <span className="meta">{activeCo.length} bill{activeCo.length === 1 ? "" : "s"}</span></summary>
          {activeCo.length ? <ul className="bill-list compact">{activeCo.map(b => <li key={b.id}>{billLine(b)}<small>{b.original ? "Original cosponsor" : "Cosponsor"}{b.sponsorshipDate ? ` since ${shortDate(b.sponsorshipDate)}` : ""}</small></li>)}</ul> : <p className="meta">None in the record.</p>}</details>
        {withdrawn.length > 0 && <details className="issue-group"><summary><b>Cosponsorship withdrawn</b> <span className="meta">{withdrawn.length}</span></summary>
          <ul className="bill-list compact">{withdrawn.map(b => <li key={b.id}>{billLine(b)}<small>Withdrawn {shortDate(b.withdrawnDate)}</small></li>)}</ul></details>}
      </div>

      <p className="source-line">Votes are copied from the {p.chamber === "senate" ? "Senate's roll-call records (senate.gov)" : "House Clerk's roll-call records (clerk.house.gov)"}; each links to its source. Sponsorships from govinfo.gov bill status records. Member details from the congress-legislators project, retrieved {shortDate(p.retrievedAt)}.</p>
    </section>
  </PublicShell>;
}
