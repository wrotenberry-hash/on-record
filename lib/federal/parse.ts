/**
 * Pure parsers for the federal official record. No database, no network, no
 * relative imports (so node --test can load this file directly). Every format
 * here was checked against live responses on 2026-11-13 (see
 * docs/TALK_IS_CHEAP_PLAN.md, "Data sources").
 */

export type Position = "Yea" | "Nay" | "Present" | "Not Voting";
export type Chamber = "house" | "senate";

export type ParsedRollCall = {
  id: string; chamber: Chamber; congress: number; session: number; rollNumber: number; votedAt: number;
  question: string; title: string | null; result: string | null; documentLabel: string | null;
  bill: BillRef | null; yea: number; nay: number; present: number; notVoting: number; sourceUrl: string;
  /** Members keyed by the chamber's own id: bioguide for the House, LIS for the Senate. */
  members: Array<{ memberKey: string; position: Position; rawPosition: string }>;
};

export type BillRef = { id: string; congress: number; billType: string; number: number };

/* ---------------------------------------------------------------- XML ---- */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(code) ? String.fromCodePoint(code) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const clean = (s: string) => decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(/\s+/g, " ").trim();

/** Text of the first <name>…</name> (or "" for <name/>), or null when absent. */
export function tag(xml: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${name}>)`);
  const m = xml.match(re);
  return m ? clean(m[1] ?? "") : null;
}
/** Raw inner XML of every <name>…</name>. */
export function blocks(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g");
  return [...xml.matchAll(re)].map(m => m[1]);
}
export function attr(xml: string, element: string, attribute: string): string | null {
  const m = xml.match(new RegExp(`<${element}\\s[^>]*?${attribute}="([^"]*)"`));
  return m ? decode(m[1]) : null;
}
const int = (s: string | null | undefined) => { const n = parseInt((s ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : 0; };

/* --------------------------------------------------------------- Time ---- */

/** Congress number and session for a calendar year (119th: 2025 session 1, 2026 session 2). */
export function congressForYear(year: number): number { return Math.floor((year - 1789) / 2) + 1; }
export function sessionForYear(year: number): number { return year % 2 === 1 ? 1 : 2; }

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Wall-clock time in Washington (America/New_York) to UTC milliseconds, daylight saving included. */
export function easternToUtc(year: number, month: number, day: number, hour = 12, minute = 0): number {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", hour: "2-digit", day: "2-digit" });
  for (const offset of [4, 5]) {
    const t = Date.UTC(year, month - 1, day, hour + offset, minute);
    const parts = Object.fromEntries(fmt.formatToParts(new Date(t)).map(p => [p.type, p.value]));
    if (Number(parts.hour) === hour && Number(parts.day) === day) return t;
  }
  return Date.UTC(year, month - 1, day, hour + 5, minute);
}

/* ----------------------------------------------------------- Positions --- */

const POSITIONS: Record<string, Position> = { yea: "Yea", aye: "Yea", nay: "Nay", no: "Nay", present: "Present", "not voting": "Not Voting" };
/** Chamber vote words to one vocabulary. Anything else (a Speaker-election name, "Guilty") keeps its raw word and is stored as Present. */
export function normalizePosition(raw: string): Position { return POSITIONS[raw.trim().toLowerCase()] ?? "Present"; }

/* --------------------------------------------------------------- Bills --- */

const BILL_PREFIXES: Array<[string, string]> = [["HCONRES", "hconres"], ["HJRES", "hjres"], ["HRES", "hres"], ["HR", "hr"],
  ["SCONRES", "sconres"], ["SJRES", "sjres"], ["SRES", "sres"], ["S", "s"]];

/** "H R 2102", "H.R. 2347", "S.J.Res. 4", "H RES 1247" → a bill reference; nominations, quorum calls and the like → null. */
export function normalizeBillRef(label: string | null | undefined, congress: number): BillRef | null {
  if (!label) return null;
  const compact = label.toUpperCase().replace(/[.\s]/g, "");
  for (const [prefix, billType] of BILL_PREFIXES) {
    const m = compact.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) { const number = Number(m[1]); return { id: `${congress}-${billType}-${number}`, congress, billType, number }; }
  }
  return null;
}

const CONGRESS_GOV_PATH: Record<string, string> = { hr: "house-bill", s: "senate-bill", hres: "house-resolution", sres: "senate-resolution",
  hjres: "house-joint-resolution", sjres: "senate-joint-resolution", hconres: "house-concurrent-resolution", sconres: "senate-concurrent-resolution" };
function ordinal(n: number) { const s = ["th", "st", "nd", "rd"], v = n % 100; return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`; }
/** The bill's public page on congress.gov. */
export function congressGovPage(ref: BillRef): string {
  return `https://www.congress.gov/bill/${ordinal(ref.congress)}-congress/${CONGRESS_GOV_PATH[ref.billType] ?? "house-bill"}/${ref.number}`;
}
/** Bill types shown on issue pages: measures that can become law, not chamber rules or simple resolutions. */
export const LAWMAKING_TYPES = ["hr", "s", "hjres", "sjres"] as const;

/* --------------------------------------------------------------- House --- */

export function houseRollUrl(year: number, roll: number): string { return `https://clerk.house.gov/evs/${year}/roll${String(roll).padStart(3, "0")}.xml`; }

/** A House Clerk roll-call file, or null when the body is not a roll call (the Clerk answers 200 with an error body for missing rolls). */
export function parseHouseRoll(xml: string, sourceUrl: string): ParsedRollCall | null {
  if (!/<rollcall-vote[\s>]/.test(xml)) return null;
  const meta = blocks(xml, "vote-metadata")[0] ?? xml;
  const congress = int(tag(meta, "congress")), session = int(tag(meta, "session")), rollNumber = int(tag(meta, "rollcall-num"));
  const date = (tag(meta, "action-date") ?? "").match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  const time = (attr(meta, "action-time", "time-etz") ?? "12:00").match(/(\d{1,2}):(\d{2})/);
  if (!congress || !rollNumber || !date) return null;
  const year = Number(date[3]);
  const votedAt = easternToUtc(year, MONTHS[date[2].toLowerCase()] ?? 1, Number(date[1]), time ? Number(time[1]) : 12, time ? Number(time[2]) : 0);
  const totals = blocks(meta, "totals-by-vote")[0] ?? "";
  const legis = tag(meta, "legis-num");
  const members = blocks(xml, "recorded-vote").flatMap(rv => {
    const key = attr(rv, "legislator", "name-id"); const raw = tag(rv, "vote") ?? "";
    return key ? [{ memberKey: key, position: normalizePosition(raw), rawPosition: raw }] : [];
  });
  return { id: `house-${year}-${rollNumber}`, chamber: "house", congress, session: session || sessionForYear(year), rollNumber, votedAt,
    question: tag(meta, "vote-question") || tag(meta, "vote-type") || "Recorded vote", title: tag(meta, "vote-desc") || null,
    result: tag(meta, "vote-result") || null, documentLabel: legis || null, bill: normalizeBillRef(legis, congress),
    yea: int(tag(totals, "yea-total")), nay: int(tag(totals, "nay-total")), present: int(tag(totals, "present-total")),
    notVoting: int(tag(totals, "not-voting-total")), sourceUrl, members };
}

/* -------------------------------------------------------------- Senate --- */

export function senateMenuUrl(congress: number, session: number): string { return `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`; }
export function senateVoteUrl(congress: number, session: number, vote: number): string {
  return `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${String(vote).padStart(5, "0")}.xml`;
}

/** Vote numbers listed for the session, newest first as the Senate lists them. */
export function parseSenateMenu(xml: string): { congress: number; session: number; voteNumbers: number[] } {
  return { congress: int(tag(xml, "congress")), session: int(tag(xml, "session")),
    voteNumbers: blocks(blocks(xml, "votes")[0] ?? "", "vote").map(v => int(tag(v, "vote_number"))).filter(n => n > 0) };
}

export function parseSenateVote(xml: string, sourceUrl: string): ParsedRollCall | null {
  if (!/<roll_call_vote[\s>]/.test(xml)) return null;
  const congress = int(tag(xml, "congress")), session = int(tag(xml, "session")), rollNumber = int(tag(xml, "vote_number"));
  const d = (tag(xml, "vote_date") ?? "").match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4}),?\s+(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!congress || !rollNumber || !d) return null;
  let hour = Number(d[4]) % 12; if (d[6].toUpperCase() === "PM") hour += 12;
  const votedAt = easternToUtc(Number(d[3]), MONTHS[d[1].slice(0, 3).toLowerCase()] ?? 1, Number(d[2]), hour, Number(d[5]));
  const doc = blocks(xml, "document")[0] ?? "";
  const docType = tag(doc, "document_type") ?? "", docNumber = tag(doc, "document_number") ?? "";
  const documentLabel = tag(doc, "document_name") || (docType || docNumber ? `${docType} ${docNumber}`.trim() : null);
  const count = blocks(xml, "count")[0] ?? "";
  const members = blocks(blocks(xml, "members")[0] ?? "", "member").flatMap(m => {
    const key = tag(m, "lis_member_id"); const raw = tag(m, "vote_cast") ?? "";
    return key ? [{ memberKey: key, position: normalizePosition(raw), rawPosition: raw }] : [];
  });
  return { id: `senate-${congress}-${session}-${rollNumber}`, chamber: "senate", congress, session, rollNumber, votedAt,
    question: tag(xml, "question") || tag(xml, "vote_question_text") || "Recorded vote",
    title: tag(xml, "vote_title") || tag(doc, "document_title") || null, result: tag(xml, "vote_result") || null,
    documentLabel, bill: normalizeBillRef(`${docType}${docNumber}`, Number(tag(doc, "document_congress")) || congress),
    yea: int(tag(count, "yeas")), nay: int(tag(count, "nays")), present: int(tag(count, "present")), notVoting: int(tag(count, "absent")),
    sourceUrl, members };
}

/* --------------------------------------------------------- Legislators --- */

export const LEGISLATORS_URL = "https://unitedstates.github.io/congress-legislators/legislators-current.json";

export type ParsedPolitician = { id: string; lisId: string | null; govtrackId: number | null; fullName: string; firstName: string; lastName: string;
  party: string; state: string; district: number | null; chamber: Chamber; termStart: string | null; termEnd: string | null; officialUrl: string | null };

type LegislatorJson = { id?: { bioguide?: string; lis?: string; govtrack?: number }; name?: { first?: string; last?: string; official_full?: string };
  terms?: Array<{ type?: string; start?: string; end?: string; state?: string; district?: number; party?: string; url?: string }> };

/** The congress-legislators "current" file, one row per sitting member, from each member's latest term. */
export function parseLegislators(data: unknown): ParsedPolitician[] {
  if (!Array.isArray(data)) return [];
  return (data as LegislatorJson[]).flatMap(p => {
    const term = p.terms?.[p.terms.length - 1]; const id = p.id?.bioguide;
    if (!term || !id || (term.type !== "sen" && term.type !== "rep") || !term.state) return [];
    const first = p.name?.first ?? "", last = p.name?.last ?? "";
    return [{ id, lisId: p.id?.lis ?? null, govtrackId: p.id?.govtrack ?? null, fullName: p.name?.official_full || `${first} ${last}`.trim(),
      firstName: first, lastName: last, party: term.party ?? "Unknown", state: term.state, district: term.type === "rep" ? term.district ?? null : null,
      chamber: term.type === "sen" ? "senate" : "house", termStart: term.start ?? null, termEnd: term.end ?? null, officialUrl: term.url ?? null } as ParsedPolitician];
  });
}

/* ------------------------------------------------------- Congress.gov ---- */

/** Overridable only so a local test can stand in for Congress.gov; production uses the real API. */
export const CONGRESS_API = (typeof process !== "undefined" && process.env?.CONGRESS_API_BASE?.trim()) || "https://api.congress.gov/v3";
export function congressBillApi(ref: BillRef, suffix = ""): string { return `${CONGRESS_API}/bill/${ref.congress}/${ref.billType}/${ref.number}${suffix}?format=json`; }
export function congressRecentBillsApi(congress: number, limit = 100): string { return `${CONGRESS_API}/bill/${congress}?format=json&sort=updateDate+desc&limit=${limit}`; }

export type ParsedBillDetail = { title: string | null; policyArea: string | null; introducedAt: string | null;
  latestActionText: string | null; latestActionAt: string | null; sponsorId: string | null };

type CongressBill = { title?: string; policyArea?: { name?: string } | null; introducedDate?: string;
  latestAction?: { actionDate?: string; text?: string }; sponsors?: Array<{ bioguideId?: string }> };

export function parseCongressBill(data: unknown): ParsedBillDetail | null {
  const bill = (data as { bill?: CongressBill } | null)?.bill;
  if (!bill) return null;
  return { title: bill.title ?? null, policyArea: bill.policyArea?.name ?? null, introducedAt: bill.introducedDate ?? null,
    latestActionText: bill.latestAction?.text ?? null, latestActionAt: bill.latestAction?.actionDate ?? null, sponsorId: bill.sponsors?.[0]?.bioguideId ?? null };
}

export function parseCongressSubjects(data: unknown): { policyArea: string | null; subjects: string[] } {
  const s = (data as { subjects?: { legislativeSubjects?: Array<{ name?: string }>; policyArea?: { name?: string } } } | null)?.subjects;
  return { policyArea: s?.policyArea?.name ?? null, subjects: (s?.legislativeSubjects ?? []).map(x => x.name ?? "").filter(Boolean) };
}

export function parseCongressBillList(data: unknown): Array<{ ref: BillRef; title: string; latestActionAt: string | null; latestActionText: string | null }> {
  const list = (data as { bills?: Array<{ congress?: number; type?: string; number?: string | number; title?: string; latestAction?: { actionDate?: string; text?: string } }> } | null)?.bills ?? [];
  return list.flatMap(b => {
    const ref = b.congress ? normalizeBillRef(`${b.type ?? ""}${b.number ?? ""}`, b.congress) : null;
    return ref ? [{ ref, title: b.title ?? `${b.type} ${b.number}`, latestActionAt: b.latestAction?.actionDate ?? null, latestActionText: b.latestAction?.text ?? null }] : [];
  });
}
