import { getDb } from "@/db";
import { viewerAccess } from "@/lib/viewer";
import { loadPhoto, photoTarget } from "@/lib/photos";

export const dynamic = "force-dynamic";

/**
 * A legislator's official portrait, served by the site itself so the reader's device never contacts an outside host
 * (lib/photos.ts). Gated like every page: with public reading off, only the editor or a trial reader gets a picture;
 * anyone else gets "Not available" and nothing is fetched.
 *
 * It answers only for a member id the site already holds, fetches a fixed official address on the server (kept in
 * the server's own cache for 30 days, so the official host is asked rarely), and answers with the picture or 404.
 * It never answers with a redirect.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return new Response("Not available", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  let id = (await params).id;
  try { id = decodeURIComponent(id); } catch { return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } }); }
  const target = await photoTarget(getDb(), id).catch(() => null);
  const answer = await loadPhoto(target, url => fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { accept: "image/*" }, next: { revalidate: 30 * 24 * 3600 } }));
  return new Response(answer.body ? Buffer.from(answer.body) : "Not found", { status: answer.status, headers: answer.headers });
}
