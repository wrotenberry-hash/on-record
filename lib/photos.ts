/**
 * Official portraits on the legislators' cards (owner, 18 Nov 2026; docs/PERSUASION_RETENTION.md, point 1).
 *
 * The reader's device never contacts an outside host. A card asks the site itself (app/api/photo/[id]); the site's
 * server fetches the official picture and hands back the bytes. So the host of the picture never sees the reader's
 * device or internet address, only the site's server asking for a member's portrait.
 *
 *   Members of Congress: the Biographical Directory of the U.S. Congress, by the member's directory id.
 *   Texas legislators:   the address in tx_people.image (from Open States), used only when it is on one of the Texas
 *                        Legislature's own sites. Any other host is not fetched and the member gets the placeholder.
 *
 * Only an id the site already holds is ever looked up, the address fetched is built here and never taken from the
 * request, and the answer is the picture or "not found": never a redirect. A member with no picture gets the same
 * neutral placeholder (their initials) whatever their party; the card draws it.
 *
 * The hosts below are listed on the privacy page (lib/trust.ts, PROCESSORS "photos"); tests/first-screen.test.mjs
 * holds the two lists together. Relative imports only, so the tests load this file directly.
 */
import { eq } from "drizzle-orm";
import { officialPoliticians, txPeople } from "../db/schema.ts";
import type { Db } from "./verify/residence-store.ts";

export const FEDERAL_PHOTO_HOSTS = ["bioguide.congress.gov"] as const;
export const TEXAS_PHOTO_HOSTS = ["house.texas.gov", "www.house.texas.gov", "senate.texas.gov", "www.senate.texas.gov"] as const;
export const PHOTO_HOSTS: readonly string[] = [...FEDERAL_PHOTO_HOSTS, ...TEXAS_PHOTO_HOSTS];

const FEDERAL_ID = /^[A-Z]\d{6}$/;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
/** How long a reader's browser keeps a portrait (30 days), and how long it waits before asking again for one that was missing. */
export const PHOTO_CACHE = "private, max-age=2592000, stale-while-revalidate=604800", MISSING_CACHE = "private, max-age=3600";

/** The Biographical Directory's portrait for a member id: /bioguide/photo/<first letter>/<ID>.jpg. null for anything that is not such an id. */
export function federalPhotoUrl(id: string): string | null {
  return FEDERAL_ID.test(id) ? `https://bioguide.congress.gov/bioguide/photo/${id.charAt(0)}/${id}.jpg` : null;
}

/** The address, if it is a plain https address on one of the named hosts; otherwise null. */
export function allowedPhotoUrl(raw: string | null | undefined, hosts: readonly string[]): string | null {
  let u: URL;
  try { u = new URL(String(raw ?? "").trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port || !hosts.includes(u.hostname.toLowerCase())) return null;
  return u.toString();
}

/** Where a card asks for a member's picture: always the site itself. */
export function photoPath(memberId: string): string {
  return `/api/photo/${encodeURIComponent(memberId)}`;
}

export type PhotoTarget = { kind: "federal" | "texas"; id: string; name: string; url: string | null };

/** The member behind an id, and the official address of their portrait. null when the site holds no such member. */
export async function photoTarget(db: Db, id: string): Promise<PhotoTarget | null> {
  if (!id || id.length > 120) return null;
  if (FEDERAL_ID.test(id)) {
    const p = await db.select({ id: officialPoliticians.id, name: officialPoliticians.fullName }).from(officialPoliticians).where(eq(officialPoliticians.id, id)).get();
    return p ? { kind: "federal", id: p.id, name: p.name, url: federalPhotoUrl(p.id) } : null;
  }
  const t = await db.select({ id: txPeople.id, name: txPeople.name, image: txPeople.image }).from(txPeople).where(eq(txPeople.id, id)).get();
  return t ? { kind: "texas", id: t.id, name: t.name, url: allowedPhotoUrl(t.image, TEXAS_PHOTO_HOSTS) } : null;
}

export type PhotoAnswer = { status: 200 | 404; headers: Record<string, string>; body: Uint8Array | null };
const missing = (cache: string): PhotoAnswer => ({ status: 404, headers: { "Cache-Control": cache, "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" }, body: null });

/**
 * Fetches the portrait on the server and returns it. `fetchImage` must not follow redirects by itself
 * (`redirect: "manual"`): a redirect is followed here, at most twice, and only to an address on the same list of
 * hosts. The answer is 200 with the picture or 404; it never carries a Location header, so the reader's browser is
 * never sent anywhere else.
 */
export async function loadPhoto(target: PhotoTarget | null, fetchImage: (url: string) => Promise<Response>): Promise<PhotoAnswer> {
  if (!target) return missing("private, no-store");
  const hosts = target.kind === "federal" ? FEDERAL_PHOTO_HOSTS : TEXAS_PHOTO_HOSTS;
  let url = allowedPhotoUrl(target.url, hosts);
  if (!url) return missing(MISSING_CACHE);
  try {
    for (let hop = 0; hop < 3; hop++) {
      const res = await fetchImage(url);
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        url = next ? allowedPhotoUrl(new URL(next, url).toString(), hosts) : null;
        if (!url) return missing(MISSING_CACHE);
        continue;
      }
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (res.status !== 200 || !IMAGE_TYPES.has(type)) return missing(MISSING_CACHE);
      const body = new Uint8Array(await res.arrayBuffer());
      if (!body.length || body.length > MAX_PHOTO_BYTES) return missing(MISSING_CACHE);
      return { status: 200, body, headers: { "Content-Type": type, "Content-Length": String(body.length), "Cache-Control": PHOTO_CACHE, "X-Content-Type-Options": "nosniff" } };
    }
    return missing(MISSING_CACHE);
  } catch { return missing("private, max-age=300"); } // the host did not answer: ask again soon
}
