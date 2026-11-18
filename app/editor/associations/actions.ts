"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getEditorUser } from "@/lib/auth";
import { normaliseEmail } from "@/lib/accounts";
import { adminEmailHash, newJoinCode } from "@/lib/associations/codes";
import { cleanName, NAME_MAX, NAME_MIN } from "@/lib/associations/rules";
import { associationsEnabled } from "@/lib/associations/session";
import { addAdmin, createAssociation, removeAdmin, replaceJoinCode, setAssociationStatus } from "@/lib/associations/store";

const PAGE = "/editor/associations";
const UUID = /^[0-9a-f-]{36}$/;
/** Editor only, and only while associations are switched on. */
const allowed = async () => associationsEnabled() && !!(await getEditorUser());

/** What the two forms that make a join code say back. `code` is the code itself: it is in this answer and nowhere else. */
export type CodeState = { message: string | null; code: string | null; name: string | null };
const refused = (message: string): CodeState => ({ message, code: null, name: null });

/** A new association, not open yet. The join code is made here, shown once in the answer, and only its keyed hash is stored. */
export async function createAssociationAction(_: CodeState, formData: FormData): Promise<CodeState> {
  if (!(await allowed())) return refused("Associations are switched off, or you are signed out.");
  const name = cleanName(formData.get("name"));
  if (!name) return refused(`Give the association a name of ${NAME_MIN} to ${NAME_MAX} characters.`);
  const { code, hash } = await newJoinCode();
  await createAssociation(getDb(), { name, joinCodeHash: hash, now: Date.now() });
  revalidatePath(PAGE);
  return { message: null, code, name };
}

/** A new join code for an association; the old code stops working at once. Shown once, like the first. */
export async function newCodeAction(_: CodeState, formData: FormData): Promise<CodeState> {
  if (!(await allowed())) return refused("Associations are switched off, or you are signed out.");
  const id = String(formData.get("associationId") ?? ""), name = String(formData.get("name") ?? "");
  if (!UUID.test(id)) return refused("That association was not found.");
  const { code, hash } = await newJoinCode();
  if (!(await replaceJoinCode(getDb(), id, hash))) return refused("A closed association cannot have a new code.");
  return { message: null, code, name };
}

/** Open an association (pending → active) or close it. Closing removes every membership and cannot be undone. */
export async function setStatusAction(formData: FormData) {
  if (!(await allowed())) return;
  const id = String(formData.get("associationId") ?? ""), to = String(formData.get("to") ?? "");
  if (!UUID.test(id) || (to !== "active" && to !== "closed")) return;
  await setAssociationStatus(getDb(), id, to, Date.now());
  revalidatePath(PAGE);
}

/** Put an administrator's email on an association's list, or take one off. */
export async function addAdminAction(formData: FormData) {
  if (!(await allowed())) return;
  const id = String(formData.get("associationId") ?? ""), email = normaliseEmail(String(formData.get("email") ?? ""));
  if (!UUID.test(id) || !email) return;
  await addAdmin(getDb(), { associationId: id, email, emailHash: await adminEmailHash(email), now: Date.now() });
  revalidatePath(PAGE);
}
export async function removeAdminAction(formData: FormData) {
  if (!(await allowed())) return;
  const id = String(formData.get("adminId") ?? "");
  if (!UUID.test(id)) return;
  await removeAdmin(getDb(), id);
  revalidatePath(PAGE);
}
