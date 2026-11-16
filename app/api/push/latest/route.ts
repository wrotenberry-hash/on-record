import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { latestAlert } from "@/lib/push";

export const dynamic = "force-dynamic";
/** The service worker asks for the newest alert after a push (pushes carry no payload). */
export async function GET() {
  const access = await viewerAccess();
  if (!access.allowed) return new Response("Not available", { status: 404 });
  const userId = await currentAppUserId();
  const a = userId ? await latestAlert(userId) : null;
  return Response.json(a ? { title: a.title, body: a.body, url: a.url } : { title: "On Record", body: "Something you follow moved.", url: "/" }, { headers: { "Cache-Control": "no-store" } });
}
