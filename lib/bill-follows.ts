import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { alertPrefs, billFollows, officialBillDepth, officialBills, readerAccounts } from "@/db/schema";
import { STAGE_LABEL, type StageKey } from "@/lib/federal/depth-parse";
import { billLabel } from "@/components/federal/badges";
import { sendTo } from "@/lib/mailer";

/** Round B: a reader follows a bill and gets one email when its stage changes. Follows are the reader's own; never shown to others. */
export async function isFollowingBill(userId: string | null, billId: string) {
  if (!userId) return false;
  return !!(await getDb().select({ b: billFollows.billId }).from(billFollows).where(and(eq(billFollows.userId, userId), eq(billFollows.billId, billId))).get());
}

export async function toggleBillFollowFor(userId: string, billId: string) {
  const db = getDb();
  if (await isFollowingBill(userId, billId)) { await db.delete(billFollows).where(and(eq(billFollows.userId, userId), eq(billFollows.billId, billId))); return false; }
  const stage = (await db.select({ s: officialBillDepth.stage }).from(officialBillDepth).where(eq(officialBillDepth.billId, billId)).get())?.s ?? null;
  await db.insert(billFollows).values({ userId, billId, createdAt: Date.now(), lastStage: stage }).onConflictDoNothing();
  return true;
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";

/** After each federal update: one email per followed bill whose stage moved, to readers with a verified email. */
export async function runBillAlerts() {
  const db = getDb();
  const moved = await db.select({ userId: billFollows.userId, billId: billFollows.billId, lastStage: billFollows.lastStage, stage: officialBillDepth.stage, stageDate: officialBillDepth.stageDate,
    title: officialBills.title, billType: officialBills.billType, number: officialBills.number, email: readerAccounts.email, verifiedAt: readerAccounts.verifiedAt })
    .from(billFollows).innerJoin(officialBillDepth, eq(officialBillDepth.billId, billFollows.billId)).innerJoin(officialBills, eq(officialBills.id, billFollows.billId))
    .leftJoin(readerAccounts, eq(readerAccounts.appUserId, billFollows.userId))
    .where(and(isNotNull(officialBillDepth.stage), or(sql`${billFollows.lastStage} is null`, ne(billFollows.lastStage, officialBillDepth.stage)))).limit(200);
  let sent = 0, skipped = 0, failed = 0;
  for (const m of moved) {
    const set = { lastStage: m.stage, lastAlertAt: Date.now() };
    const label = billLabel(m.billType, m.number), stage = STAGE_LABEL[m.stage as StageKey] ?? m.stage;
    // Round D: an in-app / push alert for every follower whose bill moved (push only where they turned it on), unless they switched bill alerts off.
    const pref = await db.select({ on: alertPrefs.instantBills }).from(alertPrefs).where(eq(alertPrefs.userId, m.userId)).get();
    if (pref && !pref.on) { await db.update(billFollows).set({ lastStage: m.stage }).where(and(eq(billFollows.userId, m.userId), eq(billFollows.billId, m.billId))); skipped++; continue; }
    if (m.lastStage) await import("@/lib/push").then(p => p.notifyUser(m.userId, { title: `${label}: ${stage}`, body: m.title, url: `/bills/${m.billId}` })).catch(() => null);
    if (!m.lastStage || !m.email || !m.verifiedAt) { skipped++; await db.update(billFollows).set({ lastStage: m.stage }).where(and(eq(billFollows.userId, m.userId), eq(billFollows.billId, m.billId))); continue; }
    const r = await sendTo(m.email, `${label}: ${stage}`, [`A bill you follow moved.`, "", `${label}, ${m.title}`, `Now: ${stage}${m.stageDate ? ` (${m.stageDate})` : ""}.`, "",
      `See the bill: ${SITE}/bills/${m.billId}`, "", "You get this because you follow this bill on On Record. Unfollow on the bill page to stop."].join("\n"));
    if (r.ok) { sent++; await db.update(billFollows).set(set).where(and(eq(billFollows.userId, m.userId), eq(billFollows.billId, m.billId))); } else failed++;
  }
  return { checked: moved.length, sent, skipped, failed };
}

export async function billFollowCounts() {
  const r = await getDb().select({ n: sql<number>`count(*)`, readers: sql<number>`count(distinct ${billFollows.userId})` }).from(billFollows).get();
  return { follows: Number(r?.n ?? 0), readers: Number(r?.readers ?? 0) };
}
