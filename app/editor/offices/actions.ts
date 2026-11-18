"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requireEditorUser } from "@/lib/auth";
import { decideOffice } from "@/lib/office/store";

/** The editor confirms an office that is waiting, closes one, or lets a closed one ask again. Nothing is deleted. */
export async function decideOfficeAccount(formData: FormData) {
  const editor = await requireEditorUser("/editor/offices");
  const id = String(formData.get("officeId") ?? ""), d = String(formData.get("decision") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id) || (d !== "confirm" && d !== "revoke" && d !== "reopen")) return;
  await decideOffice(getDb(), { id, decision: d, by: editor.userId, now: Date.now() });
  revalidatePath("/editor/offices");
}
