"use server";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { recordVisit } from "@/lib/visits";
import { cookies } from "next/headers";
import { TRIAL_COOKIE, TRIAL_COOKIE_MAX_AGE_S } from "@/lib/trial";

/** Called once per browser tab session by the visit marker. */
export async function markVisit() {
  const access = await viewerAccess();
  if (!access.allowed) return;
  // Only a trial reader's visit counts toward the week-two return rate; the editor's own visits never do.
  await recordVisit(access.invite || access.editor ? await currentAppUserId() : null, Date.now(), !!access.invite && !access.editor);
  // 21 Nov 2026: staying signed in is counted from the latest visit. The same invite code is set again with a fresh 90 days;
  // only for a reader the gate has just let in through that code (a revoked or unknown code is never renewed).
  if (access.invite) {
    const jar = await cookies(), token = jar.get(TRIAL_COOKIE)?.value;
    if (token) jar.set(TRIAL_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: TRIAL_COOKIE_MAX_AGE_S });
  }
}
