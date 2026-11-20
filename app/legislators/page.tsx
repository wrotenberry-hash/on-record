import "@/components/home/flow.css";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge } from "@/components/federal/badges";
import { LegislatorCards } from "@/components/home/legislator-cards";
import { PlaceForm } from "@/components/home/place-form";
import { STATE_COMING, stateCoverage } from "@/lib/state-coverage";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { currentLocation } from "@/lib/location";
import { rememberedZip } from "@/lib/flow/zip";
import { brandTitle } from "@/lib/brand";
import { forgetLocation } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Your legislators"), robots: { index: false, follow: false } };

/**
 * Your two U.S. senators, your U.S. representative and, in Texas, your state senator and state representative, each
 * with their most recent meaningful vote in one plain line (the same cards as the first-minute flow at /start).
 */
export default async function LegislatorsPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/legislators" access={access} page="/legislators">{null}</PublicShell>;
  const userId = await currentAppUserId();
  const loc = await currentLocation(userId).catch(() => null);
  const zip = (await rememberedZip()) ?? "";
  return <PublicShell current="/legislators" access={access} page="/legislators">
    <section className="fed-page flow">
      <div className="eyebrow">YOUR LEGISLATORS <OfficialBadge /></div>
      <h1>{loc ? "Your legislators" : "Find your legislators"}</h1>
      {loc && <>
        <LegislatorCards loc={loc} next="/legislators" />
        <form action={forgetLocation}><button className="link-button">Forget my location</button></form>
      </>}
      <div className="fed-section"><h2>{loc ? "Change location" : "Where do you vote?"}</h2>
        {/* Outside Texas there are no state legislators to find yet, so the form does not promise them (20 Nov 2026). */}
        {stateCoverage(loc?.state) === "coming"
          ? <PlaceForm next="/legislators" zip={zip} submit="Update my legislators" hint={`A ZIP code alone also works. It finds your members of Congress; the street address finds your exact House district. ${STATE_COMING}`} />
          : <PlaceForm next="/legislators" zip={zip} submit={loc ? "Update my legislators" : "Show my legislators"} />}
        <p className="flow-privacy">Your street address goes once to the U.S. Census Bureau’s address service to find your districts. We do not keep it.
          We keep your ZIP code on this device, and your state and district numbers on this device{access.editor ? " and with your editor sign-in" : access.invite ? " and with your trial invite" : ""}.</p></div>
    </section>
  </PublicShell>;
}
