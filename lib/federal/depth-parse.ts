/**
 * Round A parsers (federal data depth). Pure; tested in tests/depth.test.mjs
 * against fixtures written from each source's published format. Every parser
 * is defensive: unknown shapes give an empty result, never a throw, and the
 * ingest step reports counts on the health probe so a format change shows up
 * as a number, not as silent bad data.
 */
// Self-contained (no imports) so node's test runner can load it directly; decode and normalizeBillRef
// mirror lib/federal/parse.ts.
type BillRef = { id: string; congress: number; billType: string; number: number };
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(code) ? String.fromCodePoint(code) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const BILL_PREFIXES: Array<[string, string]> = [["HCONRES", "hconres"], ["HJRES", "hjres"], ["HRES", "hres"], ["HR", "hr"],
  ["SCONRES", "sconres"], ["SJRES", "sjres"], ["SRES", "sres"], ["S", "s"]];
export function normalizeBillRef(label: string | null | undefined, congress: number): BillRef | null {
  if (!label) return null;
  const compact = label.toUpperCase().replace(/[.\s]/g, "");
  for (const [prefix, billType] of BILL_PREFIXES) {
    const m = compact.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) { const number = Number(m[1]); return { id: `${congress}-${billType}-${number}`, congress, billType, number }; }
  }
  return null;
}

/* ---------------------------------------------------------- Bill actions --- */

export type BillAction = { seq: number; actionDate: string; text: string; type: string | null; actionCode: string | null; chamber: "house" | "senate" | null;
  committees: string[]; rollCalls: Array<{ chamber: string; rollNumber: number; session: number | null; date: string | null }> };

type RawAction = { actionCode?: string; actionDate?: string; text?: string; type?: string; sourceSystem?: { code?: number; name?: string };
  committees?: Array<{ name?: string; systemCode?: string }>; recordedVotes?: Array<{ chamber?: string; rollNumber?: number; sessionNumber?: number; date?: string }> };

/** Congress.gov /bill/{c}/{t}/{n}/actions. Oldest first; seq is the position in that order. */
export function parseActions(data: unknown): BillAction[] {
  const list = (data as { actions?: RawAction[] } | null)?.actions;
  if (!Array.isArray(list)) return [];
  const rows = list.filter(a => a && typeof a.actionDate === "string" && typeof a.text === "string").map(a => {
    const src = `${a.sourceSystem?.name ?? ""}`.toLowerCase();
    const chamber = src.includes("house") ? "house" as const : src.includes("senate") ? "senate" as const : null;
    return { actionDate: a.actionDate!.slice(0, 10), text: a.text!.replace(/\s+/g, " ").trim(), type: a.type ?? null, actionCode: a.actionCode ?? null, chamber,
      committees: (a.committees ?? []).map(c => c.systemCode ?? "").filter(Boolean),
      rollCalls: (a.recordedVotes ?? []).filter(v => typeof v.rollNumber === "number").map(v => ({ chamber: String(v.chamber ?? "").toLowerCase(), rollNumber: v.rollNumber!, session: v.sessionNumber ?? null, date: v.date ?? null })) };
  });
  // Congress.gov lists newest first; keep the source order for equal dates but present oldest first.
  rows.reverse();
  rows.sort((x, y) => x.actionDate.localeCompare(y.actionDate));
  return rows.map((r, i) => ({ seq: i, ...r }));
}

export type StageKey = "introduced" | "committee" | "passed_first" | "passed_second" | "resolving" | "president" | "law" | "vetoed" | "failed";
export const STAGE_LABEL: Record<StageKey, string> = { introduced: "Introduced", committee: "In committee", passed_first: "Passed first chamber",
  passed_second: "Passed second chamber", resolving: "Resolving differences", president: "Sent to the President", law: "Became law", vetoed: "Vetoed", failed: "Failed a vote" };

/** One action's stage, or null for actions that do not move the bill (cosponsor changes, notices). */
export function stageOf(a: Pick<BillAction, "text" | "type">): StageKey | null {
  const t = a.text.toLowerCase(), type = (a.type ?? "").toLowerCase();
  if (type === "becamelaw" || /became public law|became private law/.test(t)) return "law";
  if (type === "veto" || /vetoed by (the )?president|pocket veto/.test(t)) return "vetoed";
  if (/presented to (the )?president/.test(t) || (type === "president" && !/signed/.test(t))) return "president";
  if (/signed by (the )?president/.test(t)) return "law";
  if (type === "resolvingdifferences" || /conference report|resolving differences|agreed? to the (house|senate) amendment|concur(red)? in the (house|senate) amendment/.test(t)) return "resolving";
  if (/not agreed to|failed of passage|on passage failed|motion to suspend the rules and pass.*failed/.test(t)) return /amendment/.test(t) && !/passage/.test(t) ? null : "failed";
  // "Passed/agreed to in House: …" is Congress.gov's passage action (it can mention an amendment: "Passed Senate with an amendment").
  if (/^passed\/agreed to in (house|senate)/.test(t)) return "passed_first";
  const notPassage = /\bamendment\b|motion to (table|proceed|recommit|reconsider)|cloture/.test(t);
  if (!notPassage && ((/(passed|agreed to) (in|by) (the )?(house|senate)/.test(t)) || /on passage passed|motion to suspend the rules and pass the bill.*(agreed to|passed)/.test(t))) return "passed_first";
  if (type === "committee" || /referred to (the )?(house )?(committee|subcommittee)|reported (by|to)|ordered to be reported|committee consideration|markup/.test(t)) return "committee";
  if (type === "introreferral" || /^introduced/.test(t)) return /referred/.test(t) ? "committee" : "introduced";
  return null;
}

export type Step = { key: StageKey; label: string; date: string | null; text: string | null; done: boolean };

/**
 * The status timeline: introduced → committee → passed one chamber → passed the
 * other → resolving differences (only when it happened) → President → law or veto.
 * The first passage is the first chamber; a passage in the other chamber is the second.
 */
export function lifecycle(actions: BillAction[], introducedAt: string | null = null): { steps: Step[]; current: StageKey } {
  const hit = new Map<StageKey, BillAction>();
  let firstChamber: string | null = null;
  for (const a of actions) {
    let s = stageOf(a);
    if (!s) continue;
    if (s === "passed_first") {
      const chamber = a.chamber ?? (/senate/i.test(a.text) ? "senate" : /house/i.test(a.text) ? "house" : null);
      if (!firstChamber) firstChamber = chamber ?? "first";
      else if (chamber && chamber !== firstChamber) s = "passed_second";
      else continue;
    }
    if (!hit.has(s)) hit.set(s, a);
  }
  const order: StageKey[] = ["introduced", "committee", "passed_first", "passed_second", "resolving", "president", hit.has("vetoed") ? "vetoed" : "law"];
  const lastDone = Math.max(...order.map((k, i) => (hit.has(k) || (k === "introduced" && introducedAt) ? i : -1)));
  const steps = order.filter(k => k !== "resolving" || hit.has("resolving")).map(k => {
    const a = hit.get(k), i = order.indexOf(k);
    return { key: k, label: STAGE_LABEL[k], date: a?.actionDate ?? (k === "introduced" ? introducedAt : null), text: a?.text ?? null, done: !!a || i <= lastDone };
  });
  const current = [...steps].reverse().find(s => s.done)?.key ?? "introduced";
  return { steps, current: hit.has("failed") && current === "committee" ? "failed" : current };
}

/* ------------------------------------------------------------ Amendments --- */

export type Amendment = { id: string; congress: number; chamber: "house" | "senate"; number: number; description: string | null; purpose: string | null;
  latestActionDate: string | null; latestActionText: string | null; outcome: "adopted" | "failed" | "withdrawn" | "pending" };

export function amendmentOutcome(text: string | null | undefined): Amendment["outcome"] {
  const t = String(text ?? "").toLowerCase();
  if (/withdrawn/.test(t)) return "withdrawn";
  if (/not agreed to|failed|rejected|tabled|fell when|ruled out of order|point of order sustained/.test(t)) return "failed";
  if (/agreed to|adopted|passed/.test(t)) return "adopted";
  return "pending";
}

type RawAmendment = { congress?: number; number?: string | number; type?: string; description?: string; purpose?: string; latestAction?: { actionDate?: string; text?: string } };
/** Congress.gov /bill/.../amendments (list) or /amendment/{c}/{t}/{n} (detail under "amendment"). */
export function parseAmendments(data: unknown): Amendment[] {
  const d = data as { amendments?: RawAmendment[]; amendment?: RawAmendment } | null;
  const list = Array.isArray(d?.amendments) ? d!.amendments : d?.amendment ? [d.amendment] : [];
  return list.flatMap(a => {
    const type = String(a.type ?? "").toLowerCase(), n = Number(a.number);
    if (!a.congress || !Number.isFinite(n) || !/^(hamdt|samdt|suamdt)$/.test(type)) return [];
    const clean = (s: string | undefined) => (s ? s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null : null);
    return [{ id: `${a.congress}-${type}-${n}`, congress: a.congress, chamber: type === "hamdt" ? "house" as const : "senate" as const, number: n,
      description: clean(a.description), purpose: clean(a.purpose), latestActionDate: a.latestAction?.actionDate ?? null, latestActionText: clean(a.latestAction?.text),
      outcome: amendmentOutcome(a.latestAction?.text) }];
  });
}
/** One plain line for an amendment: its stated purpose, else its description, else its number. */
export function amendmentLine(a: Pick<Amendment, "purpose" | "description" | "chamber" | "number">) {
  const s = a.purpose ?? a.description;
  if (!s) return `${a.chamber === "house" ? "House" : "Senate"} amendment ${a.number}`;
  const one = s.split(/(?<=\.)\s/)[0];
  return one.length > 180 ? `${one.slice(0, 177).replace(/\s+\S*$/, "")}…` : one;
}

/* --------------------------------------------------------- Text versions --- */

export type TextVersion = { type: string; date: string | null; xmlUrl: string | null; htmlUrl: string | null; pdfUrl: string | null };
/** Congress.gov /bill/.../text. Oldest first. */
export function parseTextVersions(data: unknown): TextVersion[] {
  const list = (data as { textVersions?: Array<{ type?: string; date?: string | null; formats?: Array<{ type?: string; url?: string }> }> } | null)?.textVersions;
  if (!Array.isArray(list)) return [];
  const rows = list.filter(v => v?.type).map(v => {
    const f = (re: RegExp) => v.formats?.find(x => re.test(String(x.type ?? "")))?.url ?? null;
    return { type: v.type!, date: v.date ? v.date.slice(0, 10) : null, xmlUrl: f(/xml/i), htmlUrl: f(/formatted text|htm/i), pdfUrl: f(/pdf/i) };
  });
  return rows.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

/** Section-level comparison of two versions (Official, computed): added, removed and changed section numbers. */
export function compareSections(before: Array<{ number: string; text?: string }>, after: Array<{ number: string; text?: string }>) {
  const norm = (t?: string) => (t ?? "").replace(/\s+/g, " ").trim();
  const b = new Map(before.map(s => [s.number, norm(s.text)])), a = new Map(after.map(s => [s.number, norm(s.text)]));
  return { added: [...a.keys()].filter(k => !b.has(k)), removed: [...b.keys()].filter(k => !a.has(k)),
    changed: [...a.keys()].filter(k => b.has(k) && b.get(k) !== a.get(k)) };
}

/* ------------------------------------------------------------ Committees --- */

export const COMMITTEES_URL = "https://unitedstates.github.io/congress-legislators/committees-current.json";
export const COMMITTEE_MEMBERSHIP_URL = "https://unitedstates.github.io/congress-legislators/committee-membership-current.json";
export type Committee = { id: string; chamber: "house" | "senate" | "joint"; name: string; parentId: string | null; url: string | null };
export function parseCommittees(data: unknown): Committee[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((c: { type?: string; name?: string; thomas_id?: string; url?: string; subcommittees?: Array<{ name?: string; thomas_id?: string }> }) => {
    if (!c?.thomas_id || !c.name) return [];
    const chamber = c.type === "senate" ? "senate" as const : c.type === "joint" ? "joint" as const : "house" as const;
    const parent = { id: c.thomas_id, chamber, name: c.name, parentId: null, url: c.url ?? null };
    const subs = (c.subcommittees ?? []).filter(s => s?.thomas_id && s.name).map(s => ({ id: `${c.thomas_id}${s.thomas_id}`, chamber, name: s.name!, parentId: c.thomas_id!, url: null }));
    return [parent, ...subs];
  });
}
export type CommitteeMember = { committeeId: string; politicianId: string; side: "majority" | "minority" | null; rank: number | null; title: string | null };
export function parseCommitteeMembership(data: unknown): CommitteeMember[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>).flatMap(([committeeId, members]) => Array.isArray(members)
    ? members.flatMap((m: { bioguide?: string; party?: string; rank?: number; title?: string }) => m?.bioguide ? [{ committeeId, politicianId: m.bioguide,
      side: m.party === "majority" || m.party === "minority" ? m.party : null, rank: typeof m.rank === "number" ? m.rank : null, title: m.title ?? null }] : [])
    : []);
}
/** Congress.gov committee system codes ("hsag00", "ssfi10") to committees-current ids ("HSAG", "SSFI10"). */
export function committeeIdFromSystemCode(code: string) {
  const m = code.toUpperCase().match(/^([HSJ][A-Z]{3})(\d{2})$/);
  return m ? (m[2] === "00" ? m[1] : `${m[1]}${m[2]}`) : null;
}

/* -------------------------------------------------------- Floor schedule --- */

export type FloorItem = { chamber: "house" | "senate"; billId: string | null; label: string; description: string | null };
/** Monday of the week (UTC date) as YYYYMMDD, the House floor file name. */
export function weekOf(ms: number) {
  const d = new Date(ms), day = d.getUTCDay(), monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((day + 6) % 7)));
  return monday.toISOString().slice(0, 10).replace(/-/g, "");
}
export const houseFloorUrl = (week: string) => `https://docs.house.gov/floor/Download.aspx?file=/billsthisweek/${week}/${week}.xml`;
export const SENATE_FLOOR_URL = "https://www.senate.gov/legislative/schedule/floor_schedule.htm";

/** docs.house.gov weekly XML: <floor-item><legis-num>H.R. 1234</legis-num><floor-text>…</floor-text></floor-item>. */
export function parseHouseFloor(xml: string, congress: number): FloorItem[] {
  const items = xml.match(/<floor-item\b[\s\S]*?<\/floor-item>/gi) ?? [];
  const seen = new Set<string>();
  return items.flatMap(block => {
    const label = decode((block.match(/<legis-num[^>]*>([\s\S]*?)<\/legis-num>/i)?.[1] ?? "").replace(/<[^>]+>/g, "")).trim();
    if (!label || seen.has(label)) return [];
    seen.add(label);
    const text = decode((block.match(/<floor-text[^>]*>([\s\S]*?)<\/floor-text>/i)?.[1] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() || null;
    return [{ chamber: "house" as const, billId: normalizeBillRef(label, congress)?.id ?? null, label, description: text }];
  });
}

const BILL_IN_TEXT = /\b(H\.\s?R\.|S\.|H\.\s?J\.\s?Res\.|S\.\s?J\.\s?Res\.|H\.\s?Res\.|S\.\s?Res\.|H\.\s?Con\.\s?Res\.|S\.\s?Con\.\s?Res\.)\s?(\d{1,5})\b/g;
/** Bill numbers named on the Senate floor schedule page (HTML), each once, with the sentence around it. */
export function parseSenateFloor(html: string, congress: number): FloorItem[] {
  const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const seen = new Set<string>(), out: FloorItem[] = [];
  for (const m of text.matchAll(BILL_IN_TEXT)) {
    const ref: BillRef | null = normalizeBillRef(`${m[1]}${m[2]}`, congress);
    if (!ref || seen.has(ref.id)) continue;
    seen.add(ref.id);
    const start = Math.max(0, text.lastIndexOf(".", m.index!) + 1), end = text.indexOf(".", m.index! + m[0].length + 1);
    out.push({ chamber: "senate", billId: ref.id, label: m[0].replace(/\s+/g, " "), description: text.slice(start, end > 0 ? end + 1 : undefined).trim().slice(0, 300) || null });
  }
  return out;
}

/* --------------------------------------------------- Census geographies --- */

export type Districts = { state: string; congressional: string | null; stateUpper: string | null; stateLower: string | null; matchedAddress: string | null };
/** All districts for one Census geocoder address match: "TX-07", state senate "TX-SD-14", state house "TX-HD-049". */
export function districtsFromCensus(match: unknown): Districts | null {
  const m = match as { matchedAddress?: string; geographies?: Record<string, Array<Record<string, unknown>>> } | null;
  const g = m?.geographies;
  if (!g) return null;
  const state = String(g["States"]?.[0]?.["STUSAB"] ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) return null;
  const layer = (re: RegExp) => Object.entries(g).find(([k]) => re.test(k))?.[1]?.[0];
  const cd = layer(/Congressional Districts/i), up = layer(/State Legislative Districts\s*-\s*Upper/i), low = layer(/State Legislative Districts\s*-\s*Lower/i);
  const code = (row: Record<string, unknown> | undefined, re: RegExp) => { if (!row) return null; const v = Object.entries(row).find(([k]) => re.test(k))?.[1]; return v == null ? null : String(v); };
  const cdCode = code(cd, /^CD\d{3}$/);
  const congressional = cdCode && /^\d{1,2}$/.test(cdCode) ? `${state}-${cdCode === "00" || cdCode === "98" ? "AL" : cdCode.padStart(2, "0")}` : null;
  const su = code(up, /^SLDU$/) ?? code(up, /^BASENAME$/), sl = code(low, /^SLDL$/) ?? code(low, /^BASENAME$/);
  const num = (v: string | null) => (v && /^\d+$/.test(v) ? String(Number(v)) : v && v !== "ZZZ" ? v : null);
  return { state, congressional, stateUpper: num(su) ? `${state}-SD-${num(su)}` : null, stateLower: num(sl) ? `${state}-HD-${num(sl)}` : null, matchedAddress: m?.matchedAddress ?? null };
}

/* ---------------------------------------------------------- ZIP → state --- */

// USPS three-digit ZIP prefixes by state (first three digits, inclusive ranges). A border ZIP can
// cross states; the lookup says so and asks for a street address for the exact district.
const ZIP3: Array<[number, number, string]> = [[5, 5, "NY"], [6, 7, "PR"], [8, 8, "VI"], [9, 9, "PR"], [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"],
  [50, 54, "VT"], [55, 55, "MA"], [56, 59, "VT"], [60, 69, "CT"], [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"], [200, 200, "DC"], [201, 201, "VA"],
  [202, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"], [270, 289, "NC"], [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"],
  [370, 385, "TN"], [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"], [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"],
  [550, 567, "MN"], [569, 569, "DC"], [570, 577, "SD"], [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"], [660, 679, "KS"], [680, 693, "NE"],
  [700, 714, "LA"], [716, 729, "AR"], [730, 732, "OK"], [733, 733, "TX"], [734, 749, "OK"], [750, 799, "TX"], [800, 816, "CO"], [820, 831, "WY"], [832, 838, "ID"],
  [840, 847, "UT"], [850, 865, "AZ"], [870, 884, "NM"], [885, 885, "TX"], [889, 898, "NV"], [900, 961, "CA"], [967, 968, "HI"], [969, 969, "GU"], [970, 979, "OR"],
  [980, 994, "WA"], [995, 999, "AK"]];
export function stateForZip(zip: string): string | null {
  if (!/^\d{5}(-\d{4})?$/.test(zip.trim())) return null;
  const p = Number(zip.trim().slice(0, 3));
  return ZIP3.find(([a, b]) => p >= a && p <= b)?.[2] ?? null;
}

/* -------------------------------------------------------- Tally integrity --- */

export type Tally = { yea: number; nay: number; present: number; notVoting: number };
/** Official totals against the member votes stored for the roll call. Empty array when they agree. */
export function tallyMismatches(official: Tally, counted: Partial<Record<"Yea" | "Nay" | "Present" | "Not Voting", number>>) {
  const pairs: Array<[keyof Tally, "Yea" | "Nay" | "Present" | "Not Voting"]> = [["yea", "Yea"], ["nay", "Nay"], ["present", "Present"], ["notVoting", "Not Voting"]];
  return pairs.filter(([o, c]) => (official[o] ?? 0) !== (counted[c] ?? 0)).map(([o, c]) => ({ field: o, official: official[o] ?? 0, counted: counted[c] ?? 0 }));
}
