import { stateForZip } from "@/lib/federal/depth-parse";
import { congressForYear } from "@/lib/federal/parse";
import { placeForZip, zipIndexFor, type ZipPlace, type ZipTable } from "@/lib/flow/rules";

/**
 * ZIP code → House district(s), from the Census Bureau's own table (lib/data/zip-districts.json, rebuilt with
 * scripts/build-zip-districts.mjs when a new Congress is seated). Loaded once per server, on first use. The table is
 * for one Congress; after that Congress ends it is not used to name a district (see zipIndexFor).
 */
let table: Promise<ZipTable> | null = null;
const indexes = new Map<number, Map<string, string[]>>();
async function indexFor(now: number) {
  table ??= import("@/lib/data/zip-districts.json").then(m => (m.default ?? m) as unknown as ZipTable);
  const sitting = congressForYear(new Date(now).getUTCFullYear());
  if (!indexes.has(sitting)) indexes.set(sitting, zipIndexFor(await table, sitting)); // empty once the table's Congress has ended
  return indexes.get(sitting)!;
}

/** Where a ZIP is: its state, its district when it sits in one, or the districts to choose from. null for a ZIP that is not a US ZIP. */
export async function zipPlace(zip: string, now = Date.now()): Promise<ZipPlace | null> {
  return placeForZip(zip, await indexFor(now), stateForZip);
}

/**
 * The reader's ZIP code, kept in a first-party cookie on their own device only (never in the database), so a ZIP that
 * crosses districts can offer just its own districts and the street-address box does not ask for the ZIP again.
 */
export const ZIP_COOKIE = "or_zip";
export async function rememberedZip(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const v = (await cookies()).get(ZIP_COOKIE)?.value ?? "";
  return /^\d{5}$/.test(v) ? v : null;
}
/** Server actions only. */
export async function rememberZip(zip: string | null) {
  const { cookies } = await import("next/headers"), jar = await cookies();
  if (zip && /^\d{5}$/.test(zip)) jar.set(ZIP_COOKIE, zip, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 24 * 3600 });
  else jar.delete(ZIP_COOKIE);
}

/**
 * True when the page is being drawn again as the answer to a server action (for example the visit marker, which sets
 * a cookie on a reader's first page). Counting "the form was shown" then would count one showing twice.
 */
export async function isActionRerender(): Promise<boolean> {
  const { headers } = await import("next/headers");
  return (await headers()).has("next-action");
}
