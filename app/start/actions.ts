"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh, revalidatePath } from "next/cache";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { currentLocation, saveLocation, type Location } from "@/lib/location";
import { federalLegislators, geocodeAddress } from "@/lib/federal/legislators";
import { txLegislatorsFor } from "@/lib/texas/queries";
import { savePickedIssues } from "@/lib/reader-issues";
import { countEvent } from "@/lib/events";
import { rememberZip, rememberedZip, zipPlace } from "@/lib/flow/zip";
import { answerBucket, cleanZip, FIRST_VISIT_COOKIE, PLACE_ERRORS, type PlaceError } from "@/lib/flow/rules";
import { saveReaderAnswer } from "@/lib/flow/answer";
import { getDb } from "@/db";
import { followAllAt, markIssuesAsked } from "@/lib/follow-defaults";

/**
 * The first 60 seconds (owner, 17 Nov 2026): ZIP or address → your legislators → one-tap answers. Every action checks
 * who is asking; nothing here is open to a visitor who is neither a trial reader nor the editor.
 *
 * Counts (daily totals only, lib/events.ts): flow_zip, flow_address, flow_district, flow_issues, flow_first_answer and
 * first_answer_seconds, beside the older onboarding_zip / onboarding_done and lookup_* so earlier numbers stay comparable.
 */

const NEXT = new Set(["/start", "/legislators", "/"]);
const nextPath = (v: unknown) => (NEXT.has(String(v)) ? String(v) : "/start");

export type PlaceState = { error: PlaceError | null; message: string | null; zip: string; street: string; n: number };

/**
 * ZIP alone, or ZIP and street address. The street address is sent once to the Census Bureau's geocoder to find the
 * districts and is not stored: only the state and district ids are kept (cookie, and reader_locations for a trial
 * reader or the editor), plus the ZIP in a cookie on the reader's device. On a problem the reader gets a plain message
 * and their typing back.
 */
export async function findPlace(prev: PlaceState, formData: FormData): Promise<PlaceState> {
  const typedZip = String(formData.get("zip") ?? "").trim().slice(0, 12), typedStreet = String(formData.get("street") ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const fail = (error: PlaceError): PlaceState => ({ error, message: PLACE_ERRORS[error], zip: typedZip, street: typedStreet, n: (prev?.n ?? 0) + 1 });
  const access = await viewerAccess();
  if (!access.allowed) return fail("closed");
  const zip = cleanZip(typedZip), place = zip ? await zipPlace(zip) : null;
  if (!zip || !place) { await countEvent("lookup_zip_failed", access.audience); return fail(zip ? "unknown_zip" : "need_zip"); }
  const userId = access.invite || access.editor ? await currentAppUserId(true) : null;
  const had = !!(await currentLocation(userId).catch(() => null));
  let loc: Location;
  if (typedStreet) {
    const street = typedStreet.replace(new RegExp(`[,\\s]*${zip}(-\\d{4})?$`), ""); // "…, Austin, TX 78701" typed in the street box
    const g = await geocodeAddress(`${street}, ${zip}`);
    await countEvent(g.ok ? "lookup_address_ok" : "lookup_address_failed", access.audience);
    if (!g.ok) return fail(g.reason);
    const d = g.districts;
    // The House district is the sitting Congress's; when the geocoder could not give it, a ZIP inside one district still settles it.
    loc = { state: d.state, congressional: d.congressional ?? (place.state === d.state ? place.congressional : null), stateUpper: d.stateUpper, stateLower: d.stateLower, source: "address" };
  } else {
    await countEvent("lookup_zip_ok", access.audience);
    loc = { state: place.state, congressional: place.congressional, stateUpper: null, stateLower: null, source: "zip" };
  }
  await saveLocation(userId, loc);
  await rememberZip(zip);
  if (!had) { await countEvent("onboarding_zip", access.audience); await countEvent("flow_zip", access.audience); }
  if (typedStreet && (await everyoneFound(loc))) await countEvent("flow_address", access.audience);
  redirect(nextPath(formData.get("next")));
}

/** All five in Texas (two U.S. senators, the U.S. representative, the state senator, the state representative); the three federal members elsewhere. */
async function everyoneFound(loc: Location) {
  const fed = await federalLegislators(loc.state, loc.congressional).catch(() => null);
  if (!fed || fed.senators.length < 2 || !fed.representative) return false;
  if (loc.state !== "TX") return true;
  const tx = await txLegislatorsFor(loc.stateUpper, loc.stateLower).catch(() => null);
  return !!tx?.senator && !!tx?.representative;
}

/** "Which is your district?": one tap on a district when the ZIP crosses a line. Only the ZIP's own districts (or the state's) are accepted. */
export async function chooseDistrict(formData: FormData) {
  const access = await viewerAccess(), next = nextPath(formData.get("next"));
  if (!access.allowed) redirect(next);
  const d = String(formData.get("district") ?? ""), m = d.match(/^([A-Z]{2})-(\d{2}|AL)$/);
  const userId = access.invite || access.editor ? await currentAppUserId(true) : null;
  const loc = await currentLocation(userId).catch(() => null);
  if (!m || !loc) redirect(next);
  const zip = await rememberedZip(), place = zip ? await zipPlace(zip).catch(() => null) : null;
  const allowed = place?.choices.length ? place.choices.includes(d) : m[1] === loc.state;
  if (!allowed) redirect(next);
  const same = m[1] === loc.state;
  await saveLocation(userId, { state: m[1], congressional: d, stateUpper: same ? loc.stateUpper : null, stateLower: same ? loc.stateLower : null, source: loc.source });
  await countEvent("flow_district", access.audience);
  redirect(next);
}

/** Up to three issues, saved as each chip is tapped; the list of coming votes re-sorts on the same page. */
export async function saveFlowIssues(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed) return;
  const userId = access.invite || access.editor ? await currentAppUserId(true) : null;
  await savePickedIssues(userId, formData.getAll("issue").map(String));
  await countEvent("flow_issues", access.audience);
}

/**
 * The second step of the first screen (owner, 18 Nov 2026): "Pick up to three issues", or "Skip for now". Either
 * answer is recorded (reader_setup.issues_asked_at) so the step is put to a reader once; the small picker over the
 * coming votes stays for changing issues later. "Skip for now" changes no issue the reader already has.
 * Counts, as daily totals: flow_issues (saved with at least one issue) and flow_issues_skip.
 */
export async function answerIssuesStep(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed || (!access.invite && !access.editor)) return;
  const userId = await currentAppUserId(true);
  if (!userId) return;
  const picked = formData.get("choice") === "skip" ? [] : await savePickedIssues(userId, formData.getAll("issue").map(String));
  await markIssuesAsked(getDb(), userId);
  await countEvent(picked.length ? "flow_issues" : "flow_issues_skip", access.audience);
  refresh(); // the step leaves the page and the coming votes re-sort, in place
}

/**
 * "Follow all five": one tap follows every one of the reader's own legislators (members of Congress and, in Texas,
 * the two state legislators). It turns vote alerts on only for a reader who has never chosen, and the screen says so
 * beside the button. Nothing is sent from here: a phone asks permission before it shows notifications, and email
 * needs an address. Counts, as a daily total: follow_all.
 */
export async function followAllMine() {
  const access = await viewerAccess();
  if (!access.allowed || (!access.invite && !access.editor)) return;
  const userId = await currentAppUserId(true);
  const loc = await currentLocation(userId).catch(() => null);
  if (!userId || !loc) return;
  await followAllAt(getDb(), { userId, place: loc });
  await countEvent("follow_all", access.audience);
  revalidatePath("/following");
  refresh();
}

export type AnswerState = { billId: string; answer: "support" | "oppose" | "unsure" | null; saved: boolean; note: string | null; error: string | null };
const NOTES = {
  counted: "Counted in the anonymous totals. Your individual vote stays private.",
  counts_later: "New accounts start counting after 24 hours.",
  rate: "You have answered a lot in a short time, so this one is not counted.",
  finish_on_bill_page: "To have it counted, answer once on the bill’s page, where a quick automatic check runs.",
} as const;

/**
 * Support / Oppose / Not sure in one tap, saved through the same path as the bill page (lib/flow/answer.ts) and shown
 * as saved in place. The reader's first answer ever also closes the funnel: flow_first_answer, onboarding_done, and the
 * time since they first saw the landing form as a bucket (from the `or_first` cookie; nothing is stored per person).
 */
export async function answerFromFlow(prev: AnswerState, formData: FormData): Promise<AnswerState> {
  const billId = String(formData.get("billId") ?? ""), raw = String(formData.get("stance") ?? "");
  const answer = raw === "support" || raw === "oppose" || raw === "unsure" ? raw : null;
  const failed: AnswerState = { billId, answer: prev?.answer ?? null, saved: false, note: null, error: "That did not save. Try again." };
  if (!answer) return failed;
  const access = await viewerAccess();
  const r = await saveReaderAnswer(access, billId, answer).catch(() => null);
  if (!r?.ok) return failed;
  if (r.first) {
    await countEvent("flow_first_answer", access.audience);
    await countEvent("onboarding_done", access.audience);
    const bucket = answerBucket((await cookies()).get(FIRST_VISIT_COOKIE)?.value, Date.now());
    if (bucket) await countEvent("first_answer_seconds", bucket);
    await (await import("@/lib/share")).noteShareSignup();
  }
  revalidatePath(`/bills/${billId}`);
  refresh(); // the "how your district compares" block on this page now lists the bill
  return { billId, answer, saved: true, note: r.note ? NOTES[r.note] : null, error: null };
}
