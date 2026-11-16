import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { billCategories, issueCategories, leadershipChanges, officialBillCommittees, officialBillIndex, officialBills, officialCommitteeMembers, officialCommittees, officialLeaders,
  officialMemberVotes, officialPoliticians, officialRollCalls } from "@/db/schema";
import { chunked, fetchText, getCursor, setCursor, type Step } from "@/lib/federal/ingest";
import { CONGRESS_API, congressForYear, LAWMAKING_TYPES, LEGISLATORS_URL, normalizeBillRef, parseSenateMenu, senateMenuUrl } from "@/lib/federal/parse";
import { funnel, funnelTakeaway, isPartyLine, parseLeadership, stageFromLatestAction, type FunnelStage } from "@/lib/federal/dashboard-rules";
import { withPartyMajority } from "@/lib/federal/member-stats-rules";
import { partyCode } from "@/lib/federal/bill-depth";
import { voteKind } from "@/lib/federal/vote-kinds";

/**
 * Round I: Congress dashboards. The funnel covers every bill of a Congress from
 * the Congress.gov list (stage read from each bill's latest official action);
 * figures that need full action records (committees, issues) say they cover
 * the bills On Record holds in full. Computed once a day into a stored snapshot.
 */
type Db = ReturnType<typeof getDb>;
const PAGE = 250, PAGES_PER_RUN = 6;
const json = (t: string) => { try { return JSON.parse(t) as unknown; } catch { return null; } };

type ListBill = { congress?: number; type?: string; number?: string | number; title?: string; originChamber?: string; latestAction?: { actionDate?: string; text?: string }; updateDate?: string };
async function storeIndexPage(db: Db, bills: ListBill[], now: number) {
  const rows = bills.flatMap(b => {
    const ref = b.congress ? normalizeBillRef(`${b.type ?? ""}${b.number ?? ""}`, b.congress) : null;
    return ref ? [{ billId: ref.id, congress: ref.congress, billType: ref.billType, number: ref.number, originChamber: (b.originChamber ?? "").toLowerCase() || null, title: b.title ?? ref.id,
      latestActionDate: b.latestAction?.actionDate ?? null, latestActionText: b.latestAction?.text ?? null, stage: stageFromLatestAction(b.latestAction?.text), updateDate: b.updateDate ?? null, retrievedAt: now }] : [];
  });
  await chunked(rows, 100, part => db.insert(officialBillIndex).values(part).onConflictDoUpdate({ target: officialBillIndex.billId,
    set: { title: sql`excluded.title`, latestActionDate: sql`excluded.latest_action_date`, latestActionText: sql`excluded.latest_action_text`, stage: sql`excluded.stage`, updateDate: sql`excluded.update_date`, retrievedAt: now } }));
  return rows.length;
}

/** The whole-Congress list: backfill the current and previous three Congresses once, then refresh the current one by update date. */
export async function ingestBillIndex(db: Db, deadline: number): Promise<Step> {
  const apiKey = process.env.CONGRESS_GOV_API_KEY?.trim();
  if (!apiKey) return { ok: true, skipped: "CONGRESS_GOV_API_KEY is not set" };
  const headers = { "X-Api-Key": apiKey }, now = Date.now(), current = congressForYear(new Date(now).getUTCFullYear());
  let pages = 0, stored = 0; const done: number[] = [];
  for (const c of [current, current - 1, current - 2, current - 3]) {
    const key = `index:${c}:offset`, finished = await getCursor(db, `index:${c}:done`);
    if (finished) { done.push(c); if (c !== current) continue; }
    if (c === current && finished) {
      // Daily refresh: newest updates first, until the page is older than the last refresh.
      const since = await getCursor(db, `index:${c}:refreshed`);
      if (since && now - Number(since) < 20 * 3600e3) continue;
      for (let offset = 0; pages < PAGES_PER_RUN && Date.now() < deadline - 8000; offset += PAGE) {
        const r = await fetchText(`${CONGRESS_API}/bill/${c}?format=json&sort=updateDate+desc&limit=${PAGE}&offset=${offset}`, 25_000, headers).catch(() => null); pages++;
        const list = (r?.ok ? json(r.text) as { bills?: ListBill[] } : null)?.bills ?? [];
        stored += await storeIndexPage(db, list, now);
        if (!list.length || (since && (list.at(-1)?.updateDate ?? "") < new Date(Number(since)).toISOString())) break;
      }
      await setCursor(db, `index:${c}:refreshed`, String(now));
      continue;
    }
    let offset = Number(await getCursor(db, key) ?? 0);
    while (pages < PAGES_PER_RUN && Date.now() < deadline - 8000) {
      const r = await fetchText(`${CONGRESS_API}/bill/${c}?format=json&sort=updateDate+asc&limit=${PAGE}&offset=${offset}`, 25_000, headers).catch(() => null); pages++;
      if (!r?.ok) return { ok: false, error: `Congress.gov bill list answered ${r?.status ?? 0}`, pages, stored };
      const body = json(r.text) as { bills?: ListBill[]; pagination?: { count?: number } } | null, list = body?.bills ?? [];
      stored += await storeIndexPage(db, list, now);
      offset += list.length; await setCursor(db, key, String(offset));
      if (!list.length || offset >= (body?.pagination?.count ?? 0)) { await setCursor(db, `index:${c}:done`, String(now)); done.push(c); break; }
    }
    if (pages >= PAGES_PER_RUN) break;
  }
  return { ok: true, pages, stored, congressesComplete: done.length };
}

/** Current leaders from congress-legislators; a change is recorded and shown. */
export async function ingestLeaders(db: Db): Promise<Step> {
  const last = Number(await getCursor(db, "leaders:fetched") ?? 0);
  if (Date.now() - last < 20 * 3600e3) return { ok: true, skipped: "fetched today" };
  const r = await fetchText(LEGISLATORS_URL, 30_000).catch(() => null);
  const leaders = r?.ok ? parseLeadership(json(r.text)) : [];
  if (!leaders.length) return { ok: false, error: `legislators file ${r?.status ?? 0} had no leadership roles` };
  const before = await db.select().from(officialLeaders), now = Date.now();
  let changes = 0;
  for (const l of leaders) {
    const prev = before.find(b => b.title === l.title && b.chamber === l.chamber);
    if (before.length && (!prev || prev.politicianId !== l.politicianId)) { changes++; await db.insert(leadershipChanges).values({ id: crypto.randomUUID(), at: now, level: "federal", title: `${l.title} (${l.chamber})`, fromName: prev?.name ?? null, toName: l.name }); }
  }
  await db.delete(officialLeaders);
  await db.insert(officialLeaders).values(leaders.map(l => ({ ...l, retrievedAt: now }))).onConflictDoNothing();
  await setCursor(db, "leaders:fetched", String(now));
  return { ok: true, leaders: leaders.length, changes };
}

export type CongressDashboard = Awaited<ReturnType<typeof computeCongressDashboard>>;

/** Everything on the Congress dashboard, computed from the stored record. */
export async function computeCongressDashboard(db = getDb(), now = Date.now()) {
  const current = congressForYear(new Date(now).getUTCFullYear()), congresses = [current, current - 1, current - 2, current - 3];
  const idx = await db.select({ congress: officialBillIndex.congress, billType: officialBillIndex.billType, origin: officialBillIndex.originChamber, stage: officialBillIndex.stage, n: sql<number>`count(*)` })
    .from(officialBillIndex).where(and(inArray(officialBillIndex.congress, congresses), inArray(officialBillIndex.billType, [...LAWMAKING_TYPES]))).groupBy(officialBillIndex.congress, officialBillIndex.billType, officialBillIndex.originChamber, officialBillIndex.stage);
  const expand = (rows: typeof idx) => rows.flatMap(r => Array(Number(r.n)).fill(r.stage as FunnelStage) as FunnelStage[]);
  const funnels = congresses.map(c => {
    const rows = idx.filter(r => r.congress === c);
    const house = funnel(expand(rows.filter(r => r.origin === "house"))), senate = funnel(expand(rows.filter(r => r.origin === "senate"))), all = funnel(expand(rows));
    return { congress: c, house, senate, all, takeaway: funnelTakeaway(`${c}th Congress`, all) };
  });
  // Roll calls this Congress: counts, procedural share and party-line share (from the member votes on file).
  const rolls = await db.select({ id: officialRollCalls.id, chamber: officialRollCalls.chamber, question: officialRollCalls.question, title: officialRollCalls.title, congress: officialRollCalls.congress })
    .from(officialRollCalls).where(inArray(officialRollCalls.congress, congresses));
  const votesByParty = await db.select({ id: officialMemberVotes.rollCallId, party: officialPoliticians.party, position: officialMemberVotes.position, n: sql<number>`count(*)` })
    .from(officialMemberVotes).innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId))
    .where(inArray(officialMemberVotes.position, ["Yea", "Nay"])).groupBy(officialMemberVotes.rollCallId, officialPoliticians.party, officialMemberVotes.position);
  const pt = new Map<string, Record<string, { Yea?: number; Nay?: number }>>();
  for (const v of votesByParty) { const e = pt.get(v.id) ?? {}; const p = partyCode(v.party); (e[p] ??= {})[v.position as "Yea" | "Nay"] = ((e[p] ?? {})[v.position as "Yea" | "Nay"] ?? 0) + Number(v.n); pt.set(v.id, e); }
  const rollStats = congresses.map(c => {
    const mine = rolls.filter(r => r.congress === c);
    const proc = mine.filter(r => voteKind(r.question, r.title) === "procedural").length;
    const withParty = mine.filter(r => pt.has(r.id)), partyLine = withParty.filter(r => isPartyLine(pt.get(r.id)!.D ?? {}, pt.get(r.id)!.R ?? {})).length;
    return { congress: c, house: mine.filter(r => r.chamber === "house").length, senate: mine.filter(r => r.chamber === "senate").length, total: mine.length,
      proceduralPct: mine.length ? Math.round((1000 * proc) / mine.length) / 10 : null, partyLinePct: withParty.length ? Math.round((1000 * partyLine) / withParty.length) / 10 : null, withMemberVotes: withParty.length };
  });
  // Control: seats by party, leaders, vetoes.
  // Voting seats only: the delegates from DC and the territories sit in the House but do not vote on passage.
  const seats = await db.select({ chamber: officialPoliticians.chamber, party: officialPoliticians.party, n: sql<number>`count(*)` }).from(officialPoliticians)
    .where(and(eq(officialPoliticians.isCurrent, 1), sql`${officialPoliticians.state} not in ('DC', 'PR', 'GU', 'VI', 'AS', 'MP')`)).groupBy(officialPoliticians.chamber, officialPoliticians.party);
  const leaders = await db.select().from(officialLeaders);
  const vetoes = Number(idx.filter(r => r.congress === current && r.stage === "vetoed").reduce((s, r) => s + Number(r.n), 0));
  const changes = await db.select().from(leadershipChanges).orderBy(sql`${leadershipChanges.at} desc`).limit(5);
  // Key players (Official counts, no grades).
  const chairs = await db.select({ committee: officialCommittees.name, committeeId: officialCommittees.id, chamber: officialCommittees.chamber, politicianId: officialCommitteeMembers.politicianId, title: officialCommitteeMembers.title, name: officialPoliticians.fullName, party: officialPoliticians.party })
    .from(officialCommitteeMembers).innerJoin(officialCommittees, eq(officialCommittees.id, officialCommitteeMembers.committeeId)).leftJoin(officialPoliticians, eq(officialPoliticians.id, officialCommitteeMembers.politicianId))
    .where(and(sql`${officialCommittees.parentId} is null`, sql`(${officialCommitteeMembers.title} like 'Chair%' or ${officialCommitteeMembers.title} like 'Ranking%' or ${officialCommitteeMembers.title} = 'Vice Chairman')`));
  const advanced = await db.select({ id: officialPoliticians.id, name: officialPoliticians.fullName, party: officialPoliticians.party, state: officialPoliticians.state, n: sql<number>`count(*)` })
    .from(officialBills).innerJoin(officialBillIndex, eq(officialBillIndex.billId, officialBills.id)).innerJoin(officialPoliticians, eq(officialPoliticians.id, officialBills.sponsorId))
    .where(and(eq(officialBillIndex.congress, current), inArray(officialBillIndex.stage, ["passed_one", "passed_both", "law", "vetoed"]))).groupBy(officialPoliticians.id).orderBy(sql`count(*) desc`).limit(10);
  const memberRows = await db.select({ id: officialMemberVotes.rollCallId, member: officialMemberVotes.politicianId, position: officialMemberVotes.position, party: officialPoliticians.party, name: officialPoliticians.fullName, state: officialPoliticians.state, chamber: officialPoliticians.chamber })
    .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId)).innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId))
    .where(and(eq(officialRollCalls.congress, current), eq(officialPoliticians.isCurrent, 1)));
  const per = new Map<string, { name: string; party: string; state: string; chamber: string; against: number; counted: number; missed: number; total: number }>();
  for (const r of memberRows) {
    const e = per.get(r.member) ?? { name: r.name, party: r.party, state: r.state, chamber: r.chamber, against: 0, counted: 0, missed: 0, total: 0 };
    e.total++; if (r.position === "Not Voting") e.missed++;
    if (r.position === "Yea" || r.position === "Nay") { const w = withPartyMajority(r.position, pt.get(r.id)?.[partyCode(r.party)] ?? {}); if (w !== null) { e.counted++; if (!w) e.against++; } }
    per.set(r.member, e);
  }
  const top = (f: (x: typeof per extends Map<string, infer V> ? V : never) => number) => [...per].map(([id, v]) => ({ id, ...v, value: f(v) })).filter(x => x.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, 10);
  // Where bills stall: committees by bills referred vs reported (bills with full action records).
  const stall = await db.select({ committeeId: officialBillCommittees.committeeId, name: officialCommittees.name, chamber: officialCommittees.chamber, referred: sql<number>`count(*)`, reported: sql<number>`sum(case when ${officialBillCommittees.reportedAt} is not null then 1 else 0 end)` })
    .from(officialBillCommittees).leftJoin(officialCommittees, eq(officialCommittees.id, officialBillCommittees.committeeId)).groupBy(officialBillCommittees.committeeId).orderBy(sql`count(*) desc`).limit(15);
  const fullRecords = Number((await db.select({ n: sql<number>`count(distinct ${officialBillCommittees.billId})` }).from(officialBillCommittees).get())?.n ?? 0);
  // By issue: filed vs advanced vs enacted (bills sorted into an issue).
  const byIssue = await db.select({ slug: issueCategories.slug, name: issueCategories.name, filed: sql<number>`count(distinct ${billCategories.billId})`,
    advanced: sql<number>`count(distinct case when ${officialBillIndex.stage} in ('passed_one','passed_both','law','vetoed') then ${billCategories.billId} end)`,
    enacted: sql<number>`count(distinct case when ${officialBillIndex.stage} = 'law' then ${billCategories.billId} end)` })
    .from(issueCategories).leftJoin(billCategories, eq(billCategories.categorySlug, issueCategories.slug)).leftJoin(officialBillIndex, eq(officialBillIndex.billId, billCategories.billId))
    .groupBy(issueCategories.slug).orderBy(issueCategories.sortOrder);
  const counts = await getCursor(db, "congress:counts").then(v => (v ? JSON.parse(v) as { bills: number | null; laws: number | null; at: number } : null)).catch(() => null);
  const idxCurrent = funnels[0].all.reach.filed, idxAll = await db.select({ n: sql<number>`count(*)` }).from(officialBillIndex).where(eq(officialBillIndex.congress, current)).get();
  const reconcile = counts ? { officialBills: counts.bills, indexedBills: Number(idxAll?.n ?? 0), officialLaws: counts.laws, indexedLaws: funnels[0].all.reach.law,
    billsMatch: counts.bills !== null && Number(idxAll?.n ?? 0) === counts.bills, lawsMatch: counts.laws !== null && funnels[0].all.reach.law === counts.laws, at: counts.at } : null;
  return { generatedAt: now, current, funnels, rollStats, seats: seats.map(s => ({ ...s, n: Number(s.n) })), leaders, vetoes, changes,
    chairs: chairs.filter(c => c.politicianId), advanced: advanced.map(a => ({ ...a, n: Number(a.n) })),
    againstParty: top(v => v.against), missed: top(v => v.missed), stall: stall.map(s => ({ ...s, referred: Number(s.referred), reported: Number(s.reported ?? 0) })), fullRecords,
    byIssue: byIssue.map(b => ({ ...b, filed: Number(b.filed), advanced: Number(b.advanced), enacted: Number(b.enacted) })), reconcile, lawmakingOnly: idxCurrent };
}

/** Daily snapshot so pages stay fast. */
export async function refreshDashboards(db: Db): Promise<Step> {
  const last = Number(await getCursor(db, "dash:computedAt") ?? 0);
  if (Date.now() - last < 6 * 3600e3) return { ok: true, skipped: "computed recently" };
  const d = await computeCongressDashboard(db);
  await setCursor(db, "dash:congress", JSON.stringify(d));
  await setCursor(db, "dash:computedAt", String(Date.now()));
  return { ok: true, congress: d.current, indexed: d.funnels[0].all.reach.filed, rollCalls: d.rollStats[0].total };
}
export async function congressDashboard(db = getDb()): Promise<CongressDashboard | null> {
  const v = await getCursor(db, "dash:congress");
  return v ? JSON.parse(v) as CongressDashboard : null;
}

/** Senate roll-call counts and procedural share for earlier Congresses, from the Senate's own vote lists (questions included). */
export async function senateHistory(db: Db, congresses: number[]) {
  const out: Array<{ congress: number; votes: number; procedural: number }> = [];
  for (const c of congresses) {
    const cached = await getCursor(db, `senate:menu:${c}`);
    if (cached) { out.push(JSON.parse(cached)); continue; }
    let votes = 0, procedural = 0;
    for (const s of [1, 2]) {
      const r = await fetchText(senateMenuUrl(c, s), 20_000).catch(() => null);
      if (!r?.ok) continue;
      const m = parseSenateMenu(r.text); votes += m.voteNumbers.length;
      procedural += (r.text.match(/<question>([\s\S]*?)<\/question>/gi) ?? []).filter(q => voteKind(q.replace(/<[^>]+>/g, "")) === "procedural").length;
    }
    if (votes) { const row = { congress: c, votes, procedural }; out.push(row); await setCursor(db, `senate:menu:${c}`, JSON.stringify(row)); }
  }
  return out;
}
