import { ImageResponse } from "next/og";
import { getDb } from "@/db";
import { CardImage, SlideImage } from "@/components/cards/card-image";
import { asStance, CARD_FORMATS, cardFormat, withStance } from "@/lib/card-content";
import { currentAppUserId, entryViewer, sharedPagesOn, viewerAccess } from "@/lib/viewer";
import { countEvent } from "@/lib/events";
import { cardAllowed } from "@/lib/share";
import { resolveShare } from "@/lib/share-resolve";
import { cardTarget } from "@/lib/entry/rules";
import { cardStance } from "@/lib/entry/store";

export const dynamic = "force-dynamic";

/**
 * Card pictures: one sourced fact per card (a vote, a bill change, a district total), the previews of a bill and a
 * member page, the dashboard figures, and the 5-slide carousel (n=1..5, 1080x1350). Limited per device and IP range.
 *
 * Who may load one: the editor, an invited reader, or everyone when public reading is on. With SHARED_PAGES_PUBLIC on
 * (off by default; lib/public-access.ts) also anyone, for a card a reader has made a share link for, so a link
 * preview can show it. With that switch off, a visitor with no invite gets "Not available", as before.
 *
 * `stance=support|oppose|unsure` draws the sharer's own answer in a separate box. It is drawn only when it is the
 * answer of the reader asking, or one a reader already put on this exact card (the share record); otherwise the
 * card is drawn without it.
 */
export async function GET(request: Request) {
  const base = await viewerAccess();
  if (!base.allowed && !sharedPagesOn()) return new Response("Not available", { status: 404 });
  const url = new URL(request.url), p = Object.fromEntries(url.searchParams) as Record<string, string>;
  if (!(await cardAllowed())) return new Response("Too many cards from this device. Try again in an hour.", { status: 429 });
  const r = await resolveShare(p.t, p);
  if (!r) return new Response("Not found", { status: 404 });
  const requested = r.card ? asStance(p.stance) : null, targetWithStance = requested ? cardTarget(`${r.query}&stance=${requested}`) : null;
  // Without an invite: the card as it was shared (with the sharer's line, when that is what was shared), else the plain card.
  const withLine = !base.allowed && targetWithStance ? await entryViewer({ kind: "picture", target: targetWithStance }) : null;
  const access = base.allowed ? { ...base, shared: false } : withLine?.allowed ? withLine : await entryViewer({ kind: "picture", target: cardTarget(r.query) });
  if (!access.allowed) return new Response("Not available", { status: 404 });
  const stance = requested ? await cardStance(getDb(), { userId: base.allowed ? await currentAppUserId().catch(() => null) : null, billKey: r.billKey, requested, targetWithStance }).catch(() => null) : null;
  const headers = { "Cache-Control": (access.audience === "public" || access.shared) && !stance ? "public, max-age=900" : "private, no-store" };
  if (r.slides) {
    const n = Math.min(5, Math.max(1, Number(p.n) || 1)), slide = r.slides[n - 1];
    await countEvent("card_render", `carousel:${n}`);
    return new ImageResponse(<SlideImage slide={slide} />, { width: 1080, height: 1350, headers });
  }
  const format = cardFormat(p.format);
  await countEvent("card_render", `${r.type}:${format}`);
  return new ImageResponse(<CardImage card={withStance(r.card!, stance)} format={format} />, { ...CARD_FORMATS[format], headers });
}
