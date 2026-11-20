import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { briefings, briefingSubscriptions, officialBills, officialFloorSchedule, officialRollCalls, readerAccounts, txBillActions, txBills, txEvents } from "@/db/schema";
import { billLabel } from "@/components/federal/badges";
import { voteKind } from "@/lib/federal/vote-kinds";
import { weekOf } from "@/lib/federal/depth-parse";
import { currentTxSession } from "@/lib/texas/parse";
import { sendTo } from "@/lib/mailer";
import { BRAND } from "@/lib/brand";
import { BRIEFING_INLINE_LIVE, briefingInlineText } from "@/lib/briefing-inline";
import { STATE_COMING, stateCoverage } from "@/lib/state-coverage";

/**
 * Round H briefing: a two-minute read for Congress and Texas, built only from
 * official records (no model): what passed, what failed, what was stopped by a
 * procedural vote, and what is coming next. Daily while Congress or the Texas
 * Legislature is in session, weekly (Mondays) otherwise.
 */
/** `billId`, `voteId` and `chamber` (20 Nov 2026) let the inline briefing attach the approved summary and the reader's own legislators' votes; older stored briefings do not have them. */
export type BriefItem = { label: string; title: string; href: string; date: string; note: string; billId?: string | null; voteId?: string | null; chamber?: "house" | "senate" | null };
export type BriefSection = { name: string; inSession: boolean; passed: BriefItem[]; failed: BriefItem[]; blocked: BriefItem[]; coming: BriefItem[] };
export type Briefing = { kind: "daily" | "weekly"; periodLabel: string; congress: BriefSection; texas: BriefSection | null; generatedAt: string };

const DAY = 86400e3, MAX = 5;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** The date of a vote as Washington had it. 20 Nov 2026: an evening vote was dated a day late, because 7 p.m. in Washington is already the next day by the UTC clock. */
export const voteDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
export const passedResult = (r: string | null) => /pass|agreed|adopted|confirmed|invoked/i.test(r ?? "") && !/not agreed|rejected|failed/i.test(r ?? "");
export const failedResult = (r: string | null) => /fail|rejected|not agreed|not invoked|not sustained/i.test(r ?? "");

export function briefingKind(congressInSession: boolean, texasInSession: boolean): "daily" | "weekly" { return congressInSession || texasInSession ? "daily" : "weekly"; }

export async function buildBriefing(now = Date.now()): Promise<Briefing> {
  const db = getDb();
  const recent = await db.select({ n: sql<number>`count(*)` }).from(officialRollCalls).where(gte(officialRollCalls.votedAt, now - 3 * DAY)).get();
  const floorWeek = await db.select({ n: sql<number>`count(*)` }).from(officialFloorSchedule).where(gte(officialFloorSchedule.weekOf, weekOf(now))).get();
  const congressInSession = Number(recent?.n ?? 0) > 0 || Number(floorWeek?.n ?? 0) > 0;
  const tx = currentTxSession(iso(now));
  const kind = briefingKind(congressInSession, tx.inSession);
  const from = now - (kind === "daily" ? DAY : 7 * DAY);
  const rolls = await db.select({ id: officialRollCalls.id, chamber: officialRollCalls.chamber, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question, title: officialRollCalls.title,
    result: officialRollCalls.result, billId: officialRollCalls.billId, yea: officialRollCalls.yea, nay: officialRollCalls.nay, documentLabel: officialRollCalls.documentLabel, billTitle: officialBills.title,
    billType: officialBills.billType, number: officialBills.number })
    .from(officialRollCalls).leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId)).where(gte(officialRollCalls.votedAt, from)).orderBy(desc(officialRollCalls.votedAt));
  const item = (r: typeof rolls[number], note: string): BriefItem => ({ label: r.billType ? billLabel(r.billType, r.number!) : r.documentLabel ?? "Vote", title: r.billTitle ?? r.title ?? r.question,
    href: r.billId ? `/bills/${r.billId}` : "/moving", date: voteDay(r.votedAt), note: `${r.chamber === "senate" ? "Senate" : "House"}, ${r.yea}–${r.nay}. ${note}`,
    billId: r.billId ?? null, voteId: r.id, chamber: r.chamber === "senate" ? "senate" : "house" });
  const congress: BriefSection = { name: "Congress", inSession: congressInSession, passed: [], failed: [], blocked: [], coming: [] };
  for (const r of rolls) {
    const k = voteKind(r.question, r.title ?? r.billTitle);
    if (k === "passage" && passedResult(r.result) && congress.passed.length < MAX) congress.passed.push(item(r, r.question));
    else if (k === "passage" && failedResult(r.result) && congress.failed.length < MAX) congress.failed.push(item(r, r.question));
    else if (k === "procedural" && r.billId && (failedResult(r.result) && /cloture|proceed/i.test(r.question) || passedResult(r.result) && /table|recommit/i.test(r.question)) && congress.blocked.length < MAX)
      congress.blocked.push(item(r, `${r.question}: ${r.result}. A procedural vote, not a vote on the bill itself.`));
  }
  const floor = await db.select({ chamber: officialFloorSchedule.chamber, label: officialFloorSchedule.label, billId: officialFloorSchedule.billId, description: officialFloorSchedule.description, weekOf: officialFloorSchedule.weekOf,
    title: officialBills.title }).from(officialFloorSchedule).leftJoin(officialBills, eq(officialBills.id, officialFloorSchedule.billId)).where(gte(officialFloorSchedule.weekOf, weekOf(now))).limit(40);
  congress.coming = floor.slice(0, MAX).map(f => ({ label: f.label, title: f.title ?? f.description ?? f.label, href: f.billId ? `/bills/${f.billId}#your-view` : "/coming", date: `${f.weekOf.slice(0, 4)}-${f.weekOf.slice(4, 6)}-${f.weekOf.slice(6, 8)}`, billId: f.billId ?? null,
    note: `On the ${f.chamber === "senate" ? "Senate" : "House"} floor schedule for the week` }));
  let texas: BriefSection | null = null;
  const txCount = await db.select({ n: sql<number>`count(*)` }).from(txBills).get().catch(() => ({ n: 0 }));
  if (Number(txCount?.n ?? 0) > 0) {
    texas = { name: "Texas Legislature", inSession: tx.inSession, passed: [], failed: [], blocked: [], coming: [] };
    const acts = await db.select({ billId: txBillActions.billId, date: txBillActions.date, description: txBillActions.description, classification: txBillActions.classification, chamber: txBillActions.chamber,
      identifier: txBills.identifier, title: txBills.title }).from(txBillActions).innerJoin(txBills, eq(txBills.id, txBillActions.billId))
      .where(gte(txBillActions.date, iso(from))).orderBy(desc(txBillActions.date)).limit(400);
    for (const a of acts) {
      const cls = (a.classification as string[] | null) ?? [], it = { label: a.identifier, title: a.title, href: `/texas/bills/${a.billId}`, date: a.date, note: `${a.chamber === "upper" ? "Senate" : a.chamber === "lower" ? "House" : "Governor"}: ${a.description}` };
      if ((cls.includes("passage") || cls.includes("became-law") || cls.includes("executive-signature")) && texas.passed.length < MAX && !texas.passed.some(p => p.href === it.href)) texas.passed.push(it);
      else if (cls.includes("failure") && texas.failed.length < MAX) texas.failed.push(it);
    }
    const ev = await db.select().from(txEvents).where(and(gte(txEvents.start, iso(now)), lt(txEvents.start, iso(now + 8 * DAY)))).orderBy(asc(txEvents.start)).limit(MAX);
    texas.coming = ev.map(e => ({ label: "Hearing", title: e.name, href: "/coming", date: e.start.slice(0, 10), note: `${(e.bills as string[] | null)?.slice(0, 4).join(", ") ?? ""}${e.location ? ` · ${e.location}` : ""}` }));
  }
  const periodLabel = kind === "daily" ? `${new Date(from).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })}` : `Week of ${new Date(from).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })}`;
  return { kind, periodLabel, congress, texas, generatedAt: new Date(now).toISOString() };
}

/** Each scheduled evening run: write today's briefing (daily) or Monday's (weekly) once, then email subscribers. */
export async function runBriefing(now = Date.now()) {
  const db = getDb(), b = await buildBriefing(now);
  if (b.kind === "weekly" && new Date(now).getUTCDay() !== 1) return { written: false, reason: "weekly briefings are written on Mondays" };
  const id = `${b.kind}-${iso(now)}`;
  const exists = await db.select({ id: briefings.id }).from(briefings).where(eq(briefings.id, id)).get();
  if (!exists) await db.insert(briefings).values({ id, kind: b.kind, periodStart: now - (b.kind === "daily" ? DAY : 7 * DAY), periodEnd: now, content: b, createdAt: now });
  const subs = await db.select({ accountId: briefingSubscriptions.accountId, email: readerAccounts.email, verifiedAt: readerAccounts.verifiedAt, lastSentId: briefingSubscriptions.lastSentId, userId: readerAccounts.appUserId })
    .from(briefingSubscriptions).innerJoin(readerAccounts, eq(readerAccounts.id, briefingSubscriptions.accountId));
  let sent = 0, failed = 0;
  for (const s of subs) {
    if (s.lastSentId === id || !s.verifiedAt) continue;
    // 20 Nov 2026: a subscriber whose saved place is outside Texas gets one line where the Texas part would be.
    const place = s.userId ? await import("@/lib/loop/people").then(m => m.placeOf(db, s.userId!)).catch(() => null) : null;
    const coming = stateCoverage(place?.state) === "coming", forReader: Briefing = coming ? { ...b, texas: null } : b, note = coming ? STATE_COMING : null;
    const r = await sendTo(s.email, `${BRAND.name} briefing: ${b.periodLabel}`, BRIEFING_INLINE_LIVE ? await briefingEmailInline(forReader, id, s.userId ?? null, note) : briefingText(forReader, id, note));
    if (r.ok) { sent++; await db.update(briefingSubscriptions).set({ lastSentId: id }).where(eq(briefingSubscriptions.accountId, s.accountId)); } else failed++;
  }
  if (sent) await db.update(briefings).set({ emailedAt: now }).where(and(eq(briefings.id, id), isNull(briefings.emailedAt)));
  return { written: !exists, id, kind: b.kind, sent, failed };
}

/**
 * The email in the same form as the page: at most five items, each readable on its own, then "You're caught up."
 * Written for one subscriber, so it can say how that reader's own legislators voted.
 */
export async function briefingEmailInline(b: Briefing, id: string, userId: string | null = null, note: string | null = null): Promise<string> {
  const { inlineBriefing } = await import("@/lib/briefing-items");
  const items = await inlineBriefing(b, userId, "reader");
  return briefingInlineText(`${BRAND.name} briefing, ${b.periodLabel}. Official records and approved summaries only.`, items, SITE,
    [...(note ? [note, ""] : []), `Read it on the site: ${SITE}/briefing?id=${id}`, "", "You get this because you turned on the briefing on your Account page. Turn it off there."]);
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";
export function briefingText(b: Briefing, id: string, note: string | null = null) {
  const block = (s: BriefSection) => [`${s.name}${s.inSession ? "" : " (not in session)"}`, ...([["Passed", s.passed], ["Failed", s.failed], ["Stopped by a procedural vote", s.blocked], ["Coming next", s.coming]] as const)
    .filter(([, l]) => l.length).flatMap(([h, l]) => [`  ${h}:`, ...l.map(i => `   - ${i.label}: ${i.title} (${i.date}). ${i.note}`)]), ""];
  return [`${BRAND.name} briefing, ${b.periodLabel}. Official records only.`, "", ...block(b.congress), ...(b.texas ? block(b.texas) : []), ...(note ? [note, ""] : []), `Read it on the site: ${SITE}/briefing?id=${id}`, "",
    "You get this because you turned on the briefing on your Account page. Turn it off there."].join("\n");
}

export async function latestBriefing(id?: string | null) {
  const db = getDb();
  const row = id ? await db.select().from(briefings).where(eq(briefings.id, id)).get() : await db.select().from(briefings).orderBy(desc(briefings.createdAt)).limit(1).get();
  return row ?? null;
}
export async function briefingArchive(limit = 14) { return getDb().select({ id: briefings.id, kind: briefings.kind, createdAt: briefings.createdAt }).from(briefings).orderBy(desc(briefings.createdAt)).limit(limit); }
export async function setBriefingSubscription(accountId: string, on: boolean) {
  const db = getDb();
  if (on) await db.insert(briefingSubscriptions).values({ accountId, createdAt: Date.now() }).onConflictDoNothing();
  else await db.delete(briefingSubscriptions).where(eq(briefingSubscriptions.accountId, accountId));
}
export async function isSubscribed(accountId: string) { return !!(await getDb().select({ a: briefingSubscriptions.accountId }).from(briefingSubscriptions).where(eq(briefingSubscriptions.accountId, accountId)).get()); }
