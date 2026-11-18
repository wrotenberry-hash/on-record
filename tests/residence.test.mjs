// One person, one residence (owner, 18 Nov 2026). The rules in lib/verify/residence.ts, and the same database functions
// the site runs (lib/verify/residence-store.ts) against a temporary database built from the real migrations.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { addressChangesSignal, authorityFromUsps, canSetAddress, districtClusterSignal, householdDecision, mailRevocations, manyAddressesSignal, normaliseResidence, normaliseUnit,
  phoneAvailable, redeemDecision, RESIDENCE, splitUnit, stampFor, unitDecision } from "../lib/verify/residence.ts";
import { decideHold, holdPhone, issueMailCode, liveHolds, mailVerified, phoneHeldUntil, purgePhoneHolds, redeemMailCode, residenceOf, setResidence } from "../lib/verify/residence-store.ts";
import { castVote, recomputeVoice } from "../lib/constituent/store.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), DAY = 86400e3;
const dir = mkdtempSync(join(tmpdir(), "residence-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
after(() => { client.close(); rmSync(dir, { recursive: true, force: true }); });

const T0 = Date.UTC(2026, 10, 1); // every account here is older than 24 hours at T0 unless a test says otherwise
const AUSTIN = { congressional: "TX-37", state: "TX", stateUpper: "TX-SD-14", stateLower: "TX-HD-49" };
const HOUSTON = { congressional: "TX-07", state: "TX", stateUpper: "TX-SD-15", stateLower: "TX-HD-134" };
let seq = 0;
/** A verified account: email, bot check, phone. `phone` is the keyed hash the site would store. */
async function account({ phone = `phone-${++seq}`, createdAt = T0 - 30 * DAY, tier = 1 } = {}) {
  const id = `acct-${++seq}`, userId = `user-${seq}`;
  await db.insert(schema.appUsers).values({ id: userId, kind: "public", externalKey: `k-${seq}`, createdAt });
  await db.insert(schema.readerAccounts).values({ id, appUserId: userId, emailHash: `e-${seq}`, email: `r${seq}@example.test`, createdAt, verifiedAt: createdAt });
  await db.insert(schema.verificationProfiles).values({ accountId: id, tier, signupChallengeAt: createdAt, firstVoteChallengeAt: createdAt, phoneHash: phone, phoneVerifiedAt: createdAt, createdAt, updatedAt: createdAt });
  return { id, userId, phone };
}
async function bill(id) {
  await db.insert(schema.officialBills).values({ id, congress: 119, billType: "hr", number: ++seq, title: `Test bill ${id}`, congressUrl: "https://www.congress.gov/", sourceUrl: "https://www.congress.gov/", retrievedAt: T0 }).onConflictDoNothing();
  return id;
}
/** What lib/verify/flow.ts does for an address: the household key, the districts, then the tier. */
async function moveIn(a, address, districts, now, extra = {}) {
  const r = await setResidence(db, { accountId: a.id, addressKey: `addr:${address}`, buildingKey: `bldg:${address.split("|")[0]}`, hasUnit: address.includes("|"), districts,
    device: extra.device ?? null, ipRange: extra.ipRange ?? null, voteSoon: extra.voteSoon ?? { federal: false, state: false }, now });
  if (r.ok && r.kind !== "same") await db.update(schema.verificationProfiles).set({ tier: 2, districtId: districts.congressional, stateCode: districts.state, addressMatchedAt: now }).where(eq(schema.verificationProfiles.accountId, a.id));
  return r;
}
/** A Texas bill, for the state senate and state house totals. */
async function texasBill(id) {
  await db.insert(schema.txBills).values({ id, session: "90", identifier: `HB ${++seq}`, title: `Relating to a test (${id}).`, chamber: "lower", classification: ["bill"], subjects: [], stage: "filed",
    tloUrl: "https://capitol.texas.gov/", feed: "openstates", sourceUrl: "https://capitol.texas.gov/", retrievedAt: T0 }).onConflictDoNothing();
  return id;
}
/** What saving an answer does: the answer, then its home (lib/constituent/store.ts). */
const answer = (a, billId, stance, now) => castVote(db, { userId: a.userId, accountId: a.id, billKey: billId, answer: stance, reason: null, reasonHash: null, device: null, ipRange: null, now });
/** The database itself refused the row (a unique or primary-key rule), not just the code above it. */
const refusedByDatabase = promise => assert.rejects(promise, e => /UNIQUE constraint|PRIMARY KEY/i.test(`${e?.message} ${e?.cause?.message ?? ""}`));
/** Totals as "scope|group": number of voters. Groups are "address" (address-matched) and "mail" (mail-verified). */
const totals = async (billId, now) => Object.fromEntries([...(await recomputeVoice(db, billId, now))].map(([k, v]) => [k, v.support + v.oppose + v.unsure]));

/* ───────────────────────────── The owner's three tests ───────────────────────────── */

test("one phone cannot hold two counted accounts", async () => {
  const first = await account({ phone: "phone-shared" });
  // The database refuses a second account with the same phone hash, whatever the code above it does.
  await refusedByDatabase(account({ phone: "phone-shared" }));
  // The rule the phone step applies before it sends a code.
  assert.deepEqual(phoneAvailable({ takenByOtherAccount: true, heldUntil: null, now: T0 }), { ok: false, reason: "taken" });
  // Without a confirmed phone an account is not a counted account at all, even with a home address.
  const b = await bill("119-hr-9001"), noPhone = await account({ tier: 0 });
  await moveIn(first, "1 MAIN ST AUSTIN TX 78701", AUSTIN, T0); await moveIn(noPhone, "2 MAIN ST AUSTIN TX 78701", AUSTIN, T0);
  await db.update(schema.verificationProfiles).set({ phoneHash: null, phoneVerifiedAt: null }).where(eq(schema.verificationProfiles.accountId, noPhone.id));
  await answer(first, b, "support", T0 + 1); await answer(noPhone, b, "support", T0 + 1);
  assert.deepEqual(await totals(b, T0 + DAY), { "US|address": 1, "TX|address": 1, "TX-37|address": 1 });
});

test("a deleted account's phone cannot be attached to a new account for 90 days, and only a hash is kept", async () => {
  const until = await holdPhone(db, "phone-deleted", T0);
  assert.equal(until, T0 + 90 * DAY);
  assert.equal(await phoneHeldUntil(db, "phone-deleted", T0 + 89 * DAY), until);
  assert.deepEqual(phoneAvailable({ takenByOtherAccount: false, heldUntil: until, now: T0 + 89 * DAY }), { ok: false, reason: "held", until });
  assert.equal(await phoneHeldUntil(db, "phone-deleted", T0 + 90 * DAY), null, "free again on day 90");
  assert.deepEqual(phoneAvailable({ takenByOtherAccount: false, heldUntil: null, now: T0 + 90 * DAY }), { ok: true });
  await purgePhoneHolds(db, T0 + 91 * DAY);
  assert.equal((await db.select().from(schema.phoneHolds)).filter(r => r.phoneHash === "phone-deleted").length, 0, "the hash itself is dropped when the 90 days are up");
  assert.deepEqual(Object.keys(schema.phoneHolds).filter(k => /phone|account/i.test(k)), ["phoneHash"], "no number and no account id are stored");
  // Deleting an account is what puts the hold in place.
  const del = readFileSync(join(ROOT, "lib/verify/store.ts"), "utf8").match(/export async function deleteAccountAndPositions[\s\S]*?\n}/)[0];
  assert.match(del, /if \(phoneHash\) await holdPhone\(db, phoneHash, Date\.now\(\)\)/);
  assert.ok(del.indexOf("holdPhone(") < del.indexOf("db.delete(verificationProfiles)"), "the hash is read before the profile is deleted");
});

test("one account cannot be counted in two districts", async () => {
  const a = await account(), b = await bill("119-hr-9002"), tx = await texasBill("tx-90-hb-9002");
  assert.equal((await moveIn(a, "100 MAIN ST AUSTIN TX 78701", AUSTIN, T0)).kind, "first");
  await answer(a, b, "support", T0 + 1); await answer(a, tx, "support", T0 + 1);
  // The database holds one residence row per account: a second insert is refused, a new address replaces the old one.
  await refusedByDatabase(db.insert(schema.accountResidences).values({ accountId: a.id, addressKey: "x", buildingKey: "x", congressional: "TX-07", stateCode: "TX", setAt: T0 }));
  assert.deepEqual(await totals(b, T0 + DAY), { "US|address": 1, "TX|address": 1, "TX-37|address": 1 }, "a federal bill: the nation, the state, one congressional district");
  assert.deepEqual(await totals(tx, T0 + DAY), { "TX|address": 1, "TX-SD-14|address": 1, "TX-HD-49|address": 1 }, "a state bill: the state, one state senate district, one state house district");
  // After a move the account is in the new districts only: one of each kind.
  assert.equal((await moveIn(a, "9 OAK ST HOUSTON TX 77002", HOUSTON, T0 + 91 * DAY)).kind, "change");
  const home = await residenceOf(db, a.id);
  assert.deepEqual([home.congressional, home.stateUpper, home.stateLower], ["TX-07", "TX-SD-15", "TX-HD-134"]);
  assert.equal((await db.select().from(schema.accountResidences).where(eq(schema.accountResidences.accountId, a.id))).length, 1);
  // A new answer counts in the new districts, once each; no bill ever shows this account in two districts of one kind.
  const c = await bill("119-hr-9003"), tx2 = await texasBill("tx-90-hb-9003");
  await answer(a, c, "oppose", T0 + 92 * DAY); await answer(a, tx2, "oppose", T0 + 92 * DAY);
  for (const id of [b, c]) {
    const t = await totals(id, T0 + 93 * DAY);
    assert.equal(Object.keys(t).filter(k => /^TX-\d+\|/.test(k)).length, 1, `${id}: one congressional district`);
    assert.equal(t["US|address"], 1);
  }
  for (const id of [tx, tx2]) {
    const t = await totals(id, T0 + 93 * DAY);
    for (const kind of [/^TX-SD-/, /^TX-HD-/]) assert.equal(Object.keys(t).filter(k => kind.test(k)).length, 1, `${id}: one district of each kind`);
  }
  assert.equal((await totals(tx2, T0 + 93 * DAY))["TX-SD-15|address"], 1);
});

test("an address change after voting does not move past votes", async () => {
  const a = await account(), b = await bill("119-hr-9004"), tx = await texasBill("tx-90-hb-9004");
  await moveIn(a, "200 MAIN ST AUSTIN TX 78701", AUSTIN, T0);
  await answer(a, b, "support", T0 + 1); await answer(a, tx, "support", T0 + 1);
  await moveIn(a, "20 OAK ST HOUSTON TX 77002", HOUSTON, T0 + 91 * DAY);
  const after = await totals(b, T0 + 92 * DAY), afterTx = await totals(tx, T0 + 92 * DAY);
  assert.equal(after["TX-37|address"], 1, "still counted where the reader lived when they answered");
  assert.equal(after["TX-07|address"], undefined, "not carried to the new district");
  assert.equal(afterTx["TX-SD-14|address"], 1); assert.equal(afterTx["TX-HD-49|address"], 1); assert.equal(afterTx["TX-SD-15|address"], undefined);
  // Changing the answer itself after the move keeps its place too.
  await answer(a, b, "oppose", T0 + 93 * DAY);
  const changed = await recomputeVoice(db, b, T0 + 94 * DAY);
  assert.deepEqual(changed.get("TX-37|address"), { support: 0, oppose: 1, unsure: 0 });
  assert.equal(changed.get("TX-07|address"), undefined);
  // An answer given before the account had any address takes the first address, once.
  const early = await account(), d = await bill("119-hr-9005");
  await answer(early, d, "support", T0);
  assert.deepEqual(await totals(d, T0 + DAY), {}, "a phone-only account is counted in no total");
  await moveIn(early, "300 MAIN ST AUSTIN TX 78701", AUSTIN, T0 + 2 * DAY);
  assert.equal((await totals(d, T0 + 3 * DAY))["TX-37|address"], 1);
  await moveIn(early, "30 OAK ST HOUSTON TX 77002", HOUSTON, T0 + 95 * DAY);
  assert.equal((await totals(d, T0 + 96 * DAY))["TX-37|address"], 1);
  assert.deepEqual(stampFor(AUSTIN, HOUSTON), AUSTIN); assert.deepEqual(stampFor(null, HOUSTON), HOUSTON);
});

/* ───────────────────────────── 2. One address, once every 90 days ───────────────────────────── */

test("a new address replaces the old one, at most once every 90 days", async () => {
  assert.deepEqual(canSetAddress(null, "a", T0), { ok: true, kind: "first" });
  assert.deepEqual(canSetAddress({ addressKey: "a", setAt: T0 }, "a", T0 + DAY), { ok: true, kind: "same" });
  assert.deepEqual(canSetAddress({ addressKey: "a", setAt: T0 }, "b", T0 + 89 * DAY), { ok: false, reason: "too_soon", nextAllowedAt: T0 + 90 * DAY });
  assert.deepEqual(canSetAddress({ addressKey: "a", setAt: T0 }, "b", T0 + 90 * DAY), { ok: true, kind: "change" });
  const a = await account();
  await moveIn(a, "400 MAIN ST AUSTIN TX 78701", AUSTIN, T0);
  const refused = await moveIn(a, "40 OAK ST HOUSTON TX 77002", HOUSTON, T0 + 30 * DAY);
  assert.equal(refused.ok, false); assert.equal(refused.nextAllowedAt, T0 + 90 * DAY);
  assert.equal((await residenceOf(db, a.id)).congressional, "TX-37", "a refused change leaves the address as it was");
  assert.equal((await moveIn(a, "400 MAIN ST AUSTIN TX 78701", AUSTIN, T0 + 31 * DAY)).kind, "same", "saving the same address again is not a change");
});

/* ───────────────────────────── 3. Household cap and unit numbers ───────────────────────────── */

test("at most six counted accounts per normalized address; the seventh reads and follows but is not counted until reviewed", async () => {
  assert.equal(householdDecision(5), "counted"); assert.equal(householdDecision(6), "over_cap");
  const b = await bill("119-hr-9006"), home = "500 ELM ST AUSTIN TX 78702", people = [];
  for (let i = 0; i < 7; i++) { const p = await account(); people.push(p); const r = await moveIn(p, home, AUSTIN, T0 + i); await answer(p, b, "support", T0 + 100 + i); assert.deepEqual(r.held, i < 6 ? [] : ["household_cap"]); }
  assert.equal((await totals(b, T0 + DAY))["TX-37|address"], 6);
  assert.equal((await totals(b, T0 + DAY))["US|address"], 6, "an account set aside is not counted anywhere");
  // Nothing was deleted: the seventh account, its address and its answer are all still there.
  const seventh = people[6];
  assert.ok(await residenceOf(db, seventh.id));
  assert.equal((await db.select().from(schema.voiceVotes).where(eq(schema.voiceVotes.accountId, seventh.id))).length, 1);
  // The editor clears it: it counts. Confirming instead would keep it out.
  const hold = (await liveHolds(db, seventh.id))[0];
  assert.equal(await decideHold(db, hold.id, "clear", T0 + 2 * DAY), seventh.id);
  assert.equal((await totals(b, T0 + 3 * DAY))["TX-37|address"], 7);
  await decideHold(db, hold.id, "confirm", T0 + 4 * DAY);
  assert.equal((await totals(b, T0 + 5 * DAY))["TX-37|address"], 6);
  // A different unit at the same building is a different household.
  const neighbour = await account();
  assert.deepEqual((await moveIn(neighbour, `${home}|2B`, AUSTIN, T0 + 6 * DAY)).held, []);
});

test("addresses are normalized, and a unit number is required where the official database shows several units", () => {
  const one = normaliseResidence("1100 Congress Ave., Austin, TX, 78701-1234", "Apt. 4-B"), two = normaliseResidence("1100 CONGRESS AVE, AUSTIN, TX, 78701", "#4b");
  assert.equal(one.address, two.address); assert.equal(one.building, "1100 CONGRESS AVE AUSTIN TX 78701"); assert.equal(one.unit, "4B");
  assert.notEqual(normaliseResidence("1100 CONGRESS AVE, AUSTIN, TX, 78701", "5").address, one.address);
  assert.equal(normaliseResidence("1100 CONGRESS AVE, AUSTIN, TX, 78701", "").address, one.building);
  assert.equal(normaliseUnit("Unit 12"), "12"); assert.equal(normaliseUnit("  "), null);
  assert.deepEqual(splitUnit("1100 Congress Ave Apt 4B"), { street: "1100 Congress Ave", unit: "4B" });
  assert.deepEqual(splitUnit("1100 Congress Ave #12"), { street: "1100 Congress Ave", unit: "12" });
  assert.deepEqual(splitUnit("1100 Congress Ave, Suite 300", "7"), { street: "1100 Congress Ave", unit: "7" });
  assert.deepEqual(splitUnit("12 Court St"), { street: "12 Court St", unit: null }, "a street called Court is not a unit");
  // The Postal Service's documented answers (Addresses API 3.3.1): D = unit missing, S = unit given but not confirmed, Y = confirmed.
  const usps = (dpv, extra = {}) => authorityFromUsps({ address: { streetAddress: "1100 CONGRESS AVE", city: "AUSTIN", state: "TX", ZIPCode: "78701", ...extra.address }, additionalInfo: { DPVConfirmation: dpv }, corrections: extra.corrections ?? [] });
  assert.equal(unitDecision(usps("D"), false), "unit_required");
  assert.equal(unitDecision(usps("N", { corrections: [{ code: "32", text: "more information is needed" }] }), false), "unit_required");
  assert.equal(unitDecision(usps("S"), true), "unit_not_found");
  assert.equal(unitDecision(usps("Y", { address: { secondaryAddress: "APT 4B" } }), true), "ok");
  assert.equal(unitDecision(usps("Y"), false), "ok", "a single home needs no unit");
  assert.equal(unitDecision(null, false), "ok", "with the check off the unit is kept as typed and the household cap still applies");
  assert.equal(usps("Y").standard, "1100 CONGRESS AVE, AUSTIN, TX, 78701");
  assert.equal(authorityFromUsps({ error: "x" }), null);
});

/* ───────────────────────────── 4. Mailed codes ───────────────────────────── */

test("a mailed code is redeemed by one account only, once, at the address it was mailed to", async () => {
  const a = await account(), other = await account();
  await moveIn(a, "600 PINE ST AUSTIN TX 78703", AUSTIN, T0); await moveIn(other, "600 PINE ST AUSTIN TX 78703", AUSTIN, T0);
  await issueMailCode(db, { accountId: a.id, codeHash: "code-1", now: T0 });
  assert.deepEqual(await redeemMailCode(db, { accountId: other.id, codeHash: "code-1", now: T0 + DAY }), { ok: false, reason: "other_account" });
  assert.deepEqual(await redeemMailCode(db, { accountId: a.id, codeHash: "nope", now: T0 + DAY }), { ok: false, reason: "unknown" });
  assert.deepEqual(await redeemMailCode(db, { accountId: a.id, codeHash: "code-1", now: T0 + DAY }), { ok: true, revoked: [] });
  assert.equal(await mailVerified(db, a.id), true);
  assert.deepEqual(await redeemMailCode(db, { accountId: a.id, codeHash: "code-1", now: T0 + 2 * DAY }), { ok: false, reason: "used" });
  // The database refuses a second code with the same hash, and a second verification backed by the same code.
  await refusedByDatabase(db.insert(schema.mailCodes).values({ id: "dup", codeHash: "code-1", accountId: other.id, addressKey: "x", issuedAt: T0, expiresAt: T0 + DAY }));
  const used = (await db.select().from(schema.mailVerifications).where(eq(schema.mailVerifications.accountId, a.id)).get()).codeId;
  await refusedByDatabase(db.insert(schema.mailVerifications).values({ accountId: other.id, addressKey: "x", phoneHash: "p", codeId: used, verifiedAt: T0 }));
  // Expired, and mailed to an address the account has since left.
  await issueMailCode(db, { accountId: other.id, codeHash: "code-2", now: T0 });
  assert.deepEqual(await redeemMailCode(db, { accountId: other.id, codeHash: "code-2", now: T0 + RESIDENCE.mailCodeTtlMs + 1 }), { ok: false, reason: "expired" });
  await issueMailCode(db, { accountId: other.id, codeHash: "code-3", now: T0 + 70 * DAY });
  await moveIn(other, "60 OAK ST HOUSTON TX 77002", HOUSTON, T0 + 91 * DAY);
  assert.deepEqual(await redeemMailCode(db, { accountId: other.id, codeHash: "code-3", now: T0 + 92 * DAY }), { ok: false, reason: "moved" });
  assert.deepEqual(redeemDecision({ accountId: "a", addressKey: "k", expiresAt: 10, redeemedAt: null }, { id: "a", addressKey: "k", phoneHash: null }, 5), { ok: false, reason: "no_phone" });
});

test("redeeming a code removes mail-verified status from another account verified at a different address with the same phone hash", async () => {
  // The phone moved from one account to another: the first account now has a different number.
  const first = await account({ phone: "phone-moving" });
  await moveIn(first, "700 BIRCH ST AUSTIN TX 78704", AUSTIN, T0);
  await issueMailCode(db, { accountId: first.id, codeHash: "code-a", now: T0 });
  await redeemMailCode(db, { accountId: first.id, codeHash: "code-a", now: T0 + DAY });
  assert.equal(await mailVerified(db, first.id), true);
  await db.update(schema.verificationProfiles).set({ phoneHash: "phone-new" }).where(eq(schema.verificationProfiles.accountId, first.id));
  const second = await account({ phone: "phone-moving" });
  await moveIn(second, "70 OAK ST HOUSTON TX 77002", HOUSTON, T0 + 2 * DAY);
  await issueMailCode(db, { accountId: second.id, codeHash: "code-b", now: T0 + 2 * DAY });
  assert.deepEqual(await redeemMailCode(db, { accountId: second.id, codeHash: "code-b", now: T0 + 3 * DAY }), { ok: true, revoked: [first.id] });
  assert.equal(await mailVerified(db, second.id), true);
  assert.equal(await mailVerified(db, first.id), false);
  const row = await db.select().from(schema.mailVerifications).where(eq(schema.mailVerifications.accountId, first.id)).get();
  assert.equal(row.revokedReason, "phone_verified_elsewhere", "the record is kept, marked, not deleted");
  // The same phone hash at the SAME address is not touched; a different phone hash is not touched.
  const v = (accountId, addressKey, phoneHash) => ({ accountId, addressKey, phoneHash, revokedAt: null });
  assert.deepEqual(mailRevocations([v("x", "home", "p"), v("y", "elsewhere", "p"), v("z", "elsewhere", "q")], { accountId: "me", addressKey: "home", phoneHash: "p" }), ["y"]);
  // Moving away ends the account's own mail-verified status at the old address.
  await moveIn(second, "71 OAK ST HOUSTON TX 77002", HOUSTON, T0 + 95 * DAY);
  assert.equal(await mailVerified(db, second.id), false);
});

/* ───────────────────────────── 5. Signals for review ───────────────────────────── */

test("one device setting up accounts at several addresses sets them all aside; one household on one device does not", async () => {
  assert.equal(manyAddressesSignal("device", 2), false); assert.equal(manyAddressesSignal("device", 3), true);
  assert.equal(manyAddressesSignal("network", 5), false); assert.equal(manyAddressesSignal("network", 6), true);
  const family = [await account(), await account(), await account()];
  for (const p of family) assert.deepEqual((await moveIn(p, "800 CEDAR ST AUSTIN TX 78705", AUSTIN, T0, { device: "dev-family" })).held, []);
  const b = await bill("119-hr-9007"), farm = [await account(), await account(), await account()];
  for (const [i, p] of farm.entries()) { await answer(p, b, "support", T0); const r = await moveIn(p, `${810 + i} CEDAR ST AUSTIN TX 78705`, AUSTIN, T0 + i, { device: "dev-farm" }); assert.deepEqual(r.held, i < 2 ? [] : ["device_addresses"]); }
  for (const p of farm) assert.deepEqual((await liveHolds(db, p.id)).map(h => h.kind), ["device_addresses"], "the earlier accounts from that device are set aside too");
  assert.deepEqual(await totals(b, T0 + DAY), {}, "none of them counts while under review");
  assert.equal((await db.select().from(schema.voiceVotes).where(eq(schema.voiceVotes.billKey, b))).length, 3, "set aside, never deleted");
  // A hold the editor cleared is not raised again by the same pattern.
  const hold = (await liveHolds(db, farm[0].id))[0];
  await decideHold(db, hold.id, "clear", T0 + 2 * DAY);
  const fourth = await account();
  await moveIn(fourth, "820 CEDAR ST AUSTIN TX 78705", AUSTIN, T0 + 3 * DAY, { device: "dev-farm" });
  assert.deepEqual(await liveHolds(db, farm[0].id), []);
  assert.equal((await liveHolds(db, fourth.id)).length, 1);
});

test("a cluster of new accounts in one district right before a vote is set aside; the same cluster with no vote coming is not", async () => {
  assert.equal(districtClusterSignal({ recent: 10, baseline: 0, voteSoon: true }), true);
  assert.equal(districtClusterSignal({ recent: 10, baseline: 0, voteSoon: false }), false);
  assert.equal(districtClusterSignal({ recent: 9, baseline: 0, voteSoon: true }), false);
  assert.equal(districtClusterSignal({ recent: 10, baseline: 40, voteSoon: true }), false, "a district that always gains this many is not a cluster");
  const EL_PASO = { congressional: "TX-16", state: "TX", stateUpper: "TX-SD-29", stateLower: "TX-HD-77" }, now = T0 + 10 * DAY, fresh = [];
  for (let i = 0; i < 10; i++) {
    const p = await account({ createdAt: now - DAY }); fresh.push(p);
    const r = await moveIn(p, `${900 + i} MESA ST EL PASO TX 79901`, EL_PASO, now + i, { voteSoon: { federal: i === 9, state: false } });
    assert.deepEqual(r.held, i < 9 ? [] : ["district_cluster"]);
  }
  for (const p of fresh) assert.deepEqual((await liveHolds(db, p.id)).map(h => h.kind), ["district_cluster"]);
  // Long-standing accounts moving into the district are not "new accounts".
  const settled = await account();
  assert.deepEqual((await moveIn(settled, "999 MESA ST EL PASO TX 79901", EL_PASO, now + 20, { voteSoon: { federal: true, state: false } })).held, []);
});

test("repeated address changes are set aside for review", async () => {
  assert.equal(addressChangesSignal({ changesInYear: 2, refusedInMonth: 0 }), false); assert.equal(addressChangesSignal({ changesInYear: 3, refusedInMonth: 0 }), true);
  assert.equal(addressChangesSignal({ changesInYear: 0, refusedInMonth: 3 }), true);
  const a = await account();
  await moveIn(a, "1000 LAKE ST AUSTIN TX 78701", AUSTIN, T0);
  for (let i = 1; i <= 2; i++) assert.deepEqual((await moveIn(a, `10${i} OAK ST HOUSTON TX 77002`, HOUSTON, T0 + i * DAY)).held, []);
  const third = await moveIn(a, "103 OAK ST HOUSTON TX 77002", HOUSTON, T0 + 3 * DAY);
  assert.equal(third.ok, false); assert.deepEqual(third.held, ["address_changes"]);
  assert.equal((await residenceOf(db, a.id)).congressional, "TX-37");
});

test("a mailed code lasts 30 days", () => { assert.equal(RESIDENCE.mailCodeTtlMs, 30 * DAY); assert.equal(RESIDENCE.postcardsPerAddressYear, 2); });

test("the migration only creates tables", () => {
  const sql = readFileSync(join(ROOT, "drizzle/0035_one_residence.sql"), "utf8");
  assert.equal((sql.match(/CREATE TABLE/g) ?? []).length, 7);
  assert.doesNotMatch(sql, /ALTER TABLE|DROP TABLE|DROP INDEX|CREATE TRIGGER|DROP TRIGGER/);
});
