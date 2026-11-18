import Link from "next/link";
import { requireEditorUser } from "@/lib/auth";
import { getDb } from "@/db";
import { shortDate } from "@/components/federal/badges";
import { Wordmark } from "@/components/brand/wordmark";
import { CreateAssociationForm, NewCodeForm } from "@/components/associations/editor-forms";
import { MIN_SHOWN } from "@/lib/constituent/rules";
import { ASSOCIATIONS_FLAG, memberCountLine, STATUS_WORD, WHAT_IS_COUNTED } from "@/lib/associations/rules";
import { associationsEnabled } from "@/lib/associations/session";
import { associationsForEditor } from "@/lib/associations/store";
import { addAdminAction, removeAdminAction, setStatusAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Associations: made here by the editor, never by sign-up. Each gets a join code (shown once) for its members and a
 * list of administrator emails. This screen shows no member and no answer: only whether 25 or more have joined.
 */
export default async function AssociationsAdminPage() {
  await requireEditorUser("/editor/associations");
  const on = associationsEnabled();
  const list = on ? await associationsForEditor(getDb()).catch(() => []) : [];
  return <>
    <header className="topbar"><Link className="brand" href="/"><Wordmark /><i/></Link>
      <nav><Link href="/editor">Cases</Link><Link href="/editor/integrity">Flagged answers</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>
    <main className="fed-page analysis-admin">
      <p className="crumbs"><Link href="/editor">← Cases</Link></p>
      <div className="eyebrow">EDITOR · ASSOCIATIONS</div>
      <h1>Associations</h1>
      <p className={on ? "gate gate-open" : "gate gate-closed"} role="status"><b>Associations are switched {on ? "on" : "off"}.</b> {on
        ? "Readers see a join form on their Account page, and an administrator can sign in at /association."
        : `Nothing about associations is live: readers see no join form, /association does not exist, and nothing can be added here. To switch it on, set ${ASSOCIATIONS_FLAG} to 1 in the project's settings.`}</p>
      <p>An association may see totals for its own counted members, and nothing else. {WHAT_IS_COUNTED}</p>
      {on && <>
        <h2>Add an association</h2>
        <p className="meta">It starts as “not open yet”: its code does not work and nobody can sign in until you open it.</p>
        <CreateAssociationForm />
        <h2>All associations · {list.length}</h2>
        {list.length ? <ul className="review-list">{list.map(a => <li key={a.id} className="review-item" id={a.slug}>
          <b>{a.name}</b> · {STATUS_WORD[a.status]}
          <p className="meta">Added {shortDate(a.createdAt)}{a.decidedAt ? ` · ${a.status === "closed" ? "closed" : "opened"} ${shortDate(a.decidedAt)}` : ""}{a.status !== "closed" ? ` · ${memberCountLine(a.members)}` : " · every membership was removed when it closed"}</p>
          {a.status !== "closed" && <form action={setStatusAction} className="review-actions"><input type="hidden" name="associationId" value={a.id} />
            {a.status === "pending" && <button name="to" value="active">Open it</button>}
            <button name="to" value="closed" className="secondary">Close it for good (removes every membership)</button></form>}
          <p className="meta"><b>Administrators</b> (each signs in at /association with a link sent to this address):</p>
          {a.admins.length ? <ul className="analysis-list">{a.admins.map(x => <li key={x.id}>
            <form action={removeAdminAction} className="review-actions"><input type="hidden" name="adminId" value={x.id} />
              <span>{x.email} <span className="meta">· {x.verifiedAt ? `first signed in ${shortDate(x.verifiedAt)}` : "has not signed in yet"}</span></span>
              <button className="secondary" aria-label={`Remove ${x.email}`}>Remove</button></form></li>)}</ul> : <p className="meta">None yet.</p>}
          {a.status !== "closed" && <>
            <form action={addAdminAction} className="review-actions"><input type="hidden" name="associationId" value={a.id} />
              <input type="email" name="email" required placeholder="administrator@example.org" aria-label={`Administrator email for ${a.name}`} /><button>Add administrator</button></form>
            <NewCodeForm associationId={a.id} name={a.name} /></>}
        </li>)}</ul> : <p className="meta">None yet.</p>}
        <p className="meta">The number of members is shown only from {MIN_SHOWN}, here as everywhere. There is no list of members to look at, for you or for the association.</p>
      </>}
    </main>
  </>;
}
