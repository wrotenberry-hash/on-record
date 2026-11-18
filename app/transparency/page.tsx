import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { viewerAccess } from "@/lib/viewer";
import { transparencyMonths } from "@/lib/verify/transparency";
import { REASON_LABEL } from "@/lib/verify/rules";
import { brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Transparency"), robots: { index: false, follow: false } };

const monthName = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

/** Monthly note on how reader answers are protected: aggregate counts only. Behind the public switch like every reader page. */
export default async function TransparencyPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/transparency" access={access} page="/transparency">{null}</PublicShell>;
  const months = await transparencyMonths().catch(() => []);
  return <PublicShell current="/transparency" access={access} page="/transparency">
    <section className="fed-page">
      <div className="eyebrow">TRANSPARENCY</div>
      <h1>Keeping the totals to real people</h1>
      <p>Totals count only address-matched and mail-verified residents whose home is inside the bill&apos;s jurisdiction. Address-matched means a confirmed email, a text-message code to a mobile number that is not an internet (VoIP) number and not used by another account, and a home address the Census Bureau&apos;s geocoder placed; mail-verified adds a code from a mailed postcard. Accounts with only a phone, and visitors, are never counted, and new accounts count after 24 hours.</p>
      <p>Answers that look like coordinated activity (sudden surges, many new accounts from one network or device, identical reasons) are set aside from the totals while the editor looks at them. They are never deleted; the editor either returns them to the totals or keeps them out.</p>
      <h2>Each month</h2>
      {months.length ? months.map(m => <div key={m.month} className="fed-section"><h3>{monthName(m.month)}</h3>
        <p><b>Sign-ups or verifications blocked: {sum(m.blocked)}</b></p>
        {sum(m.blocked) > 0 && <ul className="analysis-list">{Object.entries(m.blocked).map(([r, n]) => <li key={r}>{REASON_LABEL[r] ?? r}: {n}</li>)}</ul>}
        <p><b>Answers set aside from totals, by reason</b>{sum(m.quarantined) > 0 ? " (one answer can match more than one reason)" : ": none"}</p>
        {sum(m.quarantined) > 0 && <ul className="analysis-list">{Object.entries(m.quarantined).map(([r, n]) => <li key={r}>{REASON_LABEL[r] ?? r}: {n}</li>)}</ul>}
        <p><b>Accounts set aside for review: {sum(m.held)}</b></p>
        {sum(m.held) > 0 && <ul className="analysis-list">{Object.entries(m.held).map(([r, n]) => <li key={r}>{REASON_LABEL[r] ?? r}: {n}</li>)}</ul>}
      </div>) : <p className="meta">Nothing blocked or set aside yet.</p>}
      <p className="meta">Counts only: no names, accounts, numbers or addresses. <Link href="/method#numbers">How reader totals are counted</Link></p>
    </section>
  </PublicShell>;
}
