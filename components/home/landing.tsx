import "./flow.css";
import { BRAND } from "@/lib/brand";
import { PlaceForm } from "@/components/home/place-form";
import { FirstVisit } from "@/components/home/first-visit";

/**
 * The first screen for a newcomer: the tagline, one sentence, and one form. The street address leads (owner, 18 Nov
 * 2026: address entry, then "Your five legislators"); a ZIP code alone and one tap still works.
 * The privacy line says exactly what app/start/actions.ts (findPlace) does with what is typed.
 */
export function Landing({ next = "/start", zip = "", keptWith }: { next?: string; zip?: string; keptWith: "invite" | "editor" | null }) {
  return <section className="flow-landing" aria-labelledby="landing-h">
    <h1 id="landing-h">{BRAND.tagline}</h1>
    <p className="lede">Enter your address to see your legislators in Congress and the Texas Legislature, and how each one voted, in plain words.</p>
    <PlaceForm next={next} zip={zip} />
    <p className="flow-privacy">Your street address goes once to the U.S. Census Bureau’s address service to find your districts. We do not keep it.
      We keep your ZIP code on this device, and your state and district numbers on this device{keptWith === "invite" ? " and with your trial invite" : keptWith === "editor" ? " and with your editor sign-in" : ""}. Nobody else sees them.
      {keptWith ? " The site then follows your legislators for you and turns on vote alerts; the next screen says so and shows how to change it." : ""}</p>
    <FirstVisit />
  </section>;
}
