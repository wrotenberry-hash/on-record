import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { OfficeShell } from "@/components/office/office-shell";
import { DashboardView } from "@/components/office/dashboard-view";
import { brandTitle } from "@/lib/brand";
import { officeView } from "@/lib/office/rules";
import { officeDashboard, touchOffice } from "@/lib/office/store";
import { currentOffice, officeDoor } from "@/lib/office/session";
import { setOfficeWeekly, signOutOffice } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Office dashboard"), robots: { index: false, follow: false } };
const requestTime = () => Date.now();

/**
 * The office dashboard: totals for the member's own district and nothing else. Everything on it comes from
 * `officeView`, the same view the download and the print page are written from.
 */
export default async function OfficeDashboardPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const access = await officeDoor();
  if (!access.allowed) return <OfficeShell access={access}>{null}</OfficeShell>;
  const office = await currentOffice();
  if (!office) redirect("/office");
  const { account, member } = office, { m } = await searchParams, now = requestTime(), db = getDb();
  if (!account.lastSeenAt || now - account.lastSeenAt > 3600e3) await touchOffice(db, account.id, now).catch(() => null);
  const signOut = <form action={signOutOffice}><button className="link-button">Sign out on this device</button></form>;
  if (account.status === "review") return <OfficeShell access={access} signedIn>
    <section className="office-page"><div className="eyebrow">OFFICE DASHBOARD</div><h1>Waiting for a person to confirm your office.</h1>
      <p className="lede">Your address shows where you work, but not which office. {member ? <>You chose the office of {member.seat} {member.name}.</> : null} The editor of this site confirms that before anything is shown. You do not need to do anything else; come back to this page later.</p>
      {signOut}</section></OfficeShell>;
  if (!member || !member.current) return <OfficeShell access={access} signedIn>
    <section className="office-page"><div className="eyebrow">OFFICE DASHBOARD</div><h1>This office is not on the current list of members.</h1>
      <p className="lede">The official record no longer lists this member as holding the seat, so there is no district to show.</p>{signOut}</section></OfficeShell>;
  const view = officeView(await officeDashboard(db, member, now));
  return <OfficeShell access={access} signedIn>
    <section className="office-page">
      <div className="eyebrow">OFFICE DASHBOARD</div>
      {m === "saved" && <p className="gate gate-open" role="status">Saved.</p>}
      <DashboardView view={view} />
      <h2>Take it with you</h2>
      <div className="office-tools">
        <a className="office-button" href="/office/export">Download as a spreadsheet file (CSV)</a>
        <a className="office-button secondary" href="/office/print">Print or save as PDF</a>
      </div>
      <p className="meta">The file and the printed page hold exactly what is on this page, and nothing more.</p>
      <h2>Weekly email</h2>
      <div className="office-tools"><form action={setOfficeWeekly}><input type="hidden" name="on" value={account.weeklyEmail ? "0" : "1"} />
        <span>One email a week, when bills coming up have a total: <b>{account.weeklyEmail ? "on" : "off"}</b></span>
        <button className="office-button secondary">{account.weeklyEmail ? "Turn off" : "Turn on"}</button></form></div>
      {signOut}
    </section>
  </OfficeShell>;
}
