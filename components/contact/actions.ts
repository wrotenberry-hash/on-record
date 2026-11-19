"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { countEvent } from "@/lib/events";
import { followBill, knownBill, unfollowBill } from "@/lib/loop/follows";

/**
 * Closing the loop on a bill a reader contacted an office about (owner's point 4, 18 Nov 2026).
 *
 * The site does not record which bill a reader contacted an office about, which office, or what they wrote
 * (lib/contacts.ts counts taps in total only), and this file keeps it that way. Instead, the first time a reader
 * uses the call, copy, form or email button on a bill's contact panel, the bill is added to their followed bills:
 * the same bill_follows row the "Follow this bill" button writes (reader, bill, time). The panel then says
 * "We'll tell you what happens to this bill." with a Stop button that removes the row.
 *
 * Only the bill's id comes in. No member, no office, no message, no button name.
 */
async function reader(billId: unknown): Promise<{ userId: string; billId: string; audience: string } | null> {
  const access = await viewerAccess();
  if (!access.allowed || (!access.invite && !access.editor)) return null;
  const id = typeof billId === "string" ? billId : "";
  if (!/^[A-Za-z0-9-]{3,60}$/.test(id) || !(await knownBill(getDb(), id))) return null;
  const userId = await currentAppUserId(true);
  return userId ? { userId, billId: id, audience: access.audience } : null;
}
const pathOf = (billId: string) => (billId.startsWith("tx-") ? `/texas/bills/${billId}` : `/bills/${billId}`);

/** Follows the bill for this reader. Returns whether the reader now follows it. */
export async function followAfterContact(billId: string): Promise<{ following: boolean }> {
  const r = await reader(billId);
  if (!r) return { following: false };
  const added = await followBill(getDb(), r.userId, r.billId);
  if (added) { await countEvent("bill_follow_add", r.audience); revalidatePath(pathOf(r.billId)); }
  return { following: true };
}

/** "Stop": the reader no longer follows the bill. */
export async function stopFollowing(billId: string): Promise<{ following: boolean }> {
  const r = await reader(billId);
  if (!r) return { following: false };
  await unfollowBill(getDb(), r.userId, r.billId);
  await countEvent("bill_follow_remove", r.audience);
  revalidatePath(pathOf(r.billId));
  return { following: false };
}
