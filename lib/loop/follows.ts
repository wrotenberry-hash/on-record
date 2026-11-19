/**
 * Following a bill (bill_follows): the reader's own list, never shown to anyone else. A row holds the reader, the
 * bill, the time and the bill's stage when they followed. Nothing else: not how the follow came about, not an
 * office, not a message. Database handle first, so tests/loop.test.mjs runs these against a temporary database.
 */
import { and, eq } from "drizzle-orm";
import { billFollows, officialBillDepth, officialBills, txBills } from "../../db/schema.ts";
import type { Db } from "../verify/residence-store.ts";

export async function isFollowing(db: Db, userId: string | null, billId: string): Promise<boolean> {
  if (!userId) return false;
  return !!(await db.select({ b: billFollows.billId }).from(billFollows).where(and(eq(billFollows.userId, userId), eq(billFollows.billId, billId))).get());
}

/** A bill the site has on record, in Congress or in Texas; null for anything else. */
export async function knownBill(db: Db, billId: string): Promise<"federal" | "state" | null> {
  if (await db.select({ id: officialBills.id }).from(officialBills).where(eq(officialBills.id, billId)).get()) return "federal";
  return (await db.select({ id: txBills.id }).from(txBills).where(eq(txBills.id, billId)).get()) ? "state" : null;
}

/** Follows the bill. True when this added it; false when the reader already followed it. */
export async function followBill(db: Db, userId: string, billId: string, now = Date.now()): Promise<boolean> {
  const stage = (await db.select({ s: officialBillDepth.stage }).from(officialBillDepth).where(eq(officialBillDepth.billId, billId)).get())?.s ?? null;
  const rows = await db.insert(billFollows).values({ userId, billId, createdAt: now, lastStage: stage }).onConflictDoNothing().returning({ b: billFollows.billId });
  return rows.length > 0;
}

export async function unfollowBill(db: Db, userId: string, billId: string) {
  await db.delete(billFollows).where(and(eq(billFollows.userId, userId), eq(billFollows.billId, billId)));
}

/**
 * The stages a closing-the-loop notice already tells a follower about (lib/loop/notices.ts): a passage, a failed
 * vote, a law, a veto. The older "a bill you follow moved" email skips these, so one event is one message.
 */
export const LOOP_STAGES: ReadonlySet<string> = new Set(["passed_first", "passed_second", "law", "vetoed", "failed", "not_taken_up", "debate_blocked"]);
