"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { betaInvites } from "@/db/schema";
import { editorialAuth } from "@/lib/editor-auth";

/** Revoke or restore one invite link. Editor only. Takes effect on the invitee's next request. */
export async function setInviteRevoked(formData: FormData) {
  const auth = await editorialAuth();
  if (!auth.user) return;
  const id = String(formData.get("inviteId") ?? ""), revoke = formData.get("action") === "revoke";
  if (!/^inv_[a-z0-9]{10}$/.test(id)) return;
  await getDb().update(betaInvites).set({ revokedAt: revoke ? Date.now() : null }).where(eq(betaInvites.id, id));
  revalidatePath("/editor/trial");
}

/** A private note on who an invite went to, so the editor can keep track. Never shown to anyone else. */
export async function labelInvite(formData: FormData) {
  const auth = await editorialAuth();
  if (!auth.user) return;
  const id = String(formData.get("inviteId") ?? ""), label = String(formData.get("label") ?? "").trim().slice(0, 60) || null;
  if (!/^inv_[a-z0-9]{10}$/.test(id)) return;
  await getDb().update(betaInvites).set({ label }).where(eq(betaInvites.id, id));
  revalidatePath("/editor/trial");
}
