import { viewerAccess } from "@/lib/viewer";
import { logContactTap } from "@/lib/contacts";

export const dynamic = "force-dynamic";

/**
 * Counts one tap on the contact tool (opened, call, form, copy, email) by kind of page. Aggregate only:
 * the body carries a tap name and "bill", "tx_bill" or "member", never a member, a bill or the message.
 */
export async function POST(request: Request) {
  const access = await viewerAccess();
  if (!access.allowed) return new Response(null, { status: 404 });
  const body = await request.json().catch(() => null) as { event?: unknown; dim?: unknown } | null;
  const ok = await logContactTap(body?.event, body?.dim);
  return new Response(null, { status: ok ? 204 : 429 });
}
