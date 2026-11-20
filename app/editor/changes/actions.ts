"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { editorialAuth } from "@/lib/editor-auth";
import { currentAppUserId } from "@/lib/viewer";
import * as queue from "@/lib/changes/queue-store";

/**
 * The editor's decisions on a drafted menu of changes (owner, 20 Nov 2026: "nothing goes live until the editor
 * approves it"). Every action checks for an allowlisted editor before it reads or writes anything, the same way the
 * bill-summary review does. The editor does not rewrite wording here: an option is approved or rejected as drafted.
 * Nothing these actions write is shown to a reader in this phase.
 */
const ID = /^[\w:.-]{1,120}$/;
const decisionOf = (v: FormDataEntryValue | null): queue.Decision | null => (v === "approved" || v === "rejected" ? v : null);
function refresh(menuId: string) {
  revalidatePath("/editor/changes");
  revalidatePath(`/editor/changes/${menuId}`);
}

/** Approve or reject one option. A short note may go with a rejection. */
export async function decideOption(formData: FormData) {
  const auth = await editorialAuth();
  if (!auth.user) return;
  const optionId = String(formData.get("optionId") ?? ""), decision = decisionOf(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  if (!ID.test(optionId) || !decision) return;
  const menuId = await queue.decideOption(getDb(), { optionId, decision, note, by: (await currentAppUserId(true)) ?? "editor", now: Date.now() });
  if (menuId) refresh(menuId);
}

/** Approve or reject every option of one group at once, so both directions are decided together. */
export async function decideGroup(formData: FormData) {
  const auth = await editorialAuth();
  if (!auth.user) return;
  const menuId = String(formData.get("menuId") ?? ""), groupKey = String(formData.get("groupKey") ?? ""), decision = decisionOf(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  if (!ID.test(menuId) || !groupKey || groupKey.length > 300 || !decision) return;
  const changed = await queue.decideGroup(getDb(), { menuId, groupKey, decision, note, by: (await currentAppUserId(true)) ?? "editor", now: Date.now() });
  if (changed) refresh(menuId);
}

/** Approve the whole menu. Refused, with nothing written, unless the rules in lib/changes/queue-rules.ts (`canGoLive`) find nothing. */
export async function makeLive(formData: FormData) {
  const auth = await editorialAuth();
  if (!auth.user) return;
  const menuId = String(formData.get("menuId") ?? "");
  if (!ID.test(menuId)) return;
  await queue.makeLive(getDb(), { menuId, by: (await currentAppUserId(true)) ?? "editor", now: Date.now() });
  refresh(menuId);
}

/** Set a menu aside. Nothing is deleted. */
export async function closeMenu(formData: FormData) {
  const auth = await editorialAuth();
  if (!auth.user) return;
  const menuId = String(formData.get("menuId") ?? "");
  if (!ID.test(menuId)) return;
  await queue.closeMenu(getDb(), { menuId, by: (await currentAppUserId(true)) ?? "editor", now: Date.now() });
  refresh(menuId);
}
