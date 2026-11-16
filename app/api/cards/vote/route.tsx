import { ImageResponse } from "next/og";
import { CardImage } from "@/components/cards/card-image";
import { CARD_FORMATS, cardFormat } from "@/lib/card-content";
import { voteCardFor } from "@/lib/cards";
import { viewerAccess } from "@/lib/viewer";
import { countEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/** A vote card image. Only for viewers allowed to see the record (public reading, the editor, or a trial reader). */
export async function GET(request: Request) {
  const access = await viewerAccess();
  if (!access.allowed) return new Response("Not available", { status: 404 });
  if (!(await (await import("@/lib/share")).cardAllowed())) return new Response("Too many cards from this device. Try again in an hour.", { status: 429 });
  const url = new URL(request.url);
  const member = url.searchParams.get("member") ?? "", roll = url.searchParams.get("roll") ?? "";
  if (!/^[A-Z]\d{6}$/.test(member) || !/^[a-z0-9-]{5,40}$/.test(roll)) return new Response("Bad request", { status: 400 });
  const data = await voteCardFor(member, roll);
  if (!data) return new Response("Not found", { status: 404 });
  const format = cardFormat(url.searchParams.get("format"));
  await countEvent("card_render", `vote:${format}`);
  return new ImageResponse(<CardImage card={data.card} format={format} />, { ...CARD_FORMATS[format], headers: { "Cache-Control": "private, no-store" } });
}
