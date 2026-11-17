import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBills, positionHistory } from "@/db/schema";
import { currentAppUserId, type ViewerAccess } from "@/lib/viewer";
import { countEvent } from "@/lib/events";
import { setAnswer, type Answer } from "@/lib/opinions";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { castCounted } from "@/lib/verify/flow";
import { ensureDeviceCookie, profileFor } from "@/lib/verify/store";
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
  await setAnswer(userId, billId, answer, null);
  await countEvent(`answer_${answer}`, access.audience);
  const first = before === 0, stance = answer === "unsure" ? null : answer;
  if (!verificationConfig().enabled) return { ok: true, first, note: null };
  await ensureDeviceCookie();
  const account = (await currentAccount()) ?? (await accountForAppUser(userId));
  const profile = account ? await profileFor(account.id).catch(() => null) : null;
  if (account && profile && (profile.tier ?? 0) >= 1 && !profile.firstVoteChallengeAt) return { ok: true, first, note: stance ? "finish_on_bill_page" : null };
  const outcome = await castCounted({ userId, account, billId, stance, reason: null, turnstile: null });
  if (outcome.counted) await countEvent(stance ? "position_counted" : "position_uncounted", access.audience);
  return { ok: true, first, note: outcome.code === "counted" ? "counted" : outcome.code === "rate" ? "rate" : outcome.code?.startsWith("from-") ? "counts_later" : null };
}
