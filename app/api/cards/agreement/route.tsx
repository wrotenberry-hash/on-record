import { ImageResponse } from "next/og";
import { CardImage } from "@/components/cards/card-image";
import { CARD_FORMATS, cardFormat } from "@/lib/card-content";
import { agreementCardFor } from "@/lib/cards";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { countEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/** The reader's own agreement card: built from that reader's answers, so only that reader can draw it. */
export async function GET(request: Request) {
  const access = await viewerAccess();
  if (!access.allowed) return new Response("Not available", { status: 404 });
  const userId = await currentAppUserId();
  if (!userId) return new Response("Sign in first", { status: 401 });
  const url = new URL(request.url);
  const member = url.searchParams.get("member") ?? "", issue = url.searchParams.get("issue") ?? "";
  if (!/^[A-Z]\d{6}$/.test(member) || !/^[a-z-]{3,40}$/.test(issue)) return new Response("Bad request", { status: 400 });
  const data = await agreementCardFor(userId, member, issue);
  if (!data) return new Response("Not found", { status: 404 });
  const format = cardFormat(url.searchParams.get("format"));
  await countEvent("card_render", `agreement:${format}`);
  return new ImageResponse(<CardImage card={data.card} format={format} />, { ...CARD_FORMATS[format], headers: { "Cache-Control": "private, no-store" } });
}
