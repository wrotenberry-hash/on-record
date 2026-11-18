"use server";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { recordVisit } from "@/lib/visits";

/** Called once per browser tab session by the visit marker. */
export async function markVisit() {
  const access = await viewerAccess();
  if (!access.allowed) return;
  // Only a trial reader's visit counts toward the week-two return rate; the editor's own visits never do.
  await recordVisit(access.invite || access.editor ? await currentAppUserId() : null, Date.now(), !!access.invite && !access.editor);
}
