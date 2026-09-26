"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authConfigured, reviewerEmail, safeRelativeReturnPath, SESSION_COOKIE, SESSION_TTL_MS, sessionCookieOptions } from "@/lib/auth";
import { sameAccessKey, signSession } from "@/lib/session-token";

/** Exchanges the editor access key for a signed 30-day session cookie. */
export async function signInWithKey(formData: FormData) {
  const supplied = String(formData.get("access_key") ?? "").trim();
  const returnTo = safeRelativeReturnPath(String(formData.get("return_to") ?? ""));
  const back = (status: string) => redirect(`/login?status=${status}&return_to=${encodeURIComponent(returnTo)}`);
  if (!authConfigured()) back("unconfigured");
  if (!supplied || supplied.length > 512) back("denied");
  if (!await sameAccessKey(supplied, process.env.EDITOR_ACCESS_KEY)) {
    // A wrong key costs a moment; the key is 256 bits of randomness, so guessing is not a practical attack.
    await new Promise(resolve => setTimeout(resolve, 750));
    back("denied");
  }
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = await signSession(process.env.EDITOR_ACCESS_KEY!.trim(), reviewerEmail()!, expiresAt);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  redirect(returnTo);
}
