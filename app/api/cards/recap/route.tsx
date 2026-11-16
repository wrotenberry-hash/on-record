import { ImageResponse } from "next/og";
import { CardImage } from "@/components/cards/card-image";
import { CARD_FORMATS, cardFormat } from "@/lib/card-content";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { recapFor } from "@/lib/recap";
import { countEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/** The reader's weekly recap card (their legislators' recorded votes). Gated like every card; private to the requester. */
export async function GET(request: Request) {
  const access = await viewerAccess();
  if (!access.allowed) return new Response("Not available", { status: 404 });
  const r = await recapFor(await currentAppUserId());
  if (!r) return new Response("Add your ZIP first", { status: 404 });
  const format = cardFormat(new URL(request.url).searchParams.get("format"));
  await countEvent("card_render", `recap:${format}`);
  return new ImageResponse(<CardImage card={r.card} format={format} />, { ...CARD_FORMATS[format], headers: { "Cache-Control": "private, no-store" } });
}
