import { ImageResponse } from "next/og";
import { CardImage, SlideImage } from "@/components/cards/card-image";
import { CARD_FORMATS, cardFormat } from "@/lib/card-content";
import { viewerAccess } from "@/lib/viewer";
import { countEvent } from "@/lib/events";
import { cardAllowed } from "@/lib/share";
import { resolveShare } from "@/lib/share-resolve";

export const dynamic = "force-dynamic";

/**
 * Round G cards: quiet kill, breaking ranks, district vs legislator, Said vs. Did,
 * dashboard cards and the 5-slide carousel (n=1..5, 1080x1350). Gated like every
 * card, and limited per device and IP range.
 */
export async function GET(request: Request) {
  const access = await viewerAccess();
  if (!access.allowed) return new Response("Not available", { status: 404 });
  const url = new URL(request.url), p = Object.fromEntries(url.searchParams) as Record<string, string>;
  if (!(await cardAllowed())) return new Response("Too many cards from this device. Try again in an hour.", { status: 429 });
  const r = await resolveShare(p.t, p);
  if (!r) return new Response("Not found", { status: 404 });
  const headers = { "Cache-Control": access.audience === "public" ? "public, max-age=900" : "private, no-store" };
  if (r.slides) {
    const n = Math.min(5, Math.max(1, Number(p.n) || 1)), slide = r.slides[n - 1];
    await countEvent("card_render", `carousel:${n}`);
    return new ImageResponse(<SlideImage slide={slide} />, { width: 1080, height: 1350, headers });
  }
  const format = cardFormat(p.format);
  await countEvent("card_render", `${r.type}:${format}`);
  return new ImageResponse(<CardImage card={r.card!} format={format} />, { ...CARD_FORMATS[format], headers });
}
