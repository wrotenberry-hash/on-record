/**
 * "Can this bill still be changed?" (owner, 20 Nov 2026: "every bill page shows, in plain English, where the bill is
 * (introduced, in committee, hearing scheduled, out of committee, floor, other chamber, final) and whether changes are
 * still possible. When the window is closed, say so.")
 *
 * Pure: the rules only. The facts come from lib/changes/window-store.ts; tested in tests/window.test.mjs.
 *
 * What a sentence may say. It states procedure ("committees rewrite bills before sending them on") and what the
 * record shows. It never forecasts what will happen to a bill and never says what a reader's answer will do. A hearing
 * date is printed only when it was confirmed against the chamber's own calendar (lib/changes/hearing-check.ts); a
 * meeting that is listed but not confirmed is said to be listed, with no date. For Texas no date is ever printed: the
 * Texas hearing reader has not been checked against the Legislature's own notices.
 */
import type { BillWindow, WindowPlace, WindowState } from "./types.ts";
import { easternLabel, statusCalledOff, statusGoingAhead } from "./hearing-check.ts";

/* -------------------------------------------------------------- Wording --- */

export const NO_HEARING_DATE = "No hearing date is known.";
export const HEARING_UNCONFIRMED = "A committee meeting on this bill is listed, but its date could not be confirmed. The date isn't known.";
export const HEARING_CANCELLED = "A committee meeting on this bill was cancelled. No new date is known.";
export const HEARING_POSTPONED = "A committee meeting on this bill was postponed. No new date is known.";
export const NAMED_IN_TITLE = "This bill is named in the meeting's title.";
const COMMITTEES_REWRITE = "Committees rewrite bills before sending them on.";
export const CHANGES = {
  introduced: `It can still be changed. Bills go to a committee first. ${COMMITTEES_REWRITE}`,
  committee: `It can still be changed. ${COMMITTEES_REWRITE}`,
  hearing: `It can still be changed. ${COMMITTEES_REWRITE} A hearing is for questions and testimony. Changes are voted on at a separate meeting called a markup.`,
  markup: "It can still be changed. A markup is the meeting where a committee votes on changes to a bill.",
  floor: (chamber: string) => `It can still be changed on the floor, if the ${chamber} allows amendments when it takes the bill up.`,
  stalled: (chamber: string) => `It is not moving. It can be changed only if the ${chamber} takes it up again.`,
  otherChamber: (has: string, first: string) => `The ${has} can still change it. If it does, the ${first} must agree to the changes.`,
  resolving: "It can be changed only in a narrow way. Only the differences between the two versions are being settled.",
  passedBoth: (signer: string) => `If both chambers passed the same text, it goes to the ${signer} and cannot be changed. If the texts differ, only those differences can still be settled.`,
  president: "The window is closed: both chambers passed the same text, and the President can sign it or veto it.",
  governor: "The window is closed: both chambers passed the same text, and the Governor can sign it, veto it, or let it become law without signing.",
  law: "The window is closed: it is law. Changing it now would take a new bill.",
  vetoed: (body: string) => `The window is closed: ${body} can vote to override a veto, but cannot change the bill.`,
  failed: (chamber: string) => `The window is closed: it failed a vote, and it goes no further unless ${chamber} votes on it again.`,
  expired: "The window is closed: a bill that has not become law when a Congress ends goes no further. It would have to be introduced again as a new bill.",
  sessionOver: (date: string) => `The window is closed: the session ended on ${date}. A bill that had not passed both chambers by then goes no further.`,
  sessionOverPassed: (date: string) => `The window is closed: the session ended on ${date}, so the Legislature can no longer change this bill.`,
  notOpenYet: "No committee has it yet, so nothing can be changed until then.",
} as const;

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2026-11-18" → "November 18, 2026"; null for anything that is not a date. */
export function longDate(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m && MONTH[Number(m[2]) - 1] ? `${MONTH[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : null;
}
const on = (iso: string | null | undefined) => { const d = longDate(iso); return d ? ` on ${d}` : ""; };
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const the = (name: string) => (/^the\s/i.test(name) ? name : `the ${name}`);

/* -------------------------------------------------------------- Meetings --- */

export type MeetingKind = "hearing" | "markup" | "meeting";
/**
 * What kind of committee meeting it is. The House types its meetings ("Hearing", "Markup"). The Senate types every
 * one "Meeting", so its title decides: "Business meeting to consider …" is a markup, "Hearings to examine …" a hearing.
 */
export function meetingKind(type: string | null | undefined, title: string | null | undefined): MeetingKind {
  const t = String(type ?? "").trim().toLowerCase(), words = String(title ?? "");
  if (t === "hearing") return "hearing";
  if (t === "markup") return "markup";
  if (/\bbusiness meeting to consider\b/i.test(words) || /\bmark-?up\b/i.test(words)) return "markup";
  if (/\bhearings? to examine\b/i.test(words) || /\bhearing\b/i.test(words)) return "hearing";
  return "meeting";
}

export type MeetingFact = {
  /** As stored: the API's type ("Hearing", "Markup", "Meeting"), status ("Scheduled", "Canceled", …) and UTC start. */
  type: string | null; title: string | null; status: string | null; startsAt: string;
  /** True only when the chamber's own calendar showed the same event at the same minute, no more than 36 hours ago. */
  confirmed: boolean;
  /** How the meeting names this bill: in its title, or in the record's list of related bills. */
  named: "title" | "record";
  /** The meeting on Congress.gov, and the chamber's own calendar page it was checked against (null: none). */
  url: string; calendarUrl: string | null; calendarLabel?: string | null;
};
type Source = { label: string; url: string };
type HearingPart = { hearing: string; hearingAt: string | null; kind: MeetingKind | null; sources: Source[] };

/**
 * The hearing sentence. Of the meetings still ahead: a confirmed one gives its date; otherwise one that is going
 * ahead but not confirmed is said to be listed, with no date; otherwise a cancelled or postponed one is said to be so.
 */
export function hearingPart(meetings: readonly MeetingFact[], now: number): HearingPart {
  const ahead = meetings.filter(m => Date.parse(m.startsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const live = ahead.filter(m => !statusCalledOff(m.status));
  const sure = live.find(m => m.confirmed && statusGoingAhead(m.status));
  const meetingSource = (m: MeetingFact): Source[] => [{ label: "The committee meeting on Congress.gov", url: m.url }];
  if (sure) {
    const kind = meetingKind(sure.type, sure.title);
    const what = kind === "markup" ? "A meeting to vote on changes (a markup)" : kind === "hearing" ? "A hearing" : "A committee meeting on this bill";
    return { hearing: `${what} is set for ${easternLabel(sure.startsAt)}.${sure.named === "title" ? ` ${NAMED_IN_TITLE}` : ""}`, hearingAt: sure.startsAt, kind,
      sources: [...meetingSource(sure), ...(sure.calendarUrl ? [{ label: sure.calendarLabel || "The chamber's own calendar", url: sure.calendarUrl }] : [])] };
  }
  if (live.length) return { hearing: HEARING_UNCONFIRMED, hearingAt: null, kind: null, sources: meetingSource(live[0]) };
  if (ahead.length) return { hearing: statusCalledOff(ahead[0].status) === "postponed" ? HEARING_POSTPONED : HEARING_CANCELLED, hearingAt: null, kind: null, sources: meetingSource(ahead[0]) };
  return { hearing: NO_HEARING_DATE, hearingAt: null, kind: null, sources: [] };
}

/* --------------------------------------------------------------- Federal --- */

export type Chamber = "house" | "senate";
const CHAMBER: Record<Chamber, string> = { house: "House", senate: "Senate" };
/** The stages lib/federal/depth-parse.ts stores (StageKey), repeated here so this file imports nothing from it. */
export type FederalStage = "introduced" | "committee" | "passed_first" | "passed_second" | "resolving" | "president" | "law" | "vetoed" | "failed" | "not_taken_up" | "debate_blocked";

export type FederalFacts = {
  /** The stored stage and its date (official_bill_depth). Null stage: the bill's actions have not been read yet. */
  stage: FederalStage | null; stageDate: string | null;
  congress: number; billType: string;
  /** Full committees the bill was sent to (not subcommittees), with the first referral and report dates on file. */
  committees: ReadonlyArray<{ name: string | null; chamber: string; referredAt: string | null; reportedAt: string | null }>;
  /** Upcoming committee meetings that name this bill. */
  meetings: readonly MeetingFact[];
  /** Chambers whose floor schedule for this week lists the bill, and that schedule's page. */
  floorChambers: readonly Chamber[]; floorUrl?: string | null;
  /** For a bill stopped by a floor vote (failed, not taken up, debate not ended): the chamber of that vote, when known. */
  stalledIn: Chamber | null;
  /**
   * A floor vote that failed after the stored stage (20 Nov 2026): a vote to take the bill up, or to end debate, in
   * the chamber that has it now. The stored stage still says "passed one chamber", but the bill is not moving, and
   * the page must not read as if it were.
   */
  blocked?: { chamber: Chamber; date: string; what: "take_up" | "end_debate" | "end_debate_take_up" } | null;
  /** The bill's "all actions" page on Congress.gov. */
  actionsUrl: string;
  now: number;
};

/** A Congress ends at noon on 3 January of the odd year after it began (the 119th: 3 January 2027). */
export function congressEnd(congress: number): { ms: number; iso: string } {
  const year = 1789 + 2 * congress;
  return { ms: Date.UTC(year, 0, 3, 17), iso: `${year}-01-03` };
}
/** A bill starts in the chamber its number names: "H.R." and "H.J.Res." in the House, "S." and "S.J.Res." in the Senate. */
export const originChamber = (billType: string): Chamber => (/^s/i.test(billType) ? "senate" : "house");

function committeeLine(names: readonly string[], chamber: string): string {
  if (names.length === 1) return `In committee: ${the(names[0])} has it.`;
  if (names.length === 2) return `In committee: ${the(names[0])} and ${the(names[1])} have it.`;
  if (names.length > 2) return `In committee: ${names.length} ${chamber} committees have it, including ${the(names[0])}.`;
  return `In committee in the ${chamber}.`;
}

/** The window for a bill in Congress, or null when its stage has not been read (the page then shows nothing). */
export function federalWindow(f: FederalFacts): BillWindow | null {
  if (!f.stage) return null;
  const origin = originChamber(f.billType), other: Chamber = origin === "house" ? "senate" : "house";
  const O = CHAMBER[origin], X = CHAMBER[other];
  const h = hearingPart(f.meetings, f.now);
  const sources: Source[] = [{ label: "All actions on this bill (Congress.gov)", url: f.actionsUrl }, ...h.sources];
  const floorSource = (): Source[] => (f.floorUrl ? [{ label: "This week's floor schedule", url: f.floorUrl }] : []);
  const make = (place: WindowPlace, state: WindowState, where: string, changes: string, extra: Source[] = []): BillWindow =>
    ({ place, state, where, changes, hearing: h.hearing, hearingAt: h.hearingAt, sources: [...sources, ...extra].filter((s, i, a) => a.findIndex(x => x.url === s.url) === i),
      ...(place === "committee" || place === "hearing_scheduled" ? { chamber: O } : {}) });

  if (f.stage === "law") return { ...make("final", "closed", `Became law${on(f.stageDate)}.`, CHANGES.law), settled: "law" };
  if (f.stage === "vetoed") return { ...make("final", "closed", `Vetoed by the President${on(f.stageDate)}.`, CHANGES.vetoed("Congress")), settled: "not_law" };
  if (f.stage === "president") return make("final", "closed", `Sent to the President${on(f.stageDate)}.`, CHANGES.president);
  // Everything below is a bill that is still alive only while its Congress is.
  const end = congressEnd(f.congress);
  if (f.now >= end.ms) return { ...make("final", "closed", `The ${ordinal(f.congress)} Congress ended on ${longDate(end.iso)}, and this bill had not become law.`, CHANGES.expired), settled: "not_law" };

  const stalled = f.stalledIn ? CHAMBER[f.stalledIn] : null;
  if (f.stage === "failed") return { ...make("final", "closed", `Failed a vote${stalled ? ` in the ${stalled}` : ""}${on(f.stageDate)}.`, CHANGES.failed(stalled ? `the ${stalled}` : "that chamber")), settled: "not_law" };
  if (f.stage === "not_taken_up" || f.stage === "debate_blocked") {
    const what = f.stage === "not_taken_up" ? "a vote to take it up failed" : "a vote to end debate failed";
    return make("floor", "narrow", `Stalled${stalled ? ` on the ${stalled} floor` : ""}: ${what}${on(f.stageDate)}.`, CHANGES.stalled(stalled ?? "chamber"));
  }
  if (f.stage === "resolving") return make("resolving", "narrow", "Passed both chambers in different versions. The House and the Senate are settling the differences.", CHANGES.resolving);
  if (f.stage === "passed_second") return make("resolving", "narrow", "Passed both the House and the Senate.", CHANGES.passedBoth("President"));
  if (f.stage === "passed_first") {
    const floor = f.floorChambers.includes(other);
    if (f.blocked && f.blocked.chamber === other && !floor) {
      const what = f.blocked.what === "take_up" ? `a ${X} vote to take it up failed` : f.blocked.what === "end_debate" ? `a ${X} vote to end debate on it failed` : `a ${X} vote to end debate on taking it up failed`;
      return make("other_chamber", "narrow", `Passed the ${O}${on(f.stageDate)}. The ${X} has it, but ${what}${on(f.blocked.date)}.`, CHANGES.stalled(X));
    }
    return make("other_chamber", "open", `Passed the ${O}${on(f.stageDate)}. The ${X} has it now.${floor ? ` It is on the ${X} floor schedule this week.` : ""}`, CHANGES.otherChamber(X, O), floor ? floorSource() : []);
  }

  // Introduced or in committee, in the chamber it started in.
  if (f.floorChambers.includes(origin)) return make("floor", "open", `On the ${O} floor schedule this week.`, CHANGES.floor(O), floorSource());
  const mine = f.committees.filter(c => c.chamber === origin);
  if (mine.some(c => !!c.reportedAt)) return make("out_of_committee", "open", `Out of committee, waiting for a vote by the full ${O}.`, CHANGES.floor(O));
  const names = [...new Set(mine.map(c => (c.name ?? "").trim()).filter(Boolean))];
  if (h.hearingAt) {
    const scheduled = h.kind === "markup" ? "A meeting to vote on changes is scheduled." : h.kind === "hearing" ? "A hearing is scheduled." : "A committee meeting on it is scheduled.";
    return make("hearing_scheduled", "open", `${committeeLine(names, O)} ${scheduled}`, h.kind === "markup" ? CHANGES.markup : h.kind === "hearing" ? CHANGES.hearing : CHANGES.committee);
  }
  if (f.stage === "committee" || mine.length > 0) return make("committee", "open", committeeLine(names, O), CHANGES.committee);
  return make("introduced", "open", `Introduced in the ${O}. No committee has it yet.`, CHANGES.introduced);
}

/**
 * Whether a bill in Congress is settled, from its stored stage alone: the same answer `federalWindow` gives in
 * `settled` (tests/settled-answers.test.mjs holds the two together). For lists of many bills, where the full window is
 * not needed.
 */
export function federalSettled(stage: string | null | undefined, congress: number, now: number): "law" | "not_law" | null {
  if (!stage) return null;
  if (stage === "law") return "law";
  if (stage === "vetoed") return "not_law";
  if (stage === "president") return null;
  if (now >= congressEnd(congress).ms) return "not_law";
  return stage === "failed" ? "not_law" : null;
}

/* ----------------------------------------------------------------- Texas --- */

export type TexasStage = "filed" | "committee" | "passed_first" | "passed_both" | "governor" | "law" | "vetoed" | "failed";
type TxChamber = "upper" | "lower";
const TX_CHAMBER: Record<TxChamber, string> = { upper: "Texas Senate", lower: "Texas House" };

export type TexasFacts = {
  stage: TexasStage;
  /** The session the bill was filed for (lib/texas/parse.ts TX_SESSIONS). Null: a session this build does not know. */
  session: { start: string; end: string | null; regular: boolean } | null;
  /** Today's date in Austin, "YYYY-MM-DD" (lib/texas/calendar.ts txToday). */
  today: string;
  /** The chamber the bill was filed in, when known. */
  origin: TxChamber | null;
  /** The committee it was last sent to, from its "Referred to …" history line. */
  committee: { name: string; chamber: string | null } | null;
  /** True when the history shows the committee sending it on. */
  reportedOut: boolean;
  /** The first chamber to pass it, and when. */
  passedFirst: { chamber: string | null; date: string | null } | null;
  /** True when an upcoming event on file lists this bill. Its date is never printed. */
  eventListed: boolean;
  tloUrl: string;
  /** Where the session's opening date comes from (lib/texas/calendar.ts TX_RULES.convene). */
  sessionSource?: Source | null;
};

/** The window for a Texas bill, or null for a session whose dates are not known. */
export function texasWindow(f: TexasFacts): BillWindow | null {
  if (!f.session) return null;
  const hearing = f.eventListed ? HEARING_UNCONFIRMED : NO_HEARING_DATE;
  const sources: Source[] = [{ label: "Bill history on Texas Legislature Online", url: f.tloUrl }];
  const make = (place: WindowPlace, state: WindowState, where: string, changes: string, extra: Source[] = []): BillWindow =>
    ({ place, state, where, changes, hearing, hearingAt: null, sources: [...sources, ...extra] });
  const tx = (c: string | null | undefined) => (c === "upper" || c === "lower" ? TX_CHAMBER[c] : null);
  const O = tx(f.origin), year = f.session.start.slice(0, 4);

  if (f.stage === "law") return { ...make("final", "closed", "Became law.", CHANGES.law), settled: "law" };
  if (f.stage === "vetoed") return { ...make("final", "closed", "Vetoed by the Governor.", CHANGES.vetoed("the Legislature")), settled: "not_law" };
  if (f.stage === "governor") return make("final", "closed", "Sent to the Governor.", CHANGES.governor);
  if (f.today < f.session.start) {
    const which = f.session.regular ? `the ${year} session` : "a special session";
    return make("introduced", "not_open_yet", `Filed for ${which}, which opens ${longDate(f.session.start)}.`, CHANGES.notOpenYet, f.sessionSource ? [f.sessionSource] : []);
  }
  if (f.session.end && f.today > f.session.end) {
    const ended = longDate(f.session.end) ?? f.session.end;
    if (f.stage === "passed_both") return make("final", "closed", "Passed both the Texas House and the Texas Senate.", CHANGES.sessionOverPassed(ended));
    if (f.stage === "failed") return { ...make("final", "closed", "Failed a vote.", CHANGES.sessionOver(ended)), settled: "not_law" };
    return { ...make("final", "closed", `Did not pass both chambers before the session ended on ${ended}.`, CHANGES.sessionOver(ended)), settled: "not_law" };
  }
  if (f.stage === "failed") return { ...make("final", "closed", "Failed a vote.", CHANGES.failed("that chamber")), settled: "not_law" };
  if (f.stage === "passed_both") return make("resolving", "narrow", "Passed both the Texas House and the Texas Senate.", CHANGES.passedBoth("Governor"));
  if (f.stage === "passed_first") {
    const first = tx(f.passedFirst?.chamber) ?? O, has = first === TX_CHAMBER.upper ? TX_CHAMBER.lower : first === TX_CHAMBER.lower ? TX_CHAMBER.upper : null;
    if (!first || !has) return make("other_chamber", "open", `Passed one chamber${on(f.passedFirst?.date)}. The other chamber has it now.`, "The other chamber can still change it. If it does, the first chamber must agree to the changes.");
    return make("other_chamber", "open", `Passed the ${first}${on(f.passedFirst?.date)}. The ${has} has it now.`, CHANGES.otherChamber(has, first));
  }
  if (f.stage === "committee") {
    const C = tx(f.committee?.chamber) ?? O;
    if (f.reportedOut) return make("out_of_committee", "open", `Out of committee, waiting for a vote by the full ${C ?? "chamber"}.`, CHANGES.floor(C ?? "chamber"));
    // The committee's name is free text from the bill's history: use it only when it reads as a plain name.
    const name = f.committee && /^[A-Za-z][A-Za-z&,.'’ -]{2,79}$/.test(f.committee.name.trim()) ? f.committee.name.trim() : null;
    return { ...make("committee", "open", name ? `In committee: the ${C ? `${C} ` : ""}committee on ${name} has it.` : C ? `In committee in the ${C}.` : "In committee.", CHANGES.committee), ...(C ? { chamber: C } : {}) };
  }
  return make("introduced", "open", O ? `Filed in the ${O}. No committee has it yet.` : "Filed. No committee has it yet.", CHANGES.introduced);
}

/** Whether a Texas bill is settled, from its stored stage and its session: the same answer `texasWindow` gives in `settled`. */
export function texasSettled(stage: string | null | undefined, session: { start: string; end: string | null } | null, today: string): "law" | "not_law" | null {
  if (!stage || !session) return null;
  if (stage === "law") return "law";
  if (stage === "vetoed") return "not_law";
  if (stage === "governor") return null;
  if (today < session.start) return null;
  if (session.end && today > session.end) return stage === "passed_both" ? null : "not_law";
  return stage === "failed" ? "not_law" : null;
}
