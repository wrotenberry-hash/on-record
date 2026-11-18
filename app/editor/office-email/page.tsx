import Link from "next/link";
import { getDb } from "@/db";
import { requireEditorUser } from "@/lib/auth";
import { Wordmark } from "@/components/brand/wordmark";
import { officeRule } from "@/lib/office/domains";
import { composeOfficeEmail, OFFICE_EMAIL_FLAG, officeEmailEnabled } from "@/lib/office/email";
import { memberOf, memberOptions, officeDashboard } from "@/lib/office/store";

export const dynamic = "force-dynamic";
const requestTime = () => Date.now();

/**
 * The weekly office email, exactly as it would be written for one member today: the same composer and the same
 * dashboard the scheduled sender uses (lib/office/email.ts, lib/office/store.ts). Nothing is sent from this page.
 * The one design is docs/OFFICE_EMAIL_DESIGN.md.
 */
export default async function OfficeEmailPreview({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  await requireEditorUser("/editor/office-email");
  const db = getDb(), asked = (await searchParams).member ?? "", on = officeEmailEnabled(process.env[OFFICE_EMAIL_FLAG]);
  const options = (await Promise.all((["us-house", "us-senate", "tx-senate", "tx-house"] as const).map(async id => ({ body: officeRule(id).body, members: await memberOptions(db, officeRule(id)).catch(() => []) })))).filter(g => g.members.length);
  const key = /^(fed|tx):/.test(asked) ? asked : /^[A-Z]\d{6}$/.test(asked) ? `fed:${asked}` : options[0]?.members[0]?.key ?? "";
  const member = key ? await memberOf(db, key) : null;
  const email = member ? composeOfficeEmail(await officeDashboard(db, member, requestTime()), { dashboard: "(link to the office dashboard)", optOut: "(this office's own link to stop the email)" }) : null;
  return <>
    <header className="topbar"><Link className="brand" href="/"><Wordmark /><i/></Link><nav><Link href="/editor">Cases</Link><Link href="/editor/offices">Offices</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>
    <main className="fed-page analysis-admin"><div className="eyebrow">EDITOR · WEEKLY OFFICE EMAIL</div><h1>{member ? `The email for ${member.seat} ${member.name}` : "The weekly office email"}</h1>
      <p className={on ? "gate gate-open" : "gate gate-closed"} role="status"><b>Sending is {on ? "on" : "off"}.</b> {on ? `${OFFICE_EMAIL_FLAG} is set to 1.` : `Nothing is sent until ${OFFICE_EMAIL_FLAG} is set to 1.`} This page only shows the words; it sends nothing.</p>
      <form method="get" className="review-actions"><label htmlFor="member">Member</label>
        <select id="member" name="member" defaultValue={key}>{options.map(g => <optgroup key={g.body} label={g.body}>{g.members.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>)}</select>
        <button>Show</button></form>
      {email ? <>
        <p className="meta">{email.items > 0 ? `This email lists ${email.items} bill${email.items === 1 ? "" : "s"} with a total, so it would be sent to this member's confirmed office accounts.` : "No bill coming up or voted on this week has 25 counted voters in this district, so no email would be sent this week."}</p>
        <h2>Subject</h2><pre className="email-preview">{email.subject}</pre>
        <h2>Body</h2><pre className="email-preview">{email.text}</pre></> : <p className="meta">No member on file.</p>}
    </main></>;
}
