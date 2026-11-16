"use server";
import { revalidatePath } from "next/cache";
import { currentAppUserId, viewerAccess } from "@/lib/viewer";
import { comingItems, setReminder } from "@/lib/reminders";
import { countEvent } from "@/lib/events";

export async function toggleReminder(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed || (!access.invite && !access.editor)) return;
  const userId = await currentAppUserId(true);
  if (!userId) return;
  const key = String(formData.get("key") ?? ""), on = formData.get("on") === "1";
  const item = (await comingItems()).find(i => i.key === key);
  if (!item) return;
  await setReminder(userId, item, on);
  await countEvent(on ? "reminder_on" : "reminder_off", access.audience);
  revalidatePath("/coming");
}
