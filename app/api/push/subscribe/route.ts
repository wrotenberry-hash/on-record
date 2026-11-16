import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { alertPrefs, pushSubscriptions } from "@/db/schema";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { endpointHash } from "@/lib/push";
import { countEvent } from "@/lib/events";

export const dynamic = "force-dynamic";
const ok = (u: unknown) => typeof u === "string" && /^https:\/\/[^\s]{10,800}$/.test(u);

/** Turn push on (POST a PushSubscription) or off (DELETE) for this device. Trial readers and the editor only. */
export async function POST(request: Request) {
  const access = await viewerAccess();
  if (!access.allowed || (!access.invite && !access.editor)) return new Response("Not available", { status: 404 });
  const userId = await currentAppUserId(true);
  const body = await request.json().catch(() => null) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  if (!userId || !ok(body?.endpoint)) return new Response("Bad request", { status: 400 });
  const db = getDb(), h = await endpointHash(body!.endpoint!);
  await db.insert(pushSubscriptions).values({ endpointHash: h, userId, endpoint: body!.endpoint!, p256dh: body!.keys?.p256dh ?? null, auth: body!.keys?.auth ?? null, createdAt: Date.now() })
    .onConflictDoUpdate({ target: pushSubscriptions.endpointHash, set: { userId, failures: 0 } });
  await db.insert(alertPrefs).values({ userId, push: 1, updatedAt: Date.now() }).onConflictDoUpdate({ target: alertPrefs.userId, set: { push: 1, updatedAt: Date.now() } });
  await countEvent("push_on", access.audience);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const access = await viewerAccess();
  if (!access.allowed) return new Response("Not available", { status: 404 });
  const userId = await currentAppUserId();
  const body = await request.json().catch(() => null) as { endpoint?: string } | null;
  if (!userId) return Response.json({ ok: true });
  const db = getDb();
  if (ok(body?.endpoint)) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpointHash, await endpointHash(body!.endpoint!)));
  const left = await db.select({ h: pushSubscriptions.endpointHash }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (!left.length) await db.update(alertPrefs).set({ push: 0, updatedAt: Date.now() }).where(eq(alertPrefs.userId, userId));
  await countEvent("push_off", access.audience);
  return Response.json({ ok: true });
}
