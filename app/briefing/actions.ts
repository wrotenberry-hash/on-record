"use server";
import { revalidatePath } from "next/cache";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { currentAppUserId, viewerAccess } from "@/lib/viewer";
import { setBriefingSubscription } from "@/lib/briefing";
import { countEvent } from "@/lib/events";

export async function toggleBriefingEmail(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed) return;
  const account = (await currentAccount()) ?? await currentAppUserId().then(u => (u ? accountForAppUser(u) : null));
  if (!account) return;
  const on = formData.get("on") === "1";
  await setBriefingSubscription(account.id, on);
  await countEvent(on ? "briefing_email_on" : "briefing_email_off", access.audience);
  revalidatePath("/briefing");
}
