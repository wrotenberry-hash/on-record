import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, billLabel, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { getBill } from "@/lib/federal/queries";

export const dynamic = "force-dynamic";

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await viewerAccess();
  const { id } = await params;
  if (!access.allowed) return <PublicShell current="/issues" access={access}>{null}</PublicShell>;
  const data = await getBill(id);
  if (!data) notFound();
  const { bill, votes, subjects, categories, sponsor } = data;
  return <PublicShell current="/issues" access={access}>
    <section className="fed-page">
      <p className="crumbs"><Link href="/issues">← Issues</Link></p>
      <div className="eyebrow">{billLabel(bill.billType, bill.number)} · {bill.congress}th Congress</div>
      <h1>{bill.title}</h1>
      {categories.length > 0 && <ul className="chip-row">{categories.map(c => <li key={c.slug}><Link href={`/issues/${c.slug}`}>{c.name}</Link></li>)}</ul>}

      <div className="fed-section"><h2>Status <OfficialBadge /></h2>
        {bill.latestActionText ? <p>{bill.latestActionText} <span className="meta">({shortDate(bill.latestActionAt)})</span></p>
          : votes[0] ? <p>Latest recorded vote: {votes[0].question}, {votes[0].result ?? "result not stated"} {votes[0].yea}–{votes[0].nay} <span className="meta">({shortDate(votes[0].votedAt)})</span></p>
          : <p className="meta">No action recorded yet.</p>}
        {sponsor && <p className="meta">Sponsor: <Link href={`/politicians/${sponsor.id}`}>{sponsor.fullName}</Link></p>}
        {bill.introducedAt && <p className="meta">Introduced {shortDate(bill.introducedAt)}</p>}
      </div>

      <div className="fed-section"><h2>Recorded votes <OfficialBadge /></h2>
        {votes.length ? <ul className="vote-list">{votes.map(v => <li key={v.id} className="vote-row"><div className="vote-main">
          <span className="vote-date">{shortDate(v.votedAt)} · {v.chamber === "senate" ? "Senate" : "House"}</span>
          <b>{v.question}</b><small>{v.result ?? "Result not stated"} · Yea {v.yea} · Nay {v.nay}{v.notVoting ? ` · Not voting ${v.notVoting}` : ""} · <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></small></div></li>)}</ul>
          : <p className="meta">No roll-call votes on this bill yet.</p>}
      </div>

      {access.preview && <div className="fed-section placeholder"><h2>Plain-language summary <span className="ctype ctype-analysis">Analysis</span></h2><p className="meta">Arrives in Phase B: headline, what it does, who it affects, cost, the case for and against, and what we don&apos;t know, each section badged.</p></div>}

      <div className="fed-section"><h2>Sources</h2><ul className="source-list">
        <li><a href={bill.congressUrl} target="_blank" rel="noopener noreferrer">This bill on Congress.gov</a></li>
        <li>Record {bill.detailStatus === "complete" ? "completed from the Congress.gov API" : "created from a roll-call vote"}, retrieved {shortDate(bill.retrievedAt)}.</li>
        {subjects.length > 0 && <li>Congress.gov subjects: {subjects.slice(0, 12).join(", ")}{subjects.length > 12 ? "…" : ""}</li>}
      </ul></div>
    </section>
  </PublicShell>;
}
