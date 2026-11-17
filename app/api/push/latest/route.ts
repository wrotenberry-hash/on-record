import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { latestAlert } from "@/lib/push";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
/** The service worker asks for the newest alert after a push (pushes carry no payload). */
export async function GET() {
  const access = await viewerAccess();
  if (!access.allowed) return new Response("Not available", { status: 404 });
  const userId = await currentAppUserId();
  const a = userId ? await latestAlert(userId) : null;
  // The service worker is a static file and cannot read the product name: the name and the icon travel in this answer.
  return Response.json({ ...(a ? { title: a.title, body: a.body, url: a.url } : { title: BRAND.name, body: "Something you follow moved.", url: "/" }), icon: BRAND.icons.small }, { headers: { "Cache-Control": "no-store" } });
}
