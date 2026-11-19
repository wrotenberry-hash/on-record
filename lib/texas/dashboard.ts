import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { txBillActions, txBills, txBillSponsors, txCommitteeMembers, txCommittees, txMemberVotes, txPeople, txSessionStats, txVotes } from "@/db/schema";
import { funnel, funnelTakeaway, isPartyLine, type FunnelStage } from "@/lib/federal/dashboard-rules";
import { withPartyMajority } from "@/lib/federal/member-stats-rules";
import { isCommitteeChair, TX_SESSIONS, txVoteKind, type TxStage } from "@/lib/texas/parse";
import { txSessionState, txToday } from "@/lib/texas/calendar";
import { chamberPassage, figureCell, officialGap, readStoredCounts, reconcileFiled, sessionKind, TX_DASH_RULES, TX_HISTORY_SESSIONS, type FigureKey, type TxFigures, type TxStoredCounts } from "@/lib/texas/history-parse";
import { lastTexasHistoryRun } from "@/lib/texas/history";
import { ISSUE_WORDS } from "@/lib/search-rank";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";
import { latestTime } from "@/lib/dashboard-end";

/**
 * Texas dashboard, measure for measure with the Congress dashboard where Texas has an equivalent. The session in
 * focus comes from the bills on file (Open States, tx_bills), checked against the official count of bills filed on
 * Texas Legislature Online; earlier sessions come from tx_session_stats (lib/texas/history.ts). Only House and Senate
 * bills are counted: joint resolutions propose constitutional amendments, which go to the voters, and simple and
 * concurrent resolutions cannot become law.
 */
const TO_FUNNEL: Record<TxStage, FunnelStage> = { filed: "filed", committee: "committee", passed_first: "passed_one", passed_both: "passed_both", governor: "passed_both", law: "law", vetoed: "vetoed", failed: "committee" };
export const TX_OFFICERS = [
  { title: "Governor", name: "Greg Abbott", party: "Republican", asOf: "89th Legislature (2025)", source: "https://gov.texas.gov/" },
  { title: "Lieutenant Governor", name: "Dan Patrick", party: "Republican", asOf: "89th Legislature (2025)", source: "https://www.ltgov.texas.gov/" },
  { title: "Speaker of the Texas House", name: "Dustin Burrows", party: "Republican", asOf: "89th Legislature (2025)", source: "https://house.texas.gov/members/speaker" },
];
const partyCode = (p: string | null) => { const x = (p ?? "").toLowerCase(); return x.startsWith("dem") ? "D" : x.startsWith("rep") ? "R" : "Other"; };
const billsOnly = sql`(${txBills.identifier} like 'HB %' or ${txBills.identifier} like 'SB %')`;
const ADVANCED: TxStage[] = ["passed_first", "passed_both", "governor", "law", "vetoed"];
export const HISTORY_COLUMNS: FigureKey[] = ["filed", "passedOrigin", "passedBoth", "signed", "withoutSignature", "becameLaw", "vetoed"];

export async function texasDashboard(now = Date.now()) {
  const db = getDb(), today = txToday(now), { current: session, inSession, upcoming, focus: focusSession } = txSessionState(today);
  const focus = focusSession.id;
  const stageRows = (await db.select({ session: txBills.session, chamber: txBills.chamber, stage: txBills.stage, n: sql<number>`count(*)`, readAt: sql<number>`max(${txBills.retrievedAt})` })
    .from(txBills).where(billsOnly).groupBy(txBills.session, txBills.chamber, txBills.stage)).map(r => ({ ...r, n: Number(r.n), readAt: Number(r.readAt) }));
  const statRows = await db.select().from(txSessionStats);
  const figuresFor = (id: string): TxFigures => { const r = statRows.find(x => x.session === id); return r ? readStoredCounts(r.counts, r.source, r.retrievedAt) : {}; };
  const headingFor = (id: string) => { const h = (statRows.find(x => x.session === id)?.counts as Partial<TxStoredCounts> | null)?.heading; return typeof h === "string" ? h : null; };
  const exp = (rows: typeof stageRows) => rows.flatMap(r => Array(r.n).fill(TO_FUNNEL[r.stage as TxStage] ?? "filed") as FunnelStage[]);

  // Recorded votes on file per session, and the procedural share.
  const voteRows = await db.select({ session: txBills.session, motion: txVotes.motion }).from(txVotes).innerJoin(txBills, eq(txBills.id, txVotes.billId));
  const votesFor = (id: string) => { const v = voteRows.filter(x => x.session === id); return { total: v.length, proceduralPct: v.length ? Math.round(1000 * v.filter(x => txVoteKind(x.motion) === "procedural").length / v.length) / 10 : null }; };

  // The session in focus (the one in progress, else the next one): funnel, chamber by chamber, checked against TLO.
  const focusRows = stageRows.filter(r => r.session === focus), focusFig = figuresFor(focus), focusName = TX_SESSIONS.find(s => s.id === focus)?.name ?? focusSession.name;
  const all = funnel(exp(focusRows));
  const current = { id: focus, name: focusName, regular: focusSession.regular, all, house: funnel(exp(focusRows.filter(r => r.chamber === "lower"))), senate: funnel(exp(focusRows.filter(r => r.chamber === "upper"))),
    takeaway: funnelTakeaway(focusName, all), passage: chamberPassage(focusRows), readAt: focusRows.length ? Math.max(...focusRows.map(r => r.readAt)) : null,
    reconcile: reconcileFiled(focusRows.reduce((s, r) => s + r.n, 0), focusFig.filed), officialFiled: figureCell(focusFig, "filed"), officialVetoed: figureCell(focusFig, "vetoed") };

  // Earlier sessions: official and counted figures, plus what is on file from Open States.
  const history = TX_HISTORY_SESSIONS.map(s => {
    const f = figuresFor(s.id), rows = stageRows.filter(r => r.session === s.id), held = chamberPassage(rows);
    return { id: s.id, name: s.name, heading: headingFor(s.id), year: s.year, regular: s.regular, kind: sessionKind(s), isFocus: s.id === focus,
      cells: HISTORY_COLUMNS.map(k => figureCell(f, k)), gap: officialGap(f), anyLoaded: Object.keys(f).length > 0,
      onFile: rows.length ? { ...held, readAt: Math.max(...rows.map(r => r.readAt)) } : null, votes: votesFor(s.id) };
  });

  // Recorded votes in the focus session: procedural share, party-line share, members' counts (no grades).
  const votes = await db.select({ id: txVotes.id, motion: txVotes.motion }).from(txVotes).innerJoin(txBills, eq(txBills.id, txVotes.billId)).where(eq(txBills.session, focus));
  const mv = votes.length ? await db.select({ voteId: txMemberVotes.voteId, personId: txMemberVotes.personId, option: txMemberVotes.option, party: txPeople.party, name: txPeople.name, chamber: txPeople.chamber })
    .from(txMemberVotes).leftJoin(txPeople, eq(txPeople.id, txMemberVotes.personId)).where(inArray(txMemberVotes.voteId, votes.map(v => v.id))) : [];
  const pt = new Map<string, Record<string, { Yea?: number; Nay?: number }>>();
  for (const r of mv) { const pos = r.option === "yes" ? "Yea" : r.option === "no" ? "Nay" : null; if (!pos) continue; const e = pt.get(r.voteId) ?? {}; const p = partyCode(r.party); (e[p] ??= {})[pos] = ((e[p] ?? {})[pos] ?? 0) + 1; pt.set(r.voteId, e); }
  const proc = votes.filter(v => txVoteKind(v.motion) === "procedural").length, pl = votes.filter(v => pt.has(v.id) && isPartyLine(pt.get(v.id)!.D ?? {}, pt.get(v.id)!.R ?? {})).length;
  const per = new Map<string, { name: string; party: string; chamber: string; against: number; counted: number; missed: number; total: number }>();
  for (const r of mv) {
    if (!r.personId) continue;
    const e = per.get(r.personId) ?? { name: r.name ?? "", party: r.party ?? "", chamber: r.chamber ?? "", against: 0, counted: 0, missed: 0, total: 0 };
    e.total++; if (/absent|not voting|excused/.test(r.option)) e.missed++;
    const pos = r.option === "yes" ? "Yea" : r.option === "no" ? "Nay" : null;
    if (pos) { const w = withPartyMajority(pos, pt.get(r.voteId)?.[partyCode(r.party)] ?? {}); if (w !== null) { e.counted++; if (!w) e.against++; } }
    per.set(r.personId, e);
  }
  const ranked = (k: "against" | "missed") => [...per].map(([id, v]) => ({ id, ...v, value: v[k] })).filter(x => x.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const against = ranked("against"), missed = ranked("missed");

  // Control: seats by party (Open States people list), officers, chairs.
  const seats = await db.select({ chamber: txPeople.chamber, party: txPeople.party, n: sql<number>`count(*)`, readAt: sql<number>`max(${txPeople.retrievedAt})` }).from(txPeople).where(eq(txPeople.isCurrent, 1)).groupBy(txPeople.chamber, txPeople.party);
  const chairs = await db.select({ committee: txCommittees.name, chamber: txCommittees.chamber, name: txCommitteeMembers.name, personId: txCommitteeMembers.personId, role: txCommitteeMembers.role })
    .from(txCommitteeMembers).innerJoin(txCommittees, eq(txCommittees.id, txCommitteeMembers.committeeId)).where(sql`lower(${txCommitteeMembers.role}) like '%chair%'`).orderBy(txCommittees.chamber, txCommittees.name)
    .then(rows => rows.filter(r => isCommitteeChair(r.role))); // chairs only: "Vice Chair" is not listed here
  const committeesReadAt = Number((await db.select({ t: sql<number>`max(${txCommittees.retrievedAt})` }).from(txCommittees).get())?.t ?? 0) || null;
  const advanced = await db.select({ personId: txBillSponsors.personId, name: txBillSponsors.name, n: sql<number>`count(*)` }).from(txBillSponsors).innerJoin(txBills, eq(txBills.id, txBillSponsors.billId))
    .where(and(eq(txBills.session, focus), billsOnly, eq(txBillSponsors.primary, 1), inArray(txBills.stage, ADVANCED))).groupBy(txBillSponsors.name).orderBy(desc(sql`count(*)`));

  // Where bills stall: "Referred to X" actions, and whether a committee report followed (bills on file only).
  const acts = await db.select({ billId: txBillActions.billId, description: txBillActions.description, classification: txBillActions.classification, seq: txBillActions.seq })
    .from(txBillActions).innerJoin(txBills, eq(txBills.id, txBillActions.billId)).where(and(eq(txBills.session, focus), billsOnly)).orderBy(txBillActions.billId, txBillActions.seq);
  const stall = new Map<string, { referred: number; reported: number }>(), lastRef = new Map<string, string>();
  for (const a of acts) {
    const cls = (a.classification as string[] | null) ?? [];
    if (cls.includes("referral-committee")) { const name = a.description.replace(/^referred to\s+/i, "").replace(/\s*\(.*$/, "").trim(); lastRef.set(a.billId, name); const e = stall.get(name) ?? { referred: 0, reported: 0 }; e.referred++; stall.set(name, e); }
    if (cls.some(c => c.startsWith("committee-passage"))) { const name = lastRef.get(a.billId); if (name) { const e = stall.get(name)!; e.reported++; } }
  }
  const subjects = await db.select({ id: txBills.id, subjects: txBills.subjects, stage: txBills.stage }).from(txBills).where(and(eq(txBills.session, focus), billsOnly));
  const byIssue = ISSUE_CATEGORIES.map(c => {
    const words = `${c.name} ${ISSUE_WORDS[c.slug] ?? ""}`.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3);
    const hit = subjects.filter(b => ((b.subjects as string[] | null) ?? []).some(s => words.some(w => s.toLowerCase().includes(w))));
    return { slug: c.slug, name: c.name, filed: hit.length, advanced: hit.filter(b => ADVANCED.includes(b.stage as TxStage)).length, enacted: hit.filter(b => b.stage === "law").length };
  });
  const withSubjects = subjects.filter(b => ((b.subjects as string[] | null) ?? []).length > 0).length;

  const stalled = [...stall].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.referred - a.referred);
  const seatsReadAt = seats.length ? Math.max(...seats.map(s => Number(s.readAt))) : null, historyRun = await lastTexasHistoryRun(db).catch(() => null);
  // When the figures on this page were last read from their sources: the latest of the bills, the members, the committees and the official statistics.
  const figuresAt = latestTime(current.readAt, seatsReadAt, committeesReadAt, historyRun?.at, ...statRows.map(r => Number(r.retrievedAt)));
  // How long each capped list would be in full, so its last line can say "the 10 highest of 34" (finite design, 18 Nov 2026).
  const listTotals = { advanced: advanced.length, againstParty: against.length, missed: missed.length, stall: stalled.length };

  return { generatedAt: now, figuresAt, listTotals, session, inSession, upcoming, focus, current, history, rules: TX_DASH_RULES, historyRun,
    rollStats: { total: votes.length, proceduralPct: votes.length ? Math.round(1000 * proc / votes.length) / 10 : null, partyLinePct: pt.size ? Math.round(1000 * pl / pt.size) / 10 : null, withMemberVotes: pt.size },
    seats: seats.map(s => ({ chamber: s.chamber, party: s.party, n: Number(s.n) })), seatsReadAt,
    officers: TX_OFFICERS, chairs, committeesReadAt, advanced: advanced.slice(0, 10).map(a => ({ ...a, n: Number(a.n) })), againstParty: against.slice(0, 10), missed: missed.slice(0, 10),
    stall: stalled.slice(0, 15), billsWithActions: new Set(acts.map(a => a.billId)).size,
    byIssue, withSubjects };
}
export type TexasDashboard = Awaited<ReturnType<typeof texasDashboard>>;
