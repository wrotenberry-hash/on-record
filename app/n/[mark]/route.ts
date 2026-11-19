import { getDb } from "@/db";
import { countReturn, PUSH_ARRIVAL, safeReturnPath } from "@/lib/loop/marks";
import { markSecret } from "@/lib/loop/run";
import { viewerAccess } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/**
 * Where the link in a closing-the-loop notice leads (owner's point 12). It adds one to the count of readers who
 * came back after a notice, by the random one-time mark in the link (lib/loop/marks.ts), and then sends the reader
 * on to the bill. It shows nothing itself: the bill page decides who may read it, as it always does, so a visitor
 * without an invite still gets the private notice there. The destination can only be a page on this site.
 * Nothing about who arrived is stored.
 */
export async function GET(request: Request, ctx: { params: Promise<{ mark: string }> }) {
  const { mark } = await ctx.params, url = new URL(request.url);
  // A push opens on the reader's own device, so an arrival through one is counted only for an invited reader.
  const fromReader = mark === PUSH_ARRIVAL ? (await viewerAccess().catch(() => null))?.allowed === true : false;
  await countReturn(getDb(), mark, markSecret(), Date.now(), fromReader).catch(() => false);
  return new Response(null, { status: 303, headers: { Location: safeReturnPath(url.searchParams.get("to")), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
