import Link from "next/link";
import { IssueCap } from "@/components/start/issue-cap";
import { PublicShell } from "@/components/public/public-shell";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { currentLocation } from "@/lib/location";
import { federalLegislators } from "@/lib/federal/legislators";
import { pickedIssues } from "@/lib/reader-issues";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";
import { countEvent } from "@/lib/events";
import { finishStart, startZip } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get started · On Record", robots: { index: false, follow: false } };

/** Onboarding in under a minute: ZIP → your legislators → three issues → done. No account needed. */
export default async function StartPage({ searchParams }: { searchParams: Promise<{ step?: string; e?: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/start" access={access} page="/start">{null}</PublicShell>;
  const { step, e } = await searchParams;
  const userId = await currentAppUserId();
  const loc = await currentLocation(userId);
  const two = step === "2" && loc;
  if (!two) await countEvent("onboarding_start", access.audience);
  const fed = two ? await federalLegislators(loc.state, loc.congressional).catch(() => null) : null;
  const issues = two ? await pickedIssues(userId) : [];
  const canFollow = !!access.invite || !!access.editor;
  return <PublicShell current="/start" access={access} page="/start">
    <section className="fed-page start">
      <div className="eyebrow">GET STARTED · STEP {two ? "2" : "1"} OF 2</div>
      {!two ? <>
        <h1>Where do you vote?</h1>
        <p>Your ZIP code finds your two senators and your representative. We keep only the state and district, never an address.</p>
        {e === "zip" && <p className="gate gate-closed" role="status">Enter a 5-digit US ZIP code.</p>}
        <form action={startZip} className="start-form"><label htmlFor="zip" className="visually-hidden">ZIP code</label>
          <input id="zip" name="zip" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" maxLength={5} required placeholder="ZIP code" autoFocus />
          <button>Next</button></form>
        <p className="meta"><Link href="/">Skip for now</Link></p>
      </> : <>
        <h1>Your legislators</h1>
        <form action={finishStart} className="start-form start-two">
          <ul className="leg-list">{fed?.senators.map(s => <li key={s.id} className="leg-card"><Link href={`/politicians/${s.id}`}><b>{s.fullName}</b></Link><span>{s.role}</span><span className="meta">{s.party}</span></li>)}
            {fed?.representative && <li className="leg-card"><Link href={`/politicians/${fed.representative.id}`}><b>{fed.representative.fullName}</b></Link><span>{fed.representative.role}</span><span className="meta">{fed.representative.party}</span></li>}</ul>
          {fed && !fed.representative && fed.houseChoices.length > 0 && <label className="start-label">Your House district (a ZIP can cross districts)
            <select name="district" className="leg-select" defaultValue=""><option value="">Not sure (pick later)</option>{fed.houseChoices.map(h => <option key={h.id} value={`${h.state}-${h.district ? String(h.district).padStart(2, "0") : "AL"}`}>District {h.district ?? "at large"}: {h.fullName}</option>)}</select></label>}
          {canFollow && <label className="consent"><input type="checkbox" name="follow" value="yes" defaultChecked /> <span>Follow them, so their votes show up first</span></label>}
          <IssueCap options={ISSUE_CATEGORIES.map(c => ({ slug: c.slug, name: c.name }))} initial={issues} />
          <button>Done</button></form>
        <p className="meta">Your choices stay on this device{canFollow ? " and with your trial invite" : ""}; nobody else sees them. <Link href="/start">Change ZIP</Link></p>
      </>}
    </section>
  </PublicShell>;
}
