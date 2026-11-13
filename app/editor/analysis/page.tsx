import Link from "next/link";
import { requireEditorUser } from "@/lib/auth";
import { AnalysisBadge, billLabel, shortDate } from "@/components/federal/badges";
import { allSummaries, analysisCounts, reviewQueue } from "@/lib/analysis/queries";
import { analysisLimits } from "@/lib/analysis/generate";
import { decideSummary } from "./actions";
import { GenerateNow } from "./generate-now";

export const dynamic = "force-dynamic";

const REASON: Record<string, string> = { sample: "1-in-5 audit (visible meanwhile)", low_confidence: "Low confidence (hidden until approved)", check_failed: "Failed the rule checker twice (hidden until approved)" };

/** Bill summaries: the sampling queue, every summary with its cost, and the test caps. */
export default async function AnalysisReviewPage() {
  await requireEditorUser("/editor/analysis");
  const [counts, queue, summaries] = await Promise.all([analysisCounts().catch(() => null), reviewQueue().catch(() => []), allSummaries().catch(() => [])]);
  const limits = analysisLimits();
  const open = queue.filter(r => r.q.status === "open"), decided = queue.filter(r => r.q.status !== "open").slice(0, 10);
  const capReached = counts && counts.summaries >= limits.maxSummaries ? `Test cap reached: ${counts.summaries} of ${limits.maxSummaries} summaries (ANALYSIS_MAX_SUMMARIES).`
    : counts && counts.analysisCallsUsd >= limits.spendCapUsd ? `Spend cap reached: $${counts.analysisCallsUsd.toFixed(2)} of $${limits.spendCapUsd} (ANALYSIS_SPEND_CAP_USD).` : null;

  return <>
    <header className="topbar"><Link className="brand" href="/">ON <span>RECORD</span><i/></Link>
      <nav><Link href="/editor">Cases</Link><Link href="/politicians">Politicians</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>
    <main className="fed-page analysis-admin">
      <p className="crumbs"><Link href="/editor">← Cases</Link></p>
      <div className="eyebrow">EDITOR · BILL SUMMARIES <AnalysisBadge /></div>
      <h1>Bill summaries</h1>
      <p>AI writes each summary from the bill&apos;s own text. A rule checker blocks loaded words, missing section cites, over-long sections and an uneven case for and against. Every fifth summary comes here for an audit, and every low-confidence or twice-failed one waits here, hidden, until you approve it.</p>
      {counts && <p className="meta">Summaries: {counts.summaries} ({counts.visible} visible, {counts.held} held, {counts.rejected} rejected) · Waiting for you: {counts.openReviews} · Spent on summaries: ${counts.analysisCallsUsd.toFixed(3)} over {counts.analysisCalls} model calls · Test caps: {limits.maxSummaries} summaries, ${limits.spendCapUsd.toFixed(2)}</p>}
      <GenerateNow disabledReason={capReached} />

      <h2>Waiting for review ({open.length})</h2>
      {open.length ? <ul className="review-list">{open.map(({ q, s, billType, number }) => <li key={q.id} className="review-item">
        <div className="eyebrow">{billLabel(billType, number)} · {REASON[q.reason]}</div>
        <p><b><Link href={`/bills/${s.billId}`}>{s.headline}</Link></b></p>
        <p className="meta">Confidence {s.confidence}: {s.confidenceReason} · {s.attempts} attempt{s.attempts === 1 ? "" : "s"} · ${s.costUsd.toFixed(4)}</p>
        <form action={decideSummary} className="review-actions">
          <input type="hidden" name="queueId" value={q.id} />
          <input name="note" placeholder="Note (optional)" maxLength={500} />
          <button name="decision" value="approved">Approve</button>
          <button name="decision" value="rejected" className="secondary">Reject</button>
        </form>
      </li>)}</ul> : <p className="meta">Nothing waiting.</p>}

      <h2>Every summary</h2>
      {summaries.length ? <div className="table-wrap"><table className="mapping-table"><thead><tr><th>Bill</th><th>Status</th><th>Checker</th><th>Grade</th><th>Words</th><th>Cost</th></tr></thead>
        <tbody>{summaries.map(({ s, billType, number, reason, grade, words }) => <tr key={s.id}>
          <td><Link href={`/bills/${s.billId}`}>{billLabel(billType, number)}</Link><br /><small>{shortDate(s.createdAt)} · {s.model}</small></td>
          <td>{s.status}{reason ? <><br /><small>{reason.replace("_", " ")}</small></> : null}</td>
          <td>{s.checkPassed ? "passed" : "failed"}{s.attempts > 1 ? " (2nd try)" : ""}</td>
          <td>{grade ?? "–"}</td><td>{words ?? "–"}</td>
          <td>${s.costUsd.toFixed(4)}<br /><small>{s.inputTokens.toLocaleString()} in / {s.outputTokens.toLocaleString()} out</small></td></tr>)}</tbody></table></div>
        : <p className="meta">None yet. The 19:00 UTC run writes them, or tap the button above.</p>}

      {decided.length > 0 && <><h2>Recent decisions</h2><ul className="analysis-list">{decided.map(({ q, billType, number }) => <li key={q.id}>{billLabel(billType, number)}: {q.status} {q.decidedAt ? shortDate(q.decidedAt) : ""}{q.note ? `: ${q.note}` : ""}</li>)}</ul></>}

      {counts?.lastRun && <p className="meta">Last summary run: {counts.lastRun.status}, {counts.lastRun.made} written{counts.lastRun.stoppedBy ? `, stopped by ${counts.lastRun.stoppedBy}` : ""}{counts.lastRun.error ? `. ${counts.lastRun.error}` : ""}.</p>}
    </main>
  </>;
}
