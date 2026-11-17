import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { txBillActions, txBills, txBillSponsors, txCommitteeMembers, txCommittees, txMemberVotes, txPeople, txSessionStats, txVotes } from "@/db/schema";
import { funnel, funnelTakeaway, isPartyLine, type FunnelStage } from "@/lib/federal/dashboard-rules";
import { withPartyMajority } from "@/lib/federal/member-stats-rules";
import { isCommitteeChair, TX_SESSIONS, txVoteKind, type TxStage } from "@/lib/texas/parse";
import { txSessionState, txToday } from "@/lib/texas/calendar";
import { ISSUE_WORDS } from "@/lib/search-rank";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";

/**
 * Round I: Texas dashboard, same funnel and figures as Congress, from the Texas
 * tables (Open States) and LegiScan session statistics for earlier sessions.
 * Leaders: from Open States roles when reported, otherwise the officers of the
 * 89th Legislature (TLO), labelled with that date.
 */
const TO_FUNNEL: Record<TxStage, FunnelStage> = { filed: "filed", committee: "committee", passed_first: "passed_one", passed_both: "passed_both", governor: "passed_both", law: "law", vetoed: "vetoed", failed: "committee" };
export const TX_OFFICERS = [
  { title: "Governor", name: "Greg Abbott", party: "Republican", asOf: "89th Legislature (2025)", source: "https://gov.texas.gov/" },
  { title: "Lieutenant Governor", name: "Dan Patrick", party: "Republican", asOf: "89th Legislature (2025)", source: "https://www.ltgov.texas.gov/" },
  { title: "Speaker of the Texas House", name: "Dustin Burrows", party: "Republican", asOf: "89th Legislature (2025)", source: "https://house.texas.gov/members/speaker" },
];
const partyCode = (p: string | null) => { const x = (p ?? "").toLowerCase(); return x.startsWith("dem") ? "D" : x.startsWith("rep") ? "R" : "Other"; };

export async function texasDashboard(now = Date.now()) {
  const db = getDb(), today = txToday(now), { current: session, inSession, upcoming, focus: focusSession } = txSessionState(today);
  const sessionsShown = [...new Set([upcoming?.id, session.id, ...TX_SESSIONS.filter(s => s.start <= today).map(s => s.id)].filter(Boolean) as string[])].slice(0, 6);
  const stageRows = await db.select({ session: txBills.session, chamber: txBills.chamber, stage: txBills.stage, n: sql<number>`count(*)` }).from(txBills).groupBy(txBills.session, txBills.chamber, txBills.stage);
  const stats = await db.select().from(txSessionStats);
  const exp = (rows: typeof stageRows) => rows.flatMap(r => Array(Number(r.n)).fill(TO_FUNNEL[r.stage as TxStage] ?? "filed") as FunnelStage[]);
  const funnels = sessionsShown.map(id => {
    const s = TX_SESSIONS.find(x => x.id === id)!, rows = stageRows.filter(r => r.session === id), st = stats.find(x => x.session === id);
    const fromStats = !rows.length && st ? (Object.entries(st.counts as Record<string, number>).flatMap(([k, n]) => Array(n).fill(TO_FUNNEL[k as TxStage] ?? "filed")) as FunnelStage[]) : null;
    const all = funnel(fromStats ?? exp(rows));
    return { id, name: s.name, regular: s.regular, house: funnel(exp(rows.filter(r => r.chamber === "lower"))), senate: funnel(exp(rows.filter(r => r.chamber === "upper"))), all,
      takeaway: funnelTakeaway(s.name, all), source: fromStats ? st!.source : rows.length ? "Open States" : null, committeeKnown: !fromStats };
  });
  const focus = focusSession.id;
  const votes = await db.select({ id: txVotes.id, motion: txVotes.motion }).from(txVotes).innerJoin(txBills, eq(txBills.id, txVotes.billId)).where(eq(txBills.session, focus));
  const mv = votes.length ? await db.select({ voteId: txMemberVotes.voteId, personId: txMemberVotes.personId, option: txMemberVotes.option, party: txPeople.party, name: txPeople.name, chamber: txPeople.chamber })
    .from(txMemberVotes).leftJoin(txPeople, eq(txPeople.id, txMemberVotes.personId)).where(inArray(txMemberVotes.voteId, votes.map(v => v.id))) : [];
  const pt = new Map<string, Record<string, { Yea?: number; Nay?: number }>>();
  for (const r of mv) { const pos = r.option === "yes" ? "Yea" : r.option === "no" ? "Nay" : null; if (!pos) continue; const e = pt.get(r.voteId) ?? {}; const p = partyCode(r.party); (e[p] ??= {})[pos] = ((e[p] ?? {})[pos] ?? 0) + 1; pt.set(r.voteId, e); }
  const proc = votes.filter(v => txVoteKind(v.motion) === "procedural").length, pl = votes.filter(v => pt.has(v.id) && isPartyLine(pt.get(v.id)!.D ?? {}, pt.get(v.id)!.R ?? {})).length;
  const per = new Map<string, { name: string; party: string; chamber: string; against: number; missed: number; total: number }>();
  for (const r of mv) {
    if (!r.personId) continue;
    const e = per.get(r.personId) ?? { name: r.name ?? "", party: r.party ?? "", chamber: r.chamber ?? "", against: 0, missed: 0, total: 0 };
    e.total++; if (/absent|not voting|excused/.test(r.option)) e.missed++;
    const pos = r.option === "yes" ? "Yea" : r.option === "no" ? "Nay" : null;
    if (pos) { const w = withPartyMajority(pos, pt.get(r.voteId)?.[partyCode(r.party)] ?? {}); if (w === false) e.against++; }
    per.set(r.personId, e);
  }
  const top = (k: "against" | "missed") => [...per].map(([id, v]) => ({ id, ...v, value: v[k] })).filter(x => x.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, 10);
  const seats = await db.select({ chamber: txPeople.chamber, party: txPeople.party, n: sql<number>`count(*)` }).from(txPeople).where(eq(txPeople.isCurrent, 1)).groupBy(txPeople.chamber, txPeople.party);
  const chairs = await db.select({ committee: txCommittees.name, chamber: txCommittees.chamber, name: txCommitteeMembers.name, personId: txCommitteeMembers.personId, role: txCommitteeMembers.role })
    .from(txCommitteeMembers).innerJoin(txCommittees, eq(txCommittees.id, txCommitteeMembers.committeeId)).where(sql`lower(${txCommitteeMembers.role}) like '%chair%'`).orderBy(txCommittees.chamber, txCommittees.name)
    .then(rows => rows.filter(r => isCommitteeChair(r.role))); // chairs only: "Vice Chair" is not listed here
  const advanced = await db.select({ personId: txBillSponsors.personId, name: txBillSponsors.name, n: sql<number>`count(*)` }).from(txBillSponsors).innerJoin(txBills, eq(txBills.id, txBillSponsors.billId))
    .where(and(eq(txBills.session, focus), eq(txBillSponsors.primary, 1), inArray(txBills.stage, ["passed_first", "passed_both", "governor", "law", "vetoed"]))).groupBy(txBillSponsors.name).orderBy(desc(sql`count(*)`)).limit(10);
  // Where bills stall: "Referred to X" actions, and whether a committee report followed.
  const acts = await db.select({ billId: txBillActions.billId, description: txBillActions.description, classification: txBillActions.classification, seq: txBillActions.seq })
    .from(txBillActions).innerJoin(txBills, eq(txBills.id, txBillActions.billId)).where(eq(txBills.session, focus)).orderBy(txBillActions.billId, txBillActions.seq);
  const stall = new Map<string, { referred: number; reported: number }>(), lastRef = new Map<string, string>();
  for (const a of acts) {
    const cls = (a.classification as string[] | null) ?? [];
    if (cls.includes("referral-committee")) { const name = a.description.replace(/^referred to\s+/i, "").replace(/\s*\(.*$/, "").trim(); lastRef.set(a.billId, name); const e = stall.get(name) ?? { referred: 0, reported: 0 }; e.referred++; stall.set(name, e); }
    if (cls.some(c => c.startsWith("committee-passage"))) { const name = lastRef.get(a.billId); if (name) { const e = stall.get(name)!; e.reported++; } }
  }
  const subjects = await db.select({ id: txBills.id, subjects: txBills.subjects, stage: txBills.stage }).from(txBills).where(eq(txBills.session, focus));
  const byIssue = ISSUE_CATEGORIES.map(c => {
    const words = `${c.name} ${ISSUE_WORDS[c.slug] ?? ""}`.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3);
    const hit = subjects.filter(b => ((b.subjects as string[] | null) ?? []).some(s => words.some(w => s.toLowerCase().includes(w))));
    return { slug: c.slug, name: c.name, filed: hit.length, advanced: hit.filter(b => ["passed_first", "passed_both", "governor", "law", "vetoed"].includes(b.stage)).length, enacted: hit.filter(b => b.stage === "law").length };
  });
  return { generatedAt: now, session, inSession, upcoming, focus, funnels, rollStats: { total: votes.length, proceduralPct: votes.length ? Math.round(1000 * proc / votes.length) / 10 : null, partyLinePct: pt.size ? Math.round(1000 * pl / pt.size) / 10 : null },
    seats: seats.map(s => ({ ...s, n: Number(s.n) })), officers: TX_OFFICERS, chairs, advanced: advanced.map(a => ({ ...a, n: Number(a.n) })), againstParty: top("against"), missed: top("missed"),
    stall: [...stall].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.referred - a.referred).slice(0, 15), byIssue };
}
