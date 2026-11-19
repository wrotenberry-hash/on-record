// The first screen and the default follows (owner, 18 Nov 2026; docs/PERSUASION_RETENTION.md, points 1, 2 and 6).
// The words in lib/flow/cards.ts, the default-follow rule in lib/follow-defaults.ts and the photo rules in
// lib/photos.ts, and the same database functions the site runs, against a temporary database built from the real
// migrations.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { CAUGHT_UP, cardVotesNote, caughtUp, deliveryLines, endOfList, fedCardVote, followSummary, initials, legislatorsHeading, meaningfulFed, meaningfulTx, noPhotoLabel, NO_PARTY, notFoundLine,
  numberWord, partyWord, photoAlt, seatLine, txCardVote, VOTES_PER_CARD } from "../lib/flow/cards.ts";
import { fedVoteRows, followedBillsMovedSince, followedMemberIds, memberVotesSince, texasBillsMovedSince, texasMembersByIds, txVoteRows } from "../lib/flow/card-store.ts";
import { applyFollowDefaults, followAllAt, followPlan, followState, issuesAsked, markIssuesAsked, memberKind, placeFromKey, placeKey, placeMemberIds, toggleMemberFollow } from "../lib/follow-defaults.ts";
import { allowedPhotoUrl, FEDERAL_PHOTO_HOSTS, federalPhotoUrl, loadPhoto, MAX_PHOTO_BYTES, PHOTO_HOSTS, photoPath, photoTarget, TEXAS_PHOTO_HOSTS } from "../lib/photos.ts";
import { LEGAL_REVIEW, PROCESSORS, STORED } from "../lib/trust.ts";
import { ISSUE_CATEGORIES } from "../lib/federal/categories.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), DAY = 86400e3;
const read = p => readFileSync(join(ROOT, p), "utf8");
const dir = mkdtempSync(join(tmpdir(), "first-screen-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
after(() => { client.close(); rmSync(dir, { recursive: true, force: true }); });

const T0 = Date.UTC(2026, 10, 18, 15);
const AUSTIN = { state: "TX", congressional: "TX-37", stateUpper: "TX-SD-14", stateLower: "TX-HD-49" };
const AUSTIN_ZIP = { state: "TX", congressional: "TX-37", stateUpper: null, stateLower: null };
const HOUSTON = { state: "TX", congressional: "TX-07", stateUpper: "TX-SD-15", stateLower: "TX-HD-134" };
const TULSA = { state: "OK", congressional: "OK-01", stateUpper: "OK-SD-35", stateLower: "OK-HD-71" };

/* ------------------------------------------------------------------ the people --- */

const member = (id, fullName, party, state, chamber, district = null, isCurrent = 1) => ({ id, fullName, firstName: fullName.split(" ")[0], lastName: fullName.split(" ").pop(), party, state, district, chamber, isCurrent,
  sourceUrl: "https://www.congress.gov/", retrievedAt: T0 });
await db.insert(schema.officialPoliticians).values([
  member("C001056", "John Cornyn", "Republican", "TX", "senate"), member("C001098", "Ted Cruz", "Republican", "TX", "senate"),
  member("D000399", "Lloyd Doggett", "Democrat", "TX", "house", 37), member("F000468", "Lizzie Fletcher", "Democrat", "TX", "house", 7),
  member("X000001", "Former Member", "Republican", "TX", "house", 37, 0), // left office: never one of "yours"
  member("L000575", "James Lankford", "Republican", "OK", "senate"), member("M001190", "Markwayne Mullin", "Republican", "OK", "senate"), member("H001082", "Kevin Hern", "Republican", "OK", "house", 1),
  member("S000033", "Bernard Sanders", "Independent", "VT", "senate"),
]);
const person = (id, name, party, chamber, district, image = null) => ({ id, name, party, chamber, district, image, sourceUrl: "https://openstates.org/", retrievedAt: T0 });
await db.insert(schema.txPeople).values([
  person("ocd-person/sd14", "Sarah Eckhardt", "Democratic", "upper", "14", "https://senate.texas.gov/members/d14/img/Eckhardt.jpg"),
  person("ocd-person/hd49", "Gina Hinojosa", "Democratic", "lower", "49", "https://images.example.org/hinojosa.jpg"), // not an official host
  person("ocd-person/sd15", "Molly Cook", "Democratic", "upper", "15"), person("ocd-person/hd134", "Ann Johnson", "Democratic", "lower", "134", "http://house.texas.gov/photos/members/1.jpg"), // not https
]);
const AUSTIN_FIVE = ["C001056", "C001098", "D000399", "ocd-person/sd14", "ocd-person/hd49"];

let seq = 0;
async function reader() {
  const userId = `user-${++seq}`;
  await db.insert(schema.appUsers).values({ id: userId, kind: "public", externalKey: `invite:${seq}`, createdAt: T0 });
  return userId;
}
const follows = async userId => (await followedMemberIds(db, userId)).sort();
const prefs = userId => db.select().from(schema.alertPrefs).where(eq(schema.alertPrefs.userId, userId)).get();
const setup = userId => db.select().from(schema.readerSetup).where(eq(schema.readerSetup.userId, userId)).get();
const sorted = list => [...list].sort();

/* ------------------------------------------------------------------- the words --- */

test("the heading counts who was found: five only when all five are there", () => {
  assert.equal(legislatorsHeading({ senators: 2, representative: 1, state: 2 }), "Your five legislators");
  assert.equal(legislatorsHeading({ senators: 2, representative: 1, state: 0 }), "Your three legislators in Congress");
  assert.equal(legislatorsHeading({ senators: 2, representative: 0, state: 0 }), "Your two U.S. senators"); // a ZIP that crosses districts, before the district is chosen
  assert.equal(legislatorsHeading({ senators: 2, representative: 1, state: 1 }), "Your four legislators"); // one state seat with no member on file
  assert.equal(legislatorsHeading({ senators: 0, representative: 1, state: 0 }), "Your legislator in Congress"); // the District of Columbia
  assert.equal(legislatorsHeading({ senators: 0, representative: 0, state: 0 }), "Your legislators");
  assert.equal(numberWord(5), "five"); assert.equal(numberWord(12), "12");
});

test("a ZIP code alone says what it could not find", () => {
  assert.equal(notFoundLine({ source: "zip", needsAddress: true, chooseDistrict: false }), "A ZIP code alone could not find your Texas state senator and your Texas state representative. Add your street address below.");
  assert.equal(notFoundLine({ source: "zip", needsAddress: false, chooseDistrict: true }), "A ZIP code alone could not find your U.S. representative. Choose your district below, or add your street address.");
  assert.match(notFoundLine({ source: "zip", needsAddress: true, chooseDistrict: true }), /your U\.S\. representative, your Texas state senator and your Texas state representative\. Add your street address below\.$/);
  assert.equal(notFoundLine({ source: "address", needsAddress: false, chooseDistrict: false }), null);
  assert.equal(notFoundLine({ source: "zip", needsAddress: false, chooseDistrict: false }), null, "outside Texas a ZIP in one district finds everyone the site covers");
});

test("party words: the party is its own word, spelled the same way whatever the source calls it", () => {
  assert.equal(partyWord("Republican"), "Republican");
  assert.equal(partyWord("Democrat"), "Democrat");
  assert.equal(partyWord("Democratic"), "Democrat", "Open States spells it Democratic; the card says Democrat");
  assert.equal(partyWord("Independent"), "Independent");
  assert.equal(partyWord(" republican "), "Republican");
  assert.equal(partyWord("Libertarian"), "Libertarian");
  assert.equal(partyWord("Working Families"), "Working Families", "a party the list does not know keeps its own name");
  assert.equal(partyWord(""), NO_PARTY); assert.equal(partyWord(null), NO_PARTY);
  for (const p of ["Republican", "Democrat", "Democratic", "Independent"]) assert.doesNotMatch(partyWord(p), /[()\-]|^[A-Z]$/, "a word, not a letter in brackets");
});

test("the seat is written out, with no party letter in it", () => {
  assert.equal(seatLine({ level: "federal", chamber: "senate", state: "TX", district: null }), "U.S. Senator for Texas");
  assert.equal(seatLine({ level: "federal", chamber: "house", state: "TX", district: 37 }), "U.S. Representative for Texas, District 37");
  assert.equal(seatLine({ level: "federal", chamber: "house", state: "VT", district: null }), "U.S. Representative for Vermont (at large)");
  assert.equal(seatLine({ level: "state", chamber: "upper", district: "14" }), "Texas State Senator, District 14");
  assert.equal(seatLine({ level: "state", chamber: "lower", district: "49" }), "Texas State Representative, District 49");
});

test("identical for every party: no file of the first screen branches on a party", () => {
  const files = ["lib/flow/cards.ts", "lib/flow/card-store.ts", "lib/flow/data.ts", "lib/follow-defaults.ts", "lib/photos.ts", "app/api/photo/[id]/route.ts",
    ...readdirSync(join(ROOT, "components/home")).filter(f => /\.tsx?$/.test(f)).map(f => `components/home/${f}`)];
  for (const f of files) {
    const text = read(f);
    assert.doesNotMatch(text, /party\s*(===|!==|==|!=)|\.party\s*\?|(Republican|Democrat\w*|Independent)["'`]\s*(\?|===|!==|&&|\|\|)/, `${f} must not branch on a party`);
    assert.doesNotMatch(text, /\b(score|grade|rating|rank)\w*\s*[:=(]/i, `${f} computes no score, grade, rating or rank`);
  }
  // The card component draws the same parts for every member, and the placeholder has one look.
  const card = read("components/home/legislator-cards.tsx"), css = read("components/home/flow.css");
  for (const part of ["<MemberPhoto", "flow-name", "flow-party", "flow-seat", "flow-votes", "flow-end"]) assert.ok(card.includes(part), `every card has ${part}`);
  assert.doesNotMatch(css, /republican|democrat|independent|#(b22|c00|d00|00f|1e4fd)|\bred\b|\bblue\b/i, "no party colours");
});

/* ------------------------------------------------- three votes per card --- */

const bill = (id, number, title, billType = "hr") => ({ id, congress: 119, billType, number, title, congressUrl: "https://www.congress.gov/", sourceUrl: "https://www.congress.gov/", retrievedAt: T0 });
const roll = (id, daysAgo, question, result, billId, chamber = "senate", yea = 60, nay = 40, title = null) => ({ id, chamber, congress: 119, session: 2, rollNumber: Number(id.split("-").pop()), votedAt: T0 - daysAgo * DAY, question, title, result,
  billId, yea, nay, sourceUrl: "https://www.senate.gov/", retrievedAt: T0 });
await db.insert(schema.officialBills).values([bill("119-s-1", 1, "Clean Water Act of 2026", "s"), bill("119-s-2", 2, "Rural Clinics Act", "s"), bill("119-s-3", 3, "A bill to extend school lunch funding", "s"),
  bill("119-s-4", 4, "Port Safety Act", "s"), bill("119-s-5", 5, "Farm Credit Act", "s"), bill("119-hr-9", 9, "Old Bill Act")]);
await db.insert(schema.officialRollCalls).values([
  roll("senate-119-2-10", 1, "On the Motion to Table", "Motion to Table Agreed to", "119-s-1"),                 // procedural: never on a card
  roll("senate-119-2-9", 2, "On Passage of the Bill", "Bill Passed", "119-s-1", "senate", 61, 39),
  roll("senate-119-2-8", 3, "On the Amendment", "Amendment Rejected", "119-s-2"),                                // an amendment: never on a card
  roll("senate-119-2-7", 4, "On Passage of the Bill", "Bill Defeated", "119-s-2", "senate", 45, 55),
  roll("senate-119-2-6", 5, "On the Cloture Motion", "Cloture Motion Agreed to", "119-s-3"),                     // debate went on: not the vote that counts
  roll("senate-119-2-5", 6, "On Passage of the Bill", "Bill Passed", "119-s-3", "senate", 70, 30),
  roll("senate-119-2-4", 7, "On Passage of the Bill", "Bill Passed", "119-s-4", "senate", 88, 12),
  roll("senate-119-2-3", 8, "On Passage of the Bill", "Bill Passed", "119-s-5", "senate", 52, 48),
  roll("senate-119-2-2", 400, "On Passage of the Bill", "Bill Passed", "119-hr-9"),                             // more than 12 months ago
]);
const cast = (rollCallId, politicianId, position) => ({ rollCallId, politicianId, position, rawPosition: position });
await db.insert(schema.officialMemberVotes).values([
  ...["10", "9", "8", "7", "6", "5", "4", "3", "2"].map((n, i) => cast(`senate-119-2-${n}`, "C001056", i % 2 ? "Nay" : "Yea")),
  cast("senate-119-2-9", "C001098", "Nay"), cast("senate-119-2-7", "C001098", "Not Voting"), cast("senate-119-2-10", "C001098", "Yea"), // two meaningful votes only
]);

test("three votes per card: the last three meaningful votes, newest first, each with its date and a link to the bill", async () => {
  const rows = await fedVoteRows(db, "C001056", T0 - 365 * DAY);
  assert.equal(rows.length, 8, "the vote from 400 days ago is outside the 12 months");
  const all = meaningfulFed(rows);
  assert.deepEqual(all.map(v => v.billId), ["119-s-1", "119-s-2", "119-s-3", "119-s-4", "119-s-5"], "procedural votes, amendments and a cloture vote that carried are left out");
  assert.equal(VOTES_PER_CARD, 3);
  const votes = all.slice(0, VOTES_PER_CARD).map(v => fedCardVote(v));
  assert.equal(votes.length, 3);
  assert.deepEqual(votes.map(v => v.billHref), ["/bills/119-s-1", "/bills/119-s-2", "/bills/119-s-3"]);
  assert.deepEqual(votes.map(v => v.billLabel), ["S. 1", "S. 2", "S. 3"]);
  assert.deepEqual(votes.map(v => v.when), [T0 - 2 * DAY, T0 - 4 * DAY, T0 - 6 * DAY], "each vote carries its date, newest first");
  assert.equal(votes[0].line, "Voted No on passing the Clean Water Act of 2026. It passed 61–39.");
  assert.equal(votes[1].line, "Voted No on passing the Rural Clinics Act. It did not pass, 45–55.");
  assert.equal(votes[2].line, "Voted No on passing a bill to extend school lunch funding. It passed 70–30.");
  for (const v of votes) { assert.equal(v.label, "Official"); assert.doesNotMatch(v.line, /!|good|bad|right|wrong|shame|finally/i); }
  assert.equal(cardVotesNote(votes.length, all.length), "The three most recent of 5 votes on bills in the past 12 months.");
  // With a summary on show the line uses its headline and is labelled Analysis; a tally under review is left out.
  const withHeadline = fedCardVote(all[0], { headline: "Requires cities to test drinking water for lead every year.", tallyUnderReview: true });
  assert.equal(withHeadline.label, "Analysis");
  assert.equal(withHeadline.line, "Voted No on passing a bill that requires cities to test drinking water for lead every year. It passed.");
});

test("fewer than three on record: the card shows what there is and says so", async () => {
  const all = meaningfulFed(await fedVoteRows(db, "C001098", T0 - 365 * DAY));
  assert.equal(all.length, 2);
  const votes = all.slice(0, VOTES_PER_CARD).map(v => fedCardVote(v));
  assert.equal(votes[1].line, "Did not vote on passing the Rural Clinics Act. It did not pass, 45–55.");
  assert.equal(cardVotesNote(votes.length, all.length), "Only two votes on bills on record in the past 12 months.");
  assert.equal(cardVotesNote(1, 1), "Only one vote on a bill on record in the past 12 months.");
  assert.equal(cardVotesNote(3, 3), "All three votes on bills on record in the past 12 months.");
  assert.equal(cardVotesNote(3, 14, true), "The three most recent of at least 14 votes on bills in the past 12 months.");
  assert.equal(cardVotesNote(0, 0), null, "no votes: the card's own line says so (NO_RECENT_VOTE)");
  assert.deepEqual(meaningfulFed(await fedVoteRows(db, "D000399", T0 - 365 * DAY)), []);
});

test("a Texas legislator's card follows the same rule", async () => {
  await db.insert(schema.txBills).values({ id: "tx-90-hb-2", session: "90", identifier: "HB 2", title: "Relating to school bus safety.", chamber: "lower", classification: ["bill"], subjects: [], stage: "passed_lower",
    tloUrl: "https://capitol.texas.gov/", feed: "openstates", sourceUrl: "https://openstates.org/", retrievedAt: T0 });
  const txVote = (id, date, motion, result) => ({ id, billId: "tx-90-hb-2", motion, date, result, chamber: "lower", counts: { yes: 101, no: 44 }, tallyOk: 1, retrievedAt: T0 });
  await db.insert(schema.txVotes).values([txVote("v1", "2026-05-01", "Read 3rd time", "pass"), txVote("v2", "2026-04-30", "Amendment No. 3", "fail"), txVote("v3", "2026-04-29", "Passed to third reading", "pass"), txVote("v4", "2026-04-28", "Motion to table", "pass")]);
  await db.insert(schema.txMemberVotes).values(["v1", "v2", "v3", "v4"].map(voteId => ({ voteId, personId: "ocd-person/hd49", name: "Hinojosa", option: "yes" })));
  const all = meaningfulTx(await txVoteRows(db, "ocd-person/hd49", "2025-11-18"));
  assert.equal(all.length, 2, "the amendment and the motion to table are left out");
  const votes = all.map(txCardVote);
  assert.equal(votes[0].line, "Voted Yes to pass a bill relating to school bus safety. It passed 101–44.");
  assert.equal(votes[1].line, "Voted Yes to move a bill relating to school bus safety forward. It went on to a final vote, 101–44.");
  assert.equal(votes[0].when, "2026-05-01"); assert.equal(votes[0].billHref, "/texas/bills/tx-90-hb-2"); assert.equal(votes[0].billLabel, "HB 2");
  assert.equal(cardVotesNote(votes.length, all.length), "Only two votes on bills on record in the past 12 months.");
});

/* ---------------------------------------------------------- default follows --- */

test("the place key holds district codes only and reads back", () => {
  assert.equal(placeKey({ ...AUSTIN, source: "address" }), "TX|TX-37|TX-SD-14|TX-HD-49");
  assert.equal(placeKey(AUSTIN_ZIP), "TX|TX-37||");
  assert.deepEqual(placeFromKey("TX|TX-37|TX-SD-14|TX-HD-49"), AUSTIN);
  assert.deepEqual(placeFromKey("TX|TX-37||"), AUSTIN_ZIP);
  for (const bad of ["", null, "texas", "TX|a|b|c|d"]) assert.equal(placeFromKey(bad), null);
});

test("the rule: first save follows all; the same place follows nobody; a new place follows only the new ones", () => {
  assert.deepEqual(followPlan({ baseKey: null, newKey: "A", baseMembers: [], members: ["s1", "s2", "r1"] }), { follow: ["s1", "s2", "r1"], first: true, record: true });
  assert.deepEqual(followPlan({ baseKey: "A", newKey: "A", baseMembers: [], members: ["s1", "s2", "r1"] }), { follow: [], first: false, record: false });
  assert.deepEqual(followPlan({ baseKey: "A", newKey: "B", baseMembers: ["s1", "s2", "r1"], members: ["s1", "s2", "r2", "x", "y"] }), { follow: ["r2", "x", "y"], first: false, record: true });
});

test("who represents a place: the current members only, in card order", async () => {
  assert.deepEqual(await placeMemberIds(db, AUSTIN), AUSTIN_FIVE);
  assert.deepEqual(await placeMemberIds(db, AUSTIN_ZIP), ["C001056", "C001098", "D000399"], "a ZIP alone finds the members of Congress");
  assert.deepEqual(await placeMemberIds(db, { state: "TX", congressional: null, stateUpper: null, stateLower: null }), ["C001056", "C001098"], "a ZIP that crosses districts: the senators only");
  assert.deepEqual(await placeMemberIds(db, TULSA), ["L000575", "M001190", "H001082"], "state legislators are covered for Texas only");
  assert.deepEqual(await placeMemberIds(db, { state: "VT", congressional: "VT-AL", stateUpper: null, stateLower: null }), ["S000033"]);
});

test("first save of a place: all five are followed and vote alerts are on", async () => {
  const u = await reader();
  const r = await applyFollowDefaults(db, { userId: u, place: AUSTIN, previous: null, now: T0 });
  assert.equal(r.first, true); assert.equal(r.alertsTurnedOn, true);
  assert.deepEqual(await follows(u), sorted(AUSTIN_FIVE));
  const p = await prefs(u);
  assert.equal(p.instantVotes, 1); assert.equal(p.instantBills, 1); assert.equal(p.push, 0, "push stays off: a device has to give permission");
  const s = await setup(u);
  assert.equal(s.placeKey, "TX|TX-37|TX-SD-14|TX-HD-49"); assert.equal(s.defaultsAt, T0);
  assert.deepEqual(await followState(db, u, AUSTIN_FIVE), { followed: 5, total: 5, alertsOn: true, alertsChosen: true, devices: 0, hasEmail: false });
  assert.deepEqual(followSummary({ total: 5, followed: 5, alertsOn: true }), { all: true, alerts: "Vote alerts are on.", button: null, line: "You follow all five." });
});

test("an unfollowed legislator stays unfollowed when the same place is saved again", async () => {
  const u = await reader();
  await applyFollowDefaults(db, { userId: u, place: AUSTIN, previous: null, now: T0 });
  assert.deepEqual(await toggleMemberFollow(db, u, "C001098", T0 + 1), { kind: "federal", following: false });
  assert.deepEqual(await toggleMemberFollow(db, u, "ocd-person/sd14", T0 + 1), { kind: "texas", following: false });
  for (const now of [T0 + DAY, T0 + 2 * DAY]) {
    const again = await applyFollowDefaults(db, { userId: u, place: AUSTIN, previous: AUSTIN, now });
    assert.deepEqual(again, { first: false, followed: [], alertsTurnedOn: false });
  }
  assert.deepEqual(await follows(u), sorted(["C001056", "D000399", "ocd-person/hd49"]));
  assert.equal((await setup(u)).defaultsAt, T0, "saving the same place again changes nothing");
  // The place can even be forgotten and typed in again (no `previous`): the record of the defaults still holds.
  await applyFollowDefaults(db, { userId: u, place: AUSTIN, previous: null, now: T0 + 3 * DAY });
  assert.deepEqual(await follows(u), sorted(["C001056", "D000399", "ocd-person/hd49"]));
  // An alert setting the reader turned off is never turned back on.
  await db.update(schema.alertPrefs).set({ instantVotes: 0 }).where(eq(schema.alertPrefs.userId, u));
  await applyFollowDefaults(db, { userId: u, place: HOUSTON, previous: AUSTIN, now: T0 + 4 * DAY });
  assert.equal((await prefs(u)).instantVotes, 0);
});

test("a new place follows the new ones, and still not the one the reader unfollowed", async () => {
  const u = await reader();
  await applyFollowDefaults(db, { userId: u, place: AUSTIN, previous: null, now: T0 });
  await toggleMemberFollow(db, u, "C001098", T0 + 1); // unfollows a senator, who also represents Houston
  const moved = await applyFollowDefaults(db, { userId: u, place: HOUSTON, previous: AUSTIN, now: T0 + DAY });
  assert.deepEqual(sorted(moved.followed), sorted(["F000468", "ocd-person/sd15", "ocd-person/hd134"]), "the three legislators who are new with Houston");
  assert.equal(moved.first, false);
  const now = await follows(u);
  assert.ok(!now.includes("C001098"), "the senator the reader unfollowed is not followed again");
  for (const id of ["C001056", "F000468", "ocd-person/sd15", "ocd-person/hd134"]) assert.ok(now.includes(id), `${id} is followed`);
  assert.ok(now.includes("D000399"), "the old place's follows are kept: the reader chose nothing against them");
  assert.equal((await setup(u)).placeKey, "TX|TX-07|TX-SD-15|TX-HD-134");
  // Another state: its three members of Congress, no state legislators.
  const tulsa = await applyFollowDefaults(db, { userId: u, place: TULSA, previous: HOUSTON, now: T0 + 2 * DAY });
  assert.deepEqual(sorted(tulsa.followed), sorted(["L000575", "M001190", "H001082"]));
});

test("a ZIP first, then the street address: three are followed, then the two state legislators", async () => {
  const u = await reader();
  const zip = await applyFollowDefaults(db, { userId: u, place: AUSTIN_ZIP, previous: null, now: T0 });
  assert.deepEqual(sorted(zip.followed), sorted(["C001056", "C001098", "D000399"]));
  const address = await applyFollowDefaults(db, { userId: u, place: AUSTIN, previous: AUSTIN_ZIP, now: T0 + 60_000 });
  assert.deepEqual(sorted(address.followed), sorted(["ocd-person/sd14", "ocd-person/hd49"]));
  assert.deepEqual(await follows(u), sorted(AUSTIN_FIVE));
});

test("a reader who set a place before this rule is not followed behind their back: they get one button", async () => {
  const u = await reader(); // has a place already (reader_locations) and no reader_setup row
  const same = await applyFollowDefaults(db, { userId: u, place: AUSTIN, previous: AUSTIN, now: T0 });
  assert.deepEqual(same, { first: false, followed: [], alertsTurnedOn: false });
  assert.deepEqual(await follows(u), []); assert.equal(await prefs(u), undefined); assert.equal(await setup(u), undefined);
  const state = await followState(db, u, AUSTIN_FIVE);
  assert.deepEqual(state, { followed: 0, total: 5, alertsOn: false, alertsChosen: false, devices: 0, hasEmail: false });
  assert.deepEqual(followSummary({ total: 5, followed: 0, alertsOn: false }), { all: false, alerts: "Vote alerts are off.", button: "Follow all five", line: "You do not follow any of your legislators yet." });
  assert.equal(followSummary({ total: 5, followed: 3, alertsOn: true }).line, "You follow three of your five legislators.");
  assert.equal(followSummary({ total: 3, followed: 1, alertsOn: false }).button, "Follow all three", "the button names the real number");
  assert.equal(followSummary({ total: 2, followed: 0, alertsOn: false }).button, "Follow both");
  assert.equal(followSummary({ total: 0, followed: 0, alertsOn: false }), null);
  // The button: everyone is followed; alerts go on because this reader never chose; the place is recorded.
  assert.deepEqual(await followAllAt(db, { userId: u, place: AUSTIN, now: T0 + 1 }), { total: 5, alertsTurnedOn: true });
  assert.deepEqual(await follows(u), sorted(AUSTIN_FIVE));
  assert.equal((await prefs(u)).instantVotes, 1); assert.equal((await setup(u)).placeKey, placeKey(AUSTIN));
  // A reader who had already said no to vote alerts keeps that answer.
  const quiet = await reader();
  await db.insert(schema.alertPrefs).values({ userId: quiet, instantVotes: 0, instantBills: 1, push: 0, updatedAt: T0 });
  assert.deepEqual(await followAllAt(db, { userId: quiet, place: AUSTIN_ZIP, now: T0 }), { total: 3, alertsTurnedOn: false });
  assert.equal((await prefs(quiet)).instantVotes, 0);
  assert.deepEqual(followSummary({ total: 3, followed: 3, alertsOn: false }), { all: true, alerts: "Vote alerts are off.", button: null, line: "You follow all three." });
});

test("only a known member can be followed: a member of Congress or a Texas legislator", async () => {
  const u = await reader();
  assert.equal(await memberKind(db, "C001056"), "federal"); assert.equal(await memberKind(db, "ocd-person/hd49"), "texas");
  for (const bad of ["", "Z999999", "c001056", "ocd-person/nobody", "C001056 ", "' or 1=1 --", "x".repeat(200)]) {
    assert.equal(await memberKind(db, bad), null, `"${bad.slice(0, 20)}" is not a member`);
    assert.equal(await toggleMemberFollow(db, u, bad), null);
  }
  assert.deepEqual(await follows(u), []);
  assert.deepEqual(await toggleMemberFollow(db, u, "ocd-person/hd49", T0), { kind: "texas", following: true });
  assert.deepEqual(await follows(u), ["ocd-person/hd49"]);
  assert.deepEqual((await texasMembersByIds(db, ["C001056", "ocd-person/hd49"])).map(p => p.name), ["Gina Hinojosa"], "the Following page lists the Texas legislators a reader follows");
  const action = read("app/politicians/actions.ts");
  assert.match(action, /toggleMemberFollow\(getDb\(\), userId, politicianId\)/, "the follow action uses the same check");
  assert.doesNotMatch(action, /\^\[A-Z\]\\d\{6\}\$/, "the action no longer refuses every id that is not a member of Congress");
  assert.ok(read("app/texas/members/[id]/page.tsx").includes("<FollowMember id={person.id} />"), "a Texas member's page has the follow button");
  assert.ok(read("app/following/page.tsx").includes("<TexasFollows people={texas} />"), "the Following page lists followed Texas legislators");
});

test("saving a place applies the defaults, and a fault there never loses the place", () => {
  const location = read("lib/location.ts");
  assert.match(location, /await applyFollowDefaults\(db, \{ userId, place: l, previous: before \?\? null, now \}\)\.catch\(\(\) => null\)/);
  assert.ok(location.indexOf("db.insert(readerLocations)") < location.indexOf("applyFollowDefaults(db"), "the place is saved first");
  const actions = read("app/start/actions.ts");
  assert.match(actions, /export async function followAllMine\(\)[\s\S]*?!access\.invite && !access\.editor[\s\S]*?followAllAt\(getDb\(\), \{ userId, place: loc \}\)/, "the one button checks who is asking");
  // Nothing in these files sends anything.
  for (const f of ["lib/follow-defaults.ts", "lib/location.ts", "app/start/actions.ts", "components/home/follow-status.tsx"]) assert.doesNotMatch(read(f), /sendTo\(|notifyUser\(|mailer|web-push|fetch\(/, `${f} sends nothing`);
});

test("how an alert reaches the reader: the screen says what is still needed", () => {
  const none = deliveryLines({ devices: 0, hasEmail: false, alertsOn: true });
  assert.match(none.push, /turn on notifications on your Account page\. Your device will ask for your permission first\.$/);
  assert.match(none.email, /add your email address on your Account page\.$/);
  assert.deepEqual(none.links.map(l => l.href), ["/following", "/account#alerts", "/account"], "links to the places that already exist");
  const both = deliveryLines({ devices: 2, hasEmail: true, alertsOn: true });
  assert.equal(both.push, "Notifications are on for two devices."); assert.equal(both.email, "They also go to the email address on your account.");
  assert.deepEqual(both.links.map(l => l.label), ["Change who you follow", "Change or turn off alerts"]);
  assert.equal(deliveryLines({ devices: 1, hasEmail: true, alertsOn: false }).links[1].label, "Turn on vote alerts");
  assert.equal(deliveryLines({ devices: 1, hasEmail: true, alertsOn: true }).push, "Notifications are on for one device.");
});

test("push devices and a verified email are read for the reader only", async () => {
  const u = await reader(), other = await reader();
  await db.insert(schema.pushSubscriptions).values([{ endpointHash: "h1", userId: u, endpoint: "https://push.example/1", createdAt: T0 }, { endpointHash: "h2", userId: other, endpoint: "https://push.example/2", createdAt: T0 }]);
  await db.insert(schema.readerAccounts).values({ id: "acct-first", appUserId: u, emailHash: "eh-first", email: "reader@example.test", createdAt: T0, verifiedAt: T0 });
  await followAllAt(db, { userId: other, place: AUSTIN, now: T0 });
  const s = await followState(db, u, AUSTIN_FIVE);
  assert.deepEqual(s, { followed: 0, total: 5, alertsOn: false, alertsChosen: false, devices: 1, hasEmail: true }, "another reader's follows and devices are not counted");
});

/* ------------------------------------------------------------- the issues step --- */

test("issues are a second step, put to a reader once", async () => {
  const u = await reader();
  assert.equal(await issuesAsked(db, u), false);
  await markIssuesAsked(db, u, T0);
  assert.equal(await issuesAsked(db, u), true);
  await markIssuesAsked(db, u, T0 + DAY);
  assert.equal((await setup(u)).issuesAskedAt, T0, "the first time stands");
  // The two halves of reader_setup do not overwrite each other.
  await applyFollowDefaults(db, { userId: u, place: AUSTIN, previous: null, now: T0 + 2 * DAY });
  const s = await setup(u);
  assert.equal(s.issuesAskedAt, T0); assert.equal(s.placeKey, placeKey(AUSTIN)); assert.equal(s.firstSeenAt, T0);
  const v = await reader();
  await applyFollowDefaults(db, { userId: v, place: AUSTIN, previous: null, now: T0 });
  await markIssuesAsked(db, v, T0 + 5);
  assert.equal((await setup(v)).placeKey, placeKey(AUSTIN)); assert.equal((await setup(v)).issuesAskedAt, T0 + 5);
  // The step itself: up to three of the 14, with "Skip for now", after the legislators on both screens.
  assert.equal(ISSUE_CATEGORIES.length, 14);
  const step = read("components/home/issues-step.tsx"), actions = read("app/start/actions.ts");
  assert.ok(step.includes("pick up to three issues") && step.includes("Skip for now"));
  assert.match(step, /if \(asked\) return null;/, "a reader who answered is not asked again");
  assert.match(actions, /formData\.get\("choice"\) === "skip" \? \[\] : await savePickedIssues/, "Skip for now saves nothing and changes no issue the reader has");
  assert.match(actions, /export async function answerIssuesStep[\s\S]*?markIssuesAsked\(getDb\(\), userId\)/);
  assert.match(read("components/start/issue-cap.tsx"), /p\.length >= 3 \? p :/, "the cap of three is enforced as the reader taps");
  assert.match(read("lib/reader-issues.ts"), /\.slice\(0, 3\)/, "and again on the server");
  for (const page of ["app/start/page.tsx", "components/home/personal.tsx"]) {
    const text = read(page);
    assert.ok(text.indexOf("<YourLegislatorsBlock") > 0 && text.indexOf("<YourLegislatorsBlock") < text.indexOf("<IssuesStep") && text.indexOf("<IssuesStep") < text.indexOf("<ComingUp"), `${page}: legislators, then the issues step, then what is coming up`);
  }
});

/* ---------------------------------------------------------------------- photos --- */

const jpeg = (bytes = 1200) => new Response(new Uint8Array(bytes).fill(7), { status: 200, headers: { "content-type": "image/jpeg" } });
/** A stand-in for the server's fetch that records every address asked for. */
function fetcher(answers) {
  const asked = [];
  return { asked, fetch: async url => { asked.push(url); const a = answers[url]; if (a === undefined) throw new Error("no route to host"); return typeof a === "function" ? a() : a; } };
}

test("photos: the address fetched is built from a member id, never taken from the request", () => {
  assert.equal(federalPhotoUrl("C001056"), "https://bioguide.congress.gov/bioguide/photo/C/C001056.jpg");
  for (const bad of ["", "c001056", "C00105", "C0010567", "../C001056", "https://example.org/x.jpg"]) assert.equal(federalPhotoUrl(bad), null);
  assert.equal(photoPath("C001056"), "/api/photo/C001056");
  assert.equal(photoPath("ocd-person/hd49"), "/api/photo/ocd-person%2Fhd49", "always the site's own address");
  assert.equal(allowedPhotoUrl("https://senate.texas.gov/members/d14/img/Eckhardt.jpg", TEXAS_PHOTO_HOSTS), "https://senate.texas.gov/members/d14/img/Eckhardt.jpg");
  for (const bad of ["http://house.texas.gov/a.jpg", "https://house.texas.gov.evil.example/a.jpg", "https://evil.example/house.texas.gov/a.jpg", "https://user:pw@house.texas.gov/a.jpg", "https://house.texas.gov:8443/a.jpg",
    "//house.texas.gov/a.jpg", "javascript:alert(1)", "file:///etc/passwd", "https://bioguide.congress.gov/x.jpg", "", null]) assert.equal(allowedPhotoUrl(bad, TEXAS_PHOTO_HOSTS), null, `${bad} is refused`);
  assert.equal(photoAlt("John Cornyn"), "Official portrait of John Cornyn");
  assert.equal(noPhotoLabel("John Cornyn"), "No official photo on file for John Cornyn");
});

test("photos: the route's lookup refuses anything but a known member id", async () => {
  for (const bad of ["", "Z999999", "c001056", "ocd-person/nobody", "../../etc/passwd", "https://example.org/a.jpg", "C001056/../x", "x".repeat(300)]) {
    assert.equal(await photoTarget(db, bad), null, `"${bad.slice(0, 24)}" is not a member`);
  }
  assert.deepEqual(await photoTarget(db, "C001056"), { kind: "federal", id: "C001056", name: "John Cornyn", url: "https://bioguide.congress.gov/bioguide/photo/C/C001056.jpg" });
  assert.deepEqual(await photoTarget(db, "ocd-person/sd14"), { kind: "texas", id: "ocd-person/sd14", name: "Sarah Eckhardt", url: "https://senate.texas.gov/members/d14/img/Eckhardt.jpg" });
  assert.equal((await photoTarget(db, "ocd-person/hd49")).url, null, "a picture on a host that is not the Texas Legislature's is not fetched");
  assert.equal((await photoTarget(db, "ocd-person/hd134")).url, null, "nor one that is not https");
  assert.equal((await photoTarget(db, "ocd-person/sd15")).url, null, "no picture on file");
  // An unknown id: 404, and nothing is fetched at all.
  const f = fetcher({});
  const no = await loadPhoto(null, f.fetch);
  assert.equal(no.status, 404); assert.equal(no.body, null); assert.deepEqual(f.asked, []);
  const none = await loadPhoto(await photoTarget(db, "ocd-person/sd15"), f.fetch);
  assert.equal(none.status, 404); assert.deepEqual(f.asked, [], "a member with no picture: nothing is fetched; the card shows the initials");
});

test("photos: the picture is fetched on the server and handed back with long cache headers", async () => {
  const url = "https://bioguide.congress.gov/bioguide/photo/C/C001056.jpg", f = fetcher({ [url]: jpeg() });
  const ok = await loadPhoto(await photoTarget(db, "C001056"), f.fetch);
  assert.deepEqual(f.asked, [url]);
  assert.equal(ok.status, 200); assert.equal(ok.body.length, 1200);
  assert.equal(ok.headers["Content-Type"], "image/jpeg"); assert.equal(ok.headers["X-Content-Type-Options"], "nosniff");
  assert.match(ok.headers["Cache-Control"], /^private, max-age=2592000/, "30 days in the reader's browser; private, because the site is invite-only");
  assert.ok(!Object.keys(ok.headers).some(h => h.toLowerCase() === "location"));
});

test("photos: the route never redirects the browser to an outside host", async () => {
  const start = "https://bioguide.congress.gov/bioguide/photo/C/C001056.jpg", target = await photoTarget(db, "C001056");
  const redirect = to => new Response(null, { status: 302, headers: { location: to } });
  // The official host answers with a redirect to somewhere else: not followed, not passed on.
  for (const to of ["https://evil.example/tracker.jpg", "http://bioguide.congress.gov/x.jpg", "//evil.example/x.jpg", "https://house.texas.gov/photos/1.jpg"]) {
    const f = fetcher({ [start]: redirect(to), [to]: jpeg(), "https://evil.example/x.jpg": jpeg() });
    const a = await loadPhoto(target, f.fetch);
    assert.equal(a.status, 404, `a redirect to ${to} ends in "not found"`); assert.equal(a.body, null);
    assert.deepEqual(f.asked, [start], "the other address is never fetched");
    assert.ok(!Object.keys(a.headers).some(h => h.toLowerCase() === "location"), "no Location header ever reaches the browser");
    assert.ok(a.status < 300 || a.status >= 400);
  }
  // A redirect that stays on the official host is followed on the server; the browser still gets the bytes.
  const moved = "https://bioguide.congress.gov/photo/abc.jpg", f = fetcher({ [start]: redirect("/photo/abc.jpg"), [moved]: jpeg(900) });
  const a = await loadPhoto(target, f.fetch);
  assert.deepEqual(f.asked, [start, moved]); assert.equal(a.status, 200); assert.equal(a.body.length, 900);
  // A redirect loop ends.
  const loop = fetcher({ [start]: () => redirect(start) });
  assert.equal((await loadPhoto(target, loop.fetch)).status, 404); assert.equal(loop.asked.length, 3);
  // Anything that is not a picture, is missing, is too large, or a host that does not answer: "not found", and the card shows the initials.
  for (const bad of [new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }), new Response("<svg/>", { status: 200, headers: { "content-type": "image/svg+xml" } }),
    new Response("no", { status: 404, headers: { "content-type": "image/jpeg" } }), new Response(new Uint8Array(0), { status: 200, headers: { "content-type": "image/png" } }), jpeg(MAX_PHOTO_BYTES + 1)]) {
    assert.equal((await loadPhoto(target, fetcher({ [start]: bad }).fetch)).status, 404);
  }
  assert.equal((await loadPhoto(target, fetcher({}).fetch)).status, 404, "the host did not answer");
  // The route file: checks who is asking before anything else, fetches with redirects off, and has no redirect of its own.
  const route = read("app/api/photo/[id]/route.ts");
  assert.ok(route.indexOf("await viewerAccess()") > 0 && route.indexOf("await viewerAccess()") < route.indexOf("photoTarget("), "the access check comes first");
  assert.match(route, /if \(!access\.allowed\) return new Response\("Not available", \{ status: 404/);
  assert.match(route, /redirect: "manual"/);
  assert.doesNotMatch(route, /NextResponse\.redirect|Response\.redirect|from "next\/navigation"|\bredirect\(|status: 30\d|[Ll]ocation["']?\s*:/);
  assert.doesNotMatch(route, /searchParams|request\.url|https?:\/\//, "no address comes from the request, and none is written in the route");
});

test("photos: the reader's device is only ever pointed at the site itself", () => {
  const files = [...readdirSync(join(ROOT, "components/home")).filter(f => /\.tsx?$/.test(f)).map(f => `components/home/${f}`), "lib/flow/data.ts", "lib/flow/cards.ts", "components/federal/follow-button.tsx"];
  for (const f of files) assert.doesNotMatch(read(f), /https?:\/\/|bioguide\.congress\.gov|texas\.gov/, `${f} names no outside address`);
  const photo = read("components/home/member-photo.tsx");
  assert.match(photo, /<img [^>]*src=\{src\} alt=\{photoAlt\(name\)\}/, "useful alt text on the portrait");
  assert.match(photo, /role="img" aria-label=\{noPhotoLabel\(name\)\}>\{initials\}/, "the placeholder is the initials, with a label that says there is no photo");
  assert.doesNotMatch(photo.replace(/\/\*[\s\S]*?\*\//g, ""), /party/i, "the placeholder is not given the member's party");
  assert.match(read("lib/flow/data.ts"), /photo: photoPath\(m\.id\)/);
  assert.equal(initials("John Cornyn"), "JC"); assert.equal(initials("Randy K. Weber, Sr."), "RW"); assert.equal(initials("Monica De La Cruz"), "MC");
  assert.equal(initials("Cher"), "C"); assert.equal(initials(""), "?");
});

test("photos: the privacy page names the hosts the server fetches from, and the lawyer is asked about the rights", () => {
  const p = PROCESSORS.find(x => x.id === "photos");
  assert.ok(p, "the photo hosts are on the privacy page");
  assert.deepEqual(sorted(p.hosts), sorted(PHOTO_HOSTS), "the list on the page is the list in the code");
  assert.deepEqual([...FEDERAL_PHOTO_HOSTS], ["bioguide.congress.gov"]);
  assert.match(p.role, /fetched by the site's server, not by your device/);
  assert.equal(p.readerData, false); assert.match(p.receives, /^Nothing about readers\./);
  assert.match(LEGAL_REVIEW.photoRights, /^rights to members' official photos/);
  assert.equal(read("app/terms/page.tsx").split('k="photoRights"').length - 1, 1);
  const stored = STORED.find(s => s.what === "Your issues and follows").detail;
  assert.match(stored, /follows your own legislators for you and switches vote alerts on; you can undo both/);
  assert.match(stored, /keeps the district codes those follows were made for and the time you answered the issues step/);
});

/* --------------------------------------------------- the home screen's lists --- */

test("the home screen's lists are capped and say how many more there are", async () => {
  const since = T0 - 30 * DAY, ids = ["C001056", "C001098"];
  const five = await memberVotesSince(db, ids, since, 5);
  assert.equal(five.rows.length, 5); assert.equal(five.total, 11, "eight by one senator and three by the other in the last 30 days");
  assert.ok(five.rows.every((r, i, a) => i === 0 || a[i - 1].votedAt >= r.votedAt), "newest first");
  assert.equal(new Set(five.rows.map(r => r.key)).size, 5);
  const all = await memberVotesSince(db, ids, since, 50);
  assert.equal(all.rows.length, 11); assert.equal(all.total, 11);
  assert.deepEqual(await memberVotesSince(db, [], since, 5), { rows: [], total: 0 });
  assert.deepEqual(await memberVotesSince(db, ["ocd-person/hd49"], since, 5), { rows: [], total: 0 }, "a followed Texas legislator adds no federal votes and breaks nothing");
  // Followed bills that moved: the reader's own follows only.
  const u = await reader(), other = await reader();
  await db.insert(schema.billFollows).values([{ userId: u, billId: "119-s-1", createdAt: T0 }, { userId: u, billId: "119-s-2", createdAt: T0 }, { userId: other, billId: "119-s-3", createdAt: T0 }]);
  await db.insert(schema.officialBillDepth).values([{ billId: "119-s-1", stage: "passed_senate", stageDate: "2026-11-16" }, { billId: "119-s-2", stage: "introduced", stageDate: "2026-01-05" },
    { billId: "119-s-3", stage: "passed_senate", stageDate: "2026-11-17" }]);
  const moved = await followedBillsMovedSince(db, u, "2026-11-10", 5);
  assert.deepEqual(moved.rows.map(b => b.id), ["119-s-1"]); assert.equal(moved.total, 1);
  assert.deepEqual(await followedBillsMovedSince(db, null, "2026-11-10", 5), { rows: [], total: 0 });
  assert.equal(await texasBillsMovedSince(db, "2026-01-01"), 0);
});

test("every list ends with a line; a capped list says how many more", () => {
  assert.deepEqual(endOfList(5, 23, { one: "vote", many: "votes" }), { text: "Showing five of 23 votes. There are 18 more.", more: 18 });
  assert.deepEqual(endOfList(5, 6, { one: "vote", many: "votes" }), { text: "Showing five of 6 votes. There is one more vote.", more: 1 });
  assert.deepEqual(endOfList(4, 4, { one: "bill", many: "bills" }), { text: "That is all four bills.", more: 0 });
  assert.equal(endOfList(1, 1, { one: "bill", many: "bills" }).text, "That is the only bill.");
  assert.equal(endOfList(2, 2, { one: "bill", many: "bills" }).text, "Those are both bills.");
  assert.equal(endOfList(6, 80, { one: "bill", many: "bills" }, true).text, "Showing six of at least 80 bills. There are at least 74 more.");
  // The components: a cap on every query, an end line after every list, and a link to the page that has the rest.
  const personal = read("components/home/personal.tsx"), since = read("components/home/since-panel.tsx"), coming = read("components/home/coming-up.tsx");
  for (const [name, text] of [["personal.tsx", personal], ["since-panel.tsx", since], ["coming-up.tsx", coming]]) {
    const lists = text.split("<ul className=").length - 1, ends = text.split('className="list-end"').length - 1;
    assert.ok(lists >= 1 && ends >= lists, `${name}: ${lists} lists, ${ends} end lines`);
    assert.doesNotMatch(text, /load more|show more|infinite/i);
  }
  assert.match(personal, /memberVotesSince\(db, ids, now - 7 \* 86400e3, WEEK_VOTES\)/); assert.match(personal, /\.slice\(0, MOVING\)/);
  assert.match(personal, /href="\/following">The rest are on your Following page/); assert.match(personal, /href=\{`\/issues\/\$\{c\.slug\}`\}/);
  assert.match(since, /memberVotesSince\(db, ids, prev, VOTES\)/); assert.match(since, /followedBillsMovedSince\(db, userId, sinceDay, BILLS\)/);
  assert.match(coming, /href="\/coming">See all \{data\.scheduledTotal\} scheduled bills/);
});

test("“You're caught up.” is said once, near the top, only when nothing is newer than the last visit", () => {
  assert.equal(CAUGHT_UP, "You’re caught up.");
  assert.equal(caughtUp({ previousVisit: T0 - DAY, newVotes: 0, newBills: 0 }), true);
  assert.equal(caughtUp({ previousVisit: T0 - DAY, newVotes: 1, newBills: 0 }), false);
  assert.equal(caughtUp({ previousVisit: T0 - DAY, newVotes: 0, newBills: 2 }), false);
  assert.equal(caughtUp({ previousVisit: null, newVotes: 0, newBills: 0 }), false, "a first visit has nothing to be caught up with");
  // One place says it, and the home screen puts that place first for a reader with a place.
  const home = read("app/page.tsx"), since = read("components/home/since-panel.tsx");
  const said = ["app/page.tsx", "app/start/page.tsx", ...readdirSync(join(ROOT, "components/home")).filter(f => /\.tsx$/.test(f)).map(f => `components/home/${f}`)]
    .filter(f => /CAUGHT_UP\}|caught up\./i.test(read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
  assert.deepEqual(said, ["components/home/since-panel.tsx"], "only the panel at the top says it");
  assert.equal(since.split("{CAUGHT_UP}").length - 1, 1);
  const returning = home.slice(home.indexOf("</> : <>"));
  assert.ok(returning.indexOf("<SincePanel") > 0 && returning.indexOf("<SincePanel") < returning.indexOf("<PersonalHome"), "the panel is the first thing a returning reader sees");
  assert.ok(returning.indexOf("LOOP NOTICES GO HERE") > 0 && returning.indexOf("LOOP NOTICES GO HERE") < returning.indexOf("<SincePanel"), "the marked place for the loop notices is above it");
});

/* ------------------------------------------------------------------------ tone --- */

test("calm and specific: no outrage wording, no exclamation marks, no urgency tricks, no streaks or points", () => {
  const lines = [
    ...[[2, 1, 2], [2, 1, 0], [2, 0, 0], [1, 1, 1], [0, 1, 0]].map(([senators, representative, state]) => legislatorsHeading({ senators, representative, state })),
    ...[["zip", true, true], ["zip", true, false], ["zip", false, true], ["address", false, true], ["address", true, false]].map(([source, needsAddress, chooseDistrict]) => notFoundLine({ source, needsAddress, chooseDistrict })),
    ...[[1, 1], [2, 2], [3, 3], [3, 9], [3, 40]].map(([a, b]) => cardVotesNote(a, b)),
    ...[[5, 5, true], [5, 3, false], [5, 0, false], [1, 1, true], [1, 0, false], [2, 2, false]].flatMap(([total, followed, alertsOn]) => { const s = followSummary({ total, followed, alertsOn }); return [s.line, s.alerts, s.button ?? ""]; }),
    ...[[0, false, true], [1, true, true], [3, true, false]].flatMap(([devices, hasEmail, alertsOn]) => { const d = deliveryLines({ devices, hasEmail, alertsOn }); return [d.push, d.email, ...d.links.map(l => l.label)]; }),
    ...[[5, 23], [5, 6], [4, 4], [1, 1], [2, 2]].map(([a, b]) => endOfList(a, b, { one: "vote", many: "votes" }).text), CAUGHT_UP, NO_PARTY, photoAlt("A B"), noPhotoLabel("A B"),
  ];
  const screens = ["components/home/follow-status.tsx", "components/home/issues-step.tsx", "components/home/since-panel.tsx", "components/home/personal.tsx", "components/home/coming-up.tsx",
    "components/home/legislator-cards.tsx", "components/home/landing.tsx", "components/home/place-form.tsx", "components/home/texas-follows.tsx", "app/start/page.tsx"]
    .map(f => read(f).replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|^\s*\/\/.*$/gm, "")); // the words a reader sees, not the comments
  for (const text of [...lines, ...screens]) {
    assert.doesNotMatch(text, /\b(slams?|shocking|outrage\w*|betray\w*|finally|don[’']t miss|act now|hurry|last chance|streak|badge earned|points?\b(?! of order))/i);
    assert.doesNotMatch(text, /[a-z]!(\s|$|<|")/, "no exclamation marks");
  }
  for (const l of lines) assert.doesNotMatch(l, /%|\b(best|worst|good|bad|strong|weak|loyal|extreme)\b/i, `no grade, percentage or adjective about a legislator: ${l}`);
});
