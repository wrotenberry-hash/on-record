import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryShell } from "@/components/share/entry-shell";
import { TakePart } from "@/components/share/take-part";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { entryViewer } from "@/lib/viewer";
import { txBill, txVoteParties } from "@/lib/texas/queries";
import { TX_SESSIONS, TX_STAGE_LABEL, type TxStage } from "@/lib/texas/parse";
import { firstUseTerms, mainDecision } from "@/lib/texas/vote-record";
import { DecisionRow, MemberVoteLists, TLO_RECORD } from "@/components/texas/decisions";
import { txSummaryForPage } from "@/lib/texas/summaries";
import { AnalysisBadge } from "@/components/federal/badges";
import { TxSummaryRest, TxSummaryTop } from "@/components/texas/summary";
import { VoteBox } from "@/components/voice/vote-box";
import { billTotals } from "@/lib/verify/store";
import { txLegislatorsOnBill } from "@/lib/texas/queries";
import { NOT_SCIENTIFIC, scopeLine, type ScopeTotals } from "@/lib/constituent/rules";
import { OpinionBadge } from "@/components/federal/badges";
import { voteBoxData } from "@/lib/constituent/view";
import { stanceQuestion } from "@/lib/federal/stance-question";
import { ContactForTxBill } from "@/components/contact/contact-section"; // contact-your-legislator (test-ready build)

export const dynamic = "force-dynamic";
const STEPS: TxStage[] = ["filed", "committee", "passed_first", "passed_both", "governor", "law"];
const STATUS_PLAIN: Record<TxStage, string> = {
  filed: "Filed. No committee has taken it up yet.", committee: "Sent to a committee. A committee is a small group of lawmakers that decides whether a bill goes on to a vote of the full House or Senate.",
  passed_first: "Passed one chamber (the House or the Senate). The other chamber has not passed it yet.", passed_both: "Passed both the House and the Senate.",
  governor: "Sent to the Governor, who can sign it, veto it, or let it become law without signing.", law: "Became law.", vetoed: "Vetoed by the Governor.", failed: "Failed a vote.",
};
const TAP = "tap";

export default async function TexasBillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string; s?: string }> }) {
  // The same rule as the federal bill page: the editor, an invited reader, or (only with SHARED_PAGES_PUBLIC on, which
  // is off by default) a visitor who arrived through a share link about this bill. That visitor (`shared`) gets the
  // record and the summary a trial reader would see: no vote box, no contact panel, nothing that is a reader's.
  const id = (await params).id, access = await entryViewer({ kind: "bill", billKey: id, code: (await searchParams).s }), shared = access.shared;
  if (!access.allowed) return <EntryShell current="/texas" access={access} page="/texas/bills/[id]">{null}</EntryShell>;
  const data = await txBill(id);
  if (!data) notFound();
  const { bill, actions, sponsors, versions, votes, members, decisions, hearings, committee } = data;
  const parties = await txVoteParties(votes.map(v => v.id)).catch(() => new Map<string, Record<string, Record<string, number>>>());
  // Newest first; the terms are explained at their first use in that order (main list, then the rest).
  const main = decisions.filter(mainDecision).reverse(), rest = decisions.filter(d => !mainDecision(d)).reverse(), terms = firstUseTerms([...main, ...rest]);
  // Readers get a summary only when it passed and the Texas gate is open; the signed-in editor also sees a held one, labelled.
  const analysis = await txSummaryForPage(bill.id, !!access.editor).catch(() => null);
  // Resident voting (18 Nov 2026): Support / Oppose / Unsure on every bill. The question uses the plain headline when a
  // summary is on show; otherwise it names the bill, with the official title beside it.
  const voice = shared ? null : await voteBoxData(bill.id, access).catch(() => null);
  const ask = analysis && !analysis.held ? stanceQuestion({ question: analysis.details?.question ?? null, headline: analysis.summary.headline }) : { question: `Do you support ${bill.identifier}?`, plain: false };
  // Each of the reader's own state legislators: their recorded vote on this bill beside their district's total, once they have voted.
  const myDistricts = voice?.place?.state === "TX" ? [voice.place.stateUpper, voice.place.stateLower].filter((x): x is string => !!x) : [];
  const yourMembers = myDistricts.length ? await txLegislatorsOnBill(bill.id, myDistricts).catch(() => []) : [];
  const yourTotals = yourMembers.length ? await billTotals(bill.id, yourMembers.map(m => m.scope)).catch(() => new Map<string, ScopeTotals>()) : new Map<string, ScopeTotals>();
  const at = STEPS.indexOf(bill.stage as TxStage), session = TX_SESSIONS.find(s => s.id === bill.session);
  const firstDate = (cls: string, chamber?: string) => actions.find(a => (a.classification as string[] | null)?.includes(cls) && (!chamber || a.chamber === chamber))?.date ?? null;
  return <EntryShell current="/texas" access={access} page="/texas/bills/[id]">
    <section className="fed-page bill-page">
      {!shared && <p className="crumbs"><Link href="/texas">← Texas Legislature</Link></p>}
      <div className="eyebrow">{bill.identifier} · {session?.name ?? `Session ${bill.session}`}</div>
      <p className="official-line"><OfficialBadge /> <span>{bill.title}</span></p>
      {analysis ? <h1 className="bill-headline">{analysis.summary.headline} <AnalysisBadge /></h1> : <h1>{bill.identifier}</h1>}
      {analysis && <TxSummaryTop a={analysis} />}
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
        {sponsors.length > 0 ? <p className="meta">Authors and sponsors: {sponsors.sort((a, b) => b.primary - a.primary).map(s => s.personId && !shared ? <Link key={s.name} className="tap" href={`/texas/members/${encodeURIComponent(s.personId)}`}>{s.name}</Link> : s.name).reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, ", ", x] : [x]), [])}</p> : <p className="meta">No authors or sponsors are on file yet.</p>}
        <p className="meta"><a className={TAP} href={bill.tloUrl} target="_blank" rel="noopener noreferrer">{TLO_RECORD}</a>. Where this page and the official record differ, the official record is right.</p>
      </div>
      {analysis && <TxSummaryRest a={analysis} />}
      {voice && <VoteBox billKey={bill.id} question={ask.question} plain={ask.plain} officialTitle={bill.title} data={voice} code={(await searchParams).c} back={`/texas/bills/${encodeURIComponent(bill.id)}`} />}
      {/* BEGIN contact-your-legislator (test-ready build): the reader's Texas legislators, official phone, email and an editable message. */}
      {shared ? <TakePart /> : <ContactForTxBill bill={bill} votes={votes} />}
      {/* END contact-your-legislator */}
      <div className="fed-section" id="decisions"><h2>Decisions so far <OfficialBadge /></h2>
        <p className="meta">Each decision says how it was taken. A member&apos;s vote is shown only where the official record lists each member by name.</p>
        {main.length ? <ul className="vote-list">{main.map(d => <DecisionRow key={d.key} d={d} terms={terms.get(d.key)} tloUrl={bill.tloUrl} parties={d.vote ? parties.get(d.vote.id) : undefined} />)}</ul>
          : <p className="meta">No decisions on this bill yet.</p>}
        {rest.length > 0 && <details className="primer"><summary>{rest.length} more {rest.length === 1 ? "decision" : "decisions"}: proposed changes and procedural steps</summary>
          <ul className="vote-list">{rest.map(d => <DecisionRow key={d.key} d={d} terms={terms.get(d.key)} tloUrl={bill.tloUrl} parties={d.vote ? parties.get(d.vote.id) : undefined} />)}</ul></details>}
      </div>
      {yourMembers.length > 0 && <div className="fed-section" id="your-legislators"><h2>Your legislators on this bill</h2>
        <ul className="vote-list">{yourMembers.map(m => <li key={m.id} className="vote-row"><div className="vote-main">
          <b><Link className="tap" href={`/texas/members/${encodeURIComponent(m.id)}`}>{m.name}</Link></b>
          <span className="vote-position">{m.line} <OfficialBadge /></span>
          <small className="district-total"><OpinionBadge /> Residents of {scopeLine(m.scope, yourTotals.get(m.scope))} {NOT_SCIENTIFIC}</small></div></li>)}</ul>
        <p className="meta">A legislator&apos;s vote is shown only where the official record lists each member by name.</p></div>}
      <MemberVoteLists decisions={decisions} members={members} tloUrl={bill.tloUrl} />
      {versions.length > 0 && <div className="fed-section"><h2>Bill text <OfficialBadge /></h2><ul className="analysis-list">{versions.map(v => <li key={v.note}>{v.url ? <a href={v.url} target="_blank" rel="noopener noreferrer">{v.note}</a> : v.note}{v.date ? ` (${shortDate(v.date)})` : ""}</li>)}</ul></div>}
      {!shared && <div className="fed-section" id="share"><h2>Share one fact from this bill</h2>
        <p className="meta"><Link className={TAP} href={`/share/card?t=bill&bill=${encodeURIComponent(bill.id)}&src=bill`}>Where it stands</Link>. The card carries one fact, its date and its source.</p></div>}
      <div className="fed-section"><h2>Sources</h2><ul className="source-list"><li><a href={bill.tloUrl} target="_blank" rel="noopener noreferrer">Texas Legislature Online (source of record)</a></li>
        {bill.openstatesUrl && <li><a href={bill.openstatesUrl} target="_blank" rel="noopener noreferrer">Open States</a></li>}<li>Retrieved {shortDate(bill.retrievedAt)} via {bill.feed === "openstates" ? "Open States" : "LegiScan"}.</li></ul></div>
    </section>
  </EntryShell>;
}
