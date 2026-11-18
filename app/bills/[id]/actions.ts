"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { officialBills } from "@/db/schema";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { countEvent } from "@/lib/events";

/** Follow or unfollow a bill: one email when its stage changes (readers with a verified email). */
export async function toggleBillFollow(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed || (!access.invite && !access.editor)) return;
  const billId = String(formData.get("billId") ?? "");
  if (!/^\d{2,3}-[a-z]+-\d+$/.test(billId)) return;
  if (!(await getDb().select({ id: officialBills.id }).from(officialBills).where(eq(officialBills.id, billId)).get())) return;
  const userId = await currentAppUserId(true);
  if (!userId) return;
  const { toggleBillFollowFor } = await import("@/lib/bill-follows");
  const on = await toggleBillFollowFor(userId, billId);
  await countEvent(on ? "bill_follow_add" : "bill_follow_remove", access.audience);
  revalidatePath(`/bills/${billId}`);
}

/**
 * The reader's own Support, Oppose or Unsure on a federal bill (or clear it). The single answer is private; an answer
 * that counts is added into anonymous totals (docs/CONSTITUENT_VOICE.md). Texas bills use the same path: app/voice/actions.ts.
 */
export async function saveStance(formData: FormData) {
  const { castBillVote } = await import("@/app/voice/actions");
  return castBillVote(formData);
}
