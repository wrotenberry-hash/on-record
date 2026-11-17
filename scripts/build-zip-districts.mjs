// Builds lib/data/zip-districts.json: which U.S. House districts each ZIP code area touches.
//
// Source (official, no key): the Census Bureau's relationship file between congressional districts and ZIP Code
// Tabulation Areas. Run it again when a new Congress is seated or a state redraws its map:
//
//   NODE_USE_ENV_PROXY=1 node scripts/build-zip-districts.mjs 119
//   node scripts/build-zip-districts.mjs 119 /path/to/tab20_cd11920_zcta520_natl.txt   (a file already downloaded)
//
// Output: { congress, source, retrieved, districts: { "TX-37": "78701 78703 …" } }. A ZIP is listed under every
// district that holds some of its land, so a ZIP that crosses a line is offered as a choice, never guessed.
import { readFileSync, writeFileSync } from "node:fs";

const FIPS = { "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID",
  "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
  "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC",
  "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI" };

const congress = Number(process.argv[2] ?? 119), file = process.argv[3];
if (!Number.isInteger(congress) || congress < 118) throw new Error("usage: node scripts/build-zip-districts.mjs <congress> [file]");
const url = `https://www2.census.gov/geo/docs/maps-data/data/rel2020/cd-sld/tab20_cd${congress}20_zcta520_natl.txt`;
const text = file ? readFileSync(file, "utf8") : await (await fetch(url)).text();
const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
const head = lines[0].split("|"), col = name => head.indexOf(name);
const CD = col(`GEOID_CD${congress}_20`), ZIP = col("GEOID_ZCTA5_20"), LAND = col("AREALAND_PART");
if (CD < 0 || ZIP < 0 || LAND < 0) throw new Error("unexpected columns: " + head.join(","));

const districts = {};
for (const line of lines.slice(1)) {
  const f = line.split("|"), geoid = f[CD], zip = f[ZIP];
  if (!/^\d{5}$/.test(zip) || !(Number(f[LAND]) > 0)) continue; // no ZIP area here, or only water
  const state = FIPS[geoid.slice(0, 2)], n = geoid.slice(2);
  if (!state || !/^\d{2}$/.test(n)) continue; // "ZZ": not in any district
  const id = `${state}-${n === "00" || n === "98" ? "AL" : n}`;
  (districts[id] ??= []).push(zip);
}
const out = { congress, source: url, retrieved: new Date().toISOString().slice(0, 10),
  districts: Object.fromEntries(Object.keys(districts).sort().map(k => [k, [...new Set(districts[k])].sort().join(" ")])) };
writeFileSync(new URL("../lib/data/zip-districts.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(`${Object.keys(out.districts).length} districts, ${new Set(Object.values(districts).flat()).size} ZIP areas, Congress ${congress}`);
