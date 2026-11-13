"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { officialPoliticians, userFollows } from "@/db/schema";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";

/** Follow or unfollow a member. Phase A: the signed-in editor only. Phase C opens this to public accounts. */
export async function toggleFollow(formData: FormData) {
  const politicianId = String(formData.get("politicianId") ?? "");
  const access = await viewerAccess();
  if (!access.allowed || !/^[A-Z]\d{6}$/.test(politicianId)) return;
  const userId = await currentAppUserId(true);
  if (!userId) return;
  const db = getDb();
  const exists = await db.select({ id: officialPoliticians.id }).from(officialPoliticians).where(eq(officialPoliticians.id, politicianId)).get();
  if (!exists) return;
  const following = await db.select().from(userFollows).where(and(eq(userFollows.userId, userId), eq(userFollows.politicianId, politicianId))).get();
  if (following) await db.delete(userFollows).where(and(eq(userFollows.userId, userId), eq(userFollows.politicianId, politicianId)));
  else await db.insert(userFollows).values({ userId, politicianId, createdAt: Date.now() }).onConflictDoNothing();
  revalidatePath(`/politicians/${politicianId}`); revalidatePath("/politicians"); revalidatePath("/following");
}
