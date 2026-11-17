import Link from "next/link";
import { requireEditorUser } from "@/lib/auth";
import { PROBLEM_REASONS, problemList, type ProblemReason } from "@/lib/problems";
import { shortDate } from "@/components/federal/badges";
import { closeProblem } from "./actions";
import { Wordmark } from "@/components/brand/wordmark";

export const dynamic = "force-dynamic";

/** Round G: problems readers reported on cards. A fix, with its note, goes to the public corrections log. */
export default async function ProblemsPage() {
  await requireEditorUser("/editor/problems");
  const [open, closed] = await Promise.all([problemList("open").catch(() => []), problemList("closed").catch(() => [])]);
  return <>
    <header className="topbar"><Link className="brand" href="/"><Wordmark /><i/></Link><nav><Link href="/editor">Cases</Link><Link href="/corrections">Corrections</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>
    <main className="fed-page analysis-admin">
      <div className="eyebrow">EDITOR · REPORTED PROBLEMS</div><h1>Reported problems ({open.length} open)</h1>
      <p className="meta">From &ldquo;Report a problem&rdquo; on every card. Readers&apos; notes are seen only here. When you mark one fixed, the page and what you changed appear in the corrections log (not the reader&apos;s note).</p>
      {open.length ? open.map(r => <div key={r.id} className="post-row">
        <div className="eyebrow">{shortDate(r.createdAt)} · {r.subjectKind.toUpperCase()}</div>
        <p><b>{PROBLEM_REASONS[r.reason as ProblemReason]}</b> on <Link href={r.page}>{r.page}</Link></p>
        {r.details && <p className="meta">Reader&apos;s note: {r.details}</p>}
        <form action={closeProblem} className="verify-form"><input type="hidden" name="id" value={r.id} />
          <label htmlFor={`res-${r.id}`}>What you changed, or why nothing changed (shown publicly when fixed)<textarea id={`res-${r.id}`} name="resolution" rows={2} maxLength={500} /></label>
          <div className="share-actions"><button name="status" value="fixed">Fixed</button><button name="status" value="no_change" className="secondary-button">Checked, no change</button><button name="status" value="dismissed" className="secondary-button">Dismiss</button></div></form>
      </div>) : <p className="empty-note">No open reports.</p>}
      {closed.length > 0 && <details className="method"><summary>Closed ({closed.length})</summary><ul className="analysis-list">{closed.map(r => <li key={r.id}>{shortDate(r.resolvedAt ?? r.createdAt)} · {r.status.replace("_", " ")} · {PROBLEM_REASONS[r.reason as ProblemReason]} · {r.page}{r.resolution ? ` — ${r.resolution}` : ""}</li>)}</ul></details>}
    </main></>;
}
