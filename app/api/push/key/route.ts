import { viewerAccess } from "@/lib/viewer";
import { vapidKeys } from "@/lib/push";

export const dynamic = "force-dynamic";
/** The push public key, for readers allowed to see the record. */
export async function GET() {
  const access = await viewerAccess();
  if (!access.allowed) return new Response("Not available", { status: 404 });
  const k = vapidKeys();
  return k ? Response.json({ publicKey: k.publicKey }) : new Response("Push not configured", { status: 503 });
}
