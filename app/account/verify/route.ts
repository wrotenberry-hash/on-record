import { NextResponse } from "next/server";
import { READER_COOKIE, READER_SESSION_MS, readerSessionToken, redeemMagicLink } from "@/lib/accounts";
import { countEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/** The emailed sign-in link: used once, then a 90-day signed session on this device. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountId = await redeemMagicLink(url.searchParams.get("t"));
  if (!accountId) { await countEvent("magic_link_invalid", ""); return NextResponse.redirect(new URL("/account?m=expired", url)); }
  await countEvent("signin", "reader");
  const res = NextResponse.redirect(new URL("/account?m=signedin", url));
  res.cookies.set(READER_COOKIE, await readerSessionToken(accountId), { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/", maxAge: Math.floor(READER_SESSION_MS / 1000) });
  return res;
}
