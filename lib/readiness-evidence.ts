/**
 * What the scripted and by-eye checks found, and when. Claude updates this file after each run of the usability
 * suite (`npm run e2e`) and each review; the checklist (lib/readiness.ts) never shows PASS for these items without an
 * entry here. `null` means "not run yet". Pure data: no imports.
 */
import type { ReadinessInput } from "./readiness.ts";

type Evidence = Pick<ReadinessInput, "brand"> & { flow: ReadinessInput["flow"] } & {
  influence: Pick<ReadinessInput["influence"], "contactOnBillAndMemberPages" | "hearingsStepLive" | "townHallsLine" | "voicePage">;
  trust: Pick<ReadinessInput["trust"], "methodology" | "pledge" | "about" | "privacyDraft" | "termsDraft" | "legalReviewed" | "founderText">;
  quality: Pick<ReadinessInput["quality"], "e2e" | "axe" | "speed" | "errorMonitoring" | "uptimeCheck" | "feedbackPrompt" | "somethingWrongLink" | "analytics">;
  welcomeScreen: boolean;
};

export const EVIDENCE: Evidence = {
  brand: { literalsLeft: 0, testedWithOtherName: { ranOn: "17 Nov 2026", note: "Tried as \"Constituent\": top bar, titles, cards, emails and the manifest all followed; tests/brand.test.mjs fails if a typed-out name comes back." } },
  flow: { e2e: { ranOn: "17 Nov 2026", secondsToLegislators: 10, secondsToFirstAnswer: 11, taps: 3, note: "Slowest of three runs (ZIP in one district, ZIP across four, a Texas street address), on a local server." },
    fiveLegislatorsForTexasAddress: true, comingUpWithAnswers: true, districtMessageShown: true, accountNotNeeded: true },
  influence: { contactOnBillAndMemberPages: { ranOn: "17 Nov 2026", note: "Seen at phone width on bill pages (whole bill and a single vote), member pages and Texas pages; taps send only the kind of page." }, hearingsStepLive: false, townHallsLine: true, voicePage: { ranOn: "17 Nov 2026", note: "Seen at phone width with seven answers, with none, and with no place saved." } },
  trust: { methodology: { ranOn: "17 Nov 2026", note: "18 sources listed from the code; tests fail if the page and the code drift apart." }, pledge: { ranOn: "17 Nov 2026", note: "The funding line waits for you." },
    about: { ranOn: "17 Nov 2026" }, privacyDraft: { ranOn: "17 Nov 2026", note: "16 points marked for the lawyer." }, termsDraft: { ranOn: "17 Nov 2026", note: "10 points marked for the lawyer." }, legalReviewed: false, founderText: false },
  quality: { e2e: null, axe: null, speed: null, errorMonitoring: true, uptimeCheck: null, feedbackPrompt: true,
    somethingWrongLink: { ranOn: "17 Nov 2026", note: "The suite files a report from a page and finds it in the queue, with and without JavaScript." },
    analytics: { ranOn: "17 Nov 2026", note: "Trial at a glance on Editor → Metrics and in the health probe." } },
  welcomeScreen: true,
};
