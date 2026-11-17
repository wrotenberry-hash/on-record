import "./flow.css";
import Link from "next/link";
import { AnalysisBadge, OfficialBadge, shortDate } from "@/components/federal/badges";
import { PlaceForm } from "@/components/home/place-form";
import { chooseDistrict } from "@/app/start/actions";
import type { Location } from "@/lib/location";
import { yourLegislators, type LegislatorCard } from "@/lib/flow/data";
import { rememberedZip } from "@/lib/flow/zip";

function Card({ c }: { c: LegislatorCard }) {
  return <li className="leg-card flow-card">
    {c.href ? <Link className="flow-name" href={c.href}><b>{c.name}</b></Link> : <b className="flow-name">{c.name}</b>}
    <span className="flow-seat">{c.seat} <OfficialBadge /></span>
    {c.vote ? <>
      <p className="flow-line">{c.vote.line}{c.vote.label === "Analysis" ? <AnalysisBadge /> : <OfficialBadge />}</p>
      <span className="flow-when">{shortDate(c.vote.when)} · <Link href={c.vote.billHref}>{c.vote.billLabel}</Link></span>
    </> : <p className="flow-line flow-none">{c.none}</p>}
  </li>;
}

/**
 * "Your legislators": up to five cards in a fixed order (U.S. senator, U.S. senator, U.S. representative, state
 * senator, state representative), each with the member's most recent meaningful vote in one plain line. A ZIP that
 * crosses districts gets a one-tap "Which is your district?"; state legislators need a street address, asked for
 * right where their cards would be. `next` is the page the forms come back to.
 */
export async function LegislatorCards({ loc, next = "/start" }: { loc: Location; next?: string }) {
  const zip = await rememberedZip();
  const data = await yourLegislators(loc, zip).catch(() => null);
  if (!data) return <p className="gate gate-closed" role="status">Your legislators could not be loaded just now. Try again in a minute.</p>;
  const federal = data.cards.filter(c => c.slot.startsWith("U.S.")), state = data.cards.filter(c => !c.slot.startsWith("U.S."));
  const choose = data.houseChoices.length > 0, askAddress = data.needsAddress || choose;
  return <div className="flow-legs">
    <ul className="leg-list flow-cards">
      {federal.map(c => <Card key={c.key} c={c} />)}
      {!federal.length && <li className="leg-card flow-card"><p className="flow-line flow-none">No current members of Congress are on file for {data.state}.</p></li>}
      {choose && <li className="leg-card flow-choose"><h3>Which is your district?</h3>
        <p className="flow-note">{zip && data.zipSplit ? `ZIP code ${zip} is split between ${data.houseChoices.length} U.S. House districts. Tap yours.` : "Your ZIP code alone does not settle your U.S. House district. Choose yours."}</p>
        {data.houseChoices.length <= 6
          ? <form action={chooseDistrict} className="flow-choices"><input type="hidden" name="next" value={next} />
            {data.houseChoices.map(h => <button key={h.id} name="district" value={h.id}>{h.label}</button>)}</form>
          : <form action={chooseDistrict} className="flow-pick"><input type="hidden" name="next" value={next} /><label htmlFor="flow-district" className="visually-hidden">U.S. House district</label>
            <select id="flow-district" name="district" className="leg-select">{data.houseChoices.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}</select><button>Use this district</button></form>}
        <p className="flow-note">Add your street address to pick it for you.</p></li>}
      {state.map(c => <Card key={c.key} c={c} />)}
      {data.needsAddress && <>
        <li className="leg-card flow-card flow-placeholder"><b className="flow-name">Your Texas state senator</b><p className="flow-line flow-none">Add your street address to find your state senator.</p></li>
        <li className="leg-card flow-card flow-placeholder"><b className="flow-name">Your Texas state representative</b><p className="flow-line flow-none">Add your street address to find your state representative.</p></li></>}
      {askAddress && <li className="leg-card flow-card"><PlaceForm next={next} zip={zip ?? ""} compact submit={data.needsAddress ? "Find my state legislators" : "Find my district"}
        hint="Sent once to the U.S. Census Bureau to find your districts. We do not keep it." /></li>}
    </ul>
    {data.stateNote && <p className="flow-note">{data.stateNote}</p>}
  </div>;
}
