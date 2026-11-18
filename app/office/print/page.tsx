import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { OfficeShell } from "@/components/office/office-shell";
import { DashboardView } from "@/components/office/dashboard-view";
import { PrintButton } from "@/components/office/print-button";
import { brandTitle } from "@/lib/brand";
import { officeView } from "@/lib/office/rules";
import { officeDashboard } from "@/lib/office/store";
import { currentOffice, officeDoor } from "@/lib/office/session";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Office dashboard, to print"), robots: { index: false, follow: false } };
const requestTime = () => Date.now();

/**
 * The dashboard laid out for paper. "Save as PDF" in the browser's print box makes the PDF; the site builds no PDF
 * file of its own. Written from the same `officeView` as the dashboard, so it shows the same thing.
 */
export default async function OfficePrintPage() {
  const access = await officeDoor();
  if (!access.allowed) return <OfficeShell access={access}>{null}</OfficeShell>;
  const office = await currentOffice();
  if (!office || office.account.status !== "active" || !office.member?.current) redirect("/office/dashboard");
  const view = officeView(await officeDashboard(getDb(), office.member, requestTime()));
  return <OfficeShell access={access} signedIn print>
    <section className="office-page">
      <div className="office-tools"><PrintButton /><Link className="office-button secondary" href="/office/dashboard">Back to the dashboard</Link></div>
      <p className="meta no-print">In the print box, choose “Save as PDF” to keep a file.</p>
      <DashboardView view={view} links={false} />
    </section>
  </OfficeShell>;
}
