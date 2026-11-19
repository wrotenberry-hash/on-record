import { getDb } from "@/db";
import { countOpen, PIXEL } from "@/lib/loop/marks";
import { markSecret } from "@/lib/loop/run";

export const dynamic = "force-dynamic";

/**
 * The tiny picture in the weekly email (owner's point 12). Loading it adds one to the count of emails opened, by
 * the random one-time mark in its address (lib/loop/marks.ts). It answers anyone, because a mail app sends no
 * cookie; it shows nothing from the site: the answer is always the same empty 1-pixel picture, whether the mark is
 * real or not. It reads no cookie and stores nothing about who asked. Mail apps that load pictures ahead of time
 * make the count run high.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ mark: string }> }) {
  const { mark } = await ctx.params;
  await countOpen(getDb(), mark, markSecret(), Date.now()).catch(() => false);
  return new Response(new Uint8Array(PIXEL), { headers: { "Content-Type": "image/gif", "Content-Length": String(PIXEL.length), "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" } });
}
