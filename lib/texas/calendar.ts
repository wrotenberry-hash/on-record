/**
 * The Texas session calendar: which session is current and which is next, and the key dates of the 2027 regular
 * session. Pure (imports only ./parse.ts); tested in tests/texas-calendar.test.mjs.
 *
 * Where the dates come from. Every date is either taken from an official record or computed from a rule whose text
 * was read on an official page on 17 Nov 2026. The only official Texas host this build machine could reach was
 * capitol.texas.gov (Texas Legislature Online), so each rule is quoted from a legislative document published there
 * that prints the current text of the Constitution, the Government Code or the House Rules. The Legislature's own
 * "Dates of Interest" and "End of Session Deadlines" documents (tlc.texas.gov) could not be read from here, so the
 * end-of-session deadlines (the last days for House and Senate action on bills) are NOT in this list. Nothing here
 * is filled in from memory.
 */
import { TX_SESSIONS, type TxSession } from "./parse.ts";

/* ------------------------------------------------------------ Date maths --- */

const DAY_MS = 86400e3;
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Today's date in Austin (America/Chicago), "YYYY-MM-DD". Session dates are Texas dates, not UTC dates. */
export function txToday(nowMs: number): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export const addDays = (iso: string, n: number) => toIso(utc(iso) + n * DAY_MS);
/** Whole days from a to b (negative when b is earlier). */
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY_MS);
/** 0 Sunday … 6 Saturday. */
export const weekday = (iso: string) => new Date(utc(iso)).getUTCDay();
/** The nth given weekday of a month: nthWeekday(2027, 1, 2, 2) is the second Tuesday of January 2027. */
export function nthWeekday(year: number, month: number, day: number, n: number): string {
  const first = Date.UTC(year, month - 1, 1), offset = (day - new Date(first).getUTCDay() + 7) % 7;
  return toIso(first + (offset + 7 * (n - 1)) * DAY_MS);
}
/** The first given weekday strictly after a date. */
export function firstWeekdayAfter(iso: string, day: number): string {
  const step = (day - weekday(iso) + 7) % 7 || 7;
  return addDays(iso, step);
}

/* ------------------------------------------------- Current and upcoming --- */

export type TxSessionState = {
  /** The session in progress, else the most recent one that has started. */
  current: TxSession;
  inSession: boolean;
  /** The next session that has not started yet, if one is known. */
  upcoming: TxSession | null;
  /** The session readers care about now: the one in progress, else the upcoming one, else the last one. */
  focus: TxSession;
  daysUntilUpcoming: number | null;
  /** Session ids to load bills for, most important first. */
  ingestOrder: string[];
};
/**
 * Which Texas session is current and which is upcoming on a date. The one rule the ingest and the pages share, so
 * nothing stays on the old session after the new one convenes: on 11 Jan 2027 the focus is the 90th as "upcoming";
 * from 12 Jan 2027 it is the 90th as "current".
 */
export function txSessionState(isoDate: string, sessions: TxSession[] = TX_SESSIONS): TxSessionState {
  const started = sessions.filter(s => s.start <= isoDate).sort((a, b) => b.start.localeCompare(a.start));
  const current = started[0] ?? sessions[sessions.length - 1];
  const inSession = !!started[0] && (!current.end || isoDate <= current.end);
  const upcoming = sessions.filter(s => s.start > isoDate).sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
  const focus = !inSession && upcoming ? upcoming : current;
  return { current, inSession, upcoming, focus, daysUntilUpcoming: upcoming ? daysBetween(isoDate, upcoming.start) : null, ingestOrder: [...new Set([focus.id, current.id])] };
}

/** Texas Legislature Online's code for a session id: "90" → "90R" (regular), "901" → "901" (first called session). */
export const tloSessionCode = (id: string) => (/^\d{2}$/.test(id) ? `${id}R` : id);
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
/** A plain name for a session id, for sessions the source lists before they are entered in TX_SESSIONS. */
export function txSessionLabel(id: string, sessions: TxSession[] = TX_SESSIONS): string {
  const known = sessions.find(s => s.id === id);
  if (known) return known.name;
  const m = /^(\d{2})(\d)?$/.exec(id);
  if (!m) return `Session ${id}`;
  return `${ordinal(Number(m[1]))} Legislature, ${m[2] ? `${ordinal(Number(m[2]))} Called Session` : "Regular Session"}`;
}

/* ------------------------------------------------------------ The rules --- */

export type TxRule = { id: string; cite: string; /** The words of the rule as printed on the official page. */ quote: string; sourceLabel: string; sourceUrl: string; readOn: string };
/**
 * The rules the dates are computed from, each with the official page it was read on (17 Nov 2026). The pages are
 * legislative documents on Texas Legislature Online that print the current text; the quoted words are text the
 * document leaves unchanged (not its proposed additions).
 */
export const TX_RULES: Record<"convene" | "length" | "prefiling" | "filingDeadline" | "veto" | "effective", TxRule> = {
  convene: { id: "convene", cite: "Texas Government Code, Sec. 301.001",
    quote: "The legislature shall convene at the seat of government in regular session at 12 noon on the second Tuesday in January of each odd-numbered year.",
    sourceLabel: "Texas Government Code, Sec. 301.001, as printed in H.B. 561 (2023) on Texas Legislature Online",
    sourceUrl: "https://capitol.texas.gov/tlodocs/88R/billtext/html/HB00561I.htm", readOn: "2026-11-17" },
  length: { id: "length", cite: "Texas Constitution, Art. III, Sec. 24(b)",
    quote: "No Regular Session shall be of longer duration than one hundred and forty (140) days.",
    sourceLabel: "Texas Constitution, Art. III, Sec. 24(b), as printed in H.J.R. 52 (2021) on Texas Legislature Online",
    sourceUrl: "https://capitol.texas.gov/tlodocs/87R/billtext/html/HJ00052I.htm", readOn: "2026-11-17" },
  prefiling: { id: "prefiling", cite: "Texas House Rules (H.R. 4, 89th Legislature), Rule 8, Sec. 7",
    quote: "Beginning the first Monday after the general election preceding the next regular legislative session, or within 30 days prior to any special session, it shall be in order to file with the chief clerk bills and resolutions for introduction in that session.",
    sourceLabel: "Texas House Rules, Rule 8, Sec. 7 (H.R. 4, 2025); the first bills for 2027 are dated 9 Nov 2026 on Texas Legislature Online",
    sourceUrl: "https://capitol.texas.gov/BillLookup/Text.aspx?LegSess=89R&Bill=HR4", readOn: "2026-11-17" },
  filingDeadline: { id: "filingDeadline", cite: "Texas House Rules (H.R. 4, 89th Legislature), Rule 8, Sec. 8",
    quote: "After the first 60 calendar days of a regular session, any bill or joint resolution, except local bills, emergency appropriations, and all emergency matters submitted by the governor in special messages to the legislature, shall require an affirmative vote of four-fifths of those members present and voting to be introduced.",
    sourceLabel: "Texas House Rules, Rule 8, Sec. 8 (H.R. 4, 2025), on Texas Legislature Online",
    sourceUrl: "https://capitol.texas.gov/BillLookup/Text.aspx?LegSess=89R&Bill=HR4", readOn: "2026-11-17" },
  veto: { id: "veto", cite: "Texas Constitution, Art. IV, Sec. 14",
    quote: "unless the Legislature, by its adjournment, prevent its return, in which case it shall be a law, unless he shall file the same, with his objections, in the office of the Secretary of State and give notice thereof by public proclamation within twenty days after such adjournment.",
    sourceLabel: "Texas Constitution, Art. IV, Sec. 14, as printed in S.J.R. 39 (2025) on Texas Legislature Online",
    sourceUrl: "https://capitol.texas.gov/tlodocs/89R/billtext/html/SJ00039E.htm", readOn: "2026-11-17" },
  effective: { id: "effective", cite: "Texas Constitution, Art. III, Sec. 39",
    quote: "No law passed by the Legislature, except the general appropriation act, shall take effect or go into force until ninety days after the adjournment of the session at which it was enacted, unless the Legislature shall, by a vote of two-thirds of all the members elected to each House, otherwise direct",
    sourceLabel: "Texas Constitution, Art. III, Sec. 39, as printed in H.J.R. 62 (1999) on Texas Legislature Online",
    sourceUrl: "https://capitol.texas.gov/tlodocs/76R/billtext/html/HJ00062F.htm", readOn: "2026-11-17" },
};
/** The longest a regular session can run (Art. III, Sec. 24(b)). */
export const TX_REGULAR_SESSION_DAYS = 140;

/* ------------------------------------------------------------ Key dates --- */

export type TxKeyDate = {
  id: string; date: string;
  /** Plain words. */
  label: string;
  /** What it means for a reader, in one sentence. */
  meaning: string;
  sourceLabel: string; sourceUrl: string;
  /** "record": the date is on an official record. "rule": computed from the quoted rule. */
  basis: "record" | "rule";
  /** The citation of the rule, for "computed from the rule in …". */
  rule: string;
  /**
   * True when the date could still move: it rests on rules the new Legislature has yet to adopt, or on the session
   * running to its last possible day.
   */
  expected: boolean;
};

/** The day a regular session convenes in a year: the second Tuesday in January (odd-numbered years only). */
export function txConveneDate(year: number): string | null {
  return year % 2 === 1 ? nthWeekday(year, 1, 2, 2) : null;
}
/** Day N of a session, counting the day it convenes as day 1. */
export const txSessionDay = (start: string, n: number) => addDays(start, n - 1);

/**
 * The first day bills for a regular session were filed, as recorded on Texas Legislature Online's "Filed House Bills"
 * and "Filed Senate Bills" reports for that session (read 17 Nov 2026: 972 House bills and the first Senate bills
 * carry "11/09/2026 Filed"). Only sessions whose record was read are listed.
 */
export const TX_PREFILING_RECORDED: Record<string, { date: string; sourceUrl: string }> = {
  "90": { date: "2026-11-09", sourceUrl: "https://capitol.texas.gov/Reports/Report.aspx?LegSess=90R&ID=housefiled" },
};

/** Key dates of a regular session, in date order. Computed from the session's start date and the rules above. */
export function txKeyDatesFor(session: TxSession): TxKeyDate[] {
  if (!session.regular) return [];
  const year = session.start.slice(0, 4), lastDay = txSessionDay(session.start, TX_REGULAR_SESSION_DAYS), R = TX_RULES;
  const out: TxKeyDate[] = [];
  const pre = TX_PREFILING_RECORDED[session.id];
  if (pre) out.push({ id: "prefiling", date: pre.date, label: "Early filing of bills begins",
    meaning: `Lawmakers can file bills for the ${year} session from this day, before the session opens, so you can read them early.`,
    sourceLabel: R.prefiling.sourceLabel, sourceUrl: R.prefiling.sourceUrl, basis: "record", rule: R.prefiling.cite, expected: false });
  out.push({ id: "convene", date: session.start, label: "The session opens at noon",
    meaning: `The ${year} regular session begins; from this day the House and Senate meet to work on bills.`,
    sourceLabel: R.convene.sourceLabel, sourceUrl: R.convene.sourceUrl, basis: "rule", rule: R.convene.cite, expected: false });
  out.push({ id: "filing-deadline", date: txSessionDay(session.start, 60), label: "Last day to file most bills (expected)",
    meaning: "After this day a new bill usually needs a yes from four out of five House members voting before it can be filed, so most bills are filed by now; the date uses the House rule from 2025, which the House can change when the session opens.",
    sourceLabel: R.filingDeadline.sourceLabel, sourceUrl: R.filingDeadline.sourceUrl, basis: "rule", rule: R.filingDeadline.cite, expected: true });
  out.push({ id: "last-day", date: lastDay, label: "Last day the session can meet",
    meaning: "A regular session can last at most 140 days, so a bill that has not passed both the House and the Senate by the end of this day does not become law in this session.",
    sourceLabel: R.length.sourceLabel, sourceUrl: R.length.sourceUrl, basis: "rule", rule: R.length.cite, expected: false });
  out.push({ id: "veto-deadline", date: addDays(lastDay, 20), label: "Last day for the Governor to veto late bills",
    meaning: "If the session runs its full 140 days, the Governor has until this day to veto a bill that reached the Governor in its final days; a bill not vetoed by then becomes law, signed or not.",
    sourceLabel: R.veto.sourceLabel, sourceUrl: R.veto.sourceUrl, basis: "rule", rule: R.veto.cite, expected: true });
  out.push({ id: "effective-91st", date: addDays(lastDay, 91), label: "New laws with no date of their own take effect",
    meaning: "If the session runs its full 140 days, a new law that names no start date begins to apply on this day, the 91st day after the session ends; a bill can name its own date instead, and the state budget bill is not covered by this rule.",
    sourceLabel: R.effective.sourceLabel, sourceUrl: R.effective.sourceUrl, basis: "rule", rule: R.effective.cite, expected: true });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export type TxCalendarRow = TxKeyDate & { passed: boolean; isToday: boolean; daysAway: number };
export type TxCalendar = { session: TxSession | null; rows: TxCalendarRow[]; next: TxCalendarRow | null; nextLine: string | null };

/** "today", "tomorrow", "in 56 days". */
export const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/**
 * The calendar to show on a date: the key dates of the regular session in progress or coming up (else the latest
 * one), each marked passed or not, with the next one picked out. A date counts as passed from the day after it.
 */
export function txCalendar(today: string, sessions: TxSession[] = TX_SESSIONS): TxCalendar {
  const regular = sessions.filter(s => s.regular).sort((a, b) => a.start.localeCompare(b.start));
  // The regular session whose last key date has not passed yet, else the latest regular session.
  const session = regular.find(s => { const k = txKeyDatesFor(s); return k.length > 0 && k[k.length - 1].date >= today; }) ?? regular[regular.length - 1] ?? null;
  if (!session) return { session: null, rows: [], next: null, nextLine: null };
  const rows = txKeyDatesFor(session).map(k => { const daysAway = daysBetween(today, k.date); return { ...k, passed: daysAway < 0, isToday: daysAway === 0, daysAway }; });
  const next = rows.find(r => !r.passed) ?? null;
  return { session, rows, next, nextLine: next ? `Next: ${next.label.replace(/ \(expected\)$/, "")}, ${inDays(next.daysAway)}` : null };
}

export type TxComingDate = { key: string; date: string; whenMs: number; title: string; detail: string; href: string; sourceUrl: string };
/**
 * The next two key dates from a moment in time, shaped for "What's coming" (lib/reminders.ts `comingItems`). The
 * time of day is noon in Austin, when the session convenes; the other dates are whole days.
 */
export function txKeyDates(nowMs: number, count = 2): TxComingDate[] {
  const cal = txCalendar(txToday(nowMs));
  return cal.rows.filter(r => !r.passed).slice(0, count).map(r => ({ key: `txdate:${cal.session!.id}:${r.id}`, date: r.date, whenMs: utc(r.date) + 18 * 3600e3,
    title: `${r.label}: Texas Legislature`, detail: `Texas session key date${r.expected ? " (could still move)" : ""}`, href: "/texas#key-dates", sourceUrl: r.sourceUrl }));
}
