/**
 * Texas Legislature parsers (Round H). Pure, no imports; tested in
 * tests/texas.test.mjs. Open States v3 is the primary feed, LegiScan the
 * fallback, and Texas Legislature Online (TLO) the source of record that every
 * bill links to. Shapes follow each API's published documentation.
 */

export const OPENSTATES_BASE = "https://v3.openstates.org";
export const LEGISCAN_BASE = "https://api.legiscan.com";

/* -------------------------------------------------------------- Sessions --- */

export type TxSession = { id: string; tlo: string; name: string; start: string; end: string | null; regular: boolean };
/** Open States session ids for Texas, with TLO's LegSess codes. Regular sessions run 140 days from the second Tuesday of January in odd years. */
export const TX_SESSIONS: TxSession[] = [
  { id: "90", tlo: "90R", name: "90th Legislature, Regular Session", start: "2027-01-12", end: "2027-05-31", regular: true },
  { id: "892", tlo: "892", name: "89th Legislature, 2nd Called Session", start: "2025-08-15", end: "2025-09-04", regular: false },
  { id: "891", tlo: "891", name: "89th Legislature, 1st Called Session", start: "2025-07-21", end: "2025-08-15", regular: false },
  { id: "89", tlo: "89R", name: "89th Legislature, Regular Session", start: "2025-01-14", end: "2025-06-02", regular: true },
  { id: "88", tlo: "88R", name: "88th Legislature, Regular Session", start: "2023-01-10", end: "2023-05-29", regular: true },
  { id: "87", tlo: "87R", name: "87th Legislature, Regular Session", start: "2021-01-12", end: "2021-05-31", regular: true },
  { id: "86", tlo: "86R", name: "86th Legislature, Regular Session", start: "2019-01-08", end: "2019-05-27", regular: true },
];
/** The session in progress on a date, else the most recent one that has started. */
export function currentTxSession(isoDate: string): { session: TxSession; inSession: boolean } {
  const started = TX_SESSIONS.filter(s => s.start <= isoDate).sort((a, b) => b.start.localeCompare(a.start));
  const session = started[0] ?? TX_SESSIONS[TX_SESSIONS.length - 1];
  return { session, inSession: !!started[0] && (!session.end || isoDate <= session.end) };
}

/* ------------------------------------------------------------- Bills --- */

export type TxStage = "filed" | "committee" | "passed_first" | "passed_both" | "governor" | "law" | "vetoed" | "failed";
export type TxAction = { order: number; date: string; description: string; chamber: "upper" | "lower" | "executive" | null; classification: string[] };
export type TxVote = { id: string; motion: string; date: string; result: string; chamber: "upper" | "lower" | null; counts: Record<string, number>;
  votes: Array<{ option: string; personId: string | null; name: string }> };
export type TxBill = { id: string; session: string; identifier: string; title: string; chamber: "upper" | "lower" | null; classification: string[]; subjects: string[];
  firstActionDate: string | null; latestActionDate: string | null; latestActionDescription: string | null; openstatesUrl: string | null;
  actions: TxAction[]; votes: TxVote[]; sponsors: Array<{ name: string; personId: string | null; primary: boolean }> ; versions: Array<{ note: string; date: string | null; url: string | null }> };

const org = (o: unknown): "upper" | "lower" | "executive" | null => { const c = (o as { classification?: string } | null)?.classification; return c === "upper" || c === "lower" || c === "executive" ? c : null; };
const str = (v: unknown) => (typeof v === "string" ? v : null);

type RawBill = { id?: string; session?: string; identifier?: string; title?: string; from_organization?: unknown; classification?: string[]; subject?: string[];
  first_action_date?: string; latest_action_date?: string; latest_action_description?: string; openstates_url?: string;
  actions?: Array<{ organization?: unknown; description?: string; date?: string; classification?: string[]; order?: number }>;
  votes?: Array<{ id?: string; motion_text?: string; start_date?: string; result?: string; organization?: unknown; counts?: Array<{ option?: string; value?: number }>;
    votes?: Array<{ option?: string; voter_name?: string; voter?: { id?: string; name?: string } | null }> }>;
  sponsorships?: Array<{ name?: string; primary?: boolean; person?: { id?: string; name?: string } | null }>;
  versions?: Array<{ note?: string; date?: string; links?: Array<{ url?: string; media_type?: string }> }> };

/** Open States /bills?jurisdiction=tx&include=actions&include=votes&include=sponsorships&include=versions */
export function parseOpenStatesBills(data: unknown): { bills: TxBill[]; page: number; maxPage: number } {
  const d = data as { results?: RawBill[]; pagination?: { page?: number; max_page?: number } } | null;
  const bills = (Array.isArray(d?.results) ? d!.results : []).flatMap((b): TxBill[] => {
    if (!b?.id || !b.identifier || !b.session) return [];
    const actions = (b.actions ?? []).filter(a => a?.date && a.description).map((a, i) => ({ order: a.order ?? i, date: a.date!.slice(0, 10), description: a.description!.trim(), chamber: org(a.organization), classification: a.classification ?? [] }))
      .sort((x, y) => x.order - y.order);
    const votes = (b.votes ?? []).filter(v => v?.id && v.start_date).map(v => ({ id: v.id!, motion: (v.motion_text ?? "").trim(), date: v.start_date!.slice(0, 10), result: v.result ?? "", chamber: org(v.organization) as "upper" | "lower" | null,
      counts: Object.fromEntries((v.counts ?? []).filter(c => c?.option).map(c => [c.option!, Number(c.value ?? 0)])),
      votes: (v.votes ?? []).map(x => ({ option: x.option ?? "", personId: x.voter?.id ?? null, name: x.voter_name ?? x.voter?.name ?? "" })) }));
    return [{ id: b.id, session: b.session, identifier: b.identifier.replace(/\s+/g, " ").trim(), title: (b.title ?? "").trim(), chamber: org(b.from_organization) as "upper" | "lower" | null,
      classification: b.classification ?? [], subjects: b.subject ?? [], firstActionDate: str(b.first_action_date)?.slice(0, 10) ?? null, latestActionDate: str(b.latest_action_date)?.slice(0, 10) ?? null,
      latestActionDescription: str(b.latest_action_description), openstatesUrl: str(b.openstates_url), actions, votes,
      sponsors: (b.sponsorships ?? []).filter(s => s?.name).map(s => ({ name: s.name!, personId: s.person?.id ?? null, primary: !!s.primary })),
      versions: (b.versions ?? []).map(v => ({ note: v.note ?? "", date: v.date?.slice(0, 10) ?? null, url: v.links?.find(l => /html/i.test(l.media_type ?? ""))?.url ?? v.links?.[0]?.url ?? null })) }];
  });
  return { bills, page: d?.pagination?.page ?? 1, maxPage: d?.pagination?.max_page ?? 1 };
}

/** Stage from Open States action classifications (the Open Civic Data vocabulary). */
export function txStage(actions: TxAction[]): TxStage {
  const has = (c: string) => actions.some(a => a.classification.includes(c));
  const passages = new Set(actions.filter(a => a.classification.includes("passage") && a.chamber && a.chamber !== "executive").map(a => a.chamber));
  if (has("executive-veto") || has("veto")) return "vetoed";
  if (has("became-law") || has("executive-signature")) return "law";
  if (has("executive-receipt")) return "governor";
  if (passages.size >= 2) return "passed_both";
  if (passages.size === 1) return "passed_first";
  if (has("failure")) return "failed";
  if (has("referral-committee") || has("committee-passage") || has("committee-passage-favorable")) return "committee";
  return "filed";
}
export const TX_STAGE_LABEL: Record<TxStage, string> = { filed: "Filed", committee: "In committee", passed_first: "Passed one chamber", passed_both: "Passed both chambers",
  governor: "Sent to the Governor", law: "Became law", vetoed: "Vetoed by the Governor", failed: "Failed a vote" };

/** TLO bill history page, the source of record: "HB 1" in 89R → History.aspx?LegSess=89R&Bill=HB1 */
export function tloBillUrl(tloSession: string, identifier: string) {
  return `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=${encodeURIComponent(tloSession)}&Bill=${encodeURIComponent(identifier.replace(/\s+/g, ""))}`;
}
export const txBillId = (session: string, identifier: string) => `tx-${session}-${identifier.toLowerCase().replace(/\s+/g, "")}`;

/** Vote integrity: the counts Open States reports against the individual votes listed. */
export function txTallyMismatch(v: TxVote) {
  if (!v.votes.length) return null;
  const listed: Record<string, number> = {};
  for (const x of v.votes) listed[x.option] = (listed[x.option] ?? 0) + 1;
  const bad = Object.entries(v.counts).filter(([o, n]) => (listed[o] ?? 0) !== n).map(([option, official]) => ({ option, official, listed: listed[option] ?? 0 }));
  return bad.length ? bad : null;
}

/* ------------------------------------------------------------- People --- */

export type TxPerson = { id: string; name: string; party: string; chamber: "upper" | "lower"; district: string; title: string | null; image: string | null; url: string | null };
export function parseOpenStatesPeople(data: unknown): { people: TxPerson[]; maxPage: number } {
  const d = data as { results?: Array<{ id?: string; name?: string; party?: string; image?: string; openstates_url?: string; current_role?: { title?: string; org_classification?: string; district?: string | number } }>; pagination?: { max_page?: number } } | null;
  const people = (d?.results ?? []).flatMap(p => {
    const c = p?.current_role?.org_classification;
    if (!p?.id || !p.name || (c !== "upper" && c !== "lower") || p.current_role?.district == null) return [];
    return [{ id: p.id, name: p.name, party: p.party ?? "", chamber: c as "upper" | "lower", district: String(p.current_role.district), title: p.current_role.title ?? null, image: p.image ?? null, url: p.openstates_url ?? null }];
  });
  return { people, maxPage: d?.pagination?.max_page ?? 1 };
}

/* --------------------------------------------------------- Committees --- */

export type TxCommittee = { id: string; name: string; chamber: "upper" | "lower" | "legislature" | null; members: Array<{ personId: string | null; name: string; role: string }> };
type RawCommittee = { id?: string; name?: string; parent_id?: string; classification?: string; memberships?: Array<{ person_name?: string; role?: string; person?: { id?: string; name?: string } | null }> };
/**
 * Open States /committees?jurisdiction=tx&classification=committee&chamber=…&include=memberships, one page.
 * `chamber` is the chamber that was asked for: the API's parent_id is the id of the chamber's organization (an
 * opaque "ocd-organization/<uuid>"), so the chamber cannot be read from a committee by itself. Without it the old
 * guess from parent_id is kept. Members with no name are left out; a member is counted once.
 */
export function parseOpenStatesCommitteePage(data: unknown, chamber: "upper" | "lower" | "legislature" | null = null): { committees: TxCommittee[]; page: number; maxPage: number; total: number | null } {
  const d = data as { results?: RawCommittee[]; pagination?: { page?: number; max_page?: number; total_items?: number } } | null;
  const committees = (Array.isArray(d?.results) ? d!.results : []).flatMap((c): TxCommittee[] => {
    if (!c?.id || !c.name) return [];
    const seen = new Set<string>();
    const members = (Array.isArray(c.memberships) ? c.memberships : []).flatMap(m => {
      const name = (m?.person_name ?? m?.person?.name ?? "").trim();
      if (!name || seen.has(name)) return [];
      seen.add(name);
      return [{ personId: m?.person?.id ?? null, name, role: (m?.role ?? "").trim() || "member" }];
    });
    return [{ id: c.id, name: c.name.trim(), chamber: chamber ?? (/upper|senate/i.test(c.parent_id ?? "") ? "upper" : /lower|house/i.test(c.parent_id ?? "") ? "lower" : null), members }];
  });
  const n = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 1 ? v : fallback);
  return { committees, page: n(d?.pagination?.page, 1), maxPage: n(d?.pagination?.max_page, 1), total: typeof d?.pagination?.total_items === "number" ? d.pagination.total_items : null };
}
export function parseOpenStatesCommittees(data: unknown): TxCommittee[] { return parseOpenStatesCommitteePage(data).committees; }
/** How a committee role reads: Open States sends "Chair", "Vice Chair", "member". */
export const isCommitteeChair = (role: string) => /^chair/i.test(role.trim());

/* ------------------------------------------------------------- Events --- */

export type TxEvent = { id: string; name: string; start: string; location: string | null; classification: string | null; bills: string[]; url: string | null };
type RawEvent = { id?: string; name?: string; start_date?: string; location?: { name?: string } | null; classification?: string; status?: string; deleted?: boolean;
  agenda?: Array<{ related_entities?: Array<{ entity_type?: string; name?: string; bill?: { identifier?: string } | null }> }>;
  participants?: Array<{ entity_type?: string; name?: string; note?: string; organization?: { name?: string; classification?: string } | null }>;
  sources?: Array<{ url?: string }>; links?: Array<{ url?: string }> };
/** A bill number as the site stores it: "HB 1", "SJR 3". Accepts "HB1", "H.B. 1", "hb  1". */
export function txBillNumber(raw: string): string {
  const m = raw.replace(/\./g, "").replace(/\s+/g, " ").trim().toUpperCase().match(/^([A-Z]{2,4}) ?0*(\d{1,5})$/);
  return m ? `${m[1]} ${m[2]}` : raw.replace(/\s+/g, " ").trim();
}
const eventBills = (e: RawEvent) => [...new Set((e.agenda ?? []).flatMap(a => (a?.related_entities ?? []).filter(r => r?.entity_type === "bill")
  .map(r => txBillNumber(r.bill?.identifier ?? r.name ?? "")).filter(Boolean)))];
/**
 * Open States /events?jurisdiction=tx (committee hearings and floor calendars). 17 Nov: the agenda (and so the bills
 * a hearing takes up) is only sent when the request asks for include=agenda; the first build did not ask, so every
 * stored hearing had no bills. Cancelled and deleted events are left out.
 */
export function parseOpenStatesEvents(data: unknown): TxEvent[] { return parseOpenStatesEventPage(data).events; }
export type TxEventFull = TxEvent & { committee: string | null; chamber: "upper" | "lower" | "legislature" | null; sourceUrl: string | null };
export function parseOpenStatesEventPage(data: unknown): { events: TxEventFull[]; cancelled: string[]; page: number; maxPage: number; total: number | null } {
  const d = data as { results?: RawEvent[]; pagination?: { page?: number; max_page?: number; total_items?: number } } | null;
  const rows = Array.isArray(d?.results) ? d!.results : [], cancelled: string[] = [];
  const events = rows.flatMap((e): TxEventFull[] => {
    if (!e?.id || !e.name || !e.start_date) return [];
    if (e.deleted || /cancel/i.test(e.status ?? "")) { cancelled.push(e.id); return []; }
    const org = (e.participants ?? []).find(p => p?.entity_type === "organization");
    const ch = org?.organization?.classification, sourceUrl = e.sources?.find(s => s?.url)?.url ?? null;
    const named = `${org?.name ?? ""} ${e.name}`;
    const chamber = ch === "upper" || ch === "lower" || ch === "legislature" ? ch : /\bsenate\b/i.test(named) ? "upper" : /\bhouse\b/i.test(named) ? "lower" : /\bjoint\b/i.test(named) ? "legislature" : null;
    return [{ id: e.id, name: e.name.trim(), start: e.start_date, location: e.location?.name ?? null, classification: e.classification ?? null, bills: eventBills(e),
      url: sourceUrl ?? e.links?.find(l => l?.url)?.url ?? null, committee: org?.name?.trim() || null, chamber, sourceUrl }];
  });
  const n = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 1 ? v : fallback);
  return { events, cancelled, page: n(d?.pagination?.page, 1), maxPage: n(d?.pagination?.max_page, 1), total: typeof d?.pagination?.total_items === "number" ? d.pagination.total_items : null };
}
/**
 * The site's bill ids for the bills on a hearing's agenda (tx_events.bills holds bill numbers such as "HB 1"). An
 * event belongs to the session whose dates hold it, else the next session to start (prefiling hearings, interim).
 */
export function txEventSession(start: string, sessions: TxSession[] = TX_SESSIONS): TxSession | null {
  const day = start.slice(0, 10);
  const inside = sessions.filter(s => s.start <= day && (!s.end || day <= s.end)).sort((a, b) => b.start.localeCompare(a.start))[0];
  if (inside) return inside;
  return sessions.filter(s => s.start > day).sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
}
export function txEventBillIds(bills: unknown, start: string, sessions: TxSession[] = TX_SESSIONS): string[] {
  const s = txEventSession(start, sessions);
  return s && Array.isArray(bills) ? bills.filter((b): b is string => typeof b === "string" && !!b.trim()).map(b => txBillId(s.id, txBillNumber(b))) : [];
}

/* ------------------------------------------------------- LegiScan fallback --- */

/** LegiScan getMasterList: bill numbers, titles and last actions (no votes). Used when Open States is unavailable. */
export function parseLegiscanMasterList(data: unknown): Array<{ number: string; title: string; lastActionDate: string | null; lastAction: string | null; status: number | null; url: string | null; billId: number | null }> {
  const list = (data as { masterlist?: Record<string, { bill_id?: number; number?: string; title?: string; last_action_date?: string; last_action?: string; status?: number; url?: string }> } | null)?.masterlist;
  if (!list || typeof list !== "object") return [];
  return Object.entries(list).filter(([k]) => k !== "session").flatMap(([, b]) => b?.number ? [{ number: b.number.replace(/^([A-Z]+)(\d+)$/, "$1 $2"), title: b.title ?? "",
    lastActionDate: b.last_action_date ?? null, lastAction: b.last_action ?? null, status: typeof b.status === "number" ? b.status : null, url: b.url ?? null,
    billId: typeof b.bill_id === "number" ? b.bill_id : null }] : []);
}
/** The LegiScan session id a master list belongs to (masterlist.session.session_id). */
export const legiscanMasterListSession = (data: unknown): number | null => {
  const id = (data as { masterlist?: { session?: { session_id?: unknown } } } | null)?.masterlist?.session?.session_id;
  return typeof id === "number" ? id : null;
};

/*
 * LegiScan recorded votes, for bills where Open States has none (LegiScan API manual, "getBill" and "getRollCall").
 * getBill: { status: "OK", bill: { bill_id, bill_number, session: { session_id, ... }, votes: [{ roll_call_id, date, desc, yea, nay, nv, absent, total, passed, chamber }] } }
 * getRollCall: { status: "OK", roll_call: { roll_call_id, bill_id, date, desc, yea, nay, nv, absent, total, passed, chamber, votes: [{ people_id, vote_id, vote_text }] } }
 * getSessionPeople: { status: "OK", sessionpeople: { session: {...}, people: [{ people_id, name, role, district, party }] } }
 */
export type LegiscanBillVotes = { billId: number; number: string; sessionId: number | null; rollCalls: Array<{ rollCallId: number; date: string; desc: string; chamber: "upper" | "lower" | null }> };
const lsChamber = (c: unknown): "upper" | "lower" | null => (c === "S" || c === "Senate" ? "upper" : c === "H" || c === "House" ? "lower" : null);
export function parseLegiscanBill(data: unknown): LegiscanBillVotes | null {
  const d = data as { status?: string; bill?: { bill_id?: number; bill_number?: string; session?: { session_id?: number } | null; session_id?: number;
    votes?: Array<{ roll_call_id?: number; date?: string; desc?: string; chamber?: string }> } } | null;
  const b = d?.status === "OK" ? d.bill : null;
  if (!b || typeof b.bill_id !== "number" || !b.bill_number) return null;
  return { billId: b.bill_id, number: txBillNumber(b.bill_number), sessionId: typeof b.session?.session_id === "number" ? b.session.session_id : typeof b.session_id === "number" ? b.session_id : null,
    rollCalls: (Array.isArray(b.votes) ? b.votes : []).flatMap(v => typeof v?.roll_call_id === "number" && v.date ? [{ rollCallId: v.roll_call_id, date: v.date.slice(0, 10), desc: (v.desc ?? "").trim(), chamber: lsChamber(v.chamber) }] : []) };
}
/** LegiScan's vote words in the Open States vocabulary the site already stores and shows. */
export const LEGISCAN_OPTION: Record<string, string> = { Yea: "yes", Nay: "no", NV: "not voting", Absent: "absent" };
export type LegiscanRollCall = { rollCallId: number; billId: number | null; date: string; motion: string; passed: boolean; chamber: "upper" | "lower" | null; counts: Record<string, number>;
  votes: Array<{ peopleId: number; option: string }> };
export function parseLegiscanRollCall(data: unknown): LegiscanRollCall | null {
  const d = data as { status?: string; roll_call?: { roll_call_id?: number; bill_id?: number; date?: string; desc?: string; yea?: number; nay?: number; nv?: number; absent?: number; passed?: number;
    chamber?: string; votes?: Array<{ people_id?: number; vote_text?: string }> } } | null;
  const r = d?.status === "OK" ? d.roll_call : null;
  if (!r || typeof r.roll_call_id !== "number" || !r.date) return null;
  const c = (v: unknown) => (typeof v === "number" && v >= 0 ? v : 0);
  return { rollCallId: r.roll_call_id, billId: typeof r.bill_id === "number" ? r.bill_id : null, date: r.date.slice(0, 10), motion: (r.desc ?? "").trim(), passed: r.passed === 1, chamber: lsChamber(r.chamber),
    counts: { yes: c(r.yea), no: c(r.nay), "not voting": c(r.nv), absent: c(r.absent) },
    votes: (Array.isArray(r.votes) ? r.votes : []).flatMap(v => typeof v?.people_id === "number" && v.vote_text ? [{ peopleId: v.people_id, option: LEGISCAN_OPTION[v.vote_text] ?? v.vote_text.toLowerCase() }] : []) };
}
export type LegiscanPerson = { peopleId: number; name: string; chamber: "upper" | "lower" | null; district: string | null };
export function parseLegiscanSessionPeople(data: unknown): LegiscanPerson[] {
  const d = data as { status?: string; sessionpeople?: { people?: Array<{ people_id?: number; name?: string; role?: string; district?: string }> } } | null;
  const rows = d?.status === "OK" && Array.isArray(d.sessionpeople?.people) ? d.sessionpeople!.people! : [];
  return rows.flatMap(p => typeof p?.people_id === "number" && p.name ? [{ peopleId: p.people_id, name: p.name.trim(), chamber: p.role === "Sen" ? "upper" as const : p.role === "Rep" ? "lower" as const : null,
    district: p.district?.match(/(\d+)/)?.[1]?.replace(/^0+/, "") ?? null }] : []);
}
/**
 * One LegiScan roll call as the rows the site stores (tx_votes / tx_member_votes). Null when the bill or session does
 * not match what was asked for, so a vote is never filed under the wrong bill or session. Members are matched to
 * tx_people by chamber and district; one LegiScan cannot place keeps its name and no person id.
 */
export function legiscanVoteRows(rc: LegiscanRollCall, bill: LegiscanBillVotes, expect: { sessionId: number; number: string; siteBillId: string },
  people: LegiscanPerson[], members: Array<{ id: string; chamber: string; district: string }>): { vote: TxVote & { billId: string }; mismatch: boolean } | null {
  if (bill.sessionId !== expect.sessionId || txBillNumber(bill.number) !== txBillNumber(expect.number)) return null;
  if (rc.billId != null && rc.billId !== bill.billId) return null;
  const byId = new Map(people.map(p => [p.peopleId, p])), seen = new Set<string>();
  const votes = rc.votes.flatMap(v => {
    const p = byId.get(v.peopleId), name = p?.name ?? `LegiScan person ${v.peopleId}`;
    if (seen.has(name)) return []; seen.add(name);
    const m = p?.chamber && p.district ? members.find(x => x.chamber === p.chamber && String(x.district) === p.district) : null;
    return [{ option: v.option, personId: m?.id ?? null, name }];
  });
  const vote = { id: `legiscan-${rc.rollCallId}`, billId: expect.siteBillId, motion: rc.motion, date: rc.date, result: rc.passed ? "pass" : "fail", chamber: rc.chamber, counts: rc.counts, votes };
  return { vote, mismatch: !!txTallyMismatch(vote) };
}
/** LegiScan status codes to stages: 1 introduced, 2 engrossed, 3 enrolled, 4 passed, 5 vetoed, 6 failed. */
export function legiscanStage(status: number | null): TxStage {
  return status === 4 ? "law" : status === 5 ? "vetoed" : status === 6 ? "failed" : status === 3 ? "governor" : status === 2 ? "passed_first" : "filed";
}

/** Kind of a Texas recorded vote, from its motion text; procedural motions are never shown as votes on the bill. */
export function txVoteKind(motion: string): "passage" | "procedural" | "amendment" | "other" {
  const m = motion.toLowerCase();
  if (/table|postpone|suspend|recommit|re-refer|previous question|adjourn|reconsider|point of order|motion to (proceed|instruct)/.test(m)) return "procedural";
  if (/amendment/.test(m)) return "amendment";
  if (/pass|final|adopt|concur|conference|third reading|second reading|engross/.test(m)) return "passage";
  return "other";
}
