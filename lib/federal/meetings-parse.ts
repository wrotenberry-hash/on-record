/**
 * Committee hearings and markups in Congress, from the Congress.gov API's committee-meeting records
 * (test-ready build, 17 Nov 2026). Pure; tested in tests/meetings.test.mjs.
 *
 * NOT YET CHECKED AGAINST LIVE DATA. The API key exists only in production, so these parsers were written from the
 * Library of Congress's published documentation of the endpoint
 * (github.com/LibraryOfCongress/api.congress.gov, Documentation/CommitteeMeetingEndpoint.md and ChangeLog.md, read
 * 17 Nov 2026) and are tested against hand-made fixtures that follow it. Every parser is defensive: an unknown shape
 * gives an empty result, never a throw, and the ingest step reports how many records it could not read.
 *
 * Documented shape:
 *   list    GET /v3/committee-meeting/{congress}/{chamber}  →  { committeeMeetings: [{ eventId, url, updateDate, congress, chamber }], pagination: { count, next } }
 *   detail  GET /v3/committee-meeting/{congress}/{chamber}/{eventId}  →  { committeeMeeting: { eventId, updateDate, congress, type, title,
 *           meetingStatus, date, chamber, committees: [{ systemCode, name, url }], location: { room, building } | { address },
 *           relatedItems: { bills: [{ type, number, congress, url }], treaties, nominations }, … } }
 *   chamber is "House", "Senate" or "NoChamber"; type is "Meeting", "Hearing" or "Markup" (Senate meetings are all "Meeting");
 *   meetingStatus is "Scheduled", "Canceled", "Postponed" or "Rescheduled"; dates are "YYYY-MM-DDThh:mm:ssZ"; empty elements are left out.
 */
import { committeeIdFromSystemCode } from "./depth-parse.ts";

export type MeetingChamber = "house" | "senate" | "joint";
export const MEETING_LIST_LIMIT = 250; // the API's largest page

function chamberOf(v: unknown): MeetingChamber | null {
  const c = String(v ?? "").trim().toLowerCase();
  return c === "house" ? "house" : c === "senate" ? "senate" : c === "nochamber" || c === "joint" ? "joint" : null;
}
const text = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");
/** A repeatable element: an array in JSON, or (defensively) a container holding the array or a single item under one key. */
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === "object"
  ? Object.values(v as Record<string, unknown>).flatMap(x => (Array.isArray(x) ? x : x && typeof x === "object" ? [x] : [])) : []);

/** An API timestamp to ISO UTC ("2026-11-24T15:00:00.000Z"), or null. A stamp with no zone is read as UTC, as the API documents. */
export function isoUtc(v: unknown): string | null {
  const s = text(v);
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const withZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : /T/.test(s) ? `${s}Z` : `${s}T00:00:00Z`;
  const ms = Date.parse(withZone.replace(" ", "T"));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** The list URL. `since` (ISO) asks only for meetings updated from then on (the API's fromDateTime filter on updateDate). */
export function meetingListUrl(base: string, congress: number, chamber: "house" | "senate", opts: { since?: string | null; offset?: number; limit?: number } = {}) {
  const q = [`format=json`, `limit=${opts.limit ?? MEETING_LIST_LIMIT}`, `offset=${opts.offset ?? 0}`];
  if (opts.since) q.push(`fromDateTime=${opts.since.slice(0, 19)}Z`);
  return `${base}/committee-meeting/${congress}/${chamber}?${q.join("&")}`;
}
export function meetingDetailUrl(base: string, congress: number, chamber: "house" | "senate", eventId: string) {
  return `${base}/committee-meeting/${congress}/${chamber}/${encodeURIComponent(eventId)}?format=json`;
}
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
/** The meeting's page on Congress.gov, which is the link readers get. */
export function meetingPageUrl(congress: number, chamber: MeetingChamber, eventId: string) {
  return `https://www.congress.gov/event/${ordinal(congress)}-congress/${chamber}-event/${encodeURIComponent(eventId)}`;
}
export const meetingId = (congress: number, chamber: MeetingChamber, eventId: string) => `${congress}-${chamber}-${eventId}`;

export type MeetingListItem = { eventId: string; congress: number | null; chamber: MeetingChamber | null; updateDate: string | null };
export function parseMeetingList(data: unknown): { items: MeetingListItem[]; count: number | null } {
  const d = data as { committeeMeetings?: unknown; pagination?: { count?: unknown } } | null;
  const seen = new Set<string>();
  const items = list(d?.committeeMeetings).flatMap(raw => {
    const m = raw as { eventId?: unknown; congress?: unknown; chamber?: unknown; updateDate?: unknown } | null;
    const eventId = text(m?.eventId);
    if (!eventId || !/^[A-Za-z0-9_-]{1,40}$/.test(eventId) || seen.has(eventId)) return [];
    seen.add(eventId);
    const congress = Number(m?.congress);
    return [{ eventId, congress: Number.isInteger(congress) && congress > 0 ? congress : null, chamber: chamberOf(m?.chamber), updateDate: isoUtc(m?.updateDate) }];
  });
  const count = Number(d?.pagination?.count);
  return { items, count: Number.isFinite(count) && d?.pagination?.count != null ? count : null };
}

export type Meeting = { id: string; eventId: string; congress: number; chamber: MeetingChamber; committeeCodes: string[]; committeeName: string | null; title: string;
  meetingType: string | null; status: string | null; startsAt: string; location: string | null; billIds: string[]; url: string };

const BILL_TYPES = new Set(["hr", "s", "hjres", "sjres", "hconres", "sconres", "hres", "sres"]);

function locationOf(v: unknown): string | null {
  if (typeof v === "string") return text(v) || null;
  const l = v as { room?: unknown; building?: unknown; address?: unknown } | null;
  if (!l || typeof l !== "object") return null;
  const room = text(l.room), building = text(l.building);
  // A meeting held online is listed with room "WEBEX" and a placeholder building.
  if (/^webex$/i.test(room)) return "Held online";
  const place = [room && /^[\w-]+$/.test(room) && building ? `Room ${room}` : room, /^-+$/.test(building) ? "" : building].filter(Boolean).join(", ");
  if (place) return place;
  const a = l.address;
  if (typeof a === "string") return text(a) || null;
  if (a && typeof a === "object") return Object.values(a as Record<string, unknown>).map(text).filter(Boolean).join(", ") || null;
  return null;
}

/** One meeting from the detail record. `fallback` is the list item it came from (the detail repeats congress and chamber, but may leave them out). */
export function parseMeetingDetail(data: unknown, fallback: { congress?: number | null; chamber?: MeetingChamber | null; eventId?: string } = {}): Meeting | null {
  const m = (data as { committeeMeeting?: unknown } | null)?.committeeMeeting as Record<string, unknown> | undefined;
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const eventId = text(m.eventId) || fallback.eventId || "";
  const congress = Number(m.congress) || fallback.congress || 0;
  const chamber = chamberOf(m.chamber) ?? fallback.chamber ?? null;
  const startsAt = isoUtc(m.date);
  const committees = list(m.committees).map(c => c as { systemCode?: unknown; name?: unknown });
  const names = [...new Set(committees.map(c => text(c?.name)).filter(Boolean))];
  const title = text(m.title) || names[0] || "";
  if (!eventId || !congress || !chamber || !startsAt || !title) return null;
  const codes = [...new Set(committees.map(c => committeeIdFromSystemCode(text(c?.systemCode))).filter((c): c is string => !!c))];
  const related = m.relatedItems as { bills?: unknown } | undefined;
  const billIds = [...new Set(list(related?.bills).flatMap(b => {
    const x = b as { type?: unknown; number?: unknown; congress?: unknown } | null;
    const type = text(x?.type).toLowerCase().replace(/[.\s]/g, ""), number = Number(text(x?.number)), c = Number(x?.congress) || congress;
    return BILL_TYPES.has(type) && Number.isInteger(number) && number > 0 ? [`${c}-${type}-${number}`] : [];
  }))];
  return { id: meetingId(congress, chamber, eventId), eventId, congress, chamber, committeeCodes: codes, committeeName: names.join("; ") || null, title,
    meetingType: text(m.type) || null, status: text(m.meetingStatus) || null, startsAt, location: locationOf(m.location), billIds, url: meetingPageUrl(congress, chamber, eventId) };
}

/**
 * Which listed meetings need their detail read this run: those never stored, or updated since they were stored.
 * Most recently updated first, at most `cap`. `stored` maps a meeting id to when it was last retrieved (ms).
 */
export function detailsDue(items: readonly MeetingListItem[], stored: ReadonlyMap<string, number>, congress: number, chamber: "house" | "senate", cap: number): MeetingListItem[] {
  return items.filter(i => {
    const at = stored.get(meetingId(i.congress ?? congress, i.chamber ?? chamber, i.eventId));
    return at === undefined || (i.updateDate !== null && Date.parse(i.updateDate) > at);
  }).sort((a, b) => (b.updateDate ?? "").localeCompare(a.updateDate ?? "")).slice(0, Math.max(0, cap));
}

/** Upcoming: from now (with three hours' grace for a meeting under way) to `days` ahead. */
export const MEETING_WINDOW_DAYS = 21;
export function isUpcoming(startsAt: string, now: number, days = MEETING_WINDOW_DAYS) {
  const t = Date.parse(startsAt);
  return Number.isFinite(t) && t >= now - 3 * 3600e3 && t <= now + days * 86400e3;
}

/** What kind of meeting it is, in plain words. Senate meetings are all listed as "Meeting". */
export function meetingKindLine(type: string | null | undefined): string {
  const t = String(type ?? "").toLowerCase();
  if (t === "hearing") return "Hearing: members question witnesses";
  if (t === "markup") return "Markup: the committee debates, changes and votes on bills";
  return "Committee meeting";
}
/** "Canceled", "Postponed", "Rescheduled", or null for a meeting that is going ahead as listed. */
export function meetingStatusNote(status: string | null | undefined): string | null {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "canceled" || s === "cancelled" ? "Canceled" : s === "postponed" ? "Postponed" : s === "rescheduled" ? "Rescheduled" : null;
}

/** "119-hr-1532" → "H.R. 1532". */
export function billIdLabel(id: string): string {
  const m = id.match(/^\d+-([a-z]+)-(\d+)$/);
  const names: Record<string, string> = { hr: "H.R.", s: "S.", hres: "H.Res.", sres: "S.Res.", hjres: "H.J.Res.", sjres: "S.J.Res.", hconres: "H.Con.Res.", sconres: "S.Con.Res." };
  return m ? `${names[m[1]] ?? m[1].toUpperCase()} ${m[2]}` : id;
}
