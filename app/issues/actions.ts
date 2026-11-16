"use server";
import { redirect } from "next/navigation";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { pickedIssues, savePickedIssues } from "@/lib/reader-issues";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";
import { countEvent } from "@/lib/events";

/** Follow or stop following one issue from its page (the same 3 issues picked when getting started). */
export async function toggleIssue(formData: FormData) {
  const access = await viewerAccess();
  const slug = String(formData.get("slug") ?? "");
  if (!access.allowed || !ISSUE_CATEGORIES.some(c => c.slug === slug)) redirect("/issues");
  const userId = access.invite || access.editor ? await currentAppUserId(true) : null;
  const now = await pickedIssues(userId);
  if (now.includes(slug)) { await savePickedIssues(userId, now.filter(s => s !== slug)); await countEvent("issue_unfollow", access.audience); redirect(`/issues/${slug}`); }
  if (now.length >= 3) redirect(`/issues/${slug}?full=1`);
  await savePickedIssues(userId, [...now, slug]); await countEvent("issue_follow", access.audience);
  redirect(`/issues/${slug}?followed=1`);
}
