import { NextResponse } from "next/server";

/**
 * A redirect to a path on this same site. The Location is relative, so the browser stays on the address it used: a
 * server that sees itself under another name (a local server answering to both 127.0.0.1 and localhost) can never send
 * the reader to an address where the invite cookie it just set does not apply.
 */
const to = (path: string) => new NextResponse(null, { status: 307, headers: { Location: path } });
import { countEvent } from "@/lib/events";
import { gateState, inviteForToken, TRIAL_COOKIE, TRIAL_COOKIE_MAX_AGE_S } from "@/lib/trial";
import { inviteLanding } from "@/lib/trial-welcome";

export const dynamic = "force-dynamic";

/**
 * An invite link. A genuine, unrevoked link sets the trial cookie once the trial
 * has opened, then lands on the welcome screen (the home page on later visits). Otherwise it explains why, without
 * revealing anything about the site's content.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const base = new URL(request.url);
  const { invite, problem } = await inviteForToken(token);
  if (!invite) { await countEvent("invite_blocked", problem ?? "invalid"); return to(`/trial?state=${problem ?? "invalid"}`); }
  const gate = await gateState();
  if (!gate.open) { await countEvent("invite_blocked", "not_open"); return to("/trial?state=not_open"); }
  await countEvent("invite_redeemed", "trial");
  // Test-ready build: the first visit lands on the welcome screen (what to try, how to give feedback); later visits go home.
  const response = to(inviteLanding(invite.activeDays ?? 0));
  response.cookies.set(TRIAL_COOKIE, token, { httpOnly: true, secure: base.protocol === "https:", sameSite: "lax", path: "/", maxAge: TRIAL_COOKIE_MAX_AGE_S });
  return response;
}
