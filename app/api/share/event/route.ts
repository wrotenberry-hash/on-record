import { viewerAccess } from "@/lib/viewer";
import { logShare } from "@/lib/share";

export const dynamic = "force-dynamic";

/** Counts one share action (share sheet, download, copied caption, video, carousel). Aggregate only. */
export async function POST(request: Request) {
  const access = await viewerAccess();
  if (!access.allowed) return new Response(null, { status: 404 });
  const body = await request.json().catch(() => null) as { event?: unknown; kind?: unknown } | null;
  const ok = await logShare(String(body?.event ?? ""), String(body?.kind ?? ""));
  return new Response(null, { status: ok ? 204 : 429 });
}
