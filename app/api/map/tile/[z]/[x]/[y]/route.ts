import { viewerAccess } from "@/lib/viewer";
import { validTile } from "@/lib/map-rules";
import { BRAND } from "@/lib/brand";

/**
 * Map pictures for the small district map and the pin map (owner, 20 Nov 2026), passed through this site's own server
 * so that a reader's device never talks to the map service: OpenStreetMap sees this server, not the reader, and learns
 * no address. Open only to someone who may read the site (the same gate as every reader page). Each picture is kept by
 * the reader's browser for a week.
 * Source and terms: tile.openstreetmap.org, © OpenStreetMap contributors (the map shows that credit).
 */
export const dynamic = "force-dynamic";
const SOURCE = () => process.env.MAP_TILE_BASE?.trim() || "https://tile.openstreetmap.org";

export async function GET(_request: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return new Response(null, { status: 404 });
  const p = await params, t = validTile(p.z, p.x, String(p.y).replace(/\.png$/, ""));
  if (!t) return new Response(null, { status: 400 });
  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
    const res = await fetch(`${SOURCE()}/${t.z}/${t.x}/${t.y}.png`, { headers: { "User-Agent": `${BRAND.fileSlug}-map/1.0${site ? ` (+${site})` : ""}` }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!res.ok) return new Response(null, { status: 502 });
    return new Response(await res.arrayBuffer(), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=604800, immutable" } });
  } catch { return new Response(null, { status: 502 }); }
}
