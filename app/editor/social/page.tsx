import Link from "next/link";
import { requireEditorUser } from "@/lib/auth";
import { postQueueList, QUEUE_ONLY, socialConfig } from "@/lib/social";
import { decideQueuedPost, draftToday } from "./actions";

export const dynamic = "force-dynamic";

/** Round G: the daily auto-drafted post queue for On Record's own accounts. One tap to approve. */
export default async function SocialQueuePage() {
  await requireEditorUser("/editor/social");
  const cfg = socialConfig(), rows = await postQueueList(30).catch(() => []);
  const label = (s: string) => ({ draft: "Waiting for you", approved: "Approved (not posted)", posted: "Posted", rejected: "Rejected", failed: "Post failed" }[s] ?? s);
  return <>
    <header className="topbar"><Link className="brand" href="/">ON <span>RECORD</span><i/></Link><nav><Link href="/editor">Cases</Link><Link href="/editor/metrics">Sharing</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>
    <main className="fed-page analysis-admin">
      <div className="eyebrow">EDITOR · ON RECORD&apos;S OWN ACCOUNTS</div><h1>Post queue</h1>
      <p className="meta">Drafted each day from the record: a bill stopped by a procedural vote (when there is one), a 5-slide bill explainer, and a dashboard card. Approve with one tap. Cards with only Official blocks may post on their own once an account is connected. No paid promotion, no replies, no engagement tricks.</p>
      <table className="chart history" tabIndex={0}><tbody>
        <tr><th scope="row">Posting</th><td>{cfg.canPost ? "On" : `Off. ${cfg.blocked}`}</td></tr>
        <tr><th scope="row">Bluesky</th><td>{cfg.bluesky ? "Connected" : "Not connected (BLUESKY_HANDLE, BLUESKY_APP_PASSWORD)"}</td></tr>
        <tr><th scope="row">Threads</th><td>{cfg.threads ? "Connected" : "Not connected (THREADS_USER_ID, THREADS_ACCESS_TOKEN)"}</td></tr>
        <tr><th scope="row">{QUEUE_ONLY.join(", ")}</th><td>Queue only: save the image and copy the caption, then post by hand.</td></tr>
      </tbody></table>
      <form action={draftToday}><button className="secondary-button">Draft today&apos;s posts now</button></form>
      {rows.length ? rows.map(r => <div key={r.id} className="post-row">
        <div className="eyebrow">{r.day} · {r.kind.toUpperCase()} · {label(r.status)}{r.officialOnly ? " · OFFICIAL ONLY" : ""}</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <a href={r.imagePath} target="_blank" rel="noopener noreferrer"><img src={r.imagePath} alt={`Card for ${r.kind}`} loading="lazy" /></a>
        {r.status === "draft" || r.status === "failed" ? <form action={decideQueuedPost} className="verify-form">
          <input type="hidden" name="id" value={r.id} />
          <label htmlFor={`cap-${r.id}`}>Caption (beside the image, never on it)<textarea id={`cap-${r.id}`} name="caption" defaultValue={r.caption} rows={4} maxLength={600} /></label>
          <div className="share-actions"><button name="decision" value="approve">Approve</button><button name="decision" value="reject" className="secondary-button">Reject</button></div>
        </form> : <p className="meta" style={{ whiteSpace: "pre-wrap" }}>{r.caption}</p>}
        {r.postedTo && Object.keys(r.postedTo).length > 0 && <p className="meta">Posted: {Object.entries(r.postedTo).map(([k, v]) => `${k} (${v})`).join(", ")}</p>}
        {r.error && <p className="meta">Error: {r.error}</p>}
        <p className="meta"><Link href={r.link}>Link in the post</Link></p>
      </div>) : <p className="empty-note">Nothing drafted yet. Drafts appear after each scheduled run.</p>}
    </main></>;
}
