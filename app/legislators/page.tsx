import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { currentLocation } from "@/lib/location";
import { federalLegislators } from "@/lib/federal/legislators";
import { findLegislators, forgetLocation, pickDistrict } from "./actions";
import { txLegislatorsFor } from "@/lib/texas/queries";
import { brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Your legislators"), robots: { index: false, follow: false } };
const ERR: Record<string, string> = { bad_zip: "Enter a 5-digit US ZIP code.", no_match: "The Census Bureau could not place that address. Check the street number and ZIP.", unreachable: "The Census address service did not answer. Try again, or use your ZIP." };

/** Your two U.S. senators and your U.S. representative (Texas state legislators join with Round H). */
export default async function LegislatorsPage({ searchParams }: { searchParams: Promise<{ e?: string; z?: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/legislators" access={access} page="/legislators">{null}</PublicShell>;
  const { e } = await searchParams;
  const userId = await currentAppUserId();
  const loc = await currentLocation(userId);
  const fed = loc ? await federalLegislators(loc.state, loc.congressional).catch(() => null) : null;
  const tx = loc?.state === "TX" ? await txLegislatorsFor(loc.stateUpper, loc.stateLower).catch(() => null) : null;
  const card = (l: { id: string; fullName: string; party: string; role: string }) => <li key={l.id} className="leg-card"><Link href={`/politicians/${l.id}`}><b>{l.fullName}</b></Link><span>{l.role}</span><span className="meta">{l.party}</span></li>;
  return <PublicShell current="/legislators" access={access} page="/legislators">
    <section className="fed-page">
      <div className="eyebrow">YOUR LEGISLATORS <OfficialBadge /></div>
      <h1>{loc ? "Your legislators" : "Find your legislators"}</h1>
      {e && ERR[e] && <p className="gate gate-closed" role="status">{ERR[e]}</p>}
      {fed && <>
        <ul className="leg-list">{fed.senators.map(card)}{fed.representative && card(fed.representative)}</ul>
        {!fed.representative && fed.houseChoices.length > 0 && <div className="fed-section"><h2>Which House district?</h2>
          <p className="meta">A ZIP can cross districts. Pick yours, or add your street below for an exact match.</p>
          <form action={pickDistrict} className="search-form"><label htmlFor="district" className="visually-hidden">House district</label>
            <select id="district" name="district" className="leg-select">{fed.houseChoices.map(h => <option key={h.id} value={`${h.state}-${h.district ? String(h.district).padStart(2, "0") : "AL"}`}>{h.state}-{h.district ?? "AL"}: {h.fullName} ({h.party})</option>)}</select>
            <button>Use this</button></form></div>}
        {loc?.state === "TX" && (tx?.senator || tx?.representative
          ? <><h2>Texas Legislature</h2><ul className="leg-list">{[tx.senator, tx.representative].filter(Boolean).map(t => <li key={t!.id} className="leg-card"><Link href={`/texas/members/${encodeURIComponent(t!.id)}`}><b>{t!.name}</b></Link><span>{t!.chamber === "upper" ? "Texas State Senator" : "Texas State Representative"}, District {t!.district}</span><span className="meta">{t!.party}</span></li>)}</ul></>
          : <p className="meta">{loc.stateUpper ? `Your Texas districts: Senate ${loc.stateUpper.split("-").pop()}, House ${loc.stateLower?.split("-").pop()}. Their members appear once Texas data loads.` : "Add your street address to find your Texas state senator and state representative."}</p>)}
        <form action={forgetLocation}><button className="link-button">Forget my location</button></form>
      </>}
      <div className="fed-section"><h2>{loc ? "Change location" : "Your ZIP code"}</h2>
        <form action={findLegislators} className="verify-form">
          <label htmlFor="zip">ZIP code</label><input id="zip" name="zip" inputMode="numeric" autoComplete="postal-code" maxLength={10} placeholder="78701" />
          <details><summary>Add your street for an exact district (optional)</summary>
            <label htmlFor="street">Street address</label><input id="street" name="street" autoComplete="street-address" placeholder="1100 Congress Ave, Austin, TX" /></details>
          <button>Find my legislators</button></form>
        <p className="meta">The Census Bureau&apos;s geocoder finds the districts. We keep only the district numbers, on this device{access.invite || access.editor ? " and with your trial account" : ""}, never the street address.</p></div>
    </section>
  </PublicShell>;
}
