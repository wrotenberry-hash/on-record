/**
 * Corrections made by hand to summaries already written (owner, 20 Nov 2026: "For the three briefing items, use repair
 * mode on the approved summaries and show me the corrected text for my approval" and, later, "On my 'yes', apply all
 * three and turn the briefing on"). Each summary was read claim by claim against its official sources and each fault
 * corrected in place from the source's own words; the text here is the text shown to the owner in
 * docs/audits/2026-11-20/briefing-corrections.md.
 *
 * Nothing here reaches the site until HAND_CORRECTIONS_APPROVED is true, which is set only on the owner's yes. Then
 * lib/analysis/hand-corrections-run.ts writes each one once, keeping the earlier wording as a version. Only the core
 * is corrected; the sections named in `withhold` had faults and are left off the page until they are corrected too
 * (two tiers, lib/analysis/tiers.ts). Pure (one type import), so node's test runner loads it.
 */
import type { ExtendedPart } from "./tiers.ts";

export const HAND_CORRECTIONS_APPROVED = false;

export type HandCorrection = {
  billId: string; /** Changing this applies the correction again. */ version: string;
  /** The stored row labels, in order: the correction is applied only to the summary it was written for. */ was: { bullets: number; rowLabels: string[] };
  headline: string; plainEnglish: string;
  /** One text per stored bullet, in order (its citation is kept unless given here). */ howItWorksToday: Array<{ text: string; section?: string }>;
  /** One entry per stored row, in order; null removes the row. */ changes: Array<{ label: string; today: string; ifPassed: string } | null>;
  /** A corrected voting question; leave out to keep the stored one (or withhold it). */ question?: string;
  withhold: ExtendedPart[]; why: string;
};

const AREA_I = "an area near the National Mall reserved for memorials of “preeminent historical and lasting significance to the United States,”";

export const HAND_CORRECTIONS: HandCorrection[] = [
  { billId: "119-hr-8483", version: "2026-11-20-a",
    was: { bullets: 5, rowLabels: ["The 847 acres", "The 683 Forest Service acres", "Public use of roads and trails", "Existing rights and agreements", "Fire break and emergency access", "Gambling on the land"] },
    headline: "Adds about 847 federal acres to the reservation of a California tribe, the Barona Band.",
    plainEnglish: "Today, federal agencies manage about 847 acres in San Diego County: 164 acres under the Bureau of Land Management and 683 acres under the Forest Service. This bill would have the United States hold that land in trust for the benefit of a California tribe, the Barona Band, and make it part of the Tribe's reservation, while keeping existing public access, water rights, and emergency access, and adding a gambling ban. The House passed it 398–0 on November 17, 2026.",
    howItWorksToday: [
      { text: "The Barona Band, a tribe, lives on a 7,500-acre reservation in San Diego County, California. Its current reservation is not its original reservation." },
      { text: "In 1931, the City of San Diego received congressional approval to buy part of the Capitan Grande Reservation for the El Capitan Reservoir. The committee report says Barona members had mainly lived there and buried ancestors there." },
      { text: "The land in this bill totals about 847 acres between the Barona Reservation and the Capitan Grande Reservation. One 164-acre parcel is managed by the Bureau of Land Management." },
      { text: "Two other parcels, totaling about 683 acres, are managed by the Forest Service. The bill would move those parcels to the Interior Department and place all three parcels in trust for the Tribe." },
      { text: "Federal Indian gaming law treats reservation land, and land held in trust by the United States for a tribe over which a tribe exercises governmental power, as Indian lands. This bill separately bans class II gambling, such as bingo-style games, and class III gambling, as that law defines those classes, on these parcels." }],
    changes: [
      { label: "The 847 acres", today: "Federal agencies manage about 847 acres in San Diego County: one 164-acre Bureau of Land Management parcel and two Forest Service parcels totaling about 683 acres.",
        ifPassed: "The United States must hold all about 847 acres in trust for the benefit of a California tribe, the Barona Band, and the land becomes part of the Tribe's reservation." },
      { label: "The 683 Forest Service acres", today: "The Forest Service manages two of the bill's three parcels, Parcels 2 and 3, totaling about 683 acres, including a fuel break.",
        ifPassed: "Those 683 acres must move to the Interior Department and be held in trust for the benefit of a California tribe, the Barona Band." },
      { label: "Public use of roads and trails", today: "The public may use roads and trails on these lands under rules in effect on the date the bill becomes law.",
        ifPassed: "The public keeps access for recreation, scenery, science, and conservation, including motorized access to existing roads and recreational access to existing trails, under rules in effect on the date the bill becomes law." },
      { label: "Existing rights and agreements", today: "Valid existing liens, rights-of-way and road rights-of-way agreements (rights of access to the land), licenses, leases, permits, special use permits, and easements, along with existing water rights and service agreements, apply on the date the bill becomes law.",
        ifPassed: "The land stays subject to those valid existing rights, and the bill does not alter existing water rights or service agreements. The bill does not reduce existing Forest Service administrative access." },
      { label: "Fuel break and emergency access", today: "Federal agencies manage the land, which includes a fuel break on the Forest Service parcels.",
        ifPassed: "Bureau of Land Management and Forest Service employees keep the access the Secretary of the Interior, consulting the Secretary of Agriculture, considers necessary for operations and emergencies, including search and rescue, wildfire suppression, evacuations, fuels management, monitoring, and law enforcement. The Tribe must maintain the fuel break within the 683 Forest Service acres in accordance with applicable Forest Service standards." },
      { label: "Gambling on the land", today: "The land, about 847 federal acres, is not part of the reservation of a California tribe, the Barona Band.",
        ifPassed: "The land may not be used for class II gambling, such as bingo-style games, or class III gambling, as the Indian Gaming Regulatory Act defines those classes." }],
    withhold: ["whatItDoes", "whoItAffects", "whatChangesForYou", "unknowns", "question"],
    why: "Read against its sources on 20 Nov 2026: this section said something the official record does not, or talked about the sources; it is left off until corrected." },

  { billId: "119-hr-9600", version: "2026-11-20-a",
    was: { bullets: 5, rowLabels: ["Where the Thomas Paine memorial may go", "The usual approval process for that memorial zone", "Public funding for the memorial"] },
    headline: "Requires placing the memorial to Thomas Paine, who argued for independence, near the National Mall.",
    plainEnglish: `Congress already allowed a privately funded memorial to Thomas Paine, whose 1776 pamphlet argued for independence. Today, putting it in Area I, ${AREA_I} needs another law after a federal recommendation; this bill approves that location and requires the Paine memorial to be placed there. The House passed it 365–36 on November 17, 2026, and the Senate received it the next day.`,
    howItWorksToday: [
      { text: "Thomas Paine wrote a 1776 pamphlet that argued the colonies should break from Great Britain. The committee report says it helped build support for the American Revolution." },
      { text: "Congress allowed the Thomas Paine Memorial Association to create a privately funded memorial in Washington in 2022." },
      { text: "Washington memorial sites are divided into areas. Area I is reserved for subjects of “preeminent historical and lasting significance to the United States” and is near the National Mall." },
      { text: "Current law allows a memorial in Area I only after a federal recommendation and approval by law within 150 calendar days after notice to Congress." },
      { text: "The National Capital Memorial Advisory Commission recommended the Thomas Paine memorial for Area I in 2024, but Rep. Raskin said the recommendation had not been sent to Congress." }],
    changes: [
      { label: "Where the Thomas Paine memorial may go", today: `The memorial has been authorized, but placement in Area I, ${AREA_I} needs approval by law.`,
        ifPassed: `The memorial's location in Area I, ${AREA_I} is approved, and the memorial must be located there.` },
      { label: "The usual approval process for Area I, near the National Mall", today: "A federal official may recommend Area I, an area for memorials near the National Mall, after advice from the memorial advisory commission, and the recommendation must be approved by law within 150 calendar days after notice.",
        ifPassed: "This bill approves placement in Area I, an area for memorials near the National Mall, despite the requirements current law sets for placing a memorial in that area." },
      { label: "Public funding for the memorial", today: "The committee report says the Thomas Paine Memorial Association is authorized to establish a privately funded memorial.",
        ifPassed: "The bill changes the location approval only. It does not add federal money." }],
    withhold: ["whatItDoes", "whoItAffects", "whatChangesForYou", "caseFor", "caseAgainst", "unknowns"],
    why: "Read against its sources on 20 Nov 2026: this section said something the official record does not, credited a reason to the wrong member, or talked about the sources; it is left off until corrected." },

  { billId: "119-hconres-93", version: "2026-11-20-a",
    was: { bullets: 5, rowLabels: ["United States forces fighting Iran", "Forces used for immediate defense", "Congressional vote on the war", "Status of the resolution"] },
    headline: "Directs the President to remove United States Armed Forces from hostilities against Iran.",
    plainEnglish: "This resolution would direct the President to remove United States armed forces from hostilities against Iran, unless Congress declares war or specifically authorizes force against Iran. It would not cover forces needed to defend the United States, an ally, or a partner from an imminent attack, provided that the President complies fully with section 5(b) of the War Powers Resolution. The House passed it 220–204 on September 15, 2026, but the Senate rejected it 48–51 on November 19, 2026.",
    howItWorksToday: [
      { text: "The War Powers Resolution is a law about when Presidents must report and end military involvement that Congress has not authorized." },
      { text: "That law generally requires the President to remove United States armed forces from hostilities within 60 days after the President notifies or is required to notify Congress, unless Congress authorizes the use." },
      { text: "This resolution concerns United States armed forces in hostilities against Iran, formally called the Islamic Republic of Iran." },
      { text: "The resolution would not cover forces needed to defend the United States, an ally, or a partner from imminent attack, provided that the President complies fully with section 5(b) of the War Powers Resolution (the 60-day rule).", section: "Full text" },
      { text: "The House passed the resolution 220–204 on September 15, 2026. The Senate rejected it 48–51 on November 19, 2026." }],
    changes: [
      { label: "United States armed forces in hostilities against Iran", today: "The War Powers Resolution generally requires removal of United States armed forces from hostilities within 60 days after the President notifies or must notify Congress, unless Congress authorizes the use.",
        ifPassed: "Congress would direct the President to remove United States armed forces from hostilities against Iran, unless Congress declares war or specifically authorizes force against Iran." },
      { label: "Forces needed to defend from imminent attack", today: "The War Powers Resolution's 60-day limit generally applies unless Congress authorizes the use of force.",
        ifPassed: "Forces could remain if needed to defend the United States, an ally, or a partner from imminent attack, provided that the President complies fully with section 5(b) of the War Powers Resolution (its 60-day limit)." },
      null, // "Congressional vote on the war": its "today" line talked about the sources; what it said about the resolution is in the first row
      { label: "Status of the resolution", today: "The House passed it 220–204 on September 15, 2026, and the Senate rejected it 48–51 on November 19, 2026.",
        ifPassed: "Congress would have directed the President to remove United States armed forces from hostilities against Iran, but the resolution did not pass the Senate." }],
    question: "Do you support directing the President to remove United States Armed Forces from hostilities against Iran?",
    withhold: ["whatItDoes", "whoItAffects", "whatChangesForYou", "unknowns", "whyNow"],
    why: "Read against its sources on 20 Nov 2026: this section dropped a condition the text attaches, predicted something the official record does not say, or talked about the sources; it is left off until corrected." },
];
