import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { officialAmendments, officialBillActions, officialBillCommittees, officialBillDepth, officialBills, officialBillTexts, officialCommitteeMembers,
  officialCommittees, officialFloorSchedule, officialMemberVotes, officialRollCalls, officialTallyChecks } from "@/db/schema";
import { chunked, fetchText, getCursor, setCursor, type Step } from "@/lib/federal/ingest";
import { congressBillApi, congressForYear, congressGovPage, type BillRef } from "@/lib/federal/parse";
import { floorBillStub } from "@/lib/flow/rules";
import { COMMITTEE_MEMBERSHIP_URL, COMMITTEES_URL, committeeIdFromSystemCode, houseFloorUrl, lifecycle, parseActions, parseAmendments, parseCommitteeMembership,
  parseCommittees, parseHouseFloor, parseSenateFloor, parseTextVersions, SENATE_FLOOR_URL, stageOf, tallyMismatches, weekOf } from "@/lib/federal/depth-parse";

/**
 * Round A ingest steps (no model calls). Each is bounded by the run's deadline
 * and a per-run cap, and reports counts, including how many records it could
 * not read, so a source format change shows on the health probe.
 */
type Db = ReturnType<typeof getDb>;
const DEPTH_PER_RUN = 25;
const WEEK_MS = 7 * 86400e3;
const safe = async (url: string, timeout = 20_000, headers: Record<string, string> = {}) => fetchText(url, timeout, headers).catch(() => ({ status: 0, ok: false, text: "" }));
const json = (text: string) => { try { return JSON.parse(text) as unknown; } catch { return null; } };

/** Actions (lifecycle), amendments and text versions for bills whose latest action changed, voted bills first. */
export async function ingestDepth(db: Db, deadline: number, cap = DEPTH_PER_RUN): Promise<Step> {
  const apiKey = process.env.CONGRESS_GOV_API_KEY?.trim();
  if (!apiKey) return { ok: true, skipped: "CONGRESS_GOV_API_KEY is not set" };
  const headers = { "X-Api-Key": apiKey };
  const due = await db.select({ id: officialBills.id, congress: officialBills.congress, billType: officialBills.billType, number: officialBills.number,
    latestActionAt: officialBills.latestActionAt, introducedAt: officialBills.introducedAt,
    voted: sql<number>`exists (select 1 from official_roll_calls r where r.bill_id = ${officialBills.id})`.as("voted") })
    .from(officialBills).leftJoin(officialBillDepth, eq(officialBillDepth.billId, officialBills.id))
    .where(or(sql`${officialBillDepth.billId} is null`, sql`coalesce(${officialBillDepth.latestActionAt}, '') <> coalesce(${officialBills.latestActionAt}, '')`))
    .orderBy(sql`voted desc`, desc(officialBills.latestActionAt)).limit(cap);
  let bills = 0, actions = 0, amendments = 0, texts = 0, unreadable = 0;
  for (const b of due) {
    if (Date.now() > deadline - 5000) break;
    const ref: BillRef = { id: b.id, congress: b.congress, billType: b.billType, number: b.number };
    const [aRes, amRes, tRes] = await Promise.all([safe(congressBillApi(ref, "/actions") + "&limit=250", 20_000, headers),
      safe(congressBillApi(ref, "/amendments") + "&limit=100", 20_000, headers), safe(congressBillApi(ref, "/text"), 20_000, headers)]);
    if ([aRes, amRes, tRes].some(r => r.status === 429)) return { ok: false, error: "Congress.gov rate limit reached", bills, actions, amendments, texts, unreadable };
    const now = Date.now(), parsed = aRes.ok ? parseActions(json(aRes.text)) : [];
    if (!aRes.ok || !parsed.length) { unreadable++; await db.insert(officialBillDepth).values({ billId: b.id, latestActionAt: b.latestActionAt, error: `actions ${aRes.status}` })
      .onConflictDoUpdate({ target: officialBillDepth.billId, set: { latestActionAt: b.latestActionAt, error: `actions ${aRes.status}` } }); continue; }
    const src = congressBillApi(ref, "/actions");
    await db.delete(officialBillActions).where(eq(officialBillActions.billId, b.id));
    await chunked(parsed, 50, part => db.insert(officialBillActions).values(part.map(a => ({ billId: b.id, seq: a.seq, actionDate: a.actionDate, text: a.text, type: a.type,
      actionCode: a.actionCode, chamber: a.chamber, stage: stageOf(a), committees: a.committees, sourceUrl: src, retrievedAt: now }))));
    actions += parsed.length;
    // Committees the bill went to, with the first referral and report dates.
    const committees = new Map<string, { referredAt: string | null; reportedAt: string | null }>();
    for (const a of parsed) for (const code of a.committees) {
      const id = committeeIdFromSystemCode(code);
      if (!id) continue;
      const c = committees.get(id) ?? { referredAt: null, reportedAt: null };
      if (!c.referredAt && /referred/i.test(a.text)) c.referredAt = a.actionDate;
      if (!c.reportedAt && /reported|ordered to be reported/i.test(a.text)) c.reportedAt = a.actionDate;
      committees.set(id, c);
    }
    await db.delete(officialBillCommittees).where(eq(officialBillCommittees.billId, b.id));
    if (committees.size) await db.insert(officialBillCommittees).values([...committees].map(([committeeId, c]) => ({ billId: b.id, committeeId, ...c })));
    const am = amRes.ok ? parseAmendments(json(amRes.text)) : [];
    if (am.length) await chunked(am, 50, part => db.insert(officialAmendments).values(part.map(x => ({ id: x.id, billId: b.id, chamber: x.chamber, number: x.number,
      description: x.description, purpose: x.purpose, latestActionDate: x.latestActionDate, latestActionText: x.latestActionText, outcome: x.outcome,
      sourceUrl: congressBillApi(ref, "/amendments"), retrievedAt: now }))).onConflictDoUpdate({ target: officialAmendments.id,
      set: { description: sql`excluded.description`, purpose: sql`excluded.purpose`, latestActionDate: sql`excluded.latest_action_date`, latestActionText: sql`excluded.latest_action_text`, outcome: sql`excluded.outcome`, retrievedAt: now } }));
    amendments += am.length;
    const tv = tRes.ok ? parseTextVersions(json(tRes.text)) : [];
    if (tv.length) await db.insert(officialBillTexts).values(tv.map(v => ({ billId: b.id, ...v, retrievedAt: now })))
      .onConflictDoUpdate({ target: [officialBillTexts.billId, officialBillTexts.type], set: { date: sql`excluded.date`, xmlUrl: sql`excluded.xml_url`, htmlUrl: sql`excluded.html_url`, pdfUrl: sql`excluded.pdf_url`, retrievedAt: now } });
    texts += tv.length;
    const life = lifecycle(parsed, b.introducedAt);
    const stageDate = life.stageDate;
    await db.insert(officialBillDepth).values({ billId: b.id, latestActionAt: b.latestActionAt, stage: life.current, stageDate, actionsAt: now, amendmentsAt: amRes.ok ? now : null, textsAt: tRes.ok ? now : null, error: null })
      .onConflictDoUpdate({ target: officialBillDepth.billId, set: { latestActionAt: b.latestActionAt, stage: life.current, stageDate, actionsAt: now, amendmentsAt: amRes.ok ? now : null, textsAt: tRes.ok ? now : null, error: null } });
    bills++;
  }
  return { ok: true, due: due.length, bills, actions, amendments, texts, unreadable };
}

/** Committees and their members from congress-legislators, weekly. */
export async function ingestCommittees(db: Db, force = false): Promise<Step> {
  const last = Number(await getCursor(db, "committees:fetched") ?? 0);
  if (!force && Date.now() - last < WEEK_MS) return { ok: true, skipped: "fetched this week" };
  const [cRes, mRes] = await Promise.all([safe(COMMITTEES_URL, 30_000), safe(COMMITTEE_MEMBERSHIP_URL, 30_000)]);
  const committees = cRes.ok ? parseCommittees(json(cRes.text)) : [], members = mRes.ok ? parseCommitteeMembership(json(mRes.text)) : [];
  if (!committees.length || !members.length) return { ok: false, error: `committees ${cRes.status} (${committees.length}), membership ${mRes.status} (${members.length})` };
  const now = Date.now();
  await db.delete(officialCommitteeMembers);
  await db.delete(officialCommittees);
  await chunked(committees, 50, part => db.insert(officialCommittees).values(part.map(c => ({ ...c, sourceUrl: COMMITTEES_URL, retrievedAt: now }))));
  await chunked(members, 100, part => db.insert(officialCommitteeMembers).values(part.map(m => ({ ...m, retrievedAt: now }))).onConflictDoNothing());
  await setCursor(db, "committees:fetched", String(now));
  return { ok: true, committees: committees.length, memberships: members.length };
}

/** This week's (and on Friday to Sunday, next week's) House floor items, and the bills named on the Senate floor schedule. */
export async function ingestFloor(db: Db, now = Date.now()): Promise<Step> {
  const congress = congressForYear(new Date(now).getUTCFullYear()), weeks = [weekOf(now)];
  if ([5, 6, 0].includes(new Date(now).getUTCDay())) weeks.push(weekOf(now + 3 * 86400e3));
  let house = 0, senate = 0;
  for (const w of weeks) {
    const url = houseFloorUrl(w), res = await safe(url, 20_000);
    if (!res.ok) continue;
    const items = parseHouseFloor(res.text, congress);
    await db.delete(officialFloorSchedule).where(and(eq(officialFloorSchedule.chamber, "house"), eq(officialFloorSchedule.weekOf, w)));
    if (items.length) await db.insert(officialFloorSchedule).values(items.map(i => ({ chamber: "house", weekOf: w, label: i.label, billId: i.billId, description: i.description, sourceUrl: url, retrievedAt: now }))).onConflictDoNothing();
    house += items.length;
  }
  const sRes = await safe(SENATE_FLOOR_URL, 20_000);
  if (sRes.ok) {
    const items = parseSenateFloor(sRes.text, congress), w = weekOf(now);
    await db.delete(officialFloorSchedule).where(and(eq(officialFloorSchedule.chamber, "senate"), eq(officialFloorSchedule.weekOf, w)));
    if (items.length) await db.insert(officialFloorSchedule).values(items.map(i => ({ chamber: "senate", weekOf: w, label: i.label, billId: i.billId, description: i.description, sourceUrl: SENATE_FLOOR_URL, retrievedAt: now }))).onConflictDoNothing();
    senate = items.length;
  }
  const stubs = await ensureFloorBillStubs(db, now).catch(() => 0);
  return { ok: true, house, senate, senateStatus: sRes.status, stubs };
}

/**
 * Owner, 17 Nov 2026 ("what's coming up" with Support / Oppose in one tap): a bill on this week's or a later floor
 * schedule gets a starter bill record when it has none, exactly as a bill first seen in a roll call does, so readers
 * can open it and answer before the vote. The bill step completes the record later. Existing records are untouched.
 */
export async function ensureFloorBillStubs(db: Db, now = Date.now()) {
  const rows = await db.select({ chamber: officialFloorSchedule.chamber, billId: officialFloorSchedule.billId, label: officialFloorSchedule.label, description: officialFloorSchedule.description,
    sourceUrl: officialFloorSchedule.sourceUrl }).from(officialFloorSchedule).where(and(sql`${officialFloorSchedule.weekOf} >= ${weekOf(now)}`, isNotNull(officialFloorSchedule.billId)));
  const stubs = rows.flatMap(r => { const b = floorBillStub(r); return b ? [{ ...b, congressUrl: congressGovPage(b), detailStatus: "stub" as const, sourceUrl: r.sourceUrl, retrievedAt: now }] : []; })
    .filter((b, i, a) => a.findIndex(x => x.id === b.id) === i);
  if (!stubs.length) return 0;
  const have = new Set((await db.select({ id: officialBills.id }).from(officialBills).where(inArray(officialBills.id, stubs.map(b => b.id)))).map(r => r.id));
  const missing = stubs.filter(b => !have.has(b.id));
  if (missing.length) await db.insert(officialBills).values(missing).onConflictDoNothing();
  return missing.length;
}

/** Every roll call's official totals against its stored member votes. Mismatches are recorded, shown as under review, and alert. */
export async function checkTallies(db: Db): Promise<Step> {
  const rows = await db.select({ id: officialRollCalls.id, yea: officialRollCalls.yea, nay: officialRollCalls.nay, present: officialRollCalls.present, notVoting: officialRollCalls.notVoting,
    position: officialMemberVotes.position, n: sql<number>`count(${officialMemberVotes.politicianId})` })
    .from(officialRollCalls).leftJoin(officialMemberVotes, eq(officialMemberVotes.rollCallId, officialRollCalls.id))
    .groupBy(officialRollCalls.id, officialMemberVotes.position);
  const byRoll = new Map<string, { official: { yea: number; nay: number; present: number; notVoting: number }; counted: Record<string, number> }>();
  for (const r of rows) {
    const e = byRoll.get(r.id) ?? { official: { yea: r.yea, nay: r.nay, present: r.present, notVoting: r.notVoting }, counted: {} };
    if (r.position) e.counted[r.position] = Number(r.n);
    byRoll.set(r.id, e);
  }
  const now = Date.now(), checks = [...byRoll].map(([rollCallId, e]) => { const m = tallyMismatches(e.official, e.counted); return { rollCallId, ok: m.length ? 0 : 1, detail: m.length ? m : null, checkedAt: now }; });
  await chunked(checks, 100, part => db.insert(officialTallyChecks).values(part).onConflictDoUpdate({ target: officialTallyChecks.rollCallId, set: { ok: sql`excluded.ok`, detail: sql`excluded.detail`, checkedAt: now } }));
  const bad = checks.filter(c => !c.ok);
  return { ok: true, checked: checks.length, mismatches: bad.length, ...(bad.length ? { examples: bad.slice(0, 3).map(b => b.rollCallId) } : {}) };
}

/** Counts only, for the health probe. */
export async function depthCounts(db = getDb()) {
  const count = async (q: Promise<{ n: number } | undefined>) => Number((await q)?.n ?? 0);
  const [billsWithActions, actions, amendments, texts, committees, memberships, floor, tallyChecked, tallyBad, stages, meetingsUpcoming] = await Promise.all([
    count(db.select({ n: sql<number>`count(*)` }).from(officialBillDepth).where(isNotNull(officialBillDepth.actionsAt)).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(officialBillActions).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(officialAmendments).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(officialBillTexts).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(officialCommittees).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(officialCommitteeMembers).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(officialFloorSchedule).where(eq(officialFloorSchedule.weekOf, weekOf(Date.now()))).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(officialTallyChecks).get()),
    count(db.select({ n: sql<number>`count(*)` }).from(officialTallyChecks).where(eq(officialTallyChecks.ok, 0)).get()),
    db.select({ stage: officialBillDepth.stage, n: sql<number>`count(*)` }).from(officialBillDepth).groupBy(officialBillDepth.stage),
    // Committee hearings and markups still ahead (official_committee_meetings); -1 when the count could not be read.
    import("@/lib/federal/meetings").then(m => m.upcomingMeetingCount(db)).catch(() => -1),
  ]);
  return { billsWithActions, actions, amendments, textVersions: texts, committees, committeeMemberships: memberships, floorItemsThisWeek: floor, committeeMeetingsUpcoming: meetingsUpcoming,
    tally: { checked: tallyChecked, mismatches: tallyBad }, stages: Object.fromEntries(stages.map(s => [s.stage ?? "unread", Number(s.n)])) };
}

/** Roll calls whose tally did not match: the vote rows show "Tally under review" instead of the counts. */
export async function tallyUnderReview(rollCallIds: string[]) {
  if (!rollCallIds.length) return new Set<string>();
  const rows = await getDb().select({ id: officialTallyChecks.rollCallId }).from(officialTallyChecks).where(and(inArray(officialTallyChecks.rollCallId, rollCallIds), eq(officialTallyChecks.ok, 0)));
  return new Set(rows.map(r => r.id));
}

/** Daily: how many bills have been introduced and how many laws enacted this Congress (Congress.gov's own counts). */
export async function ingestCongressCounts(db: Db, now = Date.now()): Promise<Step> {
  const apiKey = process.env.CONGRESS_GOV_API_KEY?.trim();
  if (!apiKey) return { ok: true, skipped: "CONGRESS_GOV_API_KEY is not set" };
  const prev = await getCursor(db, "congress:counts");
  if (prev && now - (JSON.parse(prev) as { at: number }).at < 20 * 3600e3) return { ok: true, skipped: "counted today" };
  const congress = congressForYear(new Date(now).getUTCFullYear()), base = congressBillApi({ id: "", congress, billType: "hr", number: 1 }).split("/bill/")[0];
  const headers = { "X-Api-Key": apiKey };
  const count = async (path: string) => { const r = await safe(`${base}${path}?format=json&limit=1`, 20_000, headers); const j = r.ok ? json(r.text) as { pagination?: { count?: number } } | null : null; return typeof j?.pagination?.count === "number" ? j.pagination.count : null; };
  const [bills, hr, s, laws] = await Promise.all([count(`/bill/${congress}`), count(`/bill/${congress}/hr`), count(`/bill/${congress}/s`), count(`/law/${congress}`)]);
  if (bills === null && laws === null) return { ok: false, error: "Congress.gov counts unavailable" };
  await setCursor(db, "congress:counts", JSON.stringify({ congress, bills, hr, s, laws, at: now }));
  return { ok: true, bills: bills ?? 0, laws: laws ?? 0 };
}
export async function congressCounts(db = getDb()) {
  const v = await getCursor(db, "congress:counts");
  return v ? JSON.parse(v) as { congress: number; bills: number | null; hr: number | null; s: number | null; laws: number | null; at: number } : null;
}
