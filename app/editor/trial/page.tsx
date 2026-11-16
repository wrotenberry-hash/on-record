import Link from "next/link";
import { requireEditorUser } from "@/lib/auth";
import { shortDate } from "@/components/federal/badges";
import { ensureInvites, inviteLinks, trialCounts } from "@/lib/trial";
import { eventTotals } from "@/lib/events";
import { labelInvite, setInviteRevoked } from "./actions";
import { CopyLink } from "./copy-link";
import { feedbackList } from "@/lib/feedback";
import { FEEDBACK_QUESTION } from "@/lib/feedback-rules";

export const dynamic = "force-dynamic";

/** The invite-only trial: 25 links to copy on the phone, each revocable, with counts only. */
export default async function TrialAdminPage() {
  await requireEditorUser("/editor/trial");
  await ensureInvites();
  const [links, counts, events, feedback] = await Promise.all([inviteLinks(), trialCounts(), eventTotals(7).catch(() => []), feedbackList().catch(() => [])]);
  const trialViews = events.filter(e => e.name === "page_view" && e.dim.startsWith("trial:"));
  return <>
    <header className="topbar"><Link className="brand" href="/">ON <span>RECORD</span><i/></Link>
      <nav><Link href="/editor">Cases</Link><Link href="/editor/analysis">Bill summaries</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>
    <main className="fed-page analysis-admin">
      <p className="crumbs"><Link href="/editor">← Cases</Link></p>
      <div className="eyebrow">EDITOR · INVITE-ONLY TRIAL</div>
      <h1>Trial invites</h1>
      <p className={counts.gate.open ? "gate gate-open" : "gate gate-closed"} role="status"><b>{counts.gate.open ? "Open." : "Not open yet."}</b> {counts.gate.open ? "The links below work now." : "The links work once OpenAI calls succeed in production; you will get one email when that happens."} <span className="meta">({counts.gate.reason})</span></p>
      <p>Send one link per person. Each opens Politicians, Issues, bills with their summaries, Follow and the trust pages. Public reading stays off. Revoke a link and it stops on that person&apos;s next visit.</p>
      <p className="meta">Used: {counts.used} of {counts.invites} · active in the last 7 days: {counts.activeLast7Days} · used on 2 or more days: {counts.usedOnTwoOrMoreDays} · returning this week: {counts.returningLast7Days} · revoked: {counts.revoked}. Per link we record only the days it was used, never which pages.</p>
      <ol className="invite-list">{links.map(l => <li key={l.id} className={l.revokedAt ? "revoked" : ""}>
        <div className="invite-head"><b>Invite {l.number}</b>
          <span className="meta">{l.revokedAt ? "Revoked" : l.firstSeenAt ? `Used on ${l.activeDays} day${l.activeDays === 1 ? "" : "s"}, last ${shortDate(l.lastSeenAt)}` : "Not used yet"}</span></div>
        {l.url ? <CopyLink url={l.url} inputId={`invite-${l.number}`} /> : <p className="meta">Sign-in secret missing; links cannot be shown.</p>}
        <div className="invite-actions">
          <form action={labelInvite}><input type="hidden" name="inviteId" value={l.id} /><input name="label" id={`label-${l.number}`} defaultValue={l.label ?? ""} placeholder="Who you sent it to (private)" maxLength={60} /><button>Save</button></form>
          <form action={setInviteRevoked}><input type="hidden" name="inviteId" value={l.id} /><button name="action" value={l.revokedAt ? "restore" : "revoke"} className="secondary">{l.revokedAt ? "Restore" : "Revoke"}</button></form>
        </div>
      </li>)}</ol>
      <h2>Feedback</h2>
      <p className="meta">Asked once, on a reader&apos;s third day: &ldquo;{FEEDBACK_QUESTION}&rdquo; Answers carry no invite or page.</p>
      {feedback.length ? <ul className="analysis-list">{feedback.map(f => <li key={f.id}><span className="meta">{shortDate(f.createdAt)}</span> {f.answer}</li>)}</ul> : <p className="meta">No answers yet.</p>}
      <h2>Trial page views, last 7 days</h2>
      {trialViews.length ? <ul className="analysis-list">{trialViews.map(e => <li key={e.dim}>{e.dim.slice(6)}: {e.n}</li>)}</ul> : <p className="meta">None yet.</p>}
    </main>
  </>;
}
