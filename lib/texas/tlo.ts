/**
 * Texas Legislature Online (capitol.texas.gov), the source of record. Pure: official page addresses for a bill, a
 * hearing and a member, and the parsers for the daily spot check that compares a few bills' last action on TLO with
 * what the feed gave us. Imports only ./parse.ts and ./calendar.ts; tested in tests/texas-tlo.test.mjs.
 *
 * Page structure read from the live site on 17 Nov 2026 (BillLookup/History.aspx, Members/Members.aspx,
 * Committees/CommitteesMbrs.aspx, Committees/MeetingsByCmte.aspx). A bill or session TLO does not have answers with a
 * redirect to /home.aspx; a member code it does not know redirects to /ErrorPage.aspx.
 */
import { TX_SESSIONS, txBillNumber, type TxSession } from "./parse.ts";
import { tloSessionCode } from "./calendar.ts";

export const TLO = "https://capitol.texas.gov";
const enc = encodeURIComponent;
const tloSess = (sessionId: string) => TX_SESSIONS.find(s => s.id === sessionId)?.tlo ?? tloSessionCode(sessionId);
/** The legislature number of a session id: "90" → 90, "892" → 89. */
const legOf = (sessionId: string) => Number(sessionId.slice(0, 2));

/* ------------------------------------------------------------------ Bills --- */

/** "HB 1" in session "89" → the history, text and actions pages on TLO. */
export function tloBillPages(sessionId: string, identifier: string) {
  const q = `LegSess=${enc(tloSess(sessionId))}&Bill=${enc(txBillNumber(identifier).replace(/\s+/g, ""))}`;
  return { history: `${TLO}/BillLookup/History.aspx?${q}`, text: `${TLO}/BillLookup/Text.aspx?${q}`, actions: `${TLO}/BillLookup/Actions.aspx?${q}` };
}

const decode = (s: string) => s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'")
  .replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();
const span = (html: string, id: string) => { const m = html.match(new RegExp(`<span id="${id}">([\\s\\S]*?)</span>`, "i")); return m ? decode(m[1]) : null; };
const mdy = (s: string) => { const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null; };
const chamberOf = (c: string): "upper" | "lower" | "executive" | null => (c === "S" ? "upper" : c === "H" ? "lower" : c === "E" ? "executive" : null);

export type TloAction = { chamber: "upper" | "lower" | "executive" | null; description: string; date: string; time: string | null };
export type TloHistory = { found: boolean; title: string | null; caption: string | null; lastAction: { date: string; chamber: "upper" | "lower" | "executive" | null; text: string } | null; actions: TloAction[] };
/** One bill's History.aspx page. `found` is false for anything that is not a bill history (a redirect body, an error page). */
export function parseTloHistory(html: string): TloHistory {
  const raw = span(html, "lblLastAction"), title = html.match(/<h1>(History for [^<]+)<\/h1>/i)?.[1]?.trim() ?? null;
  if (raw == null && !title) return { found: false, title: null, caption: null, lastAction: null, actions: [] };
  // "02/25/2025 H Referred to Appropriations: Feb 25 2025  3:35PM"
  const m = raw?.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s+([HSE])\s+(.*?)(?::\s+[A-Z][a-z]{2} +\d{1,2} +\d{4} +\d{1,2}:\d{2}\s*[AP]M)?\s*$/);
  const lastAction = m ? { date: mdy(m[1])!, chamber: chamberOf(m[2]), text: m[3].trim() } : null;
  const actions: TloAction[] = [];
  for (const row of html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cell = (label: string) => { const c = row[1].match(new RegExp(`<td data-label="${label}"[^>]*>([\\s\\S]*?)</td>`, "i")); return c ? decode(c[1]) : null; };
    const desc = cell("Action Description"), date = cell("Action Date");
    if (!desc || !date || !mdy(date)) continue;
    actions.push({ chamber: chamberOf((cell("Action Chamber") ?? "").trim()), description: desc, date: mdy(date)!, time: cell("Action Time") || null });
  }
  return { found: true, title, caption: span(html, "lblCaptionText"), lastAction, actions };
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|on|committee|of)\b/g, " ").replace(/\s+/g, " ").trim();
export type LastActionCheck = "agree" | "same day, other action" | "feed behind" | "feed ahead" | "not on TLO" | "nothing stored";
/**
 * The stored last action against TLO's. Same date and same words (or one contained in the other) agree. Same date,
 * different words is reported apart: several actions often happen on one day and the two may simply list a different
 * one last. A later date on TLO means the feed is behind; a later date in the feed means TLO has not caught up.
 */
export function compareLastAction(stored: { date: string | null; description: string | null }, tlo: TloHistory): LastActionCheck {
  if (!tlo.found || !tlo.lastAction) return "not on TLO";
  if (!stored.date) return "nothing stored";
  const s = stored.date.slice(0, 10), t = tlo.lastAction.date;
  if (t > s) return "feed behind";
  if (t < s) return "feed ahead";
  const a = norm(stored.description ?? ""), b = norm(tlo.lastAction.text);
  if (a && b && (a === b || a.includes(b) || b.includes(a))) return "agree";
  // The same action may sit anywhere on that day's list on TLO.
  if (a && tlo.actions.some(x => x.date === s && (norm(x.description) === a || norm(x.description).includes(a) || a.includes(norm(x.description))))) return "agree";
  return "same day, other action";
}
/** Agreements and mismatches for the health probe. "same day, other action" is counted as agreeing on the date, apart from full agreement. */
export function tallyChecks(results: LastActionCheck[]) {
  const n = (k: LastActionCheck) => results.filter(r => r === k).length;
  return { checked: results.length, agree: n("agree"), sameDayOtherAction: n("same day, other action"), mismatches: n("feed behind") + n("feed ahead"),
    feedBehind: n("feed behind"), feedAhead: n("feed ahead"), notOnTlo: n("not on TLO"), nothingStored: n("nothing stored") };
}
/**
 * Which bills to check today: the most recently active first, rotating through them by the day so the same few are not
 * checked every time. `bills` should be ordered newest action first.
 */
export function pickSpotCheck<T>(bills: T[], day: string, n: number): T[] {
  if (!bills.length || n <= 0) return [];
  const pool = bills.slice(0, Math.max(n * 6, n)), k = Math.min(n, pool.length);
  const dayNo = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400e3) || 0, start = (dayNo * k) % pool.length;
  return Array.from({ length: k }, (_, i) => pool[(start + i) % pool.length]);
}

/* ---------------------------------------------------------------- Hearings --- */

export type TloHearing = { url: string; kind: "notice" | "committee meetings" | "upcoming meetings" };
const TLO_CHAMBER = { upper: "S", lower: "H", legislature: "J" } as const;
/**
 * The official page for a hearing. The feed's own source when it is a TLO hearing notice
 * (capitol.texas.gov/tlodocs/<session>/schedules/...); else the committee's list of meetings and notices when its TLO
 * code is known; else the chamber's upcoming meetings. A notice address is never guessed: its last digits are TLO's own.
 */
export function tloHearingUrl(i: { sourceUrl?: string | null; sessionId?: string | null; chamber?: "upper" | "lower" | "legislature" | null; committeeCode?: string | null }): TloHearing | null {
  const src = (i.sourceUrl ?? "").trim().replace(/^http:/i, "https:");
  if (/^https:\/\/capitol\.texas\.gov\/tlodocs\/[0-9A-Z]+\/schedules\//i.test(src)) return { url: src, kind: "notice" };
  const ch = i.chamber ? TLO_CHAMBER[i.chamber] : null;
  if (ch && i.committeeCode && /^C\d{3}$/i.test(i.committeeCode) && i.sessionId)
    return { url: `${TLO}/Committees/MeetingsByCmte.aspx?Leg=${legOf(i.sessionId)}&Chamber=${ch}&CmteCode=${i.committeeCode.toUpperCase()}`, kind: "committee meetings" };
  if (ch) return { url: `${TLO}/Committees/MeetingsUpcoming.aspx?Chamber=${ch}`, kind: "upcoming meetings" };
  return null;
}

/* ------------------------------------------------------- Committees and members --- */

export type TloCode = { name: string; code: string };
/** Committees/CommitteesMbrs.aspx?Chamber=H|S|J: each committee's name and TLO code (C030 = House Appropriations). */
export function parseTloCommitteeList(html: string): TloCode[] {
  const out: TloCode[] = [];
  for (const m of html.matchAll(/MembershipCmte\.aspx\?LegSess=[0-9A-Z]+&(?:amp;)?CmteCode=(C\d{3})"[^>]*>([^<]+)</gi)) out.push({ code: m[1].toUpperCase(), name: decode(m[2]) });
  return out;
}
export const tloCommitteeUrl = (sessionId: string, code: string) => `${TLO}/Committees/MembershipCmte.aspx?LegSess=${enc(tloSess(sessionId))}&CmteCode=${enc(code)}`;
/** A committee name from the feed ("House Committee on Appropriations", "Senate Finance") matched to TLO's list. */
export function matchTloCode(name: string, list: TloCode[]): string | null {
  const key = norm(name.replace(/^(house|senate|joint)\s+/i, "").replace(/^(standing\s+)?committee\s+on\s+/i, ""));
  return list.find(c => norm(c.name) === key)?.code ?? null;
}

/** Members/Members.aspx?Chamber=H|S (and &Leg=NN for an earlier legislature): each member's listed name and TLO code. */
export function parseTloMemberList(html: string): TloCode[] {
  const out: TloCode[] = [];
  for (const m of html.matchAll(/MemberInfo\.aspx\?Leg=\d+&(?:amp;)?Chamber=[HS]&(?:amp;)?Code=([A-Z0-9]+)'?"?>\s*([^<]+?)\s*</gi)) out.push({ code: m[1], name: decode(m[2]) });
  return out;
}
/**
 * A member's TLO page. TLO lists members by last name ("Lopez, Janie" where two share one), so the match is on the
 * last name, and on the first name too when the list gives one. With no single match, the chamber's member list.
 */
export function tloMemberUrl(i: { sessionId: string; chamber: "upper" | "lower"; name: string; list?: TloCode[] }): { url: string; matched: boolean } {
  const ch = i.chamber === "upper" ? "S" : "H", leg = legOf(i.sessionId);
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ,-]/g, "").trim();
  const parts = fold(i.name).replace(/,.*$/, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").trim().split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? "", first = parts[0] ?? "";
  const hits = (i.list ?? []).filter(c => { const [l, f] = fold(c.name).split(",").map(x => x.trim()); return l === last && (!f || f === first || first.startsWith(f)); });
  if (hits.length === 1) return { url: `${TLO}/Members/MemberInfo.aspx?Leg=${leg}&Chamber=${ch}&Code=${hits[0].code}`, matched: true };
  return { url: `${TLO}/Members/Members.aspx?Leg=${leg}&Chamber=${ch}`, matched: false };
}

export type { TxSession };
