"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { analysisBillSummaries, analysisReviewQueue } from "@/db/schema";
import { editorialAuth } from "@/lib/editor-auth";
import { currentAppUserId } from "@/lib/viewer";

/**
 * An editor's decision on a queued summary. Approve shows it to readers (once
 * public reading is on); reject hides it for good. Only an allowlisted editor.
 */
export async function decideSummary(formData: FormData) {
  const auth = await editorialAuth();
  if (!auth.user) return;
  const queueId = String(formData.get("queueId") ?? ""), decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  if (!/^[\w-]{10,64}$/.test(queueId) || !["approved", "rejected"].includes(decision)) return;
  const db = getDb();
  const item = await db.select().from(analysisReviewQueue).where(eq(analysisReviewQueue.id, queueId)).get();
  if (!item) return;
  const now = Date.now(), reviewerKey = await currentAppUserId(true);
  await db.update(analysisReviewQueue).set({ status: decision as "approved" | "rejected", note, reviewerKey, decidedAt: now }).where(eq(analysisReviewQueue.id, queueId));
  await db.update(analysisBillSummaries).set({ status: decision === "approved" ? "visible" : "rejected", reviewedAt: now }).where(eq(analysisBillSummaries.id, item.summaryId));
  const bill = await db.select({ billId: analysisBillSummaries.billId }).from(analysisBillSummaries).where(eq(analysisBillSummaries.id, item.summaryId)).get();
  revalidatePath("/editor/analysis");
  if (bill) revalidatePath(`/bills/${bill.billId}`);
}
