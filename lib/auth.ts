import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Editor identity comes from Supabase Auth (magic-link email). The session
 * cookie is HttpOnly and read on the server only; nothing here runs in the
 * browser. The allowlist check lives in `lib/editor-auth.ts`.
 */
export type EditorUser = { userId: string; email: string; displayName: string };

export const LOGIN_PATH = "/login";

export function authConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim());
}

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return store.getAll(); },
      setAll(list) {
        // Server Components cannot set cookies; route handlers and server actions can.
        try { for (const { name, value, options } of list) store.set(name, value, options); } catch { /* read-only context */ }
      },
    },
  });
}

export async function getEditorUser(): Promise<EditorUser | null> {
  if (!authConfigured()) return null;
  const { data, error } = await (await supabaseServer()).auth.getUser();
  if (error || !data.user?.email) return null;
  const name = typeof data.user.user_metadata?.full_name === "string" ? data.user.user_metadata.full_name : null;
  return { userId: data.user.id, email: data.user.email, displayName: name || data.user.email };
}

export async function requireEditorUser(returnTo: string): Promise<EditorUser> {
  const user = await getEditorUser();
  if (user) return user;
  redirect(loginPath(returnTo));
}

export function loginPath(returnTo = "/editor"): string {
  return `${LOGIN_PATH}?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export function safeRelativeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/editor";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || url.pathname.startsWith("/auth") || url.pathname === LOGIN_PATH) return "/editor";
    return `${url.pathname}${url.search}`;
  } catch { return "/editor"; }
}
