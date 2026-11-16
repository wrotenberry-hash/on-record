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
