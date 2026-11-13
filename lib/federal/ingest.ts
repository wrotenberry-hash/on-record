import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { billCategories, categoryMappings, ingestCursors, ingestRuns, issueCategories, officialBillSubjects, officialBills,
  officialMemberVotes, officialPoliticians, officialRollCalls } from "@/db/schema";
import { categorize, DEFAULT_MAPPINGS, ISSUE_CATEGORIES, type Mapping } from "@/lib/federal/categories";
import { congressBillApi, congressForYear, congressGovPage, congressRecentBillsApi, houseRollUrl, LAWMAKING_TYPES, LEGISLATORS_URL,
  parseCongressBill, parseCongressBillList, parseCongressSubjects, parseHouseRoll, parseLegislators, parseSenateMenu, parseSenateVote,
  senateMenuUrl, senateVoteUrl, sessionForYear, type BillRef, type ParsedRollCall } from "@/lib/federal/parse";

/**
 * Federal official-record ingestion (docs/TALK_IS_CHEAP_PLAN.md). Uses no
 * model calls, so it runs even when the OpenAI budget is exhausted. Every
 * step is bounded by a time budget and a per-run cap and resumes from its
 * cursor next time. Official rows are stored with their source URL and
 * retrieval time and are not reviewed: they are copies of public records.
 */
const USER_AGENT = "OnRecord/0.2 (+https://on-record-wrotenberry.vercel.app)";
const PER_RUN_CAP = 40;
// senate.gov answers 403 to rapid requests (seen 2026-11-13 after 17 in a row; 2 s apart was fine). The House Clerk gets a lighter pause.
const SENATE_PAUSE_MS = 1_500, SENATE_BLOCK_WAIT_MS = 10_000, HOUSE_PAUSE_MS = 250;
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const LEGISLATORS_EVERY_MS = 20 * 60 * 60 * 1000;
const RECENT_BILLS_EVERY_MS = 20 * 60 * 60 * 1000;

type Db = ReturnType<typeof getDb>;
type Step = { ok: boolean; error?: string; [k: string]: unknown };
export type IngestSummary = { id: string; status: "COMPLETE" | "PARTIAL" | "FAILED"; steps: Record<string, Step>; ms: number };

async function fetchText(url: string, timeoutMs = 20_000, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...headers }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  return { status: res.status, ok: res.ok, text: await res.text() };
}

async function getCursor(db: Db, key: string) { return (await db.select().from(ingestCursors).where(eq(ingestCursors.key, key)).get())?.value ?? null; }
async function setCursor(db: Db, key: string, value: string) {
  await db.insert(ingestCursors).values({ key, value, updatedAt: Date.now() }).onConflictDoUpdate({ target: ingestCursors.key, set: { value, updatedAt: Date.now() } });
}

/** Categories and the default mapping. Inserts only what is missing, so edits made in the table persist. */
export async function seedCategories(db: Db = getDb()) {
  await db.insert(issueCategories).values(ISSUE_CATEGORIES.map((c, i) => ({ slug: c.slug, name: c.name, sortOrder: i + 1 }))).onConflictDoNothing();
  await db.insert(categoryMappings).values(DEFAULT_MAPPINGS.map(m => ({ id: m.id, sourceKind: m.sourceKind, matchKind: m.matchKind, sourceValue: m.sourceValue,
    categorySlug: m.categorySlug, note: m.note, active: 1, createdAt: Date.now() }))).onConflictDoNothing();
}

async function chunked<T>(rows: T[], size: number, fn: (part: T[]) => Promise<unknown>) { for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size)); }

/** Sitting members from congress-legislators, at most once every 20 hours unless forced. */
export async function ingestLegislators(db: Db, force = false): Promise<Step> {
  const last = Number(await getCursor(db, "legislators:last") ?? 0);
  if (!force && Date.now() - last < LEGISLATORS_EVERY_MS) return { ok: true, skipped: "fresh" };
  const res = await fetchText(LEGISLATORS_URL, 30_000);
  if (!res.ok) return { ok: false, error: `members list answered ${res.status}` };
  const rows = parseLegislators(JSON.parse(res.text));
  if (rows.length < 400) return { ok: false, error: `members list had only ${rows.length} rows` };
  const now = Date.now();
  await chunked(rows, 50, part => db.insert(officialPoliticians).values(part.map(p => ({ ...p, isCurrent: 1, sourceUrl: LEGISLATORS_URL, retrievedAt: now })))
    .onConflictDoUpdate({ target: officialPoliticians.id, set: { lisId: sql`excluded.lis_id`, govtrackId: sql`excluded.govtrack_id`, fullName: sql`excluded.full_name`,
      firstName: sql`excluded.first_name`, lastName: sql`excluded.last_name`, party: sql`excluded.party`, state: sql`excluded.state`, district: sql`excluded.district`,
      chamber: sql`excluded.chamber`, termStart: sql`excluded.term_start`, termEnd: sql`excluded.term_end`, officialUrl: sql`excluded.official_url`,
      isCurrent: 1, sourceUrl: sql`excluded.source_url`, retrievedAt: sql`excluded.retrieved_at` } }));
  const ids = new Set(rows.map(r => r.id));
  const stale = (await db.select({ id: officialPoliticians.id }).from(officialPoliticians).where(eq(officialPoliticians.isCurrent, 1))).filter(r => !ids.has(r.id)).map(r => r.id);
  if (stale.length) await db.update(officialPoliticians).set({ isCurrent: 0 }).where(inArray(officialPoliticians.id, stale));
  await setCursor(db, "legislators:last", String(now));
  return { ok: true, members: rows.length, noLongerServing: stale.length };
}

/** Stores one roll call, its member votes and, when it concerns a bill, a bill stub. Idempotent. */
async function storeRollCall(db: Db, rc: ParsedRollCall, lisToBioguide: Map<string, string>) {
  const now = Date.now();
  if (rc.bill) {
    await db.insert(officialBills).values({ id: rc.bill.id, congress: rc.bill.congress, billType: rc.bill.billType, number: rc.bill.number,
      title: rc.title || rc.documentLabel || rc.bill.id, congressUrl: congressGovPage(rc.bill), detailStatus: "stub", sourceUrl: rc.sourceUrl, retrievedAt: now }).onConflictDoNothing();
  }
  const fields = { chamber: rc.chamber, congress: rc.congress, session: rc.session, rollNumber: rc.rollNumber, votedAt: rc.votedAt,
    question: rc.question, title: rc.title, result: rc.result, documentLabel: rc.documentLabel, billId: rc.bill?.id ?? null,
    yea: rc.yea, nay: rc.nay, present: rc.present, notVoting: rc.notVoting, sourceUrl: rc.sourceUrl, retrievedAt: now };
  await db.insert(officialRollCalls).values({ id: rc.id, ...fields }).onConflictDoUpdate({ target: officialRollCalls.id, set: fields });
  const votes = rc.members.map(m => ({ rollCallId: rc.id, politicianId: rc.chamber === "senate" ? (lisToBioguide.get(m.memberKey) ?? `lis:${m.memberKey}`) : m.memberKey,
    position: m.position, rawPosition: m.rawPosition }));
  await chunked(votes, 100, part => db.insert(officialMemberVotes).values(part)
    .onConflictDoUpdate({ target: [officialMemberVotes.rollCallId, officialMemberVotes.politicianId], set: { position: sql`excluded.position`, rawPosition: sql`excluded.raw_position` } }));
}

function thisYear(now = Date.now()) {
  // The congressional year turns over in Washington, so use Eastern time.
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric" }).format(new Date(now)));
}

export async function ingestSenate(db: Db, deadline: number, cap = PER_RUN_CAP): Promise<Step> {
  const year = thisYear(), congress = congressForYear(year), session = sessionForYear(year);
  const menuRes = await fetchText(senateMenuUrl(congress, session));
  if (!menuRes.ok) return { ok: false, error: `Senate vote list answered ${menuRes.status}` };
  const menu = parseSenateMenu(menuRes.text);
  if (!menu.voteNumbers.length) return { ok: true, fetched: 0, note: "no Senate votes yet this session" };
  const key = `senate:${congress}-${session}`, latest = Math.max(...menu.voteNumbers);
  const after = Number(await getCursor(db, key) ?? Math.max(0, latest - cap));
  const todo = menu.voteNumbers.filter(n => n > after).sort((a, b) => a - b).slice(0, cap);
  const lis = new Map((await db.select({ id: officialPoliticians.id, lis: officialPoliticians.lisId }).from(officialPoliticians).where(isNotNull(officialPoliticians.lisId)))
    .map(r => [r.lis as string, r.id]));
  let stored = 0;
  let note: string | undefined;
  for (const n of todo) {
    if (Date.now() + SENATE_PAUSE_MS > deadline) break;
    if (stored) await pause(SENATE_PAUSE_MS);
    const url = senateVoteUrl(congress, session, n);
    let res = await fetchText(url);
    if (res.status === 403 || res.status === 429) { await pause(SENATE_BLOCK_WAIT_MS); res = await fetchText(url); }
    if (res.status === 403 || res.status === 429) {
      // Being asked to slow down is not a failure once something was stored; the next run resumes from the cursor.
      if (!stored) return { ok: false, error: `senate.gov refused vote ${n} (${res.status}) twice`, stored };
      note = `senate.gov asked to slow down at vote ${n}; resumes next run`; break;
    }
    const rc = res.ok ? parseSenateVote(res.text, url) : null;
    if (!rc) return { ok: stored > 0, error: `Senate vote ${n} answered ${res.status} without a vote`, stored };
    await storeRollCall(db, rc, lis); await setCursor(db, key, String(n)); stored++;
  }
  const cursor = Number(await getCursor(db, key) ?? after);
  return { ok: true, stored, remaining: menu.voteNumbers.filter(n => n > cursor).length, latest, ...(note ? { note } : {}) };
}

/** Highest roll number the Clerk has for the year, by binary search on whether a body is a real roll call. */
async function latestHouseRoll(year: number): Promise<number> {
  const isVote = async (n: number) => { const r = await fetchText(houseRollUrl(year, n), 15_000); return r.ok && /<rollcall-vote[\s>]/.test(r.text.slice(0, 600)); };
  if (!(await isVote(1))) return 0;
  let lo = 1, hi = 2;
  while (await isVote(hi)) { lo = hi; hi *= 2; if (hi > 4000) break; }
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (await isVote(mid)) lo = mid; else hi = mid; }
  return lo;
}

export async function ingestHouse(db: Db, deadline: number, cap = PER_RUN_CAP): Promise<Step> {
  const year = thisYear(), key = `house:${year}`;
  const saved = await getCursor(db, key);
  let after = saved === null ? null : Number(saved);
  if (after === null) { const latest = await latestHouseRoll(year); after = Math.max(0, latest - cap); await setCursor(db, key, String(after)); }
  let stored = 0, n = after + 1;
  for (; stored < cap && Date.now() < deadline; n++) {
    if (stored) await pause(HOUSE_PAUSE_MS);
    const url = houseRollUrl(year, n), res = await fetchText(url);
    const rc = res.ok ? parseHouseRoll(res.text, url) : null;
    if (!rc) break; // the next roll does not exist yet
    await storeRollCall(db, rc, new Map()); await setCursor(db, key, String(n)); stored++;
  }
  return { ok: true, stored, cursor: Number(await getCursor(db, key)) };
}

async function loadMappings(db: Db): Promise<Mapping[]> {
  return (await db.select().from(categoryMappings)).map(m => ({ ...m, note: m.note ?? null }));
}

/** Replaces a bill's mapping-made categories; editor-made categories are left alone. */
async function categorizeBill(db: Db, billId: string, policyArea: string | null, subjects: string[], mappings: Mapping[]) {
  await db.delete(billCategories).where(and(eq(billCategories.billId, billId), eq(billCategories.method, "mapping")));
  const found = categorize(policyArea, subjects, mappings);
  if (found.length) await db.insert(billCategories).values(found.map(f => ({ billId, categorySlug: f.slug, method: "mapping" as const, mappingId: f.mappingId,
    confidence: 1, createdAt: Date.now() }))).onConflictDoNothing();
  return found.length;
}

/** Completes bill stubs from Congress.gov (policy area, subjects, latest action) and reads the recent-bills list. Needs CONGRESS_GOV_API_KEY. */
export async function ingestBills(db: Db, deadline: number, cap = PER_RUN_CAP): Promise<Step> {
  const apiKey = process.env.CONGRESS_GOV_API_KEY?.trim();
  if (!apiKey) return { ok: true, skipped: "CONGRESS_GOV_API_KEY is not set; bills keep the title from their vote" };
  const headers = { "X-Api-Key": apiKey };
  let listed = 0;
  const lastList = Number(await getCursor(db, "bills:recent-list") ?? 0);
  if (Date.now() - lastList > RECENT_BILLS_EVERY_MS) {
    const res = await fetchText(congressRecentBillsApi(congressForYear(thisYear()), 100), 20_000, headers);
    if (!res.ok) return { ok: false, error: `Congress.gov bill list answered ${res.status}` };
    const recent = parseCongressBillList(JSON.parse(res.text)).filter(b => (LAWMAKING_TYPES as readonly string[]).includes(b.ref.billType));
    if (recent.length) await db.insert(officialBills).values(recent.map(b => ({ id: b.ref.id, congress: b.ref.congress, billType: b.ref.billType, number: b.ref.number,
      title: b.title, latestActionAt: b.latestActionAt, latestActionText: b.latestActionText, congressUrl: congressGovPage(b.ref), detailStatus: "stub" as const,
      sourceUrl: congressRecentBillsApi(congressForYear(thisYear()), 100), retrievedAt: Date.now() }))).onConflictDoNothing();
    listed = recent.length; await setCursor(db, "bills:recent-list", String(Date.now()));
  }
  const stubs = await db.select().from(officialBills).where(eq(officialBills.detailStatus, "stub")).orderBy(sql`${officialBills.latestActionAt} desc nulls last`).limit(cap);
  const mappings = await loadMappings(db);
  let completed = 0, categorized = 0;
  for (const b of stubs) {
    if (Date.now() > deadline) break;
    const ref: BillRef = { id: b.id, congress: b.congress, billType: b.billType, number: b.number };
    const [detailRes, subjectsRes] = await Promise.all([fetchText(congressBillApi(ref), 20_000, headers), fetchText(congressBillApi(ref, "/subjects"), 20_000, headers)]);
    if (detailRes.status === 429) return { ok: false, error: "Congress.gov rate limit reached", listed, completed };
    const detail = detailRes.ok ? parseCongressBill(JSON.parse(detailRes.text)) : null;
    if (!detail) continue;
    const subj = subjectsRes.ok ? parseCongressSubjects(JSON.parse(subjectsRes.text)) : { policyArea: null, subjects: [] };
    const policyArea = detail.policyArea ?? subj.policyArea;
    await db.update(officialBills).set({ title: detail.title ?? b.title, policyArea, introducedAt: detail.introducedAt, latestActionText: detail.latestActionText,
      latestActionAt: detail.latestActionAt, sponsorId: detail.sponsorId, detailStatus: "complete", sourceUrl: congressBillApi(ref), retrievedAt: Date.now() })
      .where(eq(officialBills.id, b.id));
    await db.delete(officialBillSubjects).where(eq(officialBillSubjects.billId, b.id));
    if (subj.subjects.length) await db.insert(officialBillSubjects).values(subj.subjects.map(subject => ({ billId: b.id, subject }))).onConflictDoNothing();
    categorized += (await categorizeBill(db, b.id, policyArea, subj.subjects, mappings)) ? 1 : 0;
    completed++;
  }
  return { ok: true, listed, completed, categorized };
}

/** The whole job. Steps fail independently; the run is COMPLETE, PARTIAL or FAILED accordingly. */
export async function runFederalIngest({ budgetMs = 120_000, trigger = "scheduled", forceMembers = false }: { budgetMs?: number; trigger?: string; forceMembers?: boolean } = {}): Promise<IngestSummary> {
  const db = getDb(), started = Date.now(), deadline = started + budgetMs, id = crypto.randomUUID();
  await db.insert(ingestRuns).values({ id, job: "federal", status: "RUNNING", startedAt: started, detail: { trigger } });
  const steps: Record<string, Step> = {};
  const step = async (name: string, fn: () => Promise<Step>) => {
    try { steps[name] = await fn(); } catch (e) { steps[name] = { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }; }
  };
  await step("categories", async () => { await seedCategories(db); return { ok: true }; });
  await step("members", () => ingestLegislators(db, forceMembers));
  await step("senate", () => ingestSenate(db, deadline));
  await step("house", () => ingestHouse(db, deadline));
  await step("bills", () => ingestBills(db, deadline));
  const failures = Object.values(steps).filter(s => !s.ok).length;
  const status = failures === 0 ? "COMPLETE" : failures === Object.keys(steps).length ? "FAILED" : "PARTIAL";
  const errors = Object.entries(steps).filter(([, s]) => !s.ok).map(([k, s]) => `${k}: ${s.error}`).join(" | ").slice(0, 600) || null;
  await db.update(ingestRuns).set({ status, finishedAt: Date.now(), detail: { trigger, steps }, error: errors }).where(eq(ingestRuns.id, id));
  return { id, status, steps, ms: Date.now() - started };
}
