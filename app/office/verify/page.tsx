import Link from "next/link";
import { OfficeShell } from "@/components/office/office-shell";
import { brandTitle } from "@/lib/brand";
import { officeDoor, readOfficeLink } from "@/lib/office/session";
import { openOffice } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Open the office dashboard"), robots: { index: false, follow: false } };

/**
 * The page the emailed link opens. Opening it changes nothing: the link is used up only when the button is pressed.
 * So a mail system that opens every link in an email to check it cannot spend the link before the person does.
 */
export default async function OfficeVerifyPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const access = await officeDoor();
  if (!access.allowed) return <OfficeShell access={access}>{null}</OfficeShell>;
  const { t } = await searchParams, link = await readOfficeLink(t);
  return <OfficeShell access={access}>
    <section className="office-page">
      <div className="eyebrow">FOR LEGISLATORS&apos; OFFICES</div>
      {link ? <>
        <h1>Open the office dashboard</h1>
        <p className="lede">Press the button to sign in on this device. The link works once.</p>
        <form action={openOffice} className="office-tools"><input type="hidden" name="t" value={t} /><button className="office-button">Open the dashboard</button></form>
      </> : <>
        <h1>This link has expired.</h1>
        <p className="lede">A link works once, for 30 minutes. <Link href="/office">Ask for a new one</Link>.</p>
      </>}
    </section>
  </OfficeShell>;
}
