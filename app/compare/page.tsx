import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { getDb } from "@/db";
import { officialPoliticians } from "@/db/schema";
import { compareMembers } from "@/lib/federal/member-stats";
import { KIND_LABEL, voteKind } from "@/lib/federal/vote-kinds";
import { BRAND, brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Compare members"), robots: { index: false, follow: false } };
const ID = /^[A-Z]\d{6}$/;

/** Two members' shared roll-call votes, by issue. Official: counts only, no rating. */
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/compare" access={access} page="/compare">{null}</PublicShell>;
  const { a: ra, b: rb } = await searchParams;
  const a = ID.test(ra ?? "") ? ra! : null, b = ID.test(rb ?? "") ? rb! : null;
  const members = await getDb().select({ id: officialPoliticians.id, fullName: officialPoliticians.fullName, state: officialPoliticians.state, party: officialPoliticians.party, chamber: officialPoliticians.chamber })
    .from(officialPoliticians).where(eq(officialPoliticians.isCurrent, 1)).orderBy(asc(officialPoliticians.lastName));
  const ma = members.find(m => m.id === a), mb = members.find(m => m.id === b);
  const result = ma && mb ? await compareMembers(ma.id, mb.id).catch(() => null) : null;
  const pick = (name: string, value: string | null, chamber?: string) => <select name={name} defaultValue={value ?? ""} className="leg-select" aria-label={name === "a" ? "First member" : "Second member"}>
    <option value="">Choose a member</option>
    {(["senate", "house"] as const).filter(c => !chamber || c === chamber).map(c => <optgroup key={c} label={c === "senate" ? "Senators" : "Representatives"}>
      {members.filter(m => m.chamber === c).map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.party.slice(0, 1)}-{m.state})</option>)}</optgroup>)}</select>;
  return <PublicShell current="/compare" access={access} page="/compare">
    <section className="fed-page">
      <div className="eyebrow">COMPARE <OfficialBadge /></div>
      <h1>{ma && mb ? `${ma.fullName} and ${mb.fullName}` : "Compare two members"}</h1>
      <form action="/compare" className="verify-form">{pick("a", a)}{pick("b", b, ma?.chamber)}<button>Compare</button></form>
      {ma && mb && ma.chamber !== mb.chamber && <p className="meta">A senator and a representative vote in different chambers, so they share no roll calls.</p>}
      {result && (result.total ? <>
        <p className="lead-stat">Voted the same way on <b>{result.same} of {result.total}</b> shared votes{result.kinds.passage.total ? `; on votes to pass a bill, ${result.kinds.passage.same} of ${result.kinds.passage.total}` : ""}.</p>
        <div className="fed-section"><h2>By issue</h2><ul className="analysis-list">{result.byIssue.map(i => <li key={i.issue}><b>{i.issue}:</b> same on {i.same} of {i.total}</li>)}</ul></div>
        <div className="fed-section"><h2>Recent shared votes</h2><ul className="result-list">{result.details.map(d => <li key={d.rollCallId}>
          <span>{d.billId ? <Link href={`/bills/${d.billId}`}>{d.title ?? d.question}</Link> : d.title ?? d.question}</span>
          <span className="meta">{shortDate(d.votedAt)} · {KIND_LABEL[voteKind(d.question, d.title)]} · {ma!.fullName.split(" ").pop()}: {d.a} · {mb!.fullName.split(" ").pop()}: {d.b} · {d.same ? "same" : "different"}</span></li>)}</ul></div>
        <p className="meta">Method: roll calls in {BRAND.name}&apos;s copy of the official record where both members voted Yea or Nay. Present and not voting are left out. This is a count, not a rating.</p>
      </> : <p className="meta">No shared Yea or Nay votes in the record yet.</p>)}
    </section>
  </PublicShell>;
}
