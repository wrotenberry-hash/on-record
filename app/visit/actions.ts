"use server";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { recordVisit } from "@/lib/visits";

/** Called once per browser tab session by the visit marker. */
export async function markVisit() {
  const access = await viewerAccess();
  if (!access.allowed) return;
  await recordVisit(access.invite || access.editor ? await currentAppUserId() : null);
}
