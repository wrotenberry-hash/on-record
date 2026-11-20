/**
 * The small district map and the pin map (owner, 20 Nov 2026, from the first trial feedback: a reader at a newer
 * address got "tap your district" with three names and nothing to choose by). Pure: no database, no network.
 *
 * Lines come from the Census Bureau's boundary files (scripts/build-district-shapes.mjs). They are general outlines,
 * good for seeing which side of town a district covers; near a line they can be off by a street, and the map says so.
 * A district chosen from this map, or a place given by a pin, is the reader's own word for where they live: it is
 * marked as such (lib/location.ts) and is never what makes an answer count.
 */
export type LatLon = [number, number];

/** A ring as written by the build script: the first point in ten-thousandths of a degree, then steps. Read back as [lat, lon] pairs. */
export function decodeRing(packed: readonly number[]): LatLon[] {
  const out: LatLon[] = [];
  let x = 0, y = 0;
  for (let i = 0; i + 1 < packed.length; i += 2) { x += packed[i]; y += packed[i + 1]; out.push([y / 1e4, x / 1e4]); }
  return out;
}
export type Box = { south: number; west: number; north: number; east: number };
export function boxOf(rings: ReadonlyArray<readonly LatLon[]>): Box | null {
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
  for (const r of rings) for (const [lat, lon] of r) { if (lat < south) south = lat; if (lat > north) north = lat; if (lon < west) west = lon; if (lon > east) east = lon; }
  return Number.isFinite(south) ? { south, west, north, east } : null;
}
/** Where to write a district's name: the middle of the part of its outline that lies inside the box (the ZIP area), or null when none does. */
export function labelPoint(rings: ReadonlyArray<readonly LatLon[]>, box: Box): LatLon | null {
  let lat = 0, lon = 0, n = 0;
  for (const r of rings) for (const p of r) if (p[0] >= box.south && p[0] <= box.north && p[1] >= box.west && p[1] <= box.east) { lat += p[0]; lon += p[1]; n++; }
  return n ? [lat / n, lon / n] : null;
}

/**
 * The colours of the districts on the map and on their buttons. No red and no blue: a colour here names a district,
 * never a party. Every one has enough contrast for white text.
 */
export const DISTRICT_COLOURS = ["#0f6b66", "#8a4b08", "#5b3f8f", "#4a6118", "#7d2f55", "#4f4f4f"] as const;
export const districtColour = (i: number) => DISTRICT_COLOURS[i % DISTRICT_COLOURS.length];

/* ───────────────────────────── Map pictures ───────────────────────────── */

export const TILE_MIN_ZOOM = 5, TILE_MAX_ZOOM = 18;
/** A map picture's address is three whole numbers in range; anything else is refused before any request is made. */
export function validTile(z: unknown, x: unknown, y: unknown): { z: number; x: number; y: number } | null {
  const [zz, xx, yy] = [z, x, y].map(v => (/^\d{1,7}$/.test(String(v)) ? Number(v) : NaN));
  if (!Number.isInteger(zz) || zz < TILE_MIN_ZOOM || zz > TILE_MAX_ZOOM) return null;
  const n = 2 ** zz;
  return Number.isInteger(xx) && Number.isInteger(yy) && xx >= 0 && yy >= 0 && xx < n && yy < n ? { z: zz, x: xx, y: yy } : null;
}
/** The United States and its territories, generously: a pin outside this is not sent anywhere. */
export function pinInRange(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -15 && lat <= 72 && ((lon >= -180 && lon <= -64) || (lon >= 144 && lon <= 180));
}
/**
 * The marker may be used only once the map is zoomed in far enough to tell one home from the next: from further out a
 * thumb's width is several streets, and a pin near a district line could land on the wrong side.
 */
export const PIN_MIN_ZOOM = 16;
/** A pin is kept to five decimal places (about a metre) on its way to the Census Bureau; nothing finer is sent, and nothing is stored. */
export const roundPin = (v: number) => Math.round(v * 1e5) / 1e5;

/* ───────────────────────────── Words ───────────────────────────── */

/** Owner's wording, 20 Nov 2026. */
export const COULD_NOT_PLACE = "We couldn't place that address.";
/** What to try, in the owner's order. The fourth, choosing a district by hand, is the last resort and is offered apart from these. */
export const PLACE_STEPS = [
  { key: "correct", title: "Check the address and try again.", detail: "Look at the house number and the spelling of the street. Leave out the apartment number." },
  { key: "nearby", title: "Use a nearby cross street or a neighbor's address.", detail: "A newly built home can be missing from the Census Bureau's address list for a year or more. Type two street names with “&” between them, like “Main St & Oak Ave”, or an older address close to yours." },
  { key: "pin", title: "Drop a pin on a map.", detail: "Move the map until the marker sits on your home." },
] as const;
export const LAST_RESORT = "Last resort: choose your district yourself";
export const SELF_PICKED_NOTE = "A district you choose yourself, or a pin you drop, is your own word for where you live. It is saved as that, and it is never counted as address-matched.";
export const LINES_APPROXIMATE = "District lines are from the Census Bureau and are approximate: close to a line they can be off by a street.";
export const MAP_CREDIT = "Map pictures © OpenStreetMap contributors";
