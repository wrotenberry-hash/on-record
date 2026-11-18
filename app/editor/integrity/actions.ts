"use server";
import { revalidatePath } from "next/cache";
import { requireEditorUser } from "@/lib/auth";
import { decideFlag } from "@/lib/verify/anomaly";

export async function decideIntegrityFlag(formData: FormData) {
  await requireEditorUser("/editor/integrity");
  const id = String(formData.get("flagId") ?? ""), d = String(formData.get("decision") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id) || (d !== "clear" && d !== "confirm")) return;
  await decideFlag(id, d);
  revalidatePath("/editor/integrity");
}

/** An account set aside for review (household cap or a review signal): "clear" counts it again, "confirm" keeps it out. Nothing is deleted. */
export async function decideAccountHold(formData: FormData) {
  await requireEditorUser("/editor/integrity");
  const id = String(formData.get("holdId") ?? ""), d = String(formData.get("decision") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id) || (d !== "clear" && d !== "confirm")) return;
  const { getDb } = await import("@/db"), { billsOfAccounts, decideHold } = await import("@/lib/verify/residence-store"), { recomputeBill } = await import("@/lib/verify/store");
  const accountId = await decideHold(getDb(), id, d, Date.now());
  if (accountId) for (const b of await billsOfAccounts(getDb(), [accountId])) await recomputeBill(b);
  revalidatePath("/editor/integrity");
}
