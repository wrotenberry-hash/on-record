/**
 * A Texas bill's plain-language summary, drawn in the same order as a federal bill (app/bills/[id]/page.tsx):
 * plain English, what would change, how it works today, why now, then the bill's Status (official, drawn by the page),
 * then who it affects, the official cost, what changes for you, the case for and against, what we don't know.
 *
 * Everything here is Analysis except the cost line, which is the Legislative Budget Board's own top line. A side with
 * no argument prints the fixed line from lib/texas/analysis/standard.ts; a reason is never invented.
 */
import Link from "next/link";
import { AnalysisBadge, OfficialBadge, shortDate } from "@/components/federal/badges";
import { BRAND } from "@/lib/brand";
import { txPrimerById } from "@/lib/texas/primers";
import type { TxSummaryForPage } from "@/lib/texas/summaries";

type Doc = { id: string; kind: string; label: string; url: string };
const SOURCE_NAME: Record<string, string> = { bill_analysis: "Bill analysis", fiscal_note: "Fiscal note", hro: "House Research Organization", statute: "Texas law", status: "Bill history" };

/** A citation: a link to the official source it names ("ANALYSIS", "FISCAL"), or the bill section as written ("Sec. 2"). */
function Cite({ docs, section }: { docs: readonly Doc[]; section: string }) {
  const doc = docs.find(d => d.id.toUpperCase() === section.trim().toUpperCase());
  return doc ? <a className="cite" href={doc.url} target="_blank" rel="noopener noreferrer" title={doc.label}>{SOURCE_NAME[doc.kind] ?? doc.id}</a> : <span className="cite">{section}</span>;
}

export const txHeldReason = (reason: string) => reason === "low_confidence" ? "the model marked its confidence low" : reason === "check_failed" ? "it did not pass every check" : reason === "sample" ? "picked for the 1-in-5 audit" : "it needs an editor's look";

/** Above the Status section: plain English, the held note (editor only), what would change, how it works today, why now. */
export function TxSummaryTop({ a }: { a: TxSummaryForPage }) {
  const docs = a.details?.sourceDocs ?? [], st = a.structure;
  const primers = (st?.primers ?? []).map(txPrimerById).filter((p): p is NonNullable<typeof p> => !!p && p.reviewed);
  const primerBox = (p: (typeof primers)[number]) => <details key={p.id} className="primer"><summary>{p.kind === "process" ? "How this works: " : "Background: "}{p.title}</summary>
    <ul className="analysis-list">{p.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
    <p className="meta">Sources: {p.sources.map((x, i) => <span key={x.url}>{i ? " · " : ""}<a href={x.url} target="_blank" rel="noopener noreferrer">{x.label}</a></span>)}. Checked {shortDate(p.lawAsOf)}.</p></details>;
  return <>
    {a.details?.plainEnglish && <div className="fed-section plain-english"><h2>In plain English <AnalysisBadge /></h2><p>{a.details.plainEnglish}</p></div>}
    {a.held && <div className="held-note" role="note"><b>Held for review.</b> Readers will not see this summary until an editor approves it{a.queue ? ` (${txHeldReason(a.queue.reason)})` : ""}. <Link href="/editor/texas-summaries">Review it</Link>
      {a.missingSources.length > 0 && <ul className="analysis-list">{a.missingSources.map((n, i) => <li key={i}>{n}</li>)}</ul>}</div>}
    {st && <>
      {/* 21 Nov 2026 (owner): "Today" always comes before "what would change". */}
      <div className="fed-section"><h2>How it works today <AnalysisBadge /></h2>
        <ul className="analysis-list">{st.howItWorksToday.map((p, i) => <li key={i}>{p.text} <Cite docs={docs} section={p.section} /></li>)}</ul>
        {primers.filter(p => p.kind === "topic").map(primerBox)}</div>
      <div className="fed-section"><h2>What would change <AnalysisBadge /></h2>
        <ul className="change-rows">{st.changes.map((r, i) => <li key={i}>{r.label && <h3>{r.label}</h3>}
          {r.before?.trim() && <p><b>Before:</b> {r.before}</p>}
          <p><b>Today:</b> {r.today}</p><p><b>If this passes:</b> {r.ifPassed} <Cite docs={docs} section={r.source} /></p></li>)}</ul></div>
      <div className="fed-section"><h2>Why now <AnalysisBadge /></h2><p>{st.whyNow}</p>
        {primers.filter(p => p.kind === "process").map(primerBox)}</div>
    </>}
  </>;
}

/** Below the Status section: who it affects, the official cost, what changes for you, the cases, what we don't know. */
export function TxSummaryRest({ a }: { a: TxSummaryForPage }) {
  const s = a.summary, docs = a.details?.sourceDocs ?? [];
  const side = (list: typeof s.caseFor, note: string | null) => list.length
    ? <ul className="analysis-list">{list.map((x, i) => <li key={i}>{x.argument} <span className="attrib">({x.attribution})</span>{x.source ? <> <Cite docs={docs} section={x.source} /></> : null}</li>)}</ul>
    : <p className="meta">{note}</p>;
  return <>
    {!a.structure && <div className="fed-section"><h2>What it does <AnalysisBadge /></h2>
      <ul className="analysis-list">{s.whatItDoes.map((p, i) => <li key={i}>{p.text} <Cite docs={docs} section={p.section} /></li>)}</ul></div>}
    <div className="fed-section"><h2>Who it affects <AnalysisBadge /></h2>
      <ul className="analysis-list">{s.whoItAffects.map((p, i) => <li key={i}>{p.text} <Cite docs={docs} section={p.section} /></li>)}</ul></div>
    <div className="fed-section"><h2>Cost <OfficialBadge /></h2>
      {a.fiscal ? <p>{a.fiscal.noSignificantImpact ? "The Legislative Budget Board expects no significant cost to the state." : a.fiscal.headline ?? "The Legislative Budget Board has published a fiscal note for this bill."}{" "}
        <a className="cite" href={a.fiscal.url} target="_blank" rel="noopener noreferrer">Fiscal note{a.fiscal.date ? `, ${shortDate(a.fiscal.date)}` : ""}</a>
        {a.fiscal.describes ? <span className="meta"> ({a.fiscal.describes})</span> : null}</p>
        : <p className="meta">No Legislative Budget Board fiscal note was found for this bill when the summary was written. The Legislative Budget Board is the state office that estimates what a bill would cost.</p>}
    </div>
    <div className="fed-section"><h2>What changes for you <AnalysisBadge /></h2><p>{s.whatChangesForYou}</p></div>
    <div className="fed-section"><h2>The case for and against <AnalysisBadge /></h2>
      <div className="case-grid"><div><h3>For</h3>{side(s.caseFor, a.caseNotes.for)}</div><div><h3>Against</h3>{side(s.caseAgainst, a.caseNotes.against)}</div></div>
      <p className="meta">Each argument is credited to who makes it in the official record and links to that source. Both sides are held to the same standard. They are not {BRAND.name}&apos;s view.</p></div>
    <div className="fed-section"><h2>What we don&apos;t know <AnalysisBadge /></h2>
      <ul className="analysis-list">{s.unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul>
      <p className="meta">Written by AI ({s.model}) from the {s.textVersionLabel.toLowerCase()} text{s.textDate ? ` of ${shortDate(s.textDate)}` : ""} and the official sources below, then checked against {BRAND.name}&apos;s written rules{a.readerTest ? ` and an average-reader test (${a.readerTest.passed ? "passed" : "did not pass"})` : ""}.{s.truncated ? " The bill is long; only the first part of its text was read." : ""}</p>
      {s.sources.length > 0 && <ul className="source-list">{s.sources.map(x => <li key={x.url}><a href={x.url} target="_blank" rel="noopener noreferrer">{x.label}</a>{x.date ? `, ${shortDate(x.date)}` : ""}</li>)}</ul>}</div>
  </>;
}
