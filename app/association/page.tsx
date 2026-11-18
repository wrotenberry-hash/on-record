import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { Wordmark } from "@/components/brand/wordmark";
import { BRAND, brandTitle } from "@/lib/brand";
import { MIN_SHOWN, NOT_SCIENTIFIC } from "@/lib/constituent/rules";
import { LINK_BAD_EMAIL, LINK_EXPIRED, LINK_REQUESTED, LINK_TOO_MANY, memberCountLine, rowLines, WHAT_IS_COUNTED } from "@/lib/associations/rules";
import { associationsEnabled, currentAssociationAdmin } from "@/lib/associations/session";
import { viewForAdmin } from "@/lib/associations/store";
import { requestLink, signOutAssociation } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Association totals"), robots: { index: false, follow: false } };

const MESSAGES: Record<string, { text: string; good: boolean }> = { sent: { text: LINK_REQUESTED, good: true }, email: { text: LINK_BAD_EMAIL, good: false }, limit: { text: LINK_TOO_MANY, good: false },
  expired: { text: LINK_EXPIRED, good: false }, out: { text: "Signed out on this device.", good: true } };

/**
 * What an association may see: totals for its own counted members, bill by bill, and nothing else. There is no
 * association in the address of this page: the totals are those of the administrator who is signed in, so there is
 * nothing to change in the address to look at another association. Off (page not found) unless associations are switched on.
 */
export default async function AssociationPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  if (!associationsEnabled()) notFound();
  const { m } = await searchParams, note = m ? MESSAGES[m] : null;
  const admin = await currentAssociationAdmin();
  const view = admin ? await viewForAdmin(getDb(), admin.adminId) : null;
  return <>
    <header className="topbar"><span className="brand"><Wordmark /><i/></span><nav><small>ASSOCIATION TOTALS</small></nav></header>
    <main className="fed-page analysis-admin">
      {note && <p className={note.good ? "gate gate-open" : "gate gate-closed"} role={note.good ? "status" : "alert"}>{note.text}</p>}
      {view ? <>
        <div className="eyebrow">ASSOCIATION</div>
        <h1>{view.name}</h1>
        <p className="not-poll">{NOT_SCIENTIFIC}</p>
        <p>These are totals for members of {view.name} who have answered a bill on {BRAND.name}. {memberCountLine(view.members)}</p>
        {view.rows.length ? <>
          <ul className="voice-totals">{view.rows.map(r => <li key={r.billKey}>
            <b>{r.label}</b><span className="meta"> · {r.voters} voters</span>
            {r.title && <p className="meta">Official title: {r.title}{r.url && <> · <a className="src-link" href={r.url} target="_blank" rel="noopener noreferrer">Official page</a></>}</p>}
            <ul className="analysis-list">{rowLines(r).map(line => <li key={line}>{line}</li>)}</ul>
          </li>)}</ul>
          <p><a href="/association/export">Download these totals as a file (CSV)</a> <span className="meta">The file holds the totals shown above and nothing more.</span></p>
        </> : <p className="empty-note">No bill has {MIN_SHOWN} counted member voters yet. A bill appears here once {MIN_SHOWN} counted members have answered it.</p>}
        <p className="meta">{WHAT_IS_COUNTED}</p>
        <form action={signOutAssociation}><button className="link-button">Sign out on this device</button></form>
      </> : <>
        <div className="eyebrow">ASSOCIATIONS</div>
        <h1>Totals for an association&apos;s own members</h1>
        <p>If you administer an association that is set up on {BRAND.name}, enter your email and we will send a one-time link. No password.</p>
        <form action={requestLink} className="review-actions"><input type="email" name="email" id="association-email" required autoComplete="email" placeholder="you@example.com" aria-label="Email" />
          <button>Email me a link</button></form>
        <p className="meta">You will see totals only: how many of your counted members said Support, Oppose or Unsure on a bill, from {MIN_SHOWN} counted members. Never a name, a list of members, or one person&apos;s answer. {NOT_SCIENTIFIC}</p>
        <p className="meta">Associations are set up by the site&apos;s editor. There is no charge.</p>
      </>}
    </main>
  </>;
}
