"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { countEvent } from "@/lib/events";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { saveVote } from "@/lib/verify/flow";
import { ensureDeviceCookie, recomputeBill } from "@/lib/verify/store";
import { verificationConfig } from "@/lib/verify/config";
import { decideLegacy, jurisdictionOf } from "@/lib/constituent/store";

/** Where a bill's page is, from its jurisdiction: federal bills at /bills/…, Texas bills at /texas/bills/…. */
const pageOf = (billKey: string, level: "federal" | "state") => (level === "federal" ? `/bills/${billKey}` : `/texas/bills/${encodeURIComponent(billKey)}`);

/**
 * Support, Oppose or Unsure on any bill, federal or state, or clearing the answer. One path for every bill
 * (docs/CONSTITUENT_VOICE.md): the answer is saved for the reader; whether it counts is decided by the rules, never here.
 */
export async function castBillVote(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed || (!access.invite && !access.editor)) return;
  const billKey = String(formData.get("billId") ?? "").slice(0, 120), raw = String(formData.get("stance") ?? "");
  const answer = raw === "support" || raw === "oppose" || raw === "unsure" ? raw : null;
  if (!/^[\w:./-]{3,120}$/.test(billKey)) return;
  const j = await jurisdictionOf(getDb(), billKey); // null: not a bill the site holds
  if (!j) return;
  const userId = await currentAppUserId(true);
  if (!userId) return;
  if (verificationConfig().enabled) await ensureDeviceCookie();
  const account = (await currentAccount()) ?? (await accountForAppUser(userId));
  const outcome = await saveVote({ userId, account, billKey, answer, reason: formData.get("reason"), turnstile: String(formData.get("cf-turnstile-response") ?? "") || null });
  await countEvent(answer ? `answer_${answer}` : "stance_cleared", access.audience);
  if (outcome.counted) await countEvent("position_counted", access.audience);
  const page = pageOf(billKey, j.level);
  revalidatePath(page);
  if (outcome.code) redirect(`${page}?c=${outcome.code}#your-view`);
}

/** The reader's one-time choice about answers they gave before answers were added into totals: count them, or keep them private. */
export async function chooseEarlierAnswers(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed || (!access.invite && !access.editor)) return;
  const choice = String(formData.get("choice") ?? ""), back = String(formData.get("back") ?? "/");
  if (choice !== "count" && choice !== "private") return;
  const userId = await currentAppUserId(true);
  if (!userId) return;
  const bills = await decideLegacy(getDb(), userId, choice);
  if (verificationConfig().enabled) for (const b of bills) await recomputeBill(b);
  await countEvent(choice === "count" ? "earlier_answers_counted" : "earlier_answers_private", access.audience);
  const to = /^\/[\w/%.-]*$/.test(back) ? back : "/";
  revalidatePath(to);
  redirect(to.includes("/bills/") ? `${to}#your-view` : to);
}
