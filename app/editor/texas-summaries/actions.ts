"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { txSummaries } from "@/db/schema";
import { editorialAuth } from "@/lib/editor-auth";
import { currentAppUserId } from "@/lib/viewer";
import { decideTxSummary } from "@/lib/texas/summaries";

/**
 * An editor's decision on a held or sampled Texas summary. Approve makes it visible (readers see it only once the
 * Texas gate is open); reject hides it for good. Only an allowlisted editor.
 */
export async function decideTexasSummary(formData: FormData) {
  const auth = await editorialAuth();
  if (!auth.user) return;
  const summaryId = String(formData.get("summaryId") ?? ""), decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || undefined;
  if (!/^[\w:.-]{6,80}$/.test(summaryId) || (decision !== "approved" && decision !== "rejected")) return;
  const row = await getDb().select({ billId: txSummaries.billId }).from(txSummaries).where(eq(txSummaries.id, summaryId)).get();
  if (!row) return;
  await decideTxSummary(summaryId, decision, (await currentAppUserId(true)) ?? "editor", note);
  revalidatePath("/editor/texas-summaries");
  revalidatePath(`/texas/bills/${row.billId}`);
}
