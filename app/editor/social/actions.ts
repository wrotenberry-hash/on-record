"use server";
import { revalidatePath } from "next/cache";
import { requireEditorUser } from "@/lib/auth";
import { decidePost, draftDailyPosts } from "@/lib/social";

export async function decideQueuedPost(formData: FormData) {
  await requireEditorUser("/editor/social");
  const id = String(formData.get("id") ?? ""), d = String(formData.get("decision") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id) || (d !== "approve" && d !== "reject")) return;
  await decidePost(id, d, formData.get("caption") ? String(formData.get("caption")) : null);
  revalidatePath("/editor/social");
}
export async function draftToday() {
  await requireEditorUser("/editor/social");
  await draftDailyPosts();
  revalidatePath("/editor/social");
}
