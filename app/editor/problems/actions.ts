"use server";
import { revalidatePath } from "next/cache";
import { requireEditorUser } from "@/lib/auth";
import { resolveProblem } from "@/lib/problems";

export async function closeProblem(formData: FormData) {
  await requireEditorUser("/editor/problems");
  const id = String(formData.get("id") ?? ""), s = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id) || !["fixed", "no_change", "dismissed"].includes(s)) return;
  await resolveProblem(id, s as "fixed" | "no_change" | "dismissed", formData.get("resolution") ? String(formData.get("resolution")) : null);
  revalidatePath("/editor/problems");
}
