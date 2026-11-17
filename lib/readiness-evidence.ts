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
  texas: { calendarDates: number; readyForSession: boolean | null; notReadyWhy: string };
  welcomeScreen: boolean;
};

export const EVIDENCE: Evidence = {
  brand: { literalsLeft: null, testedWithOtherName: null },
  flow: { e2e: null, fiveLegislatorsForTexasAddress: null, comingUpWithAnswers: null, districtMessageShown: null, accountNotNeeded: null },
  influence: { contactOnBillAndMemberPages: null, hearingsStepLive: false, townHallsLine: false, voicePage: null },
  trust: { methodology: null, pledge: null, about: null, privacyDraft: null, termsDraft: null, legalReviewed: false, founderText: false },
  quality: { e2e: null, axe: null, speed: null, errorMonitoring: false, uptimeCheck: null, feedbackPrompt: true, somethingWrongLink: null, analytics: null },
  texas: { calendarDates: 0, readyForSession: null, notReadyWhy: "" },
  welcomeScreen: true,
};
