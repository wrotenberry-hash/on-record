// Constituent voice, one consolidated build (owner, 18 Nov 2026; docs/CONSTITUENT_VOICE.md). The rules in
// lib/constituent/rules.ts, and the same database functions the site runs (lib/constituent/store.ts) against a
// temporary database built from the real migrations.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { FEDERAL, groupLine, legacyPrompt, MIN_GROUP, MIN_SHOWN, NOT_ENOUGH_DISTRICT, NOT_SCIENTIFIC, PROMISE, scopeForMember, scopesFor, shownTotals, standing, tally, tierOf, TIER_NAME, TIER_MEANS,
  voteCounts, whoCanWeighIn } from "../lib/constituent/rules.ts";
import { castVote, countedVotesOf, decideLegacy, importLegacy, jurisdictionOf, recomputeVoice, setJurisdiction, standingOfVote, totalsForBill, totalsForScope, voteOf } from "../lib/constituent/store.ts";
import { issueMailCode, redeemMailCode, setResidence } from "../lib/verify/residence-store.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), DAY = 86400e3;
const dir = mkdtempSync(join(tmpdir(), "constituent-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
after(() => { client.close(); rmSync(dir, { recursive: true, force: true }); });

const T0 = Date.UTC(2026, 10, 20);
const AUSTIN = { congressional: "TX-37", state: "TX", stateUpper: "TX-SD-14", stateLower: "TX-HD-49" };
const HOUSTON = { congressional: "TX-07", state: "TX", stateUpper: "TX-SD-15", stateLower: "TX-HD-134" };
const TULSA = { congressional: "OK-01", state: "OK", stateUpper: "OK-SD-35", stateLower: "OK-HD-71" };
const DC = { congressional: "DC-AL", state: "DC", stateUpper: null, stateLower: null };
const SAN_JUAN = { congressional: "PR-AL", state: "PR", stateUpper: "PR-SD-1", stateLower: "PR-HD-1" };
const TX = { code: "TX", level: "state" };
let seq = 0;

/** A reader. `phone: false` is an account with an email only; `account: false` is a visitor with no account at all. */
async function reader({ phone = true, account = true, createdAt = T0 - 30 * DAY } = {}) {
  const userId = `user-${++seq}`, id = account ? `acct-${seq}` : null;
  await db.insert(schema.appUsers).values({ id: userId, kind: "public", externalKey: `k-${seq}`, createdAt });
  if (id) await db.insert(schema.readerAccounts).values({ id, appUserId: userId, emailHash: `e-${seq}`, email: `r${seq}@example.test`, createdAt, verifiedAt: createdAt });
  if (id) await db.insert(schema.verificationProfiles).values({ accountId: id, tier: phone ? 1 : 0, signupChallengeAt: createdAt, phoneHash: phone ? `phone-${seq}` : null, phoneVerifiedAt: phone ? createdAt : null, createdAt, updatedAt: createdAt });
  return { id, userId };
}
/** The address step: the account's one home, then "address-matched". */
async function home(r, districts, now = T0, street = `${++seq} MAIN ST`) {
  const res = await setResidence(db, { accountId: r.id, addressKey: `addr:${street}:${districts.congressional}`, buildingKey: `bldg:${street}`, hasUnit: false, districts, device: null, ipRange: null, voteSoon: { federal: false, state: false }, now });
  if (res.ok && res.kind !== "same") await db.update(schema.verificationProfiles).set({ tier: 2, districtId: districts.congressional, stateCode: districts.state, addressMatchedAt: now }).where(eq(schema.verificationProfiles.accountId, r.id));
  return res;
}
/** A postcard code mailed and typed in: "mail-verified". */
async function mail(r, now = T0) {
  const code = `code-${++seq}`;
  await issueMailCode(db, { accountId: r.id, codeHash: code, now });
  assert.equal((await redeemMailCode(db, { accountId: r.id, codeHash: code, now: now + DAY })).ok, true);
}
const vote = (r, billKey, answer, now = T0 + 1, extra = {}) => castVote(db, { userId: r.userId, accountId: r.id, billKey, answer, reason: null, reasonHash: null, device: null, ipRange: null, now, ...extra });
async function federalBill(id) {
  await db.insert(schema.officialBills).values({ id, congress: 119, billType: "hr", number: ++seq, title: `Test bill ${id}`, congressUrl: "https://www.congress.gov/", sourceUrl: "https://www.congress.gov/", retrievedAt: T0 });
  return id;
}
async function texasBill(id) {
  await db.insert(schema.txBills).values({ id, session: "90", identifier: `HB ${++seq}`, title: `Relating to a test (${id}).`, chamber: "lower", classification: ["bill"], subjects: [], stage: "filed",
    tloUrl: "https://capitol.texas.gov/", feed: "openstates", sourceUrl: "https://capitol.texas.gov/", retrievedAt: T0 });
  return id;
}
/** Totals as "scope|group": number of voters. */
const totals = async (billKey, now = T0 + 2 * DAY) => Object.fromEntries([...(await recomputeVoice(db, billKey, now))].map(([k, v]) => [k, v.support + v.oppose + v.unsure]));

/* ───────────────────────────── 10. The owner's test ───────────────────────────── */

test("a non-Texas address cannot be counted on a Texas bill", async () => {
  const bill = await texasBill("tx-90-hb-test-1");
  assert.deepEqual(await jurisdictionOf(db, bill), { code: "TX", level: "state" });
  const texan = await reader(), oklahoman = await reader(), washingtonian = await reader();
  await home(texan, AUSTIN); await home(oklahoman, TULSA); await home(washingtonian, DC);
  for (const r of [texan, oklahoman, washingtonian]) await vote(r, bill, "support");
  assert.deepEqual(await totals(bill), { "TX|address": 1, "TX-SD-14|address": 1, "TX-HD-49|address": 1 }, "only the Texan is counted, once in each Texas total");
  assert.deepEqual(await standingOfVote(db, oklahoman.userId, bill, T0 + 2 * DAY), { counts: false, why: "outside_jurisdiction" });
  // The answer is still saved, as that reader's private position: nothing is refused or deleted.
  assert.equal((await voteOf(db, oklahoman.userId, bill)).answer, "support");
  // Not even mail-verified changes it.
  await mail(oklahoman);
  assert.deepEqual(await totals(bill), { "TX|address": 1, "TX-SD-14|address": 1, "TX-HD-49|address": 1 });
  // The rule itself, and the line shown in place of the buttons.
  assert.equal(standing(TX, "OK"), "outside"); assert.equal(standing(TX, "TX"), "eligible"); assert.equal(standing(TX, null), "unknown");
  assert.equal(whoCanWeighIn(TX), "People who live in Texas can weigh in on this bill. You can still read it and see the totals.");
  // A Texan who moves to Oklahoma keeps the answer they gave as a Texan; a new answer on another Texas bill is not counted.
  await home(texan, TULSA, T0 + 91 * DAY);
  const later = await texasBill("tx-90-hb-test-2");
  await vote(texan, later, "oppose", T0 + 92 * DAY);
  assert.deepEqual(await totals(later, T0 + 93 * DAY), {});
  assert.deepEqual(await totals(bill, T0 + 93 * DAY), { "TX|address": 1, "TX-SD-14|address": 1, "TX-HD-49|address": 1 });
});

/* ───────────────────────────── 3. Jurisdiction ───────────────────────────── */

test("federal bills: any state or DC counts for the nation; territory residents are their own group", async () => {
  const bill = await federalBill("119-hr-7001");
  assert.deepEqual(await jurisdictionOf(db, bill), FEDERAL);
  const tx = await reader(), ok = await reader(), dc = await reader(), pr = await reader();
  await home(tx, AUSTIN); await home(ok, TULSA); await home(dc, DC); await home(pr, SAN_JUAN);
  for (const r of [tx, ok, dc, pr]) await vote(r, bill, "support");
  assert.deepEqual(await totals(bill), { "US|address": 3, "TX|address": 1, "TX-37|address": 1, "OK|address": 1, "OK-01|address": 1, "DC|address": 1, "DC-AL|address": 1,
    "US-TERR|address": 1, "PR|address": 1, "PR-AL|address": 1 });
  assert.equal(standing(FEDERAL, "PR"), "territory"); assert.equal(standing(FEDERAL, "DC"), "eligible"); assert.equal(standing(FEDERAL, "ZZ"), "outside");
  assert.deepEqual(scopesFor(FEDERAL, AUSTIN), ["US", "TX", "TX-37"]); assert.deepEqual(scopesFor(FEDERAL, SAN_JUAN), ["US-TERR", "PR", "PR-AL"]);
  assert.deepEqual(scopesFor(TX, AUSTIN), ["TX", "TX-SD-14", "TX-HD-49"]);
});

test("a bill's jurisdiction is stored, so a new state needs no code change", async () => {
  // A bill from a state the site has no table or code for: its loader writes one row.
  await setJurisdiction(db, "ok-2027-hb-1", { code: "OK", level: "state" });
  const ok = await reader(), tx = await reader();
  await home(ok, TULSA); await home(tx, AUSTIN);
  await vote(ok, "ok-2027-hb-1", "oppose"); await vote(tx, "ok-2027-hb-1", "support");
  assert.deepEqual(await totals("ok-2027-hb-1"), { "OK|address": 1, "OK-SD-35|address": 1, "OK-HD-71|address": 1 });
  assert.equal((await db.select().from(schema.billJurisdictions).where(eq(schema.billJurisdictions.billKey, "ok-2027-hb-1")).get()).jurisdiction, "OK");
  assert.equal(await jurisdictionOf(db, "no-such-bill"), null, "an unknown bill has no jurisdiction and no totals");
  assert.doesNotMatch(readFileSync(join(ROOT, "lib/constituent/rules.ts"), "utf8").match(/export function standing[\s\S]*?\n}/)[0], /"TX"|Texas/, "the rule names no state");
});

/* ───────────────────────────── 4. Tiers ───────────────────────────── */

test("accounts with only a phone, and visitors, save a private position and are counted in no total", async () => {
  const bill = await federalBill("119-hr-7002");
  const phoneOnly = await reader(), emailOnly = await reader({ phone: false }), visitor = await reader({ account: false });
  for (const r of [phoneOnly, emailOnly, visitor]) await vote(r, bill, "support");
  assert.deepEqual(await totals(bill), {});
  assert.deepEqual(await standingOfVote(db, phoneOnly.userId, bill, T0 + 2 * DAY), { counts: false, why: "not_address_matched" });
  assert.equal((await voteOf(db, visitor.userId, bill)).answer, "support");
  assert.equal(tierOf({ emailVerifiedAt: 1, phoneVerifiedAt: 1, hasHome: false, mailVerified: false }), "phone");
  assert.equal(tierOf({ emailVerifiedAt: 1, phoneVerifiedAt: null, hasHome: true, mailVerified: true }), "none", "no text-message code, no tier");
  assert.equal(tierOf({ emailVerifiedAt: 1, phoneVerifiedAt: 1, hasHome: true, mailVerified: false }), "address");
  assert.equal(tierOf({ emailVerifiedAt: 1, phoneVerifiedAt: 1, hasHome: true, mailVerified: true }), "mail");
  // Once the home address is matched, the answers already given under the new promise count.
  await home(phoneOnly, AUSTIN);
  assert.deepEqual(await totals(bill), { "US|address": 1, "TX|address": 1, "TX-37|address": 1 });
});

test("the two tiers are named honestly: address-matched is never called verified", () => {
  assert.equal(TIER_NAME.address, "Address-matched"); assert.equal(TIER_NAME.mail, "Mail-verified");
  for (const t of ["none", "phone", "address"]) assert.doesNotMatch(`${TIER_NAME[t]} ${TIER_MEANS[t]}`, /verified/i, t);
  assert.match(TIER_MEANS.phone, /not counted in any total/);
});

test("mail-verified and address-matched are counted separately, and Unsure is a counted answer", async () => {
  const bill = await federalBill("119-hr-7003");
  const a = await reader(), b = await reader(), c = await reader(), m = await reader();
  for (const r of [a, b, c, m]) await home(r, AUSTIN);
  await mail(m);
  await vote(a, bill, "support"); await vote(b, bill, "oppose"); await vote(c, bill, "unsure"); await vote(m, bill, "unsure");
  await recomputeVoice(db, bill, T0 + 3 * DAY);
  const t = (await totalsForBill(db, bill, ["TX-37", "US"])).get("TX-37");
  assert.deepEqual(t, { mail: { support: 0, oppose: 0, unsure: 1 }, address: { support: 1, oppose: 1, unsure: 1 } });
  assert.deepEqual((await totalsForScope(db, "TX-37", [bill])).get(bill), t);
  // Moving away ends mail-verified status: the same voter's NEW answers count as address-matched.
  await home(m, HOUSTON, T0 + 91 * DAY);
  const next = await federalBill("119-hr-7004");
  await vote(m, next, "support", T0 + 92 * DAY);
  assert.deepEqual(await totals(next, T0 + 93 * DAY), { "US|address": 1, "TX|address": 1, "TX-07|address": 1 });
});

/* ───────────────────────────── 1. The promise, and answers given before it changed ───────────────────────────── */

test("the promise: an individual vote is private; counted votes are added into anonymous totals", () => {
  assert.equal(PROMISE, "Your individual vote is private. Counted votes are added into anonymous totals.");
  const page = readFileSync(join(ROOT, "components/voice/vote-box.tsx"), "utf8");
  assert.match(page, /\{PROMISE\}/);
  for (const f of ["app/bills/[id]/page.tsx", "app/texas/bills/[id]/page.tsx", "components/home/stance-buttons.tsx", "components/voice/vote-box.tsx", "lib/accounts.ts"])
    assert.doesNotMatch(readFileSync(join(ROOT, f), "utf8"), /never shown to anyone else or added up into a poll|added up into a poll|Only you see this\. It is/, `${f} no longer makes the old promise`);
});

test("votes cast before the change stay uncounted unless the user opts in on their next visit", async () => {
  const b1 = await federalBill("119-hr-7005"), b2 = await federalBill("119-hr-7006"), b3 = await federalBill("119-hr-7007");
  const r = await reader();
  await home(r, AUSTIN);
  // Answers under the old promise live in the old tables.
  await db.insert(schema.opinionUserVotes).values([{ userId: r.userId, billId: b1, stance: "support", updatedAt: T0 - 5 * DAY }, { userId: r.userId, billId: b2, stance: "oppose", updatedAt: T0 - 4 * DAY }]);
  await db.insert(schema.readerUnsure).values({ userId: r.userId, billId: b3, updatedAt: T0 - 3 * DAY });
  assert.deepEqual(await importLegacy(db, r.userId, T0), { pending: 3, choice: null });
  assert.deepEqual(await importLegacy(db, r.userId, T0), { pending: 3, choice: null }, "copied once");
  assert.equal((await voteOf(db, r.userId, b3)).answer, "unsure");
  for (const b of [b1, b2, b3]) assert.deepEqual(await totals(b), {}, "uncounted until the reader chooses");
  assert.deepEqual(await standingOfVote(db, r.userId, b1, T0 + 2 * DAY), { counts: false, why: "no_consent" });
  assert.match(legacyPrompt(3, null), /^You answered 3 bills before answers were added into totals\./); assert.equal(legacyPrompt(3, "private"), null); assert.equal(legacyPrompt(0, null), null);
  // Changing one of them now is a vote under the new promise: that one counts, the others still do not.
  await vote(r, b2, "support", T0 + DAY);
  assert.deepEqual(await totals(b2), { "US|address": 1, "TX|address": 1, "TX-37|address": 1 });
  assert.deepEqual(await importLegacy(db, r.userId, T0 + DAY), { pending: 2, choice: null });
  // "Keep them private": they stay uncounted and the question is not asked again.
  const keeper = await reader();
  await home(keeper, AUSTIN);
  await db.insert(schema.opinionUserVotes).values({ userId: keeper.userId, billId: b1, stance: "oppose", updatedAt: T0 - DAY });
  assert.deepEqual(await decideLegacy(db, keeper.userId, "private", T0), []);
  assert.deepEqual(await importLegacy(db, keeper.userId, T0 + DAY), { pending: 0, choice: "private" });
  assert.deepEqual(await totals(b1), {});
  // "Count them": they count from now on.
  assert.deepEqual((await decideLegacy(db, r.userId, "count", T0 + DAY)).sort(), [b1, b3]);
  assert.deepEqual(await totals(b1), { "US|address": 1, "TX|address": 1, "TX-37|address": 1 });
  assert.deepEqual(await totals(b3), { "US|address": 1, "TX|address": 1, "TX-37|address": 1 });
  assert.deepEqual(await importLegacy(db, r.userId, T0 + 2 * DAY), { pending: 0, choice: "count" });
});

/* ───────────────────────────── 2. Voting ───────────────────────────── */

test("a vote can be changed or cleared, the history is kept, and the reason stays private", async () => {
  const bill = await federalBill("119-hr-7008"), r = await reader();
  await home(r, AUSTIN);
  await vote(r, bill, "support", T0 + 1, { reason: "Because of my commute." });
  await vote(r, bill, "unsure", T0 + 2);
  await vote(r, bill, null, T0 + 3);
  assert.equal(await voteOf(db, r.userId, bill), null);
  const history = await db.select().from(schema.positionHistory).where(and(eq(schema.positionHistory.userId, r.userId), eq(schema.positionHistory.billId, bill)));
  assert.deepEqual(history.sort((a, b) => a.at - b.at).map(h => h.stance), ["support", "unsure", "cleared"]);
  assert.equal(history[0].reason, "Because of my commute.");
  assert.deepEqual(await totals(bill), {});
  // Totals carry numbers only: no reason, no voter.
  assert.deepEqual(Object.keys(schema.voiceTotals).filter(k => /reason|user|account/i.test(k)), []);
});

/* ───────────────────────────── 8. Abuse controls that decide counting ───────────────────────────── */

test("a new account's votes count after 24 hours; a vote saved while a check failed does not count", async () => {
  const bill = await federalBill("119-hr-7009"), fresh = await reader({ createdAt: T0 });
  await home(fresh, AUSTIN, T0 + 1000);
  await vote(fresh, bill, "support", T0 + 2000);
  assert.deepEqual(await totals(bill, T0 + 23 * 3600e3), {});
  assert.deepEqual(await standingOfVote(db, fresh.userId, bill, T0 + 23 * 3600e3), { counts: false, why: "too_new" });
  assert.deepEqual(await totals(bill, T0 + 25 * 3600e3), { "US|address": 1, "TX|address": 1, "TX-37|address": 1 });
  const limited = await reader();
  await home(limited, AUSTIN);
  await vote(limited, bill, "oppose", T0 + 3000, { counts: -1 });
  assert.equal((await totals(bill, T0 + 2 * DAY))["US|address"], 1);
  await vote(limited, bill, "oppose", T0 + 4000); // answering again, with the check passed
  assert.equal((await totals(bill, T0 + 2 * DAY))["US|address"], 2);
  assert.equal(await countedVotesOf(db, limited.userId, T0 + 2 * DAY), 1);
});

/* ───────────────────────────── 6. What may be shown ───────────────────────────── */

test("district totals appear only at 25 counted voters, mail-verified first, and a tiny group is not broken out", () => {
  const c = (support, oppose, unsure) => ({ support, oppose, unsure });
  assert.deepEqual(shownTotals({ mail: c(3, 1, 0), address: c(12, 7, 1) }, "district"), { show: false, message: NOT_ENOUGH_DISTRICT });
  assert.equal(NOT_ENOUGH_DISTRICT, "Not enough constituents yet — share this bill.");
  assert.equal(shownTotals(null, "district").show, false); assert.match(shownTotals(null, "nation").message, /Not enough voters yet/);
  const shown = shownTotals({ mail: c(4, 1, 1), address: c(12, 7, 1) }, "district");
  assert.equal(shown.show, true); assert.equal(shown.voters, 26); assert.equal(shown.label, NOT_SCIENTIFIC);
  assert.deepEqual(shown.groups.map(g => g.tier), ["mail", "address"], "mail-verified first");
  assert.equal(groupLine(shown.groups[0]), "Mail-verified, 6 voters: 4 support · 1 oppose · 1 unsure");
  assert.equal(groupLine(shown.groups[1]), "Address-matched, 20 voters: 12 support · 7 oppose · 1 unsure");
  // Two mail-verified voters among 30: their answers are not shown, only that the group is small.
  const small = shownTotals({ mail: c(2, 0, 0), address: c(15, 12, 1) }, "district");
  assert.equal(small.groups[0].counts, null); assert.equal(groupLine(small.groups[0]), `Mail-verified: fewer than ${MIN_GROUP} voters`);
  assert.equal(shownTotals({ mail: null, address: c(20, 5, 0) }, "state").groups.length, 1);
  assert.equal(MIN_SHOWN, 25); assert.equal(NOT_SCIENTIFIC, "Not a scientific poll.");
});

test("the total beside a legislator's vote is their own district's", () => {
  assert.equal(scopeForMember({ level: "federal", chamber: "upper", state: "tx", district: null }), "TX");
  assert.equal(scopeForMember({ level: "federal", chamber: "lower", state: "TX", district: 7 }), "TX-07");
  assert.equal(scopeForMember({ level: "federal", chamber: "lower", state: "VT", district: 0 }), "VT-AL");
  assert.equal(scopeForMember({ level: "state", chamber: "upper", state: "TX", district: "14" }), "TX-SD-14");
  assert.equal(scopeForMember({ level: "state", chamber: "lower", state: "TX", district: "049" }), "TX-HD-49");
  // The same strings the address step stores, so the two always meet.
  assert.equal(scopeForMember({ level: "state", chamber: "upper", state: "TX", district: 14 }), AUSTIN.stateUpper);
  assert.equal(scopeForMember({ level: "federal", chamber: "lower", state: "TX", district: 37 }), AUSTIN.congressional);
});

test("the counting rule, case by case", () => {
  const v = (over = {}) => ({ answer: "support", consent: true, tier: "address", accountCreatedAt: 0, home: AUSTIN, quarantined: false, held: false, ...over });
  const now = 2 * DAY;
  assert.deepEqual(voteCounts(v(), FEDERAL, now), { counts: true, tier: "address", scopes: ["US", "TX", "TX-37"] });
  assert.deepEqual(voteCounts(v({ tier: "mail" }), TX, now), { counts: true, tier: "mail", scopes: ["TX", "TX-SD-14", "TX-HD-49"] });
  for (const [over, why] of [[{ consent: false }, "no_consent"], [{ tier: "phone" }, "not_address_matched"], [{ tier: "none" }, "not_address_matched"], [{ accountCreatedAt: now - 1000 }, "too_new"],
    [{ accountCreatedAt: null }, "too_new"], [{ home: null }, "no_home"], [{ quarantined: true }, "under_review"], [{ held: true }, "under_review"]])
    assert.deepEqual(voteCounts(v(over), FEDERAL, now), { counts: false, why }, why);
  assert.deepEqual(voteCounts(v({ home: TULSA }), TX, now), { counts: false, why: "outside_jurisdiction" });
  assert.equal(tally([v(), v({ answer: "unsure" }), v({ answer: "oppose", tier: "mail" }), v({ held: true })], FEDERAL, now).get("TX-37|address").unsure, 1);
});

test("the migration only creates tables", () => {
  const sql = readFileSync(join(ROOT, "drizzle/0036_constituent_voice.sql"), "utf8");
  assert.equal((sql.match(/CREATE TABLE/g) ?? []).length, 11);
  assert.doesNotMatch(sql, /ALTER TABLE|DROP TABLE|DROP INDEX|CREATE TRIGGER|DROP TRIGGER/);
});
