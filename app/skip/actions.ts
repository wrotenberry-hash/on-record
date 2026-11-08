"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { representations } from "@/db/schema";
import { verifyAction } from "@/lib/session-token";

/** Confirms a "not today" link from the morning email: verifies the token, then defers the case. */
export async function confirmSkip(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  const action = await verifyAction(process.env.EDITOR_ACCESS_KEY, "defer", token);
  if (!action) redirect("/skip?status=expired");
  await getDb().update(representations).set({ deferredAt: Date.now() }).where(eq(representations.id, action.subject));
  redirect("/skip?status=done");
}
