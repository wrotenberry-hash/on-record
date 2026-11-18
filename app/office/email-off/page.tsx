import { OfficeShell } from "@/components/office/office-shell";
import { brandTitle } from "@/lib/brand";
import { readOfficeOptOut } from "@/lib/office/session";
import { stopOfficeEmail } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Stop the weekly office email"), robots: { index: false, follow: false } };

/**
 * The page the "stop this weekly email" link opens. One button, no sign-in. Opening the page changes nothing, so a
 * mail system that opens every link in an email cannot switch an office's email off; the button does. This page shows
 * nothing about the site, so it is open even while the rest is private: an office must always be able to stop email.
 */
export default async function OfficeEmailOffPage({ searchParams }: { searchParams: Promise<{ t?: string; done?: string }> }) {
  const { t, done } = await searchParams, valid = done ? false : !!(await readOfficeOptOut(t));
  return <OfficeShell access={{ allowed: true, preview: false }}>
    <section className="office-page">
      <div className="eyebrow">FOR LEGISLATORS&apos; OFFICES</div>
      {done === "1" ? <><h1>The weekly email is stopped.</h1><p className="lede">This address will not get it again. You can turn it back on from the office dashboard.</p></>
        : valid ? <><h1>Stop the weekly email?</h1><p className="lede">Press the button and this address will not get the weekly email again. Nothing else changes.</p>
          <form action={stopOfficeEmail} className="office-tools"><input type="hidden" name="t" value={t} /><button className="office-button">Stop the weekly email</button></form></>
        : <><h1>This link is not valid.</h1><p className="lede">Nothing was changed. You can turn the weekly email off from the office dashboard.</p></>}
    </section>
  </OfficeShell>;
}
