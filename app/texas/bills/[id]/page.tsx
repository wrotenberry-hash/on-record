import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { txBill, txVoteParties } from "@/lib/texas/queries";
import { TX_SESSIONS, TX_STAGE_LABEL, type TxStage } from "@/lib/texas/parse";
import { firstUseTerms, mainDecision } from "@/lib/texas/vote-record";
import { DecisionRow, MemberVoteLists, TLO_RECORD } from "@/components/texas/decisions";
import { txSummaryFor } from "@/lib/texas/summaries";
import { AnalysisBadge } from "@/components/federal/badges";
import { BRAND } from "@/lib/brand";
import { ContactForTxBill } from "@/components/contact/contact-section"; // contact-your-legislator (test-ready build)

export const dynamic = "force-dynamic";
const STEPS: TxStage[] = ["filed", "committee", "passed_first", "passed_both", "governor", "law"];
const STATUS_PLAIN: Record<TxStage, string> = {
  filed: "Filed. No committee has taken it up yet.", committee: "Sent to a committee. A committee is a small group of lawmakers that decides whether a bill goes on to a vote of the full House or Senate.",
  passed_first: "Passed one chamber (the House or the Senate). The other chamber has not passed it yet.", passed_both: "Passed both the House and the Senate.",
  governor: "Sent to the Governor, who can sign it, veto it, or let it become law without signing.", law: "Became law.", vetoed: "Vetoed by the Governor.", failed: "Failed a vote.",
};
const TAP = "tap";

export default async function TexasBillPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/texas" access={access} page="/texas/bills/[id]">{null}</PublicShell>;
  const data = await txBill((await params).id);
  if (!data) notFound();
  const { bill, actions, sponsors, versions, votes, members, decisions, hearings, committee } = data;
  const parties = await txVoteParties(votes.map(v => v.id)).catch(() => new Map<string, Record<string, Record<string, number>>>());
  // Newest first; the terms are explained at their first use in that order (main list, then the rest).
  const main = decisions.filter(mainDecision).reverse(), rest = decisions.filter(d => !mainDecision(d)).reverse(), terms = firstUseTerms([...main, ...rest]);
  const s = await txSummaryFor(bill.id, access.preview && !!access.editor).catch(() => null);
  const pts = (x: unknown) => (x as Array<{ text: string; section: string }>) ?? [], args = (x: unknown) => (x as Array<{ argument: string; attribution: string }>) ?? [];
  const at = STEPS.indexOf(bill.stage as TxStage), session = TX_SESSIONS.find(s => s.id === bill.session);
  const firstDate = (cls: string, chamber?: string) => actions.find(a => (a.classification as string[] | null)?.includes(cls) && (!chamber || a.chamber === chamber))?.date ?? null;
  return <PublicShell current="/texas" access={access} page="/texas/bills/[id]">
    <section className="fed-page bill-page">
      <p className="crumbs"><Link href="/texas">← Texas Legislature</Link></p>
      <div className="eyebrow">{bill.identifier} · {session?.name ?? `Session ${bill.session}`}</div>
      <p className="official-line"><OfficialBadge /> <span>{bill.title}</span></p>
      {s ? <h1 className="bill-headline">{s.headline} <AnalysisBadge /></h1> : <h1>{bill.identifier}</h1>}
      {s?.status === "held" && <div className="held-note" role="note"><b>Held for review.</b> Readers will not see this summary until an editor approves it.</div>}
      <div className="fed-section"><h2>Status <OfficialBadge /></h2>
        <ol className="timeline" aria-label="Where this bill is">{(bill.stage === "vetoed" ? [...STEPS.slice(0, 5), "vetoed" as TxStage] : bill.stage === "failed" ? ["filed", "committee", "failed"] as TxStage[] : STEPS).map((s, i) => {
          const done = bill.stage === s || (at >= 0 && i <= at) || (bill.stage === "vetoed" && i < 5);
          const date = s === "filed" ? (firstDate("filing") ?? bill.firstActionDate) : s === "committee" ? firstDate("referral-committee") : s === "law" ? (firstDate("became-law") ?? firstDate("executive-signature")) : s === "governor" ? firstDate("executive-receipt") : s === "vetoed" ? firstDate("executive-veto") : null;
          return <li key={s} className={`tl-step ${done ? "done" : "todo"} ${bill.stage === s ? "now" : ""} tl-${s}`}><span className="tl-dot" aria-hidden="true" /><span className="tl-label">{TX_STAGE_LABEL[s]}</span><span className="tl-date">{done ? (date ? shortDate(date) : "done") : "not yet"}</span></li>; })}
          <li className="tl-source"><a className="src-link" href={bill.tloUrl} target="_blank" rel="noopener noreferrer">Bill history on Texas Legislature Online</a></li></ol>
        <p className="lede">{STATUS_PLAIN[bill.stage as TxStage] ?? TX_STAGE_LABEL[bill.stage as TxStage] ?? bill.stage}</p>
        {bill.latestActionDescription && <p>Latest action: {bill.latestActionDescription} <span className="meta">({shortDate(bill.latestActionDate)})</span></p>}
        {committee && <p className="meta">Committee: {committee.name} ({committee.chamber === "upper" ? "Texas Senate" : committee.chamber === "lower" ? "Texas House" : "Texas Legislature"})</p>}
        {hearings.length ? <p className="meta">Upcoming hearing: {hearings.map(h => `${h.name}, ${new Date(h.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })} CT${h.location ? ` (${h.location})` : ""}`).join("; ")}</p>
          : <p className="meta">No upcoming hearing is posted for this bill.</p>}
        {sponsors.length > 0 ? <p className="meta">Authors and sponsors: {sponsors.sort((a, b) => b.primary - a.primary).map(s => s.personId ? <Link key={s.name} className="tap" href={`/texas/members/${encodeURIComponent(s.personId)}`}>{s.name}</Link> : s.name).reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, ", ", x] : [x]), [])}</p> : <p className="meta">No authors or sponsors are on file yet.</p>}
        <p className="meta"><a className={TAP} href={bill.tloUrl} target="_blank" rel="noopener noreferrer">{TLO_RECORD}</a>. Where this page and the official record differ, the official record is right.</p>
      </div>
      {s && <>
        <div className="fed-section"><h2>What it does <AnalysisBadge /></h2><ul className="analysis-list">{pts(s.whatItDoes).map((p, i) => <li key={i}>{p.text} <span className="cite">{p.section}</span></li>)}</ul></div>
        <div className="fed-section"><h2>Who it affects <AnalysisBadge /></h2><ul className="analysis-list">{pts(s.whoItAffects).map((p, i) => <li key={i}>{p.text} <span className="cite">{p.section}</span></li>)}</ul></div>
        <div className="fed-section"><h2>What changes for you <AnalysisBadge /></h2><p>{s.whatChangesForYou}</p></div>
        <div className="fed-section"><h2>The case for and against <AnalysisBadge /></h2><div className="case-grid">
          <div><h3>For</h3><ul className="analysis-list">{args(s.caseFor).map((a, i) => <li key={i}>{a.argument} <span className="attrib">({a.attribution})</span></li>)}</ul></div>
          <div><h3>Against</h3><ul className="analysis-list">{args(s.caseAgainst).map((a, i) => <li key={i}>{a.argument} <span className="attrib">({a.attribution})</span></li>)}</ul></div></div></div>
        <div className="fed-section"><h2>What we don&apos;t know <AnalysisBadge /></h2><ul className="analysis-list">{((s.unknowns as string[]) ?? []).map((u, i) => <li key={i}>{u}</li>)}</ul>
          <p className="meta">Written by {s.model} from the {s.textLabel.toLowerCase()} text on Texas Legislature Online, checked by {BRAND.name}&apos;s rule checker ({s.checkPassed ? "passed" : "did not pass"}{s.readingGrade ? `, reading grade ${s.readingGrade}` : ""}). Confidence: {s.confidence}.</p></div>
      </>}
      {/* BEGIN contact-your-legislator (test-ready build): the reader's Texas legislators, official phone, email and an editable message. */}
      <ContactForTxBill bill={bill} votes={votes} />
      {/* END contact-your-legislator */}
      <div className="fed-section" id="decisions"><h2>Decisions so far <OfficialBadge /></h2>
        <p className="meta">Each decision says how it was taken. A member&apos;s vote is shown only where the official record lists each member by name.</p>
        {main.length ? <ul className="vote-list">{main.map(d => <DecisionRow key={d.key} d={d} terms={terms.get(d.key)} tloUrl={bill.tloUrl} parties={d.vote ? parties.get(d.vote.id) : undefined} />)}</ul>
          : <p className="meta">No decisions on this bill yet.</p>}
        {rest.length > 0 && <details className="primer"><summary>{rest.length} more {rest.length === 1 ? "decision" : "decisions"}: proposed changes and procedural steps</summary>
          <ul className="vote-list">{rest.map(d => <DecisionRow key={d.key} d={d} terms={terms.get(d.key)} tloUrl={bill.tloUrl} parties={d.vote ? parties.get(d.vote.id) : undefined} />)}</ul></details>}
      </div>
      <MemberVoteLists decisions={decisions} members={members} tloUrl={bill.tloUrl} />
      {versions.length > 0 && <div className="fed-section"><h2>Bill text <OfficialBadge /></h2><ul className="analysis-list">{versions.map(v => <li key={v.note}>{v.url ? <a href={v.url} target="_blank" rel="noopener noreferrer">{v.note}</a> : v.note}{v.date ? ` (${shortDate(v.date)})` : ""}</li>)}</ul></div>}
      <div className="fed-section"><h2>Sources</h2><ul className="source-list"><li><a href={bill.tloUrl} target="_blank" rel="noopener noreferrer">Texas Legislature Online (source of record)</a></li>
        {bill.openstatesUrl && <li><a href={bill.openstatesUrl} target="_blank" rel="noopener noreferrer">Open States</a></li>}<li>Retrieved {shortDate(bill.retrievedAt)} via {bill.feed === "openstates" ? "Open States" : "LegiScan"}.</li></ul></div>
    </section>
  </PublicShell>;
}
