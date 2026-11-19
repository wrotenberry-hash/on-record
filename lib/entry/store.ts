/**
 * Entry pages and share links: the database side of lib/entry/rules.ts. Every function takes the database handle and
 * reads no request and no secret, so tests/share-entry.test.mjs runs these same functions against a temporary
 * database built from the real migrations. Nothing here writes about a person: the only write in this round is the
 * share record (share_links), which holds a card's address and never who made it.
 */
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { billCategories, eventCounts, issueCategories, officialBillActions, officialBills, officialRollCalls, officialTallyChecks, shareLinks, txBills } from "../../db/schema.ts";
import type { Db } from "../verify/residence-store.ts";
import { importLegacy, voteOf } from "../constituent/store.ts";
import { asStance, stanceToDraw, type Stance } from "../card-content.ts";
import { utcDay } from "../event-dims.ts";
import { LAWMAKING_TYPES } from "../federal/parse.ts";
import { BILL_VIEW_DIMS, billRefOfTarget, entryItems, SHARE_CODE, SHARE_START_EVENT, shareRate, splitMonth, type EntryBill, type IssueMonth } from "./rules.ts";

/* ───────────────────────────── What a share link opens ───────────────────────────── */

export type ShareGrant = { code: string; target: string; kind: string; billKey: string | null; level: "federal" | "state" | null };
/** Which table a bill lives in, or null when the site does not hold it. Read-only. */
export async function billLevel(db: Db, billKey: string): Promise<"federal" | "state" | null> {
  if (await db.select({ id: officialBills.id }).from(officialBills).where(eq(officialBills.id, billKey)).get()) return "federal";
  return (await db.select({ id: txBills.id }).from(txBills).where(eq(txBills.id, billKey)).get()) ? "state" : null;
}
/**
 * The share link with this code, and the one bill it is about (null when it is about no bill the site holds).
 * A code that was never issued gives null. Reading it changes nothing: visits are counted by lib/share.ts.
 */
export async function shareGrant(db: Db, code: string | null | undefined): Promise<ShareGrant | null> {
  if (!code || !SHARE_CODE.test(code)) return null;
  const row = await db.select().from(shareLinks).where(eq(shareLinks.code, code)).get();
  if (!row) return null;
  const ref = billRefOfTarget(row.target);
  const named = !ref ? null : "billKey" in ref ? ref.billKey
    : (await db.select({ billId: officialRollCalls.billId }).from(officialRollCalls).where(eq(officialRollCalls.id, ref.rollId)).get())?.billId ?? null;
  const level = named ? await billLevel(db, named) : null;
  return { code: row.code, target: row.target, kind: row.kind, billKey: level ? named : null, level };
}
/** Has a reader made a share link for exactly this card? Its picture may then be drawn for a link preview. */
export async function pictureShared(db: Db, target: string): Promise<boolean> {
  return !!(await db.select({ code: shareLinks.code }).from(shareLinks).where(eq(shareLinks.target, target)).get());
}

/* ───────────────────────────── The reader's stance on a card ───────────────────────────── */

/** The reader's own answer on a bill, or null. Earlier answers are brought over first, as everywhere else. */
export async function ownAnswer(db: Db, userId: string | null | undefined, billKey: string | null | undefined): Promise<Stance | null> {
  if (!userId || !billKey) return null;
  await importLegacy(db, userId).catch(() => null);
  return asStance((await voteOf(db, userId, billKey))?.answer);
}
/**
 * The stance line a card may carry. `requested` is what the address asks for; it is drawn only when it is the answer
 * of the reader asking, or one a reader already put on this exact card (`targetWithStance` is that card's share
 * record). Nothing is stored here.
 */
export async function cardStance(db: Db, i: { userId: string | null; billKey: string | null; requested: string | null | undefined; targetWithStance: string | null }): Promise<Stance | null> {
  if (!asStance(i.requested) || !i.billKey) return null;
  const own = await ownAnswer(db, i.userId, i.billKey);
  const recorded = own === i.requested || !i.targetWithStance ? false : await pictureShared(db, i.targetWithStance);
  return stanceToDraw({ requested: i.requested, own, recorded });
}

/* ───────────────────────────── The issue entry page ───────────────────────────── */

/** The plain headline of each bill whose summary a reader may see. The gate lives with the caller (lib/analysis/publish-gate.ts). */
export type HeadlineLoader = (billIds: string[]) => Promise<Map<string, string>>;
const YEAR_MS = 366 * 86400e3;

/**
 * What happened in one issue: this calendar month in full, and the most recent few from the twelve months before.
 * Only bills and joint resolutions that can become law, sorted into the issue by the published rules. Null: no such issue.
 */
export async function issueMonth(db: Db, slug: string, now: number, opts: { headlines?: HeadlineLoader } = {}): Promise<(IssueMonth & { name: string; slug: string }) | null> {
  const category = await db.select().from(issueCategories).where(eq(issueCategories.slug, slug)).get();
  if (!category) return null;
  const inIssue = sql`(select ${billCategories.billId} from ${billCategories} where ${billCategories.categorySlug} = ${slug})`;
  const since = now - YEAR_MS, sinceDay = new Date(since).toISOString().slice(0, 10);
  const [votes, actions] = await Promise.all([
    db.select({ id: officialRollCalls.id, billId: officialRollCalls.billId, chamber: officialRollCalls.chamber, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question,
      title: officialRollCalls.title, result: officialRollCalls.result, yea: officialRollCalls.yea, nay: officialRollCalls.nay, sourceUrl: officialRollCalls.sourceUrl, bad: officialTallyChecks.rollCallId })
      .from(officialRollCalls).leftJoin(officialTallyChecks, and(eq(officialTallyChecks.rollCallId, officialRollCalls.id), eq(officialTallyChecks.ok, 0)))
      .where(and(sql`${officialRollCalls.billId} in ${inIssue}`, gte(officialRollCalls.votedAt, since), lte(officialRollCalls.votedAt, now))).orderBy(desc(officialRollCalls.votedAt)).limit(600),
    db.select({ billId: officialBillActions.billId, date: officialBillActions.actionDate, stage: officialBillActions.stage, chamber: officialBillActions.chamber, text: officialBillActions.text })
      .from(officialBillActions).where(and(sql`${officialBillActions.billId} in ${inIssue}`, inArray(officialBillActions.stage, ["passed_first", "passed_second", "law", "vetoed"]),
        gte(officialBillActions.actionDate, sinceDay))).orderBy(desc(officialBillActions.actionDate)).limit(600),
  ]);
  const ids = [...new Set([...votes.map(v => v.billId), ...actions.map(a => a.billId)].filter((x): x is string => !!x))];
  const rows: Array<Omit<EntryBill, "headline">> = [];
  for (let i = 0; i < ids.length; i += 200) rows.push(...await db.select({ id: officialBills.id, billType: officialBills.billType, number: officialBills.number, title: officialBills.title, congressUrl: officialBills.congressUrl })
    .from(officialBills).where(and(inArray(officialBills.id, ids.slice(i, i + 200)), inArray(officialBills.billType, [...LAWMAKING_TYPES]))));
  const headlines = rows.length && opts.headlines ? await opts.headlines(rows.map(r => r.id)).catch(() => new Map<string, string>()) : new Map<string, string>();
  const bills = new Map(rows.map(r => [r.id, { ...r, headline: headlines.get(r.id) ?? null }]));
  const all = entryItems(bills, votes.filter(v => v.billId).map(v => ({ ...v, billId: v.billId!, tallyOk: !v.bad })), actions);
  return { ...splitMonth(all, now), name: category.name, slug: category.slug };
}

/** The bills sorted into an issue, most recent action first, capped; and how many there are in all. */
export async function issueBills(db: Db, slug: string, cap: number) {
  const where = and(eq(billCategories.categorySlug, slug), inArray(officialBills.billType, [...LAWMAKING_TYPES]));
  const [rows, total] = await Promise.all([
    db.select({ id: officialBills.id, billType: officialBills.billType, number: officialBills.number, title: officialBills.title, latestActionText: officialBills.latestActionText,
      latestActionAt: officialBills.latestActionAt, congressUrl: officialBills.congressUrl, method: billCategories.method })
      .from(billCategories).innerJoin(officialBills, eq(officialBills.id, billCategories.billId)).where(where).orderBy(sql`${officialBills.latestActionAt} desc nulls last`).limit(cap),
    db.select({ n: sql<number>`count(*)` }).from(billCategories).innerJoin(officialBills, eq(officialBills.id, billCategories.billId)).where(where).get(),
  ]);
  return { bills: rows, total: Number(total?.n ?? 0) };
}

/* ───────────────────────────── Share rate per bill view (point 12) ───────────────────────────── */

export type ShareWindow = { days: number; billViews: number; sharesStarted: number; rate: number | null };
/**
 * For the last 7 and the last 28 days (UTC days, today included): how many times a bill page was read, how many
 * times a reader opened the share screen from a bill page, and the second divided by the first.
 * Both numbers come from the aggregate daily counters (event_counts): no reader and no bill is recorded.
 * Automated clients are not counted in either. A refreshed page counts again in both.
 */
export async function shareMeasures(db: Db, now: number): Promise<{ last7: ShareWindow; last28: ShareWindow; counted: { billViews: string; sharesStarted: string; rate: string } }> {
  const window = async (days: number): Promise<ShareWindow> => {
    const since = utcDay(now - (days - 1) * 86400e3), until = utcDay(now);
    const sum = async (where: ReturnType<typeof and>) => Number((await db.select({ n: sql<number>`coalesce(sum(${eventCounts.n}), 0)` }).from(eventCounts).where(and(gte(eventCounts.day, since), lte(eventCounts.day, until), where)).get())?.n ?? 0);
    const billViews = await sum(and(eq(eventCounts.name, "page_view"), inArray(eventCounts.dim, BILL_VIEW_DIMS)));
    const sharesStarted = await sum(and(eq(eventCounts.name, SHARE_START_EVENT), sql`${eventCounts.dim} like 'bill:%'`));
    return { days, billViews, sharesStarted, rate: shareRate(billViews, sharesStarted) };
  };
  return { last7: await window(7), last28: await window(28), counted: {
    billViews: `page_view counts for the federal and Texas bill pages (${BILL_VIEW_DIMS.join(", ")}); the editor's own views and the private notice are left out`,
    sharesStarted: `${SHARE_START_EVENT} counts with a dimension starting "bill:": one each time the share screen is opened from a bill page's share menu`,
    rate: "shares started divided by bill-page views, to three decimal places; null when there were no views",
  } };
}
