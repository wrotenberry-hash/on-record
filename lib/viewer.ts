import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers } from "@/db/schema";
import { getEditorUser, type EditorUser } from "@/lib/auth";
import { entryAccess, PUBLIC_READ_FLAG, publicReadEnabled, SHARED_PAGES_FLAG, sharedPagesEnabled, type EntryPage } from "@/lib/public-access";
import { pictureShared, shareGrant } from "@/lib/entry/store";
import { currentInvite } from "@/lib/trial";
import type { Audience } from "@/lib/event-dims";

/**
 * Who may see the legislation pages. With public reading on, everyone. With it
 * off, a signed-in editor (private preview) or an invite-only trial reader whose
 * link is genuine, unrevoked and whose trial has opened (lib/trial.ts). Nothing
 * here makes data readable to an anonymous visitor while the switch is off.
 */
export type ViewerAccess = { allowed: boolean; preview: boolean; editor: EditorUser | null; invite: { id: string; number: number; activeDays: number } | null; audience: Audience };
export async function viewerAccess(): Promise<ViewerAccess> {
  const publicRead = publicReadEnabled(process.env[PUBLIC_READ_FLAG]);
  const editor = await getEditorUser();
  const invite = !publicRead && !editor ? await currentInvite() : null;
  const audience: Audience = editor ? "editor" : publicRead ? "public" : invite ? "trial" : "closed";
  return { allowed: publicRead || !!editor || !!invite, preview: !publicRead && (!!editor || !!invite), editor, invite, audience };
}

/**
 * The narrower switch, SHARED_PAGES_PUBLIC (lib/public-access.ts; OFF by default). For the three kinds of page it can
 * open: one bill reached through a share link, a shared card's picture, and an issue page.
 *
 * `shared` is true only for a visitor the present rule turns away and the narrower switch lets in. Such a visitor is
 * given no identity (no editor, no invite), so every reader feature on the page stays off. With the switch off this
 * returns exactly what viewerAccess() returns, with `shared` false.
 */
export type EntryAccess = ViewerAccess & { shared: boolean };
export type EntryRequest = { kind: "bill"; billKey: string; code?: string | null } | { kind: "issue" } | { kind: "picture"; target: string };
export async function entryViewer(request: EntryRequest): Promise<EntryAccess> {
  const base = await viewerAccess(), sharedPages = sharedPagesEnabled(process.env[SHARED_PAGES_FLAG]);
  if (base.allowed || !sharedPages) return { ...base, shared: false };
  const page: EntryPage = request.kind === "picture" ? { kind: "picture", shared: await pictureShared(getDb(), request.target).catch(() => false) } : request.kind === "bill" ? { kind: "bill", billKey: request.billKey } : { kind: "issue" };
  const grant = request.kind === "bill" ? (await shareGrant(getDb(), request.code).catch(() => null))?.billKey ?? null : null;
  const a = entryAccess({ base: false, sharedPages, page, grant });
  return a.allowed ? { allowed: true, preview: false, editor: null, invite: null, audience: "public", shared: true } : { ...base, shared: false };
}
/** Whether the narrower switch is on. For titles, the sitemap and robots, which follow it. */
export function sharedPagesOn(): boolean { return sharedPagesEnabled(process.env[SHARED_PAGES_FLAG]); }

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The app-user row for the viewer, created on first use: the editor (keyed by a
 * hash of the editor email) or a trial reader (keyed by the invite id). No email
 * or name is stored for either. Public accounts arrive in Phase C.
 */
export async function currentAppUserId(create = false): Promise<string | null> {
  const editor = await getEditorUser();
  const invite = editor ? null : await currentInvite();
  if (!editor && !invite) return null;
  const externalKey = editor ? `editor:${await sha256(editor.email.trim().toLowerCase())}` : `invite:${invite!.id}`;
  const kind = editor ? "editor" as const : "public" as const;
  const db = getDb();
  const found = await db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.externalKey, externalKey)).get();
  if (found || !create) return found?.id ?? null;
  await db.insert(appUsers).values({ id: crypto.randomUUID(), kind, externalKey, createdAt: Date.now() }).onConflictDoNothing();
  return (await db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.externalKey, externalKey)).get())?.id ?? null;
}
