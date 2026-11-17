import Link from "next/link";
import { requireEditorUser } from "@/lib/auth";
import { parityReport, rereviewSummary } from "@/lib/analysis/quality";
import { readerTestStats } from "@/lib/analysis/queries";
import { DRIFT, MIN_PER_PARTY } from "@/lib/analysis/parity-rules";
import { shortDate } from "@/components/federal/badges";
import { Wordmark } from "@/components/brand/wordmark";

export const dynamic = "force-dynamic";
const NAME: Record<string, string> = { D: "Democratic", R: "Republican", I: "Independent", "?": "No sponsor party" };

/** Round F: summary quality. Weekly 20% re-review against the bill text, error patterns, and party parity. */
export default async function QualityPage() {
  await requireEditorUser("/editor/quality");
  const [r, p, t] = await Promise.all([rereviewSummary(90).catch(() => null), parityReport().catch(() => null), readerTestStats().catch(() => null)]);
  return <>
    <header className="topbar"><Link className="brand" href="/"><Wordmark /><i/></Link><nav><Link href="/editor">Cases</Link><Link href="/editor/analysis">Bill summaries</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>
    <main className="fed-page analysis-admin">
      <div className="eyebrow">EDITOR · SUMMARY QUALITY</div><h1>Are the summaries still right, and even-handed?</h1>
      <h2>Average-reader test</h2>
      <p className="meta">Before a summary can be shown, a separate model call reads only its headline and plain-English part as an average adult and answers: what does the bill do, who is affected, what changes in daily life, and which words it did not understand. A second call checks those answers, and each reason in the case for and against, against the official sources. A wrong or vague answer, or a word not understood, sends the summary back to be rewritten (at most 2 retries); after that it is held.</p>
      {t && t.tests > 0 ? <><table className="chart history" tabIndex={0}><tbody>
        <tr><th scope="row">Summaries tested</th><td>{t.summariesTested}</td></tr>
        <tr><th scope="row">Passed on the first try</th><td>{t.passedFirstTry} ({Math.round((t.firstTryPassRate ?? 0) * 100)}%)</td></tr>
        <tr><th scope="row">Passed in the end</th><td>{t.passedInTheEnd} ({Math.round((t.finalPassRate ?? 0) * 100)}%)</td></tr>
        <tr><th scope="row">Tests run</th><td>{t.tests}</td></tr>
        <tr><th scope="row">Added cost per summary</th><td>{t.addedCostPerSummaryUsd === null ? "—" : `${(t.addedCostPerSummaryUsd * 100).toFixed(2)} cents`}</td></tr></tbody></table>
        {t.recentFailReasons.length > 0 && <details className="method"><summary>Latest reasons a summary failed</summary><ul className="analysis-list">{t.recentFailReasons.map((x, i) => <li key={i}>{x}</li>)}</ul></details>}</>
        : <p className="empty-note">No tests yet. The first run with the rebuilt generator fills this in.</p>}

      <h2>Weekly re-review (last 90 days)</h2>
      <p className="meta">Each week a random 20% of visible summaries are checked again against the bill text with the current rules. A summary that now fails is taken off the page (kept, not deleted) and added to your summary queue.</p>
      {r && <table className="chart history" tabIndex={0}><tbody>
        <tr><th scope="row">Re-checked</th><td>{r.checked}</td></tr><tr><th scope="row">Passed</th><td>{r.passed}</td></tr>
        <tr><th scope="row">Held for fixing</th><td>{r.held}</td></tr><tr><th scope="row">Could not fetch the bill text</th><td>{r.errors}</td></tr></tbody></table>}
      <h3 className="subhead">Error patterns to fix in the generator</h3>
      {r?.patterns.length ? <ol className="analysis-list">{r.patterns.map(x => <li key={x.pattern}>{x.pattern} <span className="meta">({x.n})</span></li>)}</ol> : <p className="empty-note">No failures found yet.</p>}
      {r && r.recent.length > 0 && <details className="method"><summary>Latest re-checks</summary><ul className="analysis-list">{r.recent.map(x => <li key={x.id}>{shortDate(x.at)} · {x.passed ? "passed" : x.error ? `error: ${x.error}` : `held: ${x.failures[0]}`} · prompt {x.promptVersion}</li>)}</ul></details>}

      <h2>Party parity</h2>
      <p className="meta">Visible summaries grouped by the bill sponsor&apos;s party. Same rules for every party. An alert is sent on drift once each of the two largest parties has at least {MIN_PER_PARTY} summaries: length more than {Math.round((DRIFT.lengthRatio - 1) * 100)}% apart, evaluative words more than {DRIFT.tonePer100Gap} per 100 words apart (and twice as many), or the case for taking a share of the argument words more than {Math.round(DRIFT.balanceGap * 100)} points apart or outside {Math.round(DRIFT.balanceLow * 100)}–{Math.round(DRIFT.balanceHigh * 100)}%.</p>
      {p && Object.keys(p.stats).length ? <table className="chart history" tabIndex={0}><thead><tr><th scope="col">Sponsor&apos;s party</th><th scope="col">Summaries</th><th scope="col">Average words</th><th scope="col">Evaluative words per 100</th><th scope="col">Case for: share of argument words</th></tr></thead>
        <tbody>{Object.entries(p.stats).map(([g, s]) => <tr key={g}><th scope="row">{NAME[g] ?? g}</th><td>{s.n}</td><td>{s.avgWords}</td><td>{s.tonePer100}</td><td>{Math.round(s.forShare * 100)}%</td></tr>)}</tbody></table>
        : <p className="empty-note">No visible summaries yet.</p>}
      {p && (p.enough ? (p.findings.length ? <ul className="analysis-list">{p.findings.map(f => <li key={f}><b>Drift:</b> {f}</li>)}</ul> : <p className="following-note">No drift found.</p>)
        : <p className="meta">Not enough summaries yet to compare ({MIN_PER_PARTY} per party needed).</p>)}
    </main></>;
}
