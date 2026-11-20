import { asc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { STATE_COMING } from "@/lib/state-coverage";
import { billCategories, officialBills, officialFloorSchedule, txEvents } from "@/db/schema";
import { federalLegislators, type Legislator } from "@/lib/federal/legislators";
import { tallyUnderReview } from "@/lib/federal/depth";
import { weekOf } from "@/lib/federal/depth-parse";
import { stanceQuestion } from "@/lib/federal/stance-question";
import { txLegislatorsFor } from "@/lib/texas/queries";
import { currentTxSession, TX_SESSIONS } from "@/lib/texas/parse";
import type { Location } from "@/lib/location";
import { zipPlace } from "@/lib/flow/zip";
import { floorBillStub, orderByIssues } from "@/lib/flow/rules";
import { NO_RECENT_VOTE, plainBillName, RECENT_VOTE_MS, TX_NO_MEMBER_ON_FILE, txNoRecordedVoteLine, type BillName } from "@/lib/flow/votes";
import { billLabel, cardVotesNote, fedCardVote, initials, meaningfulFed, meaningfulTx, partyWord, seatLine, txCardVote, VOTES_PER_CARD, type CardVote, type MeaningfulFed } from "@/lib/flow/cards";
import { FED_ROWS, fedVoteRows, TX_ROWS, txVoteRows } from "@/lib/flow/card-store";
import { allowedPhotoUrl, photoPath, TEXAS_PHOTO_HOSTS } from "@/lib/photos";
import { rowSummaries, type VisibleSummary } from "@/lib/bill-row-store";

/**
 * Reads for the first screen (owner, 17 and 18 Nov 2026): the reader's legislators, each with their last three
 * meaningful votes in plain lines, the coming floor votes, and the bills the reader has answered. Official data, plus
 * the Analysis headline only where a summary is visible to readers (lib/analysis/publish-gate.ts); otherwise official
 * facts only. The words and the rules are in lib/flow/cards.ts and lib/flow/votes.ts; the queries in lib/flow/card-store.ts.
 */

/** The newest reader-visible summary for each bill: its headline, its own question and the words a vote row uses. Empty while the gate is shut. */
export async function visibleSummaries(billIds: readonly string[]): Promise<Map<string, VisibleSummary>> {
  return rowSummaries(billIds);
}

/* ------------------------------------------------------------ your legislators --- */

export type { CardVote };
/**
 * One card. Every member's card has the same parts: the name, the picture (or the initials when there is none), the
 * party as a word, the seat, and up to three votes. `memberId` is the id a follow is kept under (null for a seat with
 * no member on file). `photo` is the site's own address for the portrait, or null when no official picture is known.
 */
export type LegislatorCard = { key: string; slot: "U.S. senator" | "U.S. representative" | "State senator" | "State representative"; name: string; seat: string; party: string | null;
  href: string | null; memberId: string | null; photo: string | null; initials: string; votes: CardVote[]; votesNote: string | null; none: string | null };
export type DistrictChoice = { id: string; label: string };
/** `zipSplit`: the choices are the ZIP's own districts (it crosses a line); false when the ZIP is not in the Census table and the whole state is offered. */
export type YourLegislators = { state: string; cards: LegislatorCard[]; houseChoices: DistrictChoice[]; zipSplit: boolean; needsAddress: boolean; texas: boolean; stateNote: string | null;
  counts: { senators: number; representative: number; state: number } };

/** A member's meaningful votes in the last 12 months, newest first (lib/flow/votes.ts decides what counts). `full` is false when only the latest recorded votes were read. */
async function meaningfulVotesOf(politicianId: string, now: number): Promise<{ votes: MeaningfulFed[]; full: boolean }> {
  const rows = await fedVoteRows(getDb(), politicianId, now - RECENT_VOTE_MS);
  return { votes: meaningfulFed(rows), full: rows.length < FED_ROWS };
}

/**
 * The House districts to choose between: the ZIP's own districts when the Census table lists them (a few ZIPs cross a
 * state line, so these can be in two states), else every district in the state. A district with no sitting member is
 * still offered, marked vacant.
 */
export async function houseChoicesFor(state: string, zip: string | null, all: Legislator[]): Promise<DistrictChoice[]> {
  const idOf = (m: Legislator) => `${m.state}-${m.district ? String(m.district).padStart(2, "0") : "AL"}`;
  const place = zip ? await zipPlace(zip).catch(() => null) : null;
  if (!place?.choices.length || !place.choices.some(d => d.startsWith(`${state}-`))) return all.map(m => ({ id: idOf(m), label: `District ${m.district || "at large"} · ${m.fullName} (${partyWord(m.party)})` }));
  const states = [...new Set(place.choices.map(d => d.split("-")[0]))];
  const members = [...all, ...(await Promise.all(states.filter(s => s !== state).map(s => federalLegislators(s, null).then(f => f.houseChoices).catch(() => [] as Legislator[])))).flat()];
  return place.choices.map(id => { const m = members.find(x => idOf(x) === id), n = id.split("-")[1];
    return { id, label: `${states.length > 1 ? id : `District ${n === "AL" ? "at large" : Number(n)}`} · ${m ? `${m.fullName} (${partyWord(m.party)})` : "seat vacant"}` }; });
}

/**
 * Up to five cards in a fixed order: U.S. senator, U.S. senator, U.S. representative, state senator, state
 * representative. Each has the member's last three meaningful votes, one plain line each with its date and bill, or
 * says how many there are when there are fewer.
 */
export async function yourLegislators(loc: Location, zip: string | null, now = Date.now()): Promise<YourLegislators> {
  const db = getDb(), today = new Date(now).toISOString().slice(0, 10);
  const fed = await federalLegislators(loc.state, loc.congressional);
  const members = [...fed.senators, ...(fed.representative ? [fed.representative] : [])];
  const found = await Promise.all(members.map(m => meaningfulVotesOf(m.id, now).catch(() => ({ votes: [] as MeaningfulFed[], full: true }))));
  const shown = found.map(f => f.votes.slice(0, VOTES_PER_CARD)), chosen = shown.flat();
  const [summaries, review] = await Promise.all([visibleSummaries(chosen.map(v => v.billId)).catch(() => new Map<string, VisibleSummary>()),
    tallyUnderReview(chosen.map(v => v.rollCallId)).catch(() => new Set<string>())]);
  const cards: LegislatorCard[] = members.map((m, i) => {
    const votes = shown[i].map(v => fedCardVote(v, { summary: summaries.get(v.billId), tallyUnderReview: review.has(v.rollCallId) }));
    return { key: m.id, slot: m.chamber === "senate" ? "U.S. senator" : "U.S. representative", name: m.fullName, seat: seatLine({ level: "federal", chamber: m.chamber, state: m.state, district: m.district }),
      party: partyWord(m.party), href: `/politicians/${m.id}`, memberId: m.id, photo: photoPath(m.id), initials: initials(m.fullName),
      votes, votesNote: cardVotesNote(votes.length, found[i].votes.length, !found[i].full), none: votes.length ? null : NO_RECENT_VOTE };
  });
  const vacantRep = !!loc.congressional && !fed.representative;
  if (vacantRep) cards.push({ key: `vacant-${loc.congressional}`, slot: "U.S. representative", name: `U.S. House, ${loc.congressional}`, seat: "U.S. Representative", party: null, href: null, memberId: null,
    photo: null, initials: "", votes: [], votesNote: null, none: "No current member is on file for this district. The seat may be vacant." });
  const texas = loc.state === "TX";
  let stateMembers = 0;
  if (texas && (loc.stateUpper || loc.stateLower)) {
    const tx = await txLegislatorsFor(loc.stateUpper, loc.stateLower).catch(() => ({ senator: null, representative: null }));
    const since = new Date(now - RECENT_VOTE_MS).toISOString().slice(0, 10), none = txNoRecordedVoteLine(today, TX_SESSIONS);
    const slots = [{ p: tx.senator, slot: "State senator" as const, district: loc.stateUpper, chamber: "upper" as const }, { p: tx.representative, slot: "State representative" as const, district: loc.stateLower, chamber: "lower" as const }];
    for (const s of slots) {
      const n = s.district?.split("-").pop() ?? "";
      if (!s.p) { if (s.district) cards.push({ key: `tx-${s.slot}`, slot: s.slot, name: `Texas ${s.chamber === "upper" ? "Senate" : "House"} District ${n}`, seat: `Texas State ${s.slot === "State senator" ? "Senator" : "Representative"}`,
        party: null, href: null, memberId: null, photo: null, initials: "", votes: [], votesNote: null, none: TX_NO_MEMBER_ON_FILE }); continue; }
      const rows = await txVoteRows(db, s.p.id, since).catch(() => []);
      const all = meaningfulTx(rows), votes = all.slice(0, VOTES_PER_CARD).map(txCardVote);
      stateMembers++;
      cards.push({ key: s.p.id, slot: s.slot, name: s.p.name, seat: seatLine({ level: "state", chamber: s.chamber, district: s.p.district }), party: partyWord(s.p.party),
        href: `/texas/members/${encodeURIComponent(s.p.id)}`, memberId: s.p.id, photo: allowedPhotoUrl(s.p.image, TEXAS_PHOTO_HOSTS) ? photoPath(s.p.id) : null, initials: initials(s.p.name),
        votes, votesNote: cardVotesNote(votes.length, all.length, rows.length >= TX_ROWS), none: votes.length ? null : none });
    }
  }
  const houseChoices = fed.representative || loc.congressional ? [] : await houseChoicesFor(loc.state, zip, fed.houseChoices);
  return { state: loc.state, cards, texas, needsAddress: texas && !loc.stateUpper && !loc.stateLower, houseChoices, zipSplit: houseChoices.length > 0 && houseChoices.length < fed.houseChoices.length,
    stateNote: texas ? null : STATE_COMING,
    counts: { senators: fed.senators.length, representative: fed.representative ? 1 : 0, state: stateMembers } };
}

/* ------------------------------------------------------------------ coming up --- */

/** `answerable` is false for a scheduled bill whose bill record has not been loaded yet: it is listed, without buttons. */
export type FlowBill = { billId: string; billLabel: string; name: BillName; where: string; when: string; issues: string[]; onIssue: boolean; question: string; answer: "support" | "oppose" | "unsure" | null; answerable: boolean };
export type TexasEvent = { id: string; name: string; when: string; bills: string[] };
export type ComingUp = { scheduled: FlowBill[]; scheduledTotal: number; recent: FlowBill[]; texas: TexasEvent[] };

async function answersOf(userId: string | null, billIds: string[]) {
  const out = new Map<string, "support" | "oppose" | "unsure">();
  if (!userId || !billIds.length) return out;
  for (const a of await import("@/lib/opinions").then(m => m.answersOf(userId, billIds))) out.set(a.billId, a.answer);
  return out;
}

async function issuesOf(billIds: string[]) {
  const out = new Map<string, string[]>();
  if (!billIds.length) return out;
  for (const c of await getDb().select({ billId: billCategories.billId, slug: billCategories.categorySlug }).from(billCategories).where(inArray(billCategories.billId, billIds))) out.set(c.billId, [...(out.get(c.billId) ?? []), c.slug]);
  return out;
}

const weekLabel = (w: string) => `week of ${new Date(Date.UTC(Number(w.slice(0, 4)), Number(w.slice(4, 6)) - 1, Number(w.slice(6, 8)), 12)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

/**
 * "Here's what's coming up that affects you": bills on this week's (or a later) House and Senate floor schedule, the
 * reader's issues first. When nothing is scheduled, the three most recent meaningful votes of the reader's own
 * legislators stand in ("Decided recently"). Texas hearings are listed while the Legislature is in session.
 */
export async function comingUp(input: { userId: string | null; issues: readonly string[]; loc: Location | null; limit?: number; now?: number }): Promise<ComingUp> {
  const db = getDb(), now = input.now ?? Date.now(), limit = input.limit ?? 5, today = new Date(now).toISOString().slice(0, 10);
  const floor = await db.select({ chamber: officialFloorSchedule.chamber, weekOf: officialFloorSchedule.weekOf, label: officialFloorSchedule.label, description: officialFloorSchedule.description,
    floorBillId: officialFloorSchedule.billId, billId: officialBills.id, title: officialBills.title, billType: officialBills.billType, number: officialBills.number })
    .from(officialFloorSchedule).leftJoin(officialBills, eq(officialBills.id, officialFloorSchedule.billId)).where(gte(officialFloorSchedule.weekOf, weekOf(now)))
    .orderBy(asc(officialFloorSchedule.weekOf), asc(officialFloorSchedule.chamber), sql`cast(substr(${officialFloorSchedule.billId}, instr(substr(${officialFloorSchedule.billId}, 5), '-') + 5) as integer)`, asc(officialFloorSchedule.label)).limit(120);
  type Row = { billId: string; title: string; billType: string; number: number; where: string; when: string; answerable: boolean };
  const rowsOf = floor.flatMap((f): Row[] => {
    const where = f.chamber === "senate" ? "Senate" : "House", when = weekLabel(f.weekOf);
    if (f.billId && f.billType && f.number !== null && f.title !== null) return [{ billId: f.billId, title: f.title, billType: f.billType, number: f.number, where, when, answerable: true }];
    const stub = floorBillStub({ billId: f.floorBillId, chamber: f.chamber, label: f.label, description: f.description }); // on the schedule, bill record not loaded yet
    return stub ? [{ billId: stub.id, title: stub.title, billType: stub.billType, number: stub.number, where, when, answerable: false }] : [];
  });
  // The schedule gives a week, not a day: within a week and chamber, bills are listed by number.
  const unique = rowsOf.filter((f, i, a) => a.findIndex(x => x.billId === f.billId) === i);
  const build = async (rows: Row[]): Promise<FlowBill[]> => {
    const ids = rows.filter(r => r.answerable).map(r => r.billId);
    const [issues, summaries, answers] = await Promise.all([issuesOf(ids), visibleSummaries(ids).catch(() => new Map<string, VisibleSummary>()), answersOf(input.userId, ids)]);
    return orderByIssues(rows.map(r => { const s = summaries.get(r.billId);
      return { billId: r.billId, billLabel: billLabel(r.billType, r.number), name: plainBillName({ title: r.title, billType: r.billType, headline: s?.headline, label: billLabel(r.billType, r.number) }),
        where: r.where, when: r.when, issues: issues.get(r.billId) ?? [], question: stanceQuestion({ question: s?.question, headline: s?.headline }).question, answer: answers.get(r.billId) ?? null, answerable: r.answerable }; }), input.issues);
  };
  // Bills a reader can answer come before those still waiting for their record, inside each group (own issues, the rest).
  const scheduled = (await build(unique)).sort((a, b) => Number(b.onIssue) - Number(a.onIssue) || Number(b.answerable) - Number(a.answerable));
  let recent: FlowBill[] = [];
  if (!scheduled.length && input.loc) {
    const fed = await federalLegislators(input.loc.state, input.loc.congressional).catch(() => null);
    const members = fed ? [...fed.senators, ...(fed.representative ? [fed.representative] : [])] : [];
    const all = (await Promise.all(members.map(m => meaningfulVotesOf(m.id, now).then(f => f.votes).catch(() => [] as MeaningfulFed[])))).flat().sort((a, b) => b.votedAt - a.votedAt);
    const three = all.filter((v, i, a) => a.findIndex(x => x.billId === v.billId) === i).slice(0, 3);
    recent = await build(three.map(v => ({ billId: v.billId, title: v.billTitle, billType: v.billType, number: v.number, where: v.chamber === "senate" ? "Senate" : "House", when: `voted ${dayLabel(v.votedAt)}`, answerable: true })));
    recent.sort((a, b) => three.findIndex(v => v.billId === a.billId) - three.findIndex(v => v.billId === b.billId)); // newest first; these are few
  }
  const texas = input.loc?.state === "TX" && currentTxSession(today).inSession
    ? (await db.select().from(txEvents).where(gte(txEvents.start, today)).orderBy(asc(txEvents.start)).limit(3).catch(() => [])).map(e => ({ id: e.id, name: e.name,
      when: new Date(e.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" }), bills: ((e.bills as string[] | null) ?? []).slice(0, 5) }))
    : [];
  return { scheduled: scheduled.slice(0, limit), scheduledTotal: scheduled.length, recent, texas };
}

/* ---------------------------------------------------------- district comparison --- */

export type AnsweredBill = { billId: string; billLabel: string; name: BillName; answer: "support" | "oppose" | "unsure"; at: number };

/** The bills this reader has answered, newest answer first. Read only for that reader. */
export async function answeredBills(userId: string | null, limit = 5): Promise<AnsweredBill[]> {
  if (!userId) return [];
  const db = getDb();
  const top = (await import("@/lib/opinions").then(m => m.answersOf(userId, undefined, limit))).slice(0, limit);
  if (!top.length) return [];
  const ids = top.map(t => t.billId);
  const [bills, summaries] = await Promise.all([db.select({ id: officialBills.id, title: officialBills.title, billType: officialBills.billType, number: officialBills.number }).from(officialBills).where(inArray(officialBills.id, ids)),
    visibleSummaries(ids).catch(() => new Map<string, VisibleSummary>())]);
  return top.flatMap(t => { const b = bills.find(x => x.id === t.billId); if (!b) return [];
    return [{ billId: b.id, billLabel: billLabel(b.billType, b.number), name: plainBillName({ title: b.title, billType: b.billType, headline: summaries.get(b.id)?.headline, label: billLabel(b.billType, b.number) }), answer: t.answer, at: t.at }]; });
}
