import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session-token";

/**
 * Editor identity for the single-reviewer private build. The reviewer signs in
 * once at /login with EDITOR_ACCESS_KEY; the server keeps a signed, expiring
 * HttpOnly cookie. The identity recorded on attestations is the first entry of
 * EDITOR_EMAILS. Nothing from the browser is trusted beyond the cookie signature.
 * To move to per-person accounts later, replace this module only.
 */
export type EditorUser = { userId: string; email: string; displayName: string };

export const LOGIN_PATH = "/login";
export const SESSION_COOKIE = "on_record_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function authConfigured(): boolean {
  return Boolean(process.env.EDITOR_ACCESS_KEY?.trim() && reviewerEmail());
}

/** The reviewer this deployment's access key stands for. */
export function reviewerEmail(): string | null {
  return (process.env.EDITOR_EMAILS ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean)[0] ?? null;
}

export async function reviewerId(email: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.toLowerCase()));
  return `editor-${Array.from(new Uint8Array(digest).slice(0, 8), b => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function getEditorUser(): Promise<EditorUser | null> {
  if (!authConfigured()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(process.env.EDITOR_ACCESS_KEY, token);
  if (!session || session.email !== reviewerEmail()) return null;
  return { userId: await reviewerId(session.email), email: session.email, displayName: session.email };
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

export function sessionCookieOptions(expiresAt: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(expiresAt) };
}
