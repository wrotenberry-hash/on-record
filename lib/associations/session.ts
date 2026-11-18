import "server-only";
import { cookies } from "next/headers";
import { after } from "next/server";
import { getDb } from "@/db";
import { normaliseEmail } from "@/lib/accounts";
import { sendTo } from "@/lib/mailer";
import { signAction, verifyAction } from "@/lib/session-token";
import { requestContext, withinLimit } from "@/lib/verify/store";
import { adminEmailHash } from "@/lib/associations/codes";
import { ASSOC_LINK_TTL_MS, ASSOC_SESSION_MS, ASSOCIATIONS_FLAG, associationsOn, LINK_BAD_EMAIL, LINK_REQUESTED, LINK_TOO_MANY, signInEmail } from "@/lib/associations/rules";
import { adminsForEmail, adminSession, issueAccessLink, redeemAccessLink } from "@/lib/associations/store";

/**
 * Sign-in for an association's administrator: a single-use emailed link, then a signed cookie of its own. It is
 * separate from reader sign-in (a different cookie, a different signing purpose, a different table), so an
 * administrator's session opens nothing a reader can do and a reader's session opens nothing here. Links and the
 * cookie are signed with the site's existing secret; no new secret.
 */
export const ASSOC_COOKIE = "or_assoc";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";
const key = () => process.env.EDITOR_ACCESS_KEY?.trim() || "";

/** The one switch for everything about associations. Off by default. */
export const associationsEnabled = () => associationsOn(process.env[ASSOCIATIONS_FLAG]);

/**
 * Emails a sign-in link to an administrator. The answer is the same whether or not the address is on a list, and the
 * limits are counted for every address typed, listed or not. The list is looked up and the email sent only after the
 * answer has gone out, so how long the form takes says nothing either. One link per association the address administers.
 */
export async function requestAssociationLink(rawEmail: string): Promise<{ ok: boolean; message: string }> {
  const email = normaliseEmail(rawEmail);
  if (!email) return { ok: false, message: LINK_BAD_EMAIL };
  if (!associationsEnabled() || !key()) return { ok: true, message: LINK_REQUESTED };
  const ctx = await requestContext(), emailHash = await adminEmailHash(email);
  if (!(await withinLimit("assoc_link_ip_hour", ctx.ipRange)) || !(await withinLimit("assoc_link_email_hour", emailHash))) return { ok: false, message: LINK_TOO_MANY };
  after(async () => {
    const db = getDb(), now = Date.now();
    for (const a of await adminsForEmail(db, emailHash)) {
      const token = await signAction(key(), "association-link", await issueAccessLink(db, a.adminId, now), now + ASSOC_LINK_TTL_MS);
      const mail = signInEmail(a.associationName, `${SITE_URL}/association/open?t=${encodeURIComponent(token)}`);
      await sendTo(a.email, mail.subject, mail.text); // a failed send is not reported: saying so would show the address is listed
    }
  });
  return { ok: true, message: LINK_REQUESTED };
}

/** Uses an emailed link once. Returns the value for the administrator's cookie, or null. */
export async function redeemAssociationLink(token: string | null | undefined): Promise<string | null> {
  if (!associationsEnabled()) return null;
  const v = await verifyAction(key(), "association-link", token);
  if (!v) return null;
  const now = Date.now(), adminId = await redeemAccessLink(getDb(), v.subject, now);
  return adminId ? signAction(key(), "association", adminId, now + ASSOC_SESSION_MS) : null;
}
export const assocCookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/association", maxAge: Math.floor(ASSOC_SESSION_MS / 1000) });

/**
 * The administrator signed in on this request, or null. The cookie names an administrator row and nothing else; the
 * row is read again on every request, so an administrator the editor has taken off the list, or an association that
 * has closed, is out at once.
 */
export async function currentAssociationAdmin(): Promise<{ adminId: string; associationId: string; associationName: string } | null> {
  if (!associationsEnabled()) return null;
  try {
    const v = await verifyAction(key(), "association", (await cookies()).get(ASSOC_COOKIE)?.value);
    return v ? await adminSession(getDb(), v.subject) : null;
  } catch { return null; }
}
