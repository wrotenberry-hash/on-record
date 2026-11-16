"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { officialBills } from "@/db/schema";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { setStance } from "@/lib/opinions";
import { countEvent } from "@/lib/events";
import { redirect } from "next/navigation";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { castCounted } from "@/lib/verify/flow";
import { ensureDeviceCookie } from "@/lib/verify/store";
import { verificationConfig } from "@/lib/verify/config";

/** The reader's own Support or Oppose on a bill (or clear it). Kept private to that reader. */
export async function saveStance(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed || (!access.invite && !access.editor)) return;
  const billId = String(formData.get("billId") ?? ""), raw = String(formData.get("stance") ?? "");
  const stance = raw === "support" || raw === "oppose" ? raw : null;
  if (!/^\d{2,3}-[a-z]+-\d+$/.test(billId)) return;
  if (!(await getDb().select({ id: officialBills.id }).from(officialBills).where(eq(officialBills.id, billId)).get())) return;
  const userId = await currentAppUserId(true);
  if (!userId) return;
  await setStance(userId, billId, stance);
  await countEvent(stance ? "stance_set" : "stance_cleared", access.audience);
  // Round J: a verified reader's answer also goes toward the tier totals (behind VERIFICATION_ENABLED).
  if (verificationConfig().enabled) {
    await ensureDeviceCookie();
    const account = (await currentAccount()) ?? (await accountForAppUser(userId));
    const outcome = await castCounted({ userId, account, billId, stance, reason: formData.get("reason"), turnstile: String(formData.get("cf-turnstile-response") ?? "") || null });
    if (outcome.counted) await countEvent(stance ? "position_counted" : "position_uncounted", access.audience);
    revalidatePath(`/bills/${billId}`);
    if (outcome.code) redirect(`/bills/${billId}?c=${outcome.code}#your-view`);
    return;
  }
  revalidatePath(`/bills/${billId}`);
}
