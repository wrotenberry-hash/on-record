import "./flow.css";
import Link from "next/link";
import { AnalysisBadge, OfficialBadge, shortDate } from "@/components/federal/badges";
import { PlaceForm } from "@/components/home/place-form";
import { MemberPhoto } from "@/components/home/member-photo";
import { FollowStatus } from "@/components/home/follow-status";
import { chooseDistrict } from "@/app/start/actions";
import type { Location } from "@/lib/location";
import { yourLegislators, type LegislatorCard, type YourLegislators } from "@/lib/flow/data";
import { legislatorsHeading, notFoundLine } from "@/lib/flow/cards";
import { rememberedZip } from "@/lib/flow/zip";
import { zipMap, type ZipMap } from "@/lib/district-shapes";
import { districtColour, PLACE_STEPS, SELF_PICKED_NOTE } from "@/lib/map-rules";
import { LastResort } from "@/components/map/last-resort";

/** The district lines over the reader's ZIP, when a district has to be chosen and there are few enough to draw. */
const mapFor = (data: YourLegislators, zip: string | null) => (data.houseChoices.length > 0 && data.houseChoices.length <= 6 ? zipMap(zip, data.houseChoices.map(h => h.id)).catch(() => null) : Promise.resolve(null));

/**
 * One legislator. Every member's card has the same parts in the same order, whoever they are: the portrait (or their
 * initials), the name, the party as a word, the seat, then their last three votes on bills, each a plain line with
 * its date and a link to the bill, and a line that ends the list.
 */
function Card({ c }: { c: LegislatorCard }) {
  const member = !!c.memberId;
  return <li className="leg-card flow-card">
    <div className={member ? "flow-head" : undefined}>
      {member && <MemberPhoto src={c.photo} name={c.name} initials={c.initials} />}
      <div className="flow-who">
        {c.href ? <Link className="flow-name" href={c.href}><b>{c.name}</b></Link> : <b className="flow-name">{c.name}</b>}
        {c.party && <span className="flow-party">{c.party}</span>}
        <span className="flow-seat">{c.seat} <OfficialBadge /></span>
      </div>
    </div>
    {c.votes.length ? <ol className="flow-votes" aria-label={`${c.name}: latest votes on bills, newest first`}>{c.votes.map((v, i) => <li key={`${v.billHref}-${i}`}>
      <p className="flow-line">{v.line}{v.label === "Analysis" ? <AnalysisBadge /> : <OfficialBadge />}</p>
      <span className="flow-when">{shortDate(v.when)} · <Link href={v.billHref}>{v.billLabel}</Link></span>
    </li>)}</ol> : <p className="flow-line flow-none">{c.none}</p>}
    {c.votesNote && <p className="flow-end">{c.votesNote}{c.href ? <> <Link href={c.href}>All recent votes by {c.name}</Link></> : null}</p>}
  </li>;
}

function Cards({ data, zip, next, map, tried }: { data: YourLegislators; zip: string | null; next: string;
  /** The district lines over the ZIP, for the last-resort choice. */ map: ZipMap | null; /** A street address was given and still no House district was found. */ tried: boolean }) {
  const federal = data.cards.filter(c => c.slot.startsWith("U.S.")), state = data.cards.filter(c => !c.slot.startsWith("U.S."));
  const choose = data.houseChoices.length > 0, askAddress = data.needsAddress || choose;
  return <div className="flow-legs">
    <ul className="leg-list flow-cards">
      {federal.map(c => <Card key={c.key} c={c} />)}
      {!federal.length && <li className="leg-card flow-card"><p className="flow-line flow-none">No current members of Congress are on file for {data.state}.</p></li>}
      {/* 20 Nov 2026 (first trial feedback): no silent fall back to "tap your district". What to try comes first, in
          order; choosing by hand is the last resort, with a map of the district lines over the ZIP. */}
      {choose && <li className="leg-card flow-choose"><h3>{tried ? "We couldn’t place that address in a U.S. House district." : zip && data.zipSplit ? `ZIP code ${zip} is shared by ${data.houseChoices.length} U.S. House districts.` : "Your ZIP code alone does not settle your U.S. House district."}</h3>
        <p className="flow-note">Try these, in this order:</p>
        <ol className="place-steps">
          <li><b>{tried ? PLACE_STEPS[0].title : "Add your street address."}</b> {tried ? PLACE_STEPS[0].detail : "It finds your district for you."}
            <PlaceForm next={next} zip={zip ?? ""} compact submit="Find my district" hint="Sent once to the U.S. Census Bureau to find your districts. We do not keep it." /></li>
          <li><b>{PLACE_STEPS[1].title}</b> {PLACE_STEPS[1].detail}</li>
          <li><b><Link href={`/start/pin?next=${encodeURIComponent(next)}${zip ? `&zip=${zip}` : ""}`}>{PLACE_STEPS[2].title}</Link></b> {PLACE_STEPS[2].detail}</li>
        </ol>
        <LastResort map={map}>
          {data.houseChoices.length <= 6
            ? <form action={chooseDistrict} className="district-choices"><input type="hidden" name="next" value={next} />
              {data.houseChoices.map((h, n) => { const at = map ? map.districts.findIndex(d => d.id === h.id) : -1;
                return <button key={h.id} name="district" value={h.id} style={{ ["--district" as string]: districtColour(at >= 0 ? at : n) }}>{h.label}</button>; })}</form>
            : <form action={chooseDistrict} className="flow-pick"><input type="hidden" name="next" value={next} /><label htmlFor="flow-district" className="visually-hidden">U.S. House district</label>
              <select id="flow-district" name="district" className="leg-select">{data.houseChoices.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}</select><button>Use this district</button></form>}
          <p className="meta">{SELF_PICKED_NOTE}</p>
        </LastResort></li>}
      {state.map(c => <Card key={c.key} c={c} />)}
      {data.needsAddress && <>
        <li className="leg-card flow-card flow-placeholder"><b className="flow-name">Your Texas state senator</b><p className="flow-line flow-none">A street address is needed to find your state senator: one ZIP code can cover more than one Texas Senate district. Add it below.</p></li>
        <li className="leg-card flow-card flow-placeholder"><b className="flow-name">Your Texas state representative</b><p className="flow-line flow-none">A street address is needed to find your state representative: one ZIP code can cover more than one Texas House district. Add it below.</p></li></>}
      {askAddress && !choose && <li className="leg-card flow-card"><PlaceForm next={next} zip={zip ?? ""} compact submit={data.needsAddress ? "Find my state legislators" : "Find my district"}
        hint="Sent once to the U.S. Census Bureau to find your districts. We do not keep it." /></li>}
    </ul>
    {data.stateNote && <p className="flow-note">{data.stateNote}</p>}
  </div>;
}

const FAILED = <p className="gate gate-closed" role="status">Your legislators could not be loaded just now. Try again in a minute.</p>;

/**
 * The cards alone, for a page that has its own heading (/legislators): up to five in a fixed order (U.S. senator,
 * U.S. senator, U.S. representative, state senator, state representative). A ZIP that crosses districts gets a
 * one-tap "Which is your district?"; state legislators need a street address, asked for right where their cards
 * would be. `next` is the page the forms come back to.
 */
export async function LegislatorCards({ loc, next = "/start" }: { loc: Location; next?: string }) {
  const zip = await rememberedZip();
  const data = await yourLegislators(loc, zip).catch(() => null);
  if (!data) return FAILED;
  return <Cards data={data} zip={zip} next={next} map={await mapFor(data, zip)} tried={loc.source === "address" || loc.source === "nearby"} />;
}

/**
 * The first screen's main block (owner, 18 Nov 2026): the heading that counts who was found ("Your five
 * legislators"; "Your three legislators in Congress" when that is what is there), what a ZIP code alone could not
 * find, the cards, and under them what the reader follows and whether vote alerts are on, with one button to follow
 * everyone when they do not. `level` is the heading's level on the page it sits in; `children` go after the lead-in
 * sentence (the "Change address or ZIP" link on /start).
 */
export async function YourLegislatorsBlock({ loc, userId, next = "/start", level = 2, canFollow = false, children }:
  { loc: Location; userId: string | null; next?: string; level?: 1 | 2; canFollow?: boolean; children?: React.ReactNode }) {
  const zip = await rememberedZip();
  const data = await yourLegislators(loc, zip).catch(() => null);
  const H = level === 1 ? "h1" : "h2";
  if (!data) return <><H>Your legislators</H>{FAILED}</>;
  const missing = notFoundLine({ source: loc.source, needsAddress: data.needsAddress, chooseDistrict: data.houseChoices.length > 0 });
  const memberIds = data.cards.flatMap(c => (c.memberId ? [c.memberId] : []));
  const map = await mapFor(data, zip);
  return <>
    <H id="your-legislators">{legislatorsHeading(data.counts)}</H>
    <p className="meta flow-lede">Each one’s last three votes on bills, in plain words, from the official record. {children}</p>
    {missing && <p className="flow-missing" role="note">{missing}</p>}
    <Cards data={data} zip={zip} next={next} map={map} tried={loc.source === "address" || loc.source === "nearby"} />
    {canFollow && <FollowStatus userId={userId} memberIds={memberIds} />}
  </>;
}
