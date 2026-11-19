"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { countEvent } from "@/lib/events";
import { toggleMemberFollow } from "@/lib/follow-defaults";

/**
 * Follow or unfollow a member: the signed-in editor or a trial reader. A member of Congress (by Biographical
 * Directory id) or a Texas legislator (by the id in tx_people); any other id is ignored (lib/follow-defaults.ts).
 */
export async function toggleFollow(formData: FormData) {
  const politicianId = String(formData.get("politicianId") ?? "");
  const access = await viewerAccess();
  if (!access.allowed || (!access.invite && !access.editor)) return;
  const userId = await currentAppUserId(true);
  if (!userId) return;
  const done = await toggleMemberFollow(getDb(), userId, politicianId);
  if (!done) return;
  await countEvent(done.following ? "follow_add" : "follow_remove", access.audience);
  revalidatePath(done.kind === "texas" ? `/texas/members/${encodeURIComponent(politicianId)}` : `/politicians/${politicianId}`);
  revalidatePath("/politicians"); revalidatePath("/following"); revalidatePath("/"); revalidatePath("/start");
}
