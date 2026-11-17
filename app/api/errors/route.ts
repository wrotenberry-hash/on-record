import { viewerAccess } from "@/lib/viewer";
import { recordError } from "@/lib/error-events";
import { cleanDigest, cleanMessage, routePattern } from "@/lib/error-rules";
import { ensureDeviceCookie, requestContext, withinLimit } from "@/lib/verify/store";

export const dynamic = "force-dynamic";
const MAX_BODY = 2000;

/**
 * The error page tells the site it was shown: { route, message, digest } and
 * nothing else. Open only to someone who can open a page (a trial reader or the
 * editor), only from this site, and limited per device and network range. The
 * route is reduced to its pattern and the message is cleaned again here, so no
 * address, query or reader detail is stored whatever the browser sends.
 */
export async function POST(request: Request) {
  const none = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return none(403);
  const access = await viewerAccess();
  if (!access.allowed) return none(403);
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return none(400);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return none(400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return none(400);
  const { route, message, digest, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length || typeof route !== "string" || typeof message !== "string" || (digest !== undefined && digest !== null && typeof digest !== "string")) return none(400);
  if (route.length > 200 || message.length > 200 || (digest && !cleanDigest(digest))) return none(400);
  await ensureDeviceCookie();
  const ctx = await requestContext();
  if (!(await withinLimit("error_device_hour", ctx.device)) || !(await withinLimit("error_ip_hour", ctx.ipRange))) return none(429);
  await recordError({ source: "client", route: routePattern(route), message: cleanMessage(message), digest });
  return none(204);
}
