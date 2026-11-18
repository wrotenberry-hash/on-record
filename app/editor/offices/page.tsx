import Link from "next/link";
import { getDb } from "@/db";
import { requireEditorUser } from "@/lib/auth";
import { shortDate } from "@/components/federal/badges";
import { Wordmark } from "@/components/brand/wordmark";
import { OFFICE_DOMAINS, proofLine } from "@/lib/office/domains";
import { OFFICE_EMAIL_FLAG, officeEmailEnabled } from "@/lib/office/email";
import { officesForEditor, type OfficeForEditor } from "@/lib/office/store";
import { decideOfficeAccount } from "./actions";

export const dynamic = "force-dynamic";

const who = (o: OfficeForEditor) => (o.member ? `${o.member.seat} ${o.member.name} (${o.member.scopeName})${o.member.current ? "" : ", no longer in the seat"}` : `a member this site has no record of (${o.account.memberKey})`);

/**
 * Legislators' offices that signed in with a government email address. An address that names one office opens that
 * office's dashboard by itself. An address that names only the chamber waits here until the editor confirms which
 * office it is. The editor sees the office address, because that is what is being confirmed; an office never sees a reader.
 */
export default async function EditorOfficesPage() {
  await requireEditorUser("/editor/offices");
  const all = await officesForEditor(getDb()).catch(() => []);
  const by = (s: string) => all.filter(o => o.account.status === s);
  const waiting = by("review"), active = by("active"), closed = by("revoked"), unconfirmed = by("pending");
  const row = (o: OfficeForEditor, buttons: React.ReactNode) => <li key={o.account.id} className="review-item">
    <b>{o.account.email}</b> · says it works for {who(o)}
    <p className="meta">{o.proof ? proofLine(o.proof) : "This domain is no longer on the list."}</p>
    <p className="meta">asked {shortDate(o.account.createdAt)}{o.account.emailVerifiedAt ? ` · link used ${shortDate(o.account.emailVerifiedAt)}` : " · link not used yet"}{o.account.lastSeenAt ? ` · last seen ${shortDate(o.account.lastSeenAt)}` : ""} · weekly email {o.account.weeklyEmail ? "on" : "off"}</p>
    <form action={decideOfficeAccount} className="review-actions"><input type="hidden" name="officeId" value={o.account.id} />{buttons}</form>
  </li>;
  return <>
    <header className="topbar"><Link className="brand" href="/"><Wordmark /><i/></Link>
      <nav><Link href="/editor">Cases</Link><Link href="/editor/integrity">Flagged answers</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>
    <main className="fed-page analysis-admin">
      <p className="crumbs"><Link href="/editor">← Cases</Link></p>
      <div className="eyebrow">EDITOR · LEGISLATORS&apos; OFFICES</div>
      <h1>Offices</h1>
      <p className={officeEmailEnabled(process.env[OFFICE_EMAIL_FLAG]) ? "gate gate-open" : "gate gate-closed"} role="status"><b>Weekly office email {officeEmailEnabled(process.env[OFFICE_EMAIL_FLAG]) ? "on" : "off"}.</b> It is sent only when {OFFICE_EMAIL_FLAG} is set to 1. <Link href="/editor/office-email">See the email as an office would get it</Link>.</p>

      <h2 id="waiting">Offices waiting · {waiting.length}</h2>
      <p className="meta">These people used the link sent to a government address, so the address is theirs. The address does not show which office they work for; they chose it. Confirm only when you are satisfied they work for that member, for example by calling the office&apos;s public number. Until then they see nothing.</p>
      {waiting.length ? <ul className="review-list">{waiting.map(o => row(o, <><button name="decision" value="confirm">Confirm: open the dashboard</button><button name="decision" value="revoke" className="secondary">Refuse</button></>))}</ul> : <p className="meta">No office is waiting.</p>}

      <h2>Open · {active.length}</h2>
      {active.length ? <ul className="review-list">{active.map(o => row(o, <button name="decision" value="revoke" className="secondary">Close this account</button>))}</ul> : <p className="meta">No office has a dashboard open.</p>}

      {closed.length > 0 && <><h2>Closed · {closed.length}</h2><ul className="review-list">{closed.map(o => row(o, <button name="decision" value="reopen" className="secondary">Let this address ask again</button>))}</ul></>}

      <h2>Asked for a link, not used · {unconfirmed.length}</h2>
      <p className="meta">Anyone can type an address on a listed domain. Nothing is confirmed until the link sent to that address is used. An address that never uses its link is deleted after a week.</p>
      {unconfirmed.length > 0 && <ul className="analysis-list">{unconfirmed.map(o => <li key={o.account.id}>{o.account.email} · asked {shortDate(o.account.createdAt)}</li>)}</ul>}

      <h2>Addresses that can sign in</h2>
      <ul className="analysis-list">{OFFICE_DOMAINS.map(d => <li key={d.id}><b>{d.domain}</b> ({d.body}). {d.proves}{d.doesNotProve ? ` It does not prove: ${d.doesNotProve.replace(/\.$/, "").toLowerCase()}.` : ""} {d.then}</li>)}</ul>
    </main>
  </>;
}
