import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { viewerAccess } from "@/lib/viewer";
import { brandTitle } from "@/lib/brand";
import { rememberedZip, zipPlace } from "@/lib/flow/zip";
import { zipCenter, zipMap } from "@/lib/district-shapes";
import { PinForm } from "@/components/map/pin-form";
import { SELF_PICKED_NOTE } from "@/lib/map-rules";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Drop a pin"), robots: { index: false, follow: false } };

const NEXT = new Set(["/start", "/legislators", "/"]);
const PROBLEM: Record<string, string> = {
  no_match: "The Census Bureau has no districts on file for that spot. Move the marker onto land inside a U.S. state or territory and try again.",
  no_district: "The Census Bureau named the state at that spot but not a U.S. House district. Move the marker a little and try again.",
  unreachable: "The Census Bureau’s service did not answer. Try again in a minute.",
  range: "That spot is outside the United States. Move the marker onto your home and try again.",
};
/** Austin, when the reader's ZIP code is not known: the map still opens somewhere, and the reader can move it anywhere. */
const FALLBACK: [number, number] = [30.2747, -97.7404];

/**
 * "Drop a pin on a map": the third thing to try when the Census Bureau cannot place a street address (owner, 20 Nov
 * 2026, from a reader at a newly built address). The map opens on the reader's ZIP code and shows its district lines
 * when the ZIP is shared by more than one district.
 */
export default async function PinPage({ searchParams }: { searchParams: Promise<{ zip?: string; next?: string; e?: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/legislators" access={access} page="/start/pin">{null}</PublicShell>;
  const sp = await searchParams, next = NEXT.has(String(sp.next)) ? String(sp.next) : "/start";
  const zip = /^\d{5}$/.test(String(sp.zip)) ? String(sp.zip) : await rememberedZip();
  const place = zip ? await zipPlace(zip).catch(() => null) : null;
  const [centre, map] = await Promise.all([zipCenter(zip).catch(() => null), place && place.choices.length > 1 ? zipMap(zip, place.choices).catch(() => null) : null]);
  return <PublicShell current="/legislators" access={access} page="/start/pin">
    <section className="fed-page flow">
      <div className="eyebrow">YOUR LEGISLATORS</div>
      <h1>Drop a pin on your home</h1>
      <p className="lede">Move the map until the marker in the middle sits on your home, then press “Use this spot”.{zip && centre ? ` The map opens on ZIP code ${zip}.` : ""}</p>
      {sp.e && PROBLEM[sp.e] && <p className="gate gate-closed" role="alert">{PROBLEM[sp.e]}</p>}
      <PinForm map={map} centre={centre ?? FALLBACK} next={next} />
      <p className="flow-privacy">The spot goes once to the U.S. Census Bureau, which names the districts there. We do not keep the spot. We keep your state and district numbers, as with an address. The map pictures come through this site, so the map service never sees your device.</p>
      <p className="meta">{SELF_PICKED_NOTE}</p>
      <p><Link href={next}>Back: try an address instead</Link></p>
    </section>
  </PublicShell>;
}
