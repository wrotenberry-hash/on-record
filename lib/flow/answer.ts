import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBills, positionHistory } from "@/db/schema";
import { currentAppUserId, type ViewerAccess } from "@/lib/viewer";
import { countEvent } from "@/lib/events";
import type { Answer } from "@/lib/opinions";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { saveVote } from "@/lib/verify/flow";
import { ensureDeviceCookie } from "@/lib/verify/store";
import { verificationConfig } from "@/lib/verify/config";

/**
 * One tap on Support / Oppose / Not sure outside the bill page. It follows the same path as `saveStance`
 * (app/bills/[id]/actions.ts): the same checks, `setAnswer` for the private answer, the same `answer_*` counts, and
 * `castCounted` for a verified reader. The one difference is that it hands the result back instead of sending the
 * reader to the bill page, so the answer can show as saved in place.
 *
 * A verified reader's very first counted answer needs the automatic bot check, which runs on the bill page. Here that
 * answer is saved privately and the reader is told where to finish; no failed check is recorded against them.
 */
export type SavedAnswer = { ok: boolean; first: boolean; note: "counted" | "counts_later" | "rate" | "finish_on_bill_page" | null };

export async function saveReaderAnswer(access: ViewerAccess, billId: string, answer: Answer): Promise<SavedAnswer> {
  const no: SavedAnswer = { ok: false, first: false, note: null };
  if (!access.allowed || (!access.invite && !access.editor)) return no;
  if (!/^\d{2,3}-[a-z]+-\d+$/.test(billId)) return no;
  const db = getDb();
  if (!(await db.select({ id: officialBills.id }).from(officialBills).where(eq(officialBills.id, billId)).get())) return no;
  const userId = await currentAppUserId(true);
  if (!userId) return no;
  const before = Number((await db.select({ n: sql<number>`count(*)` }).from(positionHistory).where(eq(positionHistory.userId, userId)).get())?.n ?? 0);
  const first = before === 0;
  if (verificationConfig().enabled) await ensureDeviceCookie();
  const account = (await currentAccount()) ?? (await accountForAppUser(userId));
  // The bot check before an address-matched reader's first counted answer runs on the bill page; with no token here that
  // answer is saved as a private position and the reader is told where to finish. No failed check is recorded.
  const outcome = await saveVote({ userId, account, billKey: billId, answer, reason: null, turnstile: null });
  await countEvent(`answer_${answer}`, access.audience);
  if (outcome.counted) await countEvent("position_counted", access.audience);
  return { ok: true, first, note: outcome.code === "counted" ? "counted" : outcome.code === "rate" ? "rate" : outcome.code === "challenge" ? "finish_on_bill_page" : outcome.code?.startsWith("from-") ? "counts_later" : null };
}
