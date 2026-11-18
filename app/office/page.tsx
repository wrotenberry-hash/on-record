import Link from "next/link";
import { OfficeShell } from "@/components/office/office-shell";
import { OfficeRequestForm } from "@/components/office/request-form";
import { BRAND, brandTitle } from "@/lib/brand";
import { MIN_SHOWN, NOT_SCIENTIFIC } from "@/lib/constituent/rules";
import { OFFICE_DOMAINS } from "@/lib/office/domains";
import { currentOffice, officeDoor } from "@/lib/office/session";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("For legislators' offices"), robots: { index: false, follow: false } };

const MESSAGES: Record<string, string> = {
  expired: "That link has expired or was already used. Ask for a new one below.",
  signedout: "Signed out on this device.",
  slow: "Too many tries from here. Wait an hour, then ask for a new link.",
};

/**
 * Where a legislator's office signs in: a work email on one of the listed government domains, then a link that works
 * once. The list of domains, and what each one proves, is printed on the page from lib/office/domains.ts.
 */
export default async function OfficePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const access = await officeDoor();
  if (!access.allowed) return <OfficeShell access={access}>{null}</OfficeShell>;
  const { m } = await searchParams, office = await currentOffice();
  return <OfficeShell access={access} signedIn={!!office}>
    <section className="office-page">
      <div className="eyebrow">FOR LEGISLATORS&apos; OFFICES</div>
      <h1>See what your own district says about bills.</h1>
      <p className="lede">Residents answer Support, Oppose or Unsure on bills at {BRAND.name}. A legislator&apos;s office can see the totals for its own district: bills coming up, bills the member voted on, the trend over time and the top issues. It is free, and it is the same for every office.</p>
      <p className="not-poll">{NOT_SCIENTIFIC}</p>
      {m && MESSAGES[m] && <p className={m === "signedout" ? "gate gate-open" : "gate gate-closed"} role="status">{MESSAGES[m]}</p>}
      {office && <p className="gate gate-open" role="status">This device is signed in. <Link href="/office/dashboard">Open the office dashboard</Link>.</p>}

      <h2>Sign in with your work email</h2>
      <p className="meta">We email you a link. It works once, for 30 minutes. There is no password.</p>
      <OfficeRequestForm />

      <h2>What an office sees</h2>
      <ul className="office-notes">
        <li>Only your member&apos;s own district: a U.S. senator&apos;s state, a U.S. representative&apos;s congressional district, a state senator&apos;s or state representative&apos;s district.</li>
        <li>Totals only. Never a name, an email address, an individual answer or a reason.</li>
        <li>A total appears only from {MIN_SHOWN} counted voters. Only mail-verified and address-matched residents are counted, and mail-verified is listed first.</li>
        <li>The member&apos;s own recorded vote, from the official record, beside each total.</li>
        <li>You can download what you see, or print it. Once your office is confirmed, one email a week lists the bills coming up; you can stop it with the link in the email or on the dashboard.</li>
      </ul>

      <h2>Email addresses this page accepts</h2>
      <p className="meta">Any other address is refused. What happens next depends on what the address proves.</p>
      <ul className="office-domains">{OFFICE_DOMAINS.map(d => <li key={d.id}>
        <span><code>{d.domain}</code> · {d.body}</span>
        <span><b>What it proves:</b> {d.proves}</span>
        {d.doesNotProve && <span><b>What it does not prove:</b> {d.doesNotProve}</span>}
        <span><b>What happens:</b> {d.then}</span>
      </li>)}</ul>
    </section>
  </OfficeShell>;
}
