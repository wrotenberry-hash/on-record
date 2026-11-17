import { redeemUnsubscribe } from "@/lib/accounts";
import { countEvent } from "@/lib/events";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** One tap from the weekly email: no sign-in needed, nothing else changes. */
export async function GET(request: Request) {
  const ok = await redeemUnsubscribe(new URL(request.url).searchParams.get("t"));
  if (ok) await countEvent("digest_unsubscribe", "");
  const body = ok ? `You will not get the weekly ${BRAND.name} email any more. You can turn it back on from your account page.` : "This unsubscribe link is not valid. Nothing was changed.";
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${BRAND.name}</title><body style="font:17px/1.5 Arial,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#172224;background:#f7f6f2"><h1 style="font:600 26px Georgia,serif">${ok ? "Unsubscribed." : "Link not valid."}</h1><p>${body}</p></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
