// First trial feedback, 20 Nov 2026: a reader at a newer address in ZIP 76120 entered a street address and still got
// "ZIP code 76120 is split between 3 U.S. House districts. Tap yours." The owner's instructions: never fall back
// silently to the ZIP picker; say "We couldn't place that address" and offer, in order, to correct the address, use a
// nearby cross street or a neighbor's address, or drop a pin on a map; show "tap your district" only as a last resort,
// with a small map of the district lines over the ZIP; and mark any place that was self-picked rather than matched, so
// it never counts as address-matched.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COULD_NOT_PLACE, decodeRing, boxOf, labelPoint, DISTRICT_COLOURS, districtColour, LAST_RESORT, LINES_APPROXIMATE, pinInRange, PIN_MIN_ZOOM, PLACE_STEPS, roundPin, SELF_PICKED_NOTE, TILE_MAX_ZOOM, TILE_MIN_ZOOM, validTile } from "../lib/map-rules.ts";
import { PLACE_ERRORS } from "../lib/flow/rules.ts";
import { notFoundLine } from "../lib/flow/cards.ts";
import { districtFromCensus } from "../lib/verify/rules.ts";
import { districtsFromCensus } from "../lib/federal/depth-parse.ts";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const json = f => JSON.parse(read(f));

test("why it happened: the address matched, and the district's number was in a field the site did not read", () => {
  // The Census Bureau's answer for the map year that holds the sitting Congress (the row it returned on 20 Nov 2026).
  const row = { GEOID: "4833", CDSESSN: "119", STATE: "48", BASENAME: "33", NAME: "Congressional District 33" };
  const match = { matchedAddress: "928 ARKAN LN, FORT WORTH, TX, 76120", geographies: { States: [{ STUSAB: "TX" }], "119th Congressional Districts": [row] } };
  assert.equal(districtsFromCensus(match).congressional, "TX-33", "the lookup now reads it");
  // The counting side had the same miss, and worse: with no number it named the address "at large".
  assert.deepEqual(districtFromCensus(match), { districtId: "TX-33", state: "TX" });
  assert.equal(districtFromCensus({ geographies: { States: [{ STUSAB: "TX" }], "119th Congressional Districts": [{ CDSESSN: "119", NAME: "x" }] } }), null, "no number is no district, never TX-AL");
  assert.deepEqual(districtFromCensus({ geographies: { States: [{ STUSAB: "TX" }], "119th Congressional Districts": [{ CD119: "07" }] } }), { districtId: "TX-07", state: "TX" });
  assert.deepEqual(districtFromCensus({ geographies: { States: [{ STUSAB: "WY" }], "119th Congressional Districts": [{ GEOID: "5600", BASENAME: "Congressional District (at Large)" }] } }), { districtId: "WY-AL", state: "WY" });
  // From now on the two cases are counted apart, so the next report does not have to be worked out.
  assert.match(read("app/start/actions.ts"), /if \(!loc\.congressional\) await countEvent\("lookup_address_no_district", access\.audience\);/);
});

test("an address that cannot be placed is never answered with the ZIP: the owner's words, then what to try, in order", () => {
  assert.equal(COULD_NOT_PLACE, "We couldn't place that address.");
  assert.equal(PLACE_ERRORS.no_match, COULD_NOT_PLACE);
  assert.doesNotMatch(PLACE_ERRORS.no_match, /ZIP/i, "the message no longer points back to the ZIP code");
  assert.deepEqual(PLACE_STEPS.map(s => s.key), ["correct", "nearby", "pin"]);
  assert.deepEqual(PLACE_STEPS.map(s => s.title), ["Check the address and try again.", "Use a nearby cross street or a neighbor's address.", "Drop a pin on a map."]);
  assert.match(PLACE_STEPS[1].detail, /“&” between them/, "it says how to type a cross street (the Census Bureau places “A St & B Ave”)");
  // The action stops at the failed match: nothing is saved and no place is taken from the ZIP.
  const action = read("app/start/actions.ts"), find = action.slice(action.indexOf("export async function findPlace"), action.indexOf("async function everyoneFound"));
  assert.ok(find.indexOf("if (!g.ok) return fail(g.reason);") > 0 && find.indexOf("if (!g.ok) return fail(g.reason);") < find.indexOf("await saveLocation(userId, loc);"));
  // The form shows the three steps, with the pin as a link; the reader's typing stays.
  const form = read("components/home/place-form.tsx");
  assert.match(form, /state\.error === "no_match" \? <div className="gate gate-closed place-nomatch" role="alert">/);
  assert.match(form, /\{PLACE_STEPS\.map\(s => <li key=\{s\.key\}><b>\{s\.key === "pin" \? <a href=\{pinHref\}>\{s\.title\}<\/a> : s\.title\}<\/b> \{s\.detail\}<\/li>\)\}/);
  assert.match(form, /defaultValue=\{state\.street\}/);
});

test("'tap your district' is the last resort: after the three steps, closed until opened, with a map of the lines over the ZIP", () => {
  const cards = read("components/home/legislator-cards.tsx"), block = cards.slice(cards.indexOf("{choose && <li"), cards.indexOf("{state.map(c => <Card"));
  const at = s => { const i = block.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at("PLACE_STEPS[0].title") < at("PLACE_STEPS[1].title") && at("PLACE_STEPS[1].title") < at("PLACE_STEPS[2].title") && at("PLACE_STEPS[2].title") < at("<LastResort map={map}>"));
  assert.ok(at("<LastResort map={map}>") < at("<form action={chooseDistrict}"), "the district buttons exist only inside the last resort");
  assert.equal((block.match(/action=\{chooseDistrict\}/g) ?? []).length, 2, "one form of buttons and one list for a long choice, both inside it");
  assert.equal(LAST_RESORT, "Last resort: choose your district yourself");
  const last = read("components/map/last-resort.tsx");
  assert.match(last, /<details className="flow-last-resort" onToggle=/); assert.doesNotMatch(last, /<details[^>]* open/, "it starts closed");
  assert.match(last, /\{open && map && <DistrictMap map=\{map\}/, "the map is drawn when it opens");
  // The headline no longer tells the reader to tap, and no line sends them to choosing first.
  assert.doesNotMatch(cards, /Tap yours/);
  for (const source of ["zip", "address", "nearby", "pin", "picked"]) for (const needsAddress of [true, false]) for (const chooseDistrict of [true, false])
    assert.doesNotMatch(notFoundLine({ source, needsAddress, chooseDistrict }) ?? "", /choose your district/i);
  assert.equal(notFoundLine({ source: "address", needsAddress: false, chooseDistrict: true }), "That address did not find your U.S. representative. The steps below say what to try.");
  // Each button carries its district's colour on the map; the colours name districts, never parties.
  assert.match(block, /style=\{\{ \["--district" as string\]: districtColour\(at >= 0 \? at : n\) \}\}/);
  for (const c of DISTRICT_COLOURS) { const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); assert.ok(!(r > 150 && g < 90 && b < 90) && !(b > 150 && r < 90 && g < 110), `${c} is neither red nor blue`); }
  assert.equal(new Set(DISTRICT_COLOURS).size, DISTRICT_COLOURS.length); assert.equal(districtColour(DISTRICT_COLOURS.length), DISTRICT_COLOURS[0]);
  assert.match(LINES_APPROXIMATE, /approximate/);
});

test("a place the reader gave themselves is marked, and counting never reads it", () => {
  const loc = read("lib/location.ts"), action = read("app/start/actions.ts");
  assert.match(loc, /export type PlaceSource = "zip" \| "address" \| "nearby" \| "pin" \| "picked";/);
  assert.match(loc, /export const SELF_PLACED: readonly PlaceSource\[\] = \["nearby", "pin", "picked"\];/);
  // A district chosen by hand is "picked", whatever found the rest of the place; a pin is "pin"; a cross street is "nearby".
  assert.match(action, /stateLower: same \? loc\.stateLower : null, source: "picked" \}\);/);
  assert.match(action, /stateUpper: d\.stateUpper, stateLower: d\.stateLower, source: "pin" \}\);/);
  assert.match(action, /source: \/ & \/\.test\(d\.matchedAddress \?\? ""\) \? "nearby" : "address" \};/);
  assert.match(SELF_PICKED_NOTE, /never counted as address-matched/);
  // The mark is stored with the account's place (reader_locations.source, plain text: no migration) and in the cookie.
  assert.match(read("drizzle/0021_roundc_locations.sql"), /`source` text NOT NULL,/); assert.doesNotMatch(read("drizzle/0021_roundc_locations.sql"), /CHECK[^;]*source/i);
  assert.match(loc, /source !== "nearby" && source !== "pin" && source !== "picked"\)\) return null;/);
  // What makes an answer count is decided elsewhere, from its own match of a full home address by the Census Bureau:
  // the counting rules, the counting store and the verification flow never read the lookup place at all.
  for (const f of ["lib/constituent/rules.ts", "lib/constituent/store.ts", "lib/verify/flow.ts", "lib/verify/rules.ts", "lib/verify/residence-store.ts", "lib/verify/providers.ts"])
    assert.doesNotMatch(read(f), /readerLocations|currentLocation|@\/lib\/location|\.\.\/location/, `${f} never reads the lookup place`);
  assert.match(read("lib/verify/flow.ts"), /const g = await geocodeDistrict\(street\);/);
  assert.match(read("lib/constituent/view.ts"), /The looked-up place only chooses which totals to show; it never makes an answer count\./);
});

test("the pin: the spot goes once to the Census Bureau, rounded, only from close in, and is not stored", () => {
  assert.equal(roundPin(32.76315587727073), 32.76316); assert.equal(roundPin(-97.1814), -97.1814);
  assert.deepEqual([pinInRange(32.76, -97.18), pinInRange(61.2, -149.9), pinInRange(21.3, -157.8), pinInRange(13.4, 144.7), pinInRange(18.2, -66.5)], [true, true, true, true, true]);
  assert.deepEqual([pinInRange(51.5, -0.1), pinInRange(NaN, -97), pinInRange(32.7, 97.1), pinInRange(0, 0)], [false, false, false, false]);
  assert.ok(PIN_MIN_ZOOM >= 16, "from further out a thumb's width is several streets");
  const action = read("app/start/actions.ts"), pin = action.slice(action.indexOf("export async function placeByPin"), action.indexOf("/** Up to three issues"));
  assert.match(pin, /if \(!access\.allowed\) redirect\(next\);/);
  assert.match(pin, /const lat = roundPin\(Number\(formData\.get\("lat"\)\)\), lon = roundPin\(Number\(formData\.get\("lon"\)\)\);\n\s+if \(!pinInRange\(lat, lon\)\)/);
  assert.match(pin, /if \(!g\.districts\.congressional\) redirect\(`\$\{back\}&e=no_district`\);/, "a spot with no House district is not saved as a place");
  assert.doesNotMatch(pin, /lat[^;]*saveLocation|saveLocation\([^)]*\b(lat|lon)\b/, "the spot itself is never saved");
  const form = read("components/map/pin-form.tsx");
  assert.match(form, /const close = !!spot && spot\.zoom >= PIN_MIN_ZOOM;/); assert.match(form, /<button type="submit" disabled=\{!close\}>Use this spot<\/button>/);
  // The same official service, asked by coordinates, with the same care about which Congress's map answered.
  const leg = read("lib/federal/legislators.ts");
  assert.match(leg, /\/geocoder\/geographies\/coordinates\?/);
  assert.equal((leg.match(/if \(d\.congressional && used !== null && used !== sitting\)/g) ?? []).length, 2);
});

test("map pictures come through the site's own server, behind the reader gate, and only for a real picture address", () => {
  assert.deepEqual(validTile("12", "941", "1652"), { z: 12, x: 941, y: 1652 });
  assert.equal(validTile(String(TILE_MIN_ZOOM - 1), "0", "0"), null); assert.equal(validTile(String(TILE_MAX_ZOOM + 1), "0", "0"), null);
  for (const bad of [["12", "4096", "0"], ["12", "-1", "0"], ["12", "1.5", "0"], ["x", "1", "1"], ["12", "../1", "1"], ["12", "1", "1;rm"]]) assert.equal(validTile(...bad), null, bad.join("/"));
  const route = read("app/api/map/tile/[z]/[x]/[y]/route.ts"), map = read("components/map/district-map.tsx");
  assert.ok(route.indexOf("if (!access.allowed) return new Response(null, { status: 404 });") < route.indexOf("fetch("));
  assert.ok(route.indexOf("if (!t) return new Response(null, { status: 400 });") < route.indexOf("fetch("));
  assert.match(map, /L\.tileLayer\("\/api\/map\/tile\/\{z\}\/\{x\}\/\{y\}"/, "the reader's device asks this site, nobody else");
  assert.doesNotMatch(map + read("components/map/pin-form.tsx") + read("components/map/last-resort.tsx"), /https?:\/\//, "no outside address in anything the reader's device runs");
  assert.match(map, /MAP_CREDIT/);
  // The trust pages name both services and what each receives.
  const trust = read("lib/trust.ts");
  assert.match(trust, /id: "osm", name: "OpenStreetMap"/); assert.match(trust, /hosts: \["tile\.openstreetmap\.org"\]/);
  assert.match(trust, /The street address you type, or the spot you choose on the map, sent from the site's server\./);
  assert.match(trust, /id: "census-boundaries"/);
});

test("the outlines: every district of the sitting Congress, every shared ZIP, read back as they were written", () => {
  assert.deepEqual(decodeRing([-971810, 327630, 10, -5, -20, 0]), [[32.763, -97.181], [32.7625, -97.18], [32.7625, -97.182]]);
  const box = boxOf([decodeRing([-971810, 327630, 10, -5, -20, 0])]);
  assert.deepEqual(box, { south: 32.7625, west: -97.182, north: 32.763, east: -97.18 });
  assert.equal(boxOf([]), null);
  assert.deepEqual(labelPoint([[[32.7627, -97.181], [40, -90]]], box), [32.7627, -97.181]); assert.equal(labelPoint([[[40, -90]]], box), null);
  const d = json("lib/data/district-shapes.json"), z = json("lib/data/zip-shapes.json"), c = json("lib/data/zip-centers.json"), table = json("lib/data/zip-districts.json");
  assert.equal(d.congress, table.congress, "the lines are for the same Congress as the ZIP table"); assert.equal(z.congress, table.congress);
  assert.equal(Object.keys(d.districts).length, 441, "435 districts, the District of Columbia and five territories");
  for (const id of Object.keys(table.districts)) assert.ok(d.districts[id]?.length, `${id} has an outline`);
  // The reader's ZIP: shared by three districts, each with an outline that reaches the ZIP area.
  const mine = Object.entries(table.districts).filter(([, zips]) => zips.split(" ").includes("76120")).map(([id]) => id).sort();
  assert.deepEqual(mine, ["TX-12", "TX-25", "TX-33"]);
  const zipBox = boxOf(z.zips["76120"].map(decodeRing));
  assert.ok(zipBox.south > 32.6 && zipBox.north < 32.9 && zipBox.west > -97.3 && zipBox.east < -97.0, "ZIP 76120 is east Fort Worth");
  for (const id of mine) assert.ok(labelPoint(d.districts[id].map(decodeRing), zipBox), `${id} has points inside the ZIP area`);
  assert.deepEqual(c.centers["76120"].map(v => v / 1e3).map(Math.round), [33, -97]);
  // Every ZIP shared by more than one district has an outline; a ZIP in one district needs none.
  const count = new Map(); for (const zips of Object.values(table.districts)) for (const zip of zips.split(" ")) count.set(zip, (count.get(zip) ?? 0) + 1);
  const shared = [...count].filter(([, n]) => n > 1).map(([zip]) => zip);
  assert.ok(shared.length > 5000 && shared.filter(zip => !z.zips[zip]).length < shared.length * 0.01, "all but a handful of shared ZIPs have an outline");
  assert.equal(z.zips["78701"], undefined);
  // Like the ZIP table, the outlines are not used once their Congress has ended.
  assert.match(read("lib/district-shapes.ts"), /if \(d\.congress !== congressForYear\(new Date\(now\)\.getUTCFullYear\(\)\) \|\| z\.congress !== d\.congress\) return null;/);
});
