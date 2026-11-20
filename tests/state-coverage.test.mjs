// Owner, 20 Nov 2026, before invites go outside Texas: "tell me what a non-Texas reader sees where state content would
// be. If it shows anything empty or Texas-specific, replace it with one line: 'State coverage starts with Texas. Your
// state is coming.'" Congress is covered for every state; the one state legislature on the site is Texas.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COVERED_STATES, coverageFromPlaceCookie, STATE_COMING, stateCoverage } from "../lib/state-coverage.ts";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("the one line, and who gets it", () => {
  assert.equal(STATE_COMING, "State coverage starts with Texas. Your state is coming.");
  assert.deepEqual(COVERED_STATES, ["TX"]);
  assert.deepEqual(["TX", "tx", "CA", "NY", "OH", "WY", "DC", "PR"].map(stateCoverage), ["covered", "covered", "coming", "coming", "coming", "coming", "coming", "coming"]);
  // No place saved: nothing is known, so nothing is replaced (the first screen asks for an address).
  assert.deepEqual([null, undefined, "", "Texas", "7"].map(stateCoverage), ["unknown", "unknown", "unknown", "unknown", "unknown"]);
  assert.deepEqual(["CA|CA-11|||address", "TX|TX-37|TX-SD-14|TX-HD-49|address", "WY|WY-AL|||zip", "", undefined].map(coverageFromPlaceCookie), ["coming", "covered", "coming", "unknown", "unknown"]);
});

test("every place a reader outside Texas would meet state content says the one line, in the same words", () => {
  // The legislators cards (the first screen's results and Your legislators): where state legislators would be.
  assert.match(read("lib/flow/data.ts"), /stateNote: texas \? null : STATE_COMING,/);
  assert.doesNotMatch(read("lib/flow/data.ts"), /covered for Texas only/);
  // The home strip: where the Texas Legislature cell would be.
  assert.match(read("components/home/right-now.tsx"), /coverage === "coming" \? <div className="rn-cell"><b>Your state<\/b><span>\{STATE_COMING\}<\/span><\/div> : <div className="rn-cell"><b>Texas Legislature<\/b>/);
  // What's coming: Texas hearings are left out and the line stands where they would be.
  const coming = read("app/coming/page.tsx");
  assert.match(coming, /const items = coverage === "coming" \? allItems\.filter\(i => i\.where !== "Texas"\) : allItems;/);
  assert.match(coming, /\{coverage === "coming" && <p className="meta state-coming-line">\{STATE_COMING\}<\/p>\}/);
  assert.match(coming, /coverage === "coming" \? "Times are Eastern\." : "Times are Eastern for Congress and Central for Texas\."/);
  // The briefing, on the page and by email.
  const briefingPage = read("app/briefing/page.tsx"), briefing = read("lib/briefing.ts");
  assert.match(briefingPage, /const forReader: Briefing = coverage === "coming" \? \{ \.\.\.b, texas: null \} : b;/);
  assert.match(briefingPage, /\{coverage === "coming" && <p className="meta state-coming-line">\{STATE_COMING\}<\/p>\}/);
  assert.match(briefing, /const coming = stateCoverage\(place\?\.state\) === "coming", forReader: Briefing = coming \? \{ \.\.\.b, texas: null \} : b, note = coming \? STATE_COMING : null;/);
  // The Congress dashboard's link to the Texas dashboard.
  assert.match(read("app/dashboard/page.tsx"), /coverage === "coming" \? <> · \{STATE_COMING\}<\/> : <> · <Link href="\/dashboard\/texas">Texas Legislature<\/Link><\/>/);
  // The address form no longer promises state legislators to a reader outside Texas.
  assert.match(read("app/legislators/page.tsx"), /stateCoverage\(loc\?\.state\) === "coming"\n\s+\? <PlaceForm next="\/legislators" zip=\{zip\} submit="Update my legislators" hint=\{`A ZIP code alone also works\. It finds your members of Congress; the street address finds your exact House district\. \$\{STATE_COMING\}`\} \/>/);
  // The menu: no Texas section for a reader outside Texas; a Texas page opened anyway says the line.
  const shell = read("components/public/public-shell.tsx");
  assert.match(shell, /\.filter\(p => p\.href !== "\/texas" \|\| coverage !== "coming" \|\| current === "\/texas"\)/);
  assert.match(shell, /\{enabled && coverage === "coming" && current === "\/texas" && <div className="preview-banner state-coming" role="note">\{STATE_COMING\} This section covers the Texas Legislature\.<\/div>\}/);
  // One wording, kept in one place: nobody retypes it.
  for (const f of ["lib/flow/data.ts", "components/home/right-now.tsx", "app/coming/page.tsx", "app/briefing/page.tsx", "lib/briefing.ts", "app/dashboard/page.tsx", "app/legislators/page.tsx", "components/public/public-shell.tsx"])
    assert.doesNotMatch(read(f), /Your state is coming/, `${f} uses the shared line`);
});

test("a Texas reader, and a reader with no place saved, see what they saw before", () => {
  // Every replacement is conditional on a saved place outside Texas.
  for (const [f, n] of [["components/home/right-now.tsx", 1], ["app/coming/page.tsx", 4], ["app/briefing/page.tsx", 2], ["app/dashboard/page.tsx", 1], ["components/public/public-shell.tsx", 2]])
    assert.ok((read(f).match(/coverage (?:===|!==) "coming"/g) ?? []).length >= n, f);
  // Congress is covered for every state: the federal lookup has no list of states.
  assert.doesNotMatch(read("lib/federal/legislators.ts"), /COVERED_STATES|stateCoverage/);
});

// Found by the four-state check of 20 Nov 2026 (live Census service): the 2025 map-year answer, which is the one that
// holds the sitting Congress's map, names the district only in GEOID and BASENAME. These are the rows it returned.
test("the House district is read from every form the Census service uses, so a street address always names the representative", async () => {
  const { districtsFromCensus } = await import("../lib/federal/depth-parse.ts");
  const match = (stusab, key, row) => ({ matchedAddress: "X", geographies: { States: [{ STUSAB: stusab }], [key]: [row] } });
  // Columbus, Ohio (90 W Broad St, 43215: a ZIP shared by two districts), map year 2025: no "CD119" field.
  assert.equal(districtsFromCensus(match("OH", "119th Congressional Districts", { GEOID: "3915", CDSESSN: "119", STATE: "39", BASENAME: "15", NAME: "Congressional District 15" })).congressional, "OH-15");
  // The same place, map year 2024 and the "current" map: the field is there.
  assert.equal(districtsFromCensus(match("OH", "119th Congressional Districts", { GEOID: "3915", CDSESSN: "119", BASENAME: "15", CD119: "15" })).congressional, "OH-15");
  assert.equal(districtsFromCensus(match("OH", "120th Congressional Districts", { GEOID: "3915", CDSESSN: "120", BASENAME: "15", CD120: "15" })).congressional, "OH-15");
  // New York (350 5th Ave, 10118), map year 2025.
  assert.equal(districtsFromCensus(match("NY", "119th Congressional Districts", { GEOID: "3612", CDSESSN: "119", STATE: "36", BASENAME: "12", NAME: "Congressional District 12" })).congressional, "NY-12");
  // A state with one district (Wyoming), map year 2025: "at Large", GEOID ending 00.
  assert.equal(districtsFromCensus(match("WY", "119th Congressional Districts", { GEOID: "5600", CDSESSN: "119", STATE: "56", BASENAME: "Congressional District (at Large)", NAME: "Congressional District (at Large)" })).congressional, "WY-AL");
  assert.equal(districtsFromCensus(match("WY", "119th Congressional Districts", { CDSESSN: "119", BASENAME: "Congressional District (at Large)" })).congressional, "WY-AL");
  // A single-digit district keeps its two-digit form; a row with nothing usable names no district rather than guessing.
  assert.equal(districtsFromCensus(match("CA", "119th Congressional Districts", { GEOID: "0603", BASENAME: "3" })).congressional, "CA-03");
  assert.equal(districtsFromCensus(match("CA", "119th Congressional Districts", { CDSESSN: "119", NAME: "x" })).congressional, null);
});
