import Link from "next/link";
import { requireEditorUser } from "@/lib/auth";
import { shortDate } from "@/components/federal/badges";
import { flagsForEditor } from "@/lib/verify/anomaly";
import { verificationCounts } from "@/lib/verify/store";
import { shortHash } from "@/lib/verify/crypto";
import { REASON_LABEL } from "@/lib/verify/rules";
import { decideAccountHold, decideIntegrityFlag } from "./actions";
import { getDb } from "@/db";
import { holdsForEditor } from "@/lib/verify/residence-store";
import { HOLD_LABEL, type HoldKind } from "@/lib/verify/residence";
import { Wordmark } from "@/components/brand/wordmark";
import { MailVerifyCounts } from "@/components/account/mail-verify-counts";

export const dynamic = "force-dynamic";

const subjectText = (kind: string, subject: string) => kind === "bill_surge" ? <Link href={`/bills/${subject}`}>{subject}</Link>
  : kind === "district_surge" ? <><Link href={`/bills/${subject.split("@")[0]}`}>{subject.split("@")[0]}</Link> in {subject.split("@")[1]}</>
  : kind === "same_reason" ? `reason #${shortHash(subject)}` : `${kind === "ip_cluster" ? "network" : "device"} #${shortHash(subject)}`;

const HOLD_WORDS: Record<string, string> = { countedAtAddress: "accounts already counted at the address:", cap: "limit:", addresses: "addresses:", accounts: "accounts:", district: "district",
  arrivals72h: "new accounts and address changes in 72 hours:", previous28d: "in the 28 days before:", changesInYear: "changes this year:", refusedInMonth: "refused tries this month:" };

/** Round J: flagged answers, one tap to clear (count again) or confirm (keep out). Nothing here deletes an answer. */
export default async function IntegrityPage() {
  await requireEditorUser("/editor/integrity");
  const [flags, counts] = await Promise.all([flagsForEditor().catch(() => []), verificationCounts().catch(() => null)]);
  const holds = await holdsForEditor(getDb()).catch(() => []);
  const openHolds = holds.filter(h => h.status === "open"), decidedHolds = holds.filter(h => h.status !== "open").slice(0, 20);
  // What the editor sees about a hold: the reason and the numbers behind it. Never an address, a phone or an email.
  const holdDetail = (h: (typeof holds)[number]) => Object.entries((h.detail ?? {}) as Record<string, unknown>).map(([k, v]) => `${HOLD_WORDS[k] ?? k} ${v}`).join(", ");
  const open = flags.filter(f => f.status === "open"), decided = flags.filter(f => f.status !== "open");
  return <>
    <header className="topbar"><Link className="brand" href="/"><Wordmark /><i/></Link>
      <nav><Link href="/editor">Cases</Link><Link href="/editor/trial">Trial invites</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>
    <main className="fed-page analysis-admin">
      <p className="crumbs"><Link href="/editor">← Cases</Link></p>
      <div className="eyebrow">EDITOR · REAL-PERSON VERIFICATION</div>
      <h1>Flagged answers</h1>
      {counts && <p className={counts.enabled ? "gate gate-open" : "gate gate-closed"} role="status"><b>Verification {counts.enabled ? "on" : "off"}.</b> Bot check keys {counts.turnstileConfigured ? "set" : "missing"} · text-message keys {counts.twilioConfigured ? "set" : "missing"} · spend this month ${counts.spendMonthUsd.toFixed(2)} of ${counts.monthlyCapUsd}.
        Readers: {counts.profiles.tier0} visitors with an account, {counts.profiles.tier1} real people, {counts.profiles.tier2} district-matched · {counts.countedPositions} counted answers, {counts.quarantinedPositions} set aside.</p>}
      <h2>Open · {open.length}</h2>
      {open.length ? <ul className="review-list">{open.map(f => <li key={f.id} className="review-item">
        <b>{REASON_LABEL[f.kind] ?? f.kind}</b> · {subjectText(f.kind, f.subject)}
        <p className="meta">{f.positions} answer{f.positions === 1 ? "" : "s"} set aside · flagged {shortDate(f.createdAt)} · {Object.entries((f.detail ?? {}) as Record<string, unknown>).map(([k, v]) => `${k} ${v}`).join(", ")}</p>
        <form action={decideIntegrityFlag} className="review-actions"><input type="hidden" name="flagId" value={f.id} />
          <button name="decision" value="clear">Clear: count them</button><button name="decision" value="confirm" className="secondary">Confirm: keep out</button></form>
      </li>)}</ul> : <p className="meta">Nothing flagged.</p>}
      {decided.length > 0 && <><h2>Decided</h2><ul className="analysis-list">{decided.map(f => <li key={f.id}>{REASON_LABEL[f.kind] ?? f.kind} · {subjectText(f.kind, f.subject)} · {f.positions} answers · {f.status === "cleared" ? "cleared (counted)" : "confirmed (kept out)"} {f.decidedAt ? shortDate(f.decidedAt) : ""}
        {f.status === "confirmed" && <form action={decideIntegrityFlag} style={{ display: "inline" }}><input type="hidden" name="flagId" value={f.id} /> <button name="decision" value="clear" className="link-button">Clear instead</button></form>}</li>)}</ul></>}
      <h2 id="accounts">Accounts set aside · {openHolds.length}</h2>
      <p className="meta">One person, one home: an account over the six-per-address limit, or caught by a review signal, can read and follow but none of its answers count until you decide. Nothing is deleted either way.</p>
      {openHolds.length ? <ul className="review-list">{openHolds.map(h => <li key={h.id} className="review-item">
        <b>{HOLD_LABEL[h.kind as HoldKind] ?? h.kind}</b> · account #{shortHash(h.accountId)}
        <p className="meta">set aside {shortDate(h.createdAt)}{holdDetail(h) ? ` · ${holdDetail(h)}` : ""}</p>
        <form action={decideAccountHold} className="review-actions"><input type="hidden" name="holdId" value={h.id} />
          <button name="decision" value="clear">Clear: count this account</button><button name="decision" value="confirm" className="secondary">Confirm: keep out</button></form>
      </li>)}</ul> : <p className="meta">No account is waiting.</p>}
      {decidedHolds.length > 0 && <ul className="analysis-list">{decidedHolds.map(h => <li key={h.id}>{HOLD_LABEL[h.kind as HoldKind] ?? h.kind} · account #{shortHash(h.accountId)} · {h.status === "cleared" ? "cleared (counted)" : "confirmed (kept out)"} {h.decidedAt ? shortDate(h.decidedAt) : ""}
        {h.status === "confirmed" && <form action={decideAccountHold} style={{ display: "inline" }}><input type="hidden" name="holdId" value={h.id} /> <button name="decision" value="clear" className="link-button">Clear instead</button></form>}</li>)}</ul>}
      <MailVerifyCounts />
      <p className="meta">Monthly counts by reason are on the reader-facing <Link href="/transparency">Transparency</Link> page.</p>
    </main>
  </>;
}
