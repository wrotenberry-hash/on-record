// Builds the two files behind the small district map (owner, 20 Nov 2026: "show a small map of the district lines over
// the ZIP, not just three names"):
//
//   lib/data/district-shapes.json   the outline of every U.S. House district of one Congress
//   lib/data/zip-shapes.json        the outline of every ZIP code area that lies in more than one district
//   lib/data/zip-centers.json       the middle of every ZIP code area (where the pin map opens)
//
// Source (official, no key): the Census Bureau's cartographic boundary files, 1:500,000.
//   https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip
//   https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip
// Unzip both, then (run it again when a new Congress is seated or a state redraws its map, after build-zip-districts):
//
//   node scripts/build-district-shapes.mjs 119 /path/to/cb_2024_us_cd119_500k /path/to/cb_2020_us_zcta520_500k
//
// (each path without its extension: the .shp and .dbf beside each other). No package is needed: the two file formats
// are read here. Lines are thinned (see the two tolerances below); the map says its lines are approximate.
import { readFileSync, writeFileSync } from "node:fs";

const FIPS = { "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID",
  "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
  "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC",
  "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI" };

const [congressArg, cdBase, zipBase] = process.argv.slice(2), congress = Number(congressArg);
if (!Number.isInteger(congress) || congress < 118 || !cdBase || !zipBase) throw new Error("usage: node scripts/build-district-shapes.mjs <congress> <cd file, no extension> <zcta file, no extension>");

/** The attribute table (.dbf): one object of trimmed strings per record. */
function readDbf(path) {
  const b = readFileSync(path), n = b.readUInt32LE(4), headerLen = b.readUInt16LE(8), recLen = b.readUInt16LE(10), fields = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) fields.push({ name: b.toString("latin1", o, o + 11).replace(/\0.*$/, ""), len: b[o + 16] });
  const out = [];
  for (let i = 0; i < n; i++) {
    let o = headerLen + i * recLen + 1; const row = {};
    for (const f of fields) { row[f.name] = b.toString("latin1", o, o + f.len).trim(); o += f.len; }
    out.push(row);
  }
  return out;
}
/** The shapes (.shp): for each record, its rings as arrays of [lon, lat]. Polygons only; anything else is an empty list. */
function readShp(path) {
  const b = readFileSync(path), out = [];
  for (let o = 100; o < b.length;) {
    const words = b.readUInt32BE(o + 4), start = o + 8, type = b.readInt32LE(start), rings = [];
    if (type === 5 || type === 15) {
      const parts = b.readInt32LE(start + 36), points = b.readInt32LE(start + 40), partAt = start + 44, pointAt = partAt + 4 * parts;
      for (let p = 0; p < parts; p++) {
        const from = b.readInt32LE(partAt + 4 * p), to = p + 1 < parts ? b.readInt32LE(partAt + 4 * (p + 1)) : points, ring = [];
        for (let i = from; i < to; i++) ring.push([b.readDoubleLE(pointAt + 16 * i), b.readDoubleLE(pointAt + 16 * i + 8)]);
        rings.push(ring);
      }
    }
    out.push(rings); o = start + words * 2;
  }
  return out;
}

/** Thins a ring (Douglas–Peucker), keeping its ends; `tol` is in degrees. */
function thin(ring, tol) {
  if (ring.length < 5) return ring;
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, z] = stack.pop(); let worst = 0, at = -1;
    const [ax, ay] = ring[a], [zx, zy] = ring[z], dx = zx - ax, dy = zy - ay, len = dx * dx + dy * dy;
    for (let i = a + 1; i < z; i++) {
      const [x, y] = ring[i], t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0, d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol && at > 0) { keep[at] = 1; stack.push([a, at], [at, z]); }
  }
  return ring.filter((_, i) => keep[i]);
}
// District lines are thinned to about 40 metres; a ZIP area's outline, which is only there to show where the ZIP is, to about 200.
const DISTRICT_TOL = 0.0004, ZIP_TOL = 0.002;
/** Rings thinned; slivers of fewer than four points are dropped. */
// To keep the files small each ring is written as whole numbers: the first point in ten-thousandths of a degree, then
// each point as its step from the one before (lib/district-shapes.ts `decodeRing` reads it back).
const pack = (rings, tol) => rings.map(r => thin(r, tol)).filter(r => r.length >= 4).map(r => {
  const out = []; let px = 0, py = 0;
  for (const [x, y] of r) { const ix = Math.round(x * 1e4), iy = Math.round(y * 1e4); out.push(ix - px, iy - py); px = ix; py = iy; }
  return out;
});

const cdRows = readDbf(`${cdBase}.dbf`), cdShapes = readShp(`${cdBase}.shp`), cdField = Object.keys(cdRows[0]).find(k => /^CD\d{3}FP$/.test(k));
if (!cdField || Number(cdField.slice(2, 5)) !== congress) throw new Error(`the district file is for ${cdField ?? "?"}, not the ${congress}th Congress`);
if (cdRows.length !== cdShapes.length) throw new Error("the district file's shapes and table differ in length");
const districts = {};
cdRows.forEach((row, i) => {
  const st = FIPS[row.STATEFP], n = row[cdField];
  if (!st || !/^\d{2}$/.test(n) || n === "ZZ") return;
  districts[`${st}-${n === "00" || n === "98" ? "AL" : n}`] = pack(cdShapes[i], DISTRICT_TOL);
});

const table = JSON.parse(readFileSync(new URL("../lib/data/zip-districts.json", import.meta.url), "utf8"));
if (table.congress !== congress) throw new Error(`lib/data/zip-districts.json is for the ${table.congress}th Congress; rebuild it first`);
const count = new Map();
for (const zips of Object.values(table.districts)) for (const z of String(zips).split(" ")) count.set(z, (count.get(z) ?? 0) + 1);
const zipRows = readDbf(`${zipBase}.dbf`), zipShapes = readShp(`${zipBase}.shp`), zipField = Object.keys(zipRows[0]).find(k => /^ZCTA5CE/.test(k));
if (!zipField) throw new Error("the ZIP file has no ZCTA5CE column");
const zips = {};
// The middle of every ZIP code area (of its bounding box), in thousandths of a degree: where the pin map opens.
const centers = {};
zipRows.forEach((row, i) => {
  const z = row[zipField];
  if (!/^\d{5}$/.test(z)) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of zipShapes[i]) for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (Number.isFinite(x0)) centers[z] = [Math.round((y0 + y1) * 500), Math.round((x0 + x1) * 500)]; // [lat, lon] × 1000
  if ((count.get(z) ?? 0) > 1) zips[z] = pack(zipShapes[i], ZIP_TOL);
});

const retrieved = new Date().toISOString().slice(0, 10);
const write = (name, body) => { const path = new URL(`../lib/data/${name}`, import.meta.url); writeFileSync(path, JSON.stringify(body)); console.log(name, `${(JSON.stringify(body).length / 1e6).toFixed(2)} MB`); };
write("district-shapes.json", { congress, encoding: "delta-1e4", source: "U.S. Census Bureau, cartographic boundary file cb_2024_us_cd119_500k (1:500,000)", sourceUrl: "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip", retrieved, districts });
write("zip-shapes.json", { congress, encoding: "delta-1e4", source: "U.S. Census Bureau, cartographic boundary file cb_2020_us_zcta520_500k (1:500,000)", sourceUrl: "https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip", retrieved, zips });
write("zip-centers.json", { encoding: "lat-lon-1e3", source: "U.S. Census Bureau, cartographic boundary file cb_2020_us_zcta520_500k (1:500,000)", sourceUrl: "https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip", retrieved, centers });
console.log(`${Object.keys(districts).length} districts, ${Object.keys(zips).length} ZIP areas in more than one district`);
