import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers } from "@/db/schema";
import { getEditorUser, type EditorUser } from "@/lib/auth";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";

/**
 * Who may see the legislation pages. With public reading on, everyone. With it
 * off, only a signed-in editor, as a private preview. Nothing here makes data
 * readable to an anonymous visitor while the switch is off.
 */
export async function viewerAccess(): Promise<{ allowed: boolean; preview: boolean; editor: EditorUser | null }> {
  const publicRead = publicReadEnabled(process.env[PUBLIC_READ_FLAG]);
  const editor = await getEditorUser();
  return { allowed: publicRead || !!editor, preview: !publicRead && !!editor, editor };
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The app-user row for the signed-in viewer, created on first use. Phase A has
 * only the editor; the email itself is not stored, only a hash used as a key.
 * Public accounts arrive in Phase C.
 */
export async function currentAppUserId(create = false): Promise<string | null> {
  const editor = await getEditorUser();
  if (!editor) return null;
  const externalKey = `editor:${await sha256(editor.email.trim().toLowerCase())}`;
  const db = getDb();
  const found = await db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.externalKey, externalKey)).get();
  if (found || !create) return found?.id ?? null;
  await db.insert(appUsers).values({ id: crypto.randomUUID(), kind: "editor", externalKey, createdAt: Date.now() }).onConflictDoNothing();
  return (await db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.externalKey, externalKey)).get())?.id ?? null;
}
