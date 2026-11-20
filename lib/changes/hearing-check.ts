/**
 * Confirming a committee meeting's date against the chamber's own calendar (owner, 20 Nov 2026: "Check the
 * hearing-date reader against live data before the 'can it still be changed' line goes on any bill page. If a hearing
 * date can't be confirmed, the page says the date isn't known.").
 *
 * Pure: no imports. Tested in tests/window.test.mjs against pages captured on 20 Nov 2026 (tests/fixtures/meetings/).
 *
 * The rule. A stored meeting (from the Congress.gov API) is CONFIRMED only when the chamber's own page shows the same
 * event starting at the same minute, once the stored UTC time is turned into Washington time, and the stored status is
 * Scheduled or Rescheduled, and the chamber's page does not say cancelled or postponed. Anything else is not
 * confirmed: a page that could not be read, an event the chamber does not list, a different time, a meeting with no
 * time, a joint meeting (neither chamber's calendar carries it). A page never prints a date that is not confirmed.
 *
 *   House   https://docs.house.gov/Committee/Calendar/ByEvent.aspx?EventID={eventId}
 *           <p class="meetingTime">Thursday, November 19, 2026 (12:30 PM)</p>, Eastern time, and a
 *           <strong class="status-alert"> line when the meeting was moved or called off.
 *   Senate  https://www.senate.gov/general/committee_schedules/hearings.xml, one <meeting> per event; its
 *           <identifier> is the API's eventId; <date>19-NOV-2026 10:00 AM</date> is Eastern time.
 */

export const houseEventUrl = (eventId: string) => `https://docs.house.gov/Committee/Calendar/ByEvent.aspx?EventID=${encodeURIComponent(eventId)}`;
export const SENATE_HEARINGS_URL = "https://www.senate.gov/general/committee_schedules/hearings.xml";

export type CalledOff = "cancelled" | "postponed";
/** What a chamber's own calendar says about one event. `localStart` is the wall-clock time in Washington: "2026-11-19T12:30". */
export type ChamberListing = { eventId: string; localStart: string | null; calledOff: CalledOff | null; kind: string | null };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const pad = (n: number) => String(n).padStart(2, "0");
const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "12:30 PM" on a calendar day, as "YYYY-MM-DDTHH:MM", or null when any part is out of range. */
function local(year: number, month: number, day: number, hour12: number, minute: number, pm: boolean): string | null {
  if (!(year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && hour12 >= 1 && hour12 <= 12 && minute >= 0 && minute <= 59)) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null; // 31 June and the like
  return `${year}-${pad(month)}-${pad(day)}T${pad((hour12 % 12) + (pm ? 12 : 0))}:${pad(minute)}`;
}
const calledOffIn = (text: string): CalledOff | null => (/\bcancel/i.test(text) ? "cancelled" : /\bpostpon/i.test(text) ? "postponed" : null);

/**
 * One event's page on the House committee calendar. Null when the page is not that event's page (an error page, a
 * page for another event, a page with neither a time nor a status line). The weekday printed must match the date.
 */
export function parseHouseEventPage(html: string | null | undefined, eventId: string): ChamberListing | null {
  if (typeof html !== "string" || !eventId || !new RegExp(`EventID=${escapeRe(eventId)}(?![0-9A-Za-z])`, "i").test(html)) return null;
  const time = strip(html.match(/<p[^>]*class="[^"]*\bmeetingTime\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
  // The words beside the time ("Meeting was rescheduled to the time and date listed above.", "Meeting was cancelled.").
  const alerts = [...html.matchAll(/<(strong|span|p|div)[^>]*class="[^"]*\bstatus-alert\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => strip(m[2])).join(" ");
  const m = time.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s*\(\s*(\d{1,2}):(\d{2})\s*([AP])\.?M\.?\s*\)$/i);
  let localStart: string | null = null;
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1, year = Number(m[4]), day = Number(m[3]);
    localStart = local(year, month, day, Number(m[5]), Number(m[6]), m[7].toUpperCase() === "P");
    if (localStart && new Date(Date.UTC(year, month - 1, day)).getUTCDay() !== DAYS.indexOf(m[1].toLowerCase())) localStart = null;
  }
  const calledOff = calledOffIn(`${alerts} ${time}`);
  if (!localStart && !calledOff && !time) return null;
  const kind = strip(html.match(/<h1[^>]*>\s*([A-Za-z ]{3,30}):/i)?.[1] ?? "") || null; // "Hearing:", "Markup:"
  return { eventId, localStart, calledOff, kind };
}

/** The Senate's schedule of committee meetings, by event id. Empty when the text is not that schedule. */
export function parseSenateHearings(xml: string | null | undefined): Map<string, ChamberListing> {
  const out = new Map<string, ChamberListing>();
  if (typeof xml !== "string" || !/<css_meetings_scheduled[\s>]/i.test(xml)) return out;
  for (const block of xml.match(/<meeting>[\s\S]*?<\/meeting>/gi) ?? []) {
    const tag = (name: string) => strip(block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "");
    const eventId = tag("identifier");
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(eventId) || out.has(eventId)) continue;
    const d = tag("date").match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP])M$/i);
    const fromDate = d ? local(Number(d[3]), MONTHS.findIndex(x => x.startsWith(d[2].toLowerCase())) + 1, Number(d[1]), Number(d[4]), Number(d[5]), d[6].toUpperCase() === "P") : null;
    const isoDay = tag("date_iso_8601"), isoTime = tag("time_iso_8601");
    const fromIso = /^\d{4}-\d{2}-\d{2}$/.test(isoDay) && /^\d{2}:\d{2}(:\d{2})?$/.test(isoTime) ? `${isoDay}T${isoTime.slice(0, 5)}` : null;
    // The schedule gives the time twice. When both are there they must agree; when they do not, the time is not known.
    const localStart = fromDate && fromIso ? (fromDate === fromIso ? fromDate : null) : fromDate ?? fromIso;
    const matter = tag("matter");
    const calledOff = calledOffIn(`${tag("type")} ${tag("date")} ${tag("time")} ${tag("room")}`) ?? (/\b(CANCELL?ED|POSTPONED)\b/.test(matter) || /^(cancel|postpon)/i.test(matter) ? calledOffIn(matter) : null);
    out.set(eventId, { eventId, localStart, calledOff, kind: tag("type") || null });
  }
  return out;
}

const EASTERN = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** A UTC instant as wall-clock time in Washington, "YYYY-MM-DDTHH:MM", daylight saving included. Null for a bad date. */
export function easternWallClock(isoUtc: string | null | undefined): string | null {
  const ms = Date.parse(String(isoUtc ?? ""));
  if (!Number.isFinite(ms)) return null;
  const p = Object.fromEntries(EASTERN.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}
const EASTERN_WORDS = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
/** "Thursday, November 19 at 12:30 p.m. Eastern". Only ever called with a confirmed start. */
export function easternLabel(isoUtc: string): string {
  const p = Object.fromEntries(EASTERN_WORDS.formatToParts(new Date(Date.parse(isoUtc))).map(x => [x.type, x.value]));
  const half = /^p/i.test(p.dayPeriod ?? "") ? "p.m." : "a.m.";
  return `${p.weekday}, ${p.month} ${p.day} at ${p.hour}${p.minute === "00" ? "" : `:${p.minute}`} ${half} Eastern`;
}

/** The API's status words: a meeting that is going ahead as listed is "Scheduled" or "Rescheduled". */
export const statusGoingAhead = (status: string | null | undefined) => /^(scheduled|rescheduled)$/i.test(String(status ?? "").trim());
/** "Canceled" or "Postponed" in the stored record. */
export function statusCalledOff(status: string | null | undefined): CalledOff | null {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "canceled" || s === "cancelled" ? "cancelled" : s === "postponed" ? "postponed" : null;
}

export type CheckReason = "confirmed" | "status" | "no_calendar" | "not_listed" | "called_off" | "no_time" | "different_time";
/** The whole rule, for one stored meeting and what the chamber's calendar says about it (null: the chamber does not list it). */
export function checkMeeting(stored: { chamber: string; startsAt: string; status: string | null }, listing: ChamberListing | null): { confirmed: boolean; reason: CheckReason } {
  const no = (reason: CheckReason) => ({ confirmed: false, reason });
  if (!statusGoingAhead(stored.status)) return no("status");
  if (stored.chamber !== "house" && stored.chamber !== "senate") return no("no_calendar");
  if (!listing) return no("not_listed");
  if (listing.calledOff) return no("called_off");
  const mine = easternWallClock(stored.startsAt);
  if (!mine || !listing.localStart) return no("no_time");
  return mine === listing.localStart ? { confirmed: true, reason: "confirmed" } : no("different_time");
}

/* ------------------------------------------------- What is kept on file --- */

/** One confirmation: the start that was confirmed, when it was checked, and the chamber page that showed it. */
export type Confirmation = { startsAt: string; checkedAt: number; source: string };
/** A confirmation older than this no longer counts (owner's brief, 20 Nov 2026). */
export const CONFIRM_FRESH_MS = 36 * 3600e3;

/** The stored JSON (meeting id → confirmation) as a map. Anything unreadable gives an empty map, never a throw. */
export function parseConfirmations(json: string | null | undefined): Map<string, Confirmation> {
  const out = new Map<string, Confirmation>();
  let data: unknown = null;
  try { data = JSON.parse(json ?? "null"); } catch { return out; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;
  for (const [id, v] of Object.entries(data as Record<string, unknown>)) {
    const c = v as Partial<Confirmation> | null;
    if (c && typeof c.startsAt === "string" && Number.isFinite(Date.parse(c.startsAt)) && typeof c.checkedAt === "number" && typeof c.source === "string") out.set(id, { startsAt: c.startsAt, checkedAt: c.checkedAt, source: c.source });
  }
  return out;
}
/** Only meetings that are still ahead are kept. */
export function pruneConfirmations(all: ReadonlyMap<string, Confirmation>, now: number): Map<string, Confirmation> {
  return new Map([...all].filter(([, c]) => Date.parse(c.startsAt) > now));
}
/**
 * Does a confirmation on file still stand for the meeting as it is stored now? It must be for the same start, be no
 * older than 36 hours, and the meeting must still be ahead and still listed as going ahead.
 */
export function confirmationHolds(c: Confirmation | null | undefined, meeting: { startsAt: string; status: string | null }, now: number): boolean {
  return !!c && c.startsAt === meeting.startsAt && c.checkedAt <= now + 60_000 && now - c.checkedAt <= CONFIRM_FRESH_MS
    && Date.parse(meeting.startsAt) > now && statusGoingAhead(meeting.status);
}
