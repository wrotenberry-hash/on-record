import { congressForYear } from "@/lib/federal/parse";
import { boxOf, decodeRing, labelPoint, type Box, type LatLon } from "@/lib/map-rules";

/**
 * The outlines behind the small district map, read from the files scripts/build-district-shapes.mjs writes. Server
 * only, loaded once per server on first use. Like the ZIP table, the outlines are for one Congress: once that Congress
 * has ended they are not used (the picker then shows no map rather than the wrong lines).
 */
type ShapeFile = { congress: number; districts: Record<string, number[][]> };
type ZipFile = { congress: number; zips: Record<string, number[][]> };
type CenterFile = { centers: Record<string, [number, number]> };
let districts: Promise<ShapeFile> | null = null, zips: Promise<ZipFile> | null = null, centers: Promise<CenterFile> | null = null;

export type DistrictShape = { id: string; rings: LatLon[][]; label: LatLon | null };
export type ZipMap = { zip: string; box: Box; outline: LatLon[][]; districts: DistrictShape[] };

/** Where a ZIP code area's middle is, for opening the pin map there. Null for a ZIP the Census Bureau has no area for. */
export async function zipCenter(zip: string | null | undefined): Promise<LatLon | null> {
  if (!zip || !/^\d{5}$/.test(zip)) return null;
  centers ??= import("@/lib/data/zip-centers.json").then(m => (m.default ?? m) as unknown as CenterFile);
  const c = (await centers).centers[zip];
  return c ? [c[0] / 1e3, c[1] / 1e3] : null;
}

/**
 * The ZIP area's outline and the outline of each district named, for the map on the "choose your district" step.
 * Null when the ZIP has no outline on file (it lies in one district), a district has none, or the files are for a
 * Congress that has ended.
 */
export async function zipMap(zip: string | null | undefined, districtIds: readonly string[], now = Date.now()): Promise<ZipMap | null> {
  if (!zip || !/^\d{5}$/.test(zip) || !districtIds.length) return null;
  districts ??= import("@/lib/data/district-shapes.json").then(m => (m.default ?? m) as unknown as ShapeFile);
  zips ??= import("@/lib/data/zip-shapes.json").then(m => (m.default ?? m) as unknown as ZipFile);
  const [d, z] = await Promise.all([districts, zips]);
  if (d.congress !== congressForYear(new Date(now).getUTCFullYear()) || z.congress !== d.congress) return null;
  const outline = (z.zips[zip] ?? []).map(decodeRing), box = boxOf(outline);
  if (!box) return null;
  const shapes = districtIds.map(id => { const rings = (d.districts[id] ?? []).map(decodeRing); return { id, rings: clipToNeighbourhood(rings, box), label: labelPoint(rings, box) }; });
  return shapes.every(s => s.rings.length) ? { zip, box, outline, districts: shapes } : null;
}

/**
 * A district can be hundreds of miles across; the map shows a ZIP. Only the rings that come near the ZIP are sent to
 * the page, and each is kept whole (cutting a ring would draw a false line).
 */
function clipToNeighbourhood(rings: LatLon[][], box: Box): LatLon[][] {
  const padLat = (box.north - box.south) * 2 + 0.05, padLon = (box.east - box.west) * 2 + 0.05;
  return rings.filter(r => r.some(([lat, lon]) => lat >= box.south - padLat && lat <= box.north + padLat && lon >= box.west - padLon && lon <= box.east + padLon));
}
