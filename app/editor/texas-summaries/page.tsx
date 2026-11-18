import Link from "next/link";
import { requireEditorUser } from "@/lib/auth";
import { AnalysisBadge, shortDate } from "@/components/federal/badges";
import { Wordmark } from "@/components/brand/wordmark";
import { txSummaryCounts, txSummaryList } from "@/lib/texas/summaries";
import { TX_SESSIONS } from "@/lib/texas/parse";
import { decideTexasSummary } from "./actions";

export const dynamic = "force-dynamic";

const REASON: Record<string, string> = { sample: "1-in-5 audit", low_confidence: "Low confidence (hidden until approved)", check_failed: "Did not pass every check (hidden until approved)" };

/** Texas bill summaries: the ones waiting for the editor, every one written, and what they cost. */
export default async function TexasSummariesPage() {
  await requireEditorUser("/editor/texas-summaries");
  const [counts, list] = await Promise.all([txSummaryCounts().catch(() => null), txSummaryList().catch(() => [])]);
  const open = list.filter(r => r.queue?.status === "open"), decided = list.filter(r => r.queue && r.queue.status !== "open").slice(0, 10);
  const session = (id: string) => TX_SESSIONS.find(x => x.id === id)?.name ?? `Session ${id}`;
  return <>
    <header className="topbar"><Link className="brand" href="/"><Wordmark /><i/></Link>
      <nav><Link href="/editor">Cases</Link><Link href="/editor/analysis">Federal summaries</Link><Link href="/editor/next">What&apos;s next</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>
    <main className="fed-page analysis-admin">
      <p className="crumbs"><Link href="/editor/next#texas">← What&apos;s next: Texas</Link></p>
      <div className="eyebrow">EDITOR · TEXAS BILL SUMMARIES <AnalysisBadge /></div>
      <h1>Texas bill summaries</h1>
      <p>Written the same way as federal summaries, from the bill&apos;s text, the committee or Senate Research Center analysis, the Legislative Budget Board fiscal note and the House Research Organization analysis. Only bills with a hearing, a vote or a follower get one. A summary that does not pass every check waits here, hidden, until you approve or reject it.</p>
      {counts ? <p className="meta">Written: {counts.written} ({counts.visible} passed, {counts.held} held, {counts.rejected} rejected) · Waiting for you: {counts.openReviews} · Spent: ${counts.callsUsd.toFixed(2)} over {counts.calls} model calls · Limit: {counts.limit} summaries · {counts.paused ? "Writing is paused (it has not been started)." : "Writing is on."} {counts.readersSeeThem ? "Readers see the ones that passed." : "Readers do not see Texas summaries yet; only you do, signed in."}</p>
        : <p className="meta">The counts could not be loaded. Reload in a minute.</p>}

      <h2>Waiting for review ({open.length})</h2>
      {open.length ? <ul className="review-list">{open.map(({ s, identifier, session: ses, queue, check, readerTest }) => <li key={s.id} className="review-item">
        <div className="eyebrow">{identifier} · {session(ses)} · {REASON[queue!.reason] ?? queue!.reason}</div>
        <p><b><Link href={`/texas/bills/${encodeURIComponent(s.billId)}`}>{s.headline}</Link></b></p>
        <p className="meta">Confidence {s.confidence}: {s.confidenceReason} · {s.attempts} attempt{s.attempts === 1 ? "" : "s"} · ${s.costUsd.toFixed(2)}</p>
        {check && !check.passed && check.failures.length > 0 && <details className="primer"><summary>Written rules it did not pass ({check.failures.length})</summary><ul className="analysis-list">{check.failures.map((f, i) => <li key={i}>{f}</li>)}</ul></details>}
        {readerTest && !readerTest.passed && readerTest.reasons.length > 0 && <details className="primer"><summary>Average-reader test: why it did not pass ({readerTest.reasons.length})</summary><ul className="analysis-list">{readerTest.reasons.map((f, i) => <li key={i}>{f}</li>)}</ul></details>}
        <form action={decideTexasSummary} className="review-actions">
          <input type="hidden" name="summaryId" value={s.id} />
          <input name="note" placeholder="Note (optional)" maxLength={500} aria-label="Note (optional)" />
          <button name="decision" value="approved">Approve</button>
          <button name="decision" value="rejected" className="secondary">Reject</button>
        </form>
      </li>)}</ul> : <p className="meta">Nothing waiting.</p>}

      <h2>Every Texas summary</h2>
      {list.length ? <div className="table-wrap"><table className="mapping-table"><thead><tr><th>Bill</th><th>Status</th><th>Written rules</th><th>Reader test</th><th>Cost</th></tr></thead>
        <tbody>{list.map(({ s, identifier, session: ses, queue, readerTest }) => <tr key={s.id}>
          <td><Link href={`/texas/bills/${encodeURIComponent(s.billId)}`}>{identifier}</Link><br /><small>{session(ses)} · {shortDate(s.createdAt)} · {s.model}</small></td>
          <td>{s.status === "visible" ? "passed" : s.status}{queue ? <><br /><small>{(REASON[queue.reason] ?? queue.reason).replace(/ \(.*$/, "")}</small></> : null}</td>
          <td>{s.checkPassed ? "passed" : "did not pass"}{s.attempts > 1 ? ` (${s.attempts} attempts)` : ""}</td>
          <td>{readerTest ? (readerTest.passed ? "passed" : "did not pass") : "not run"}</td>
          <td>${s.costUsd.toFixed(2)}</td></tr>)}</tbody></table></div>
        : <p className="meta">None yet. Texas summaries have not been started.</p>}

      {decided.length > 0 && <><h2>Recent decisions</h2><ul className="analysis-list">{decided.map(({ s, identifier, queue }) => <li key={s.id}>{identifier}: {queue!.status}{queue!.decidedAt ? ` ${shortDate(queue!.decidedAt)}` : ""}{queue!.note ? `: ${queue!.note}` : ""}</li>)}</ul></>}

      {counts?.lastRun && <p className="meta">Last run: {counts.lastRun.status}, {counts.lastRun.made} written{counts.lastRun.stoppedBy ? `, stopped by ${counts.lastRun.stoppedBy}` : ""}.</p>}
    </main>
  </>;
}
