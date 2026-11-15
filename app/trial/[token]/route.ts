import { NextResponse } from "next/server";
import { countEvent } from "@/lib/events";
import { gateState, inviteForToken, TRIAL_COOKIE, TRIAL_COOKIE_MAX_AGE_S } from "@/lib/trial";

export const dynamic = "force-dynamic";

/**
 * An invite link. A genuine, unrevoked link sets the trial cookie once the trial
 * has opened, then lands on the home page. Otherwise it explains why, without
 * revealing anything about the site's content.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const base = new URL(request.url);
  const { invite, problem } = await inviteForToken(token);
  if (!invite) { await countEvent("invite_blocked", problem ?? "invalid"); return NextResponse.redirect(new URL(`/trial?state=${problem ?? "invalid"}`, base)); }
  const gate = await gateState();
  if (!gate.open) { await countEvent("invite_blocked", "not_open"); return NextResponse.redirect(new URL("/trial?state=not_open", base)); }
  await countEvent("invite_redeemed", "trial");
  const response = NextResponse.redirect(new URL("/", base));
  response.cookies.set(TRIAL_COOKIE, token, { httpOnly: true, secure: base.protocol === "https:", sameSite: "lax", path: "/", maxAge: TRIAL_COOKIE_MAX_AGE_S });
  return response;
}
