"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { currentAppUserId, viewerAccess } from "@/lib/viewer";
import { withinLimit } from "@/lib/verify/store";
import { joinCodeHash } from "@/lib/associations/codes";
import { alreadyMessage, JOIN_NO_MATCH, JOIN_NOT_OPEN, JOIN_TOO_MANY, joinedMessage, leftMessage } from "@/lib/associations/rules";
import { associationsEnabled } from "@/lib/associations/session";
import { joinAssociation, leaveAssociation } from "@/lib/associations/store";

/** What the join and leave forms on the Account page say back. `n` changes on every answer so the code field is cleared. */
export type MemberState = { ok: boolean; message: string | null; n: number };

/** The reader's own account, found as the rest of the Account page finds it. Never taken from the form. */
async function account() {
  const access = await viewerAccess();
  if (!access.allowed) return null;
  const a = await currentAccount();
  if (a) return a;
  const u = await currentAppUserId();
  return u ? accountForAppUser(u) : null;
}

/**
 * Join an association with its code, or leave one (one tap). The account is the signed-in reader's; the association
 * learns nothing from either: no list of members exists anywhere it can look.
 */
export async function memberAction(prev: MemberState, formData: FormData): Promise<MemberState> {
  const say = (ok: boolean, message: string): MemberState => ({ ok, message, n: prev.n + 1 });
  if (!associationsEnabled()) return say(false, "Associations are not switched on.");
  const a = await account();
  if (!a) return say(false, "Sign in to your account first.");
  const db = getDb();
  if (formData.get("do") === "leave") {
    const id = String(formData.get("associationId") ?? "");
    const name = /^[0-9a-f-]{36}$/.test(id) ? await leaveAssociation(db, { accountId: a.id, associationId: id }) : null;
    revalidatePath("/account");
    return name ? say(true, leftMessage(name)) : say(false, "You are not a member of that association.");
  }
  // Every try counts toward the limit, right or wrong, so a code cannot be guessed by trying many.
  if (!(await withinLimit("assoc_join_account_day", a.id))) return say(false, JOIN_TOO_MANY);
  const hash = await joinCodeHash(formData.get("code"));
  if (!hash) return say(false, JOIN_NO_MATCH);
  const r = await joinAssociation(db, { accountId: a.id, joinCodeHash: hash, now: Date.now() });
  if (!r.ok) return say(false, r.why === "not_open" ? JOIN_NOT_OPEN : JOIN_NO_MATCH);
  revalidatePath("/account");
  return say(true, r.already ? alreadyMessage(r.name) : joinedMessage(r.name));
}
