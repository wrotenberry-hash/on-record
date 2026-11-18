// Mail-verified by postcard (owner, 18 Nov 2026; docs/CONSTITUENT_VOICE.md, point 4). The rules in lib/mail-verify/rules.ts,
// the senders in lib/mail-verify/sender.ts, and the same database functions the site runs (lib/mail-verify/store.ts)
// against a temporary database built from the real migrations. No postcard is mailed and no outside host is called.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { addressLimit, capAllows, CODE_ALPHABET, countsTowardLimits, displayCode, flowVisible, MAIL_NOTE_OK, MAIL_OFFER_COOKIE, MAIL_OFFER_LINE, mailNote, monthStart, newCode, normaliseCode, offerShown,
  POSTCARD, postcardLines, redeemNote, requestDecision, splitStoredAddress } from "../lib/mail-verify/rules.ts";
import { mockSender, postcardSettings, senderFor, VENDOR_ADAPTER_BUILT, vendorSender } from "../lib/mail-verify/sender.ts";
import { accountStanding, postcardCounts, postcardStateOf, redeemPostcardCode, requestPostcard, spentThisMonthUsd } from "../lib/mail-verify/store.ts";
import { castVote, countedVotesOf, recomputeVoice } from "../lib/constituent/store.ts";
import { TIER_NAME } from "../lib/constituent/rules.ts";
import { RESIDENCE } from "../lib/verify/residence.ts";
import { mailVerified, openHold, setResidence } from "../lib/verify/residence-store.ts";
import { LIMITS } from "../lib/verify/rules.ts";
import { keyedHash } from "../lib/verify/crypto.ts";

process.env.EDITOR_ACCESS_KEY ??= "a-key-for-tests-only";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), DAY = 86400e3;
const dir = mkdtempSync(join(tmpdir(), "mail-verify-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
after(() => { client.close(); rmSync(dir, { recursive: true, force: true }); });
const read = p => readFileSync(join(ROOT, p), "utf8");

const T0 = Date.UTC(2026, 10, 20);
const AUSTIN = { congressional: "TX-37", state: "TX", stateUpper: "TX-SD-14", stateLower: "TX-HD-49" };
const ON = { MAIL_VERIFICATION_ENABLED: "1", VERIFICATION_ENABLED: "1" };
let seq = 0;

/** A reader account. `phone: false` has an email only. */
async function reader({ phone = true, createdAt = T0 - 30 * DAY } = {}) {
  const userId = `user-${++seq}`, id = `acct-${seq}`;
  await db.insert(schema.appUsers).values({ id: userId, kind: "public", externalKey: `k-${seq}`, createdAt });
  await db.insert(schema.readerAccounts).values({ id, appUserId: userId, emailHash: `e-${seq}`, email: `r${seq}@example.test`, createdAt, verifiedAt: createdAt });
  await db.insert(schema.verificationProfiles).values({ accountId: id, tier: phone ? 1 : 0, signupChallengeAt: createdAt, firstVoteChallengeAt: createdAt, phoneHash: phone ? `phone-${seq}` : null, phoneVerifiedAt: phone ? createdAt : null, createdAt, updatedAt: createdAt });
  return { id, userId };
}
/** The address step (what lib/verify/flow.ts does): the account's one home, the encrypted address on file, then "address-matched". */
async function home(r, street = `${++seq} MAIN ST`, now = T0 - 20 * DAY, districts = AUSTIN) {
  const res = await setResidence(db, { accountId: r.id, addressKey: `addr:${street}`, buildingKey: `bldg:${street}`, hasUnit: false, districts, device: null, ipRange: null, voteSoon: { federal: false, state: false }, now });
  if (res.ok && res.kind !== "same") await db.update(schema.verificationProfiles).set({ tier: 2, districtId: districts.congressional, stateCode: districts.state, addressMatchedAt: now, addressCipher: `v1.cipher.${street}` }).where(eq(schema.verificationProfiles.accountId, r.id));
  return res;
}
/** An address-matched reader. */
async function matched(street) { const r = await reader(); await home(r, street); return r; }
/** A stand-in for a real vendor: it "mails" by writing to a list, at a price. Nothing leaves this process. */
function paidSender(costUsd, log = []) {
  return { log, sender: { vendor: "test-vendor", costUsd, async send(job) { log.push({ postcardId: job.postcardId, code: job.code, address: await job.address() }); return { ok: true, status: "sent", vendorRef: `ref-${log.length}`, costUsd }; } } };
}
/** What lib/mail-verify/flow.ts does when a reader asks: a new code, its keyed hash, the request. Returns the result and the code that would be printed. */
async function ask(r, { now = T0, mode = "mock", sender = mockSender, capUsd = 100, address } = {}) {
  const code = newCode(), reads = [];
  const result = await requestPostcard(db, { accountId: r.id, code, codeHash: await keyedHash("mail-code", code), now, mode, capUsd, sender, address: address ?? (async () => { reads.push(now); return "1 MAIN ST, AUSTIN, TX 78701"; }) });
  return { result, code, addressReads: reads.length };
}
/** What the reader types, as the site handles it: normalised, hashed, then checked. */
async function type(r, typed, now) {
  const code = normaliseCode(typed);
  return code ? redeemPostcardCode(db, { accountId: r.id, codeHash: await keyedHash("mail-code", code), now }) : { ok: false, reason: "format" };
}
const cardsOf = r => db.select().from(schema.mailPostcards).where(eq(schema.mailPostcards.accountId, r.id));
const codesOf = r => db.select().from(schema.mailCodes).where(eq(schema.mailCodes.accountId, r.id));
async function federalBill(id) {
  await db.insert(schema.officialBills).values({ id, congress: 119, billType: "hr", number: ++seq, title: `Test bill ${id}`, congressUrl: "https://www.congress.gov/", sourceUrl: "https://www.congress.gov/", retrievedAt: T0 });
  return id;
}
const vote = (r, billKey, answer, now = T0 + 1) => castVote(db, { userId: r.userId, accountId: r.id, billKey, answer, reason: null, reasonHash: null, device: null, ipRange: null, now });
const totals = async (billKey, now) => Object.fromEntries([...(await recomputeVoice(db, billKey, now))].map(([k, v]) => [k, v.support + v.oppose + v.unsure]));

/* ───────────────────────────── 1. The code ───────────────────────────── */

test("the code: 6 characters, no look-alikes, drawn evenly", () => {
  assert.equal(POSTCARD.codeLength, 6);
  assert.equal(CODE_ALPHABET.length, 31);
  for (const c of "0O1IL") assert.ok(!CODE_ALPHABET.includes(c), `${c} is not in the alphabet`);
  assert.equal(new Set(CODE_ALPHABET).size, CODE_ALPHABET.length, "no character twice");
  const seen = new Set();
  for (let i = 0; i < 2000; i++) { const c = newCode(); assert.match(c, /^[A-HJKMNP-Z2-9]{6}$/); seen.add(c); }
  assert.ok(seen.size > 1990, "codes do not repeat in a small sample");
  // A byte that would favour the first letters (248 to 255, past 8 full turns of 31) is thrown away and drawn again.
  let turn = 0;
  const fixed = bytes => { bytes.fill(turn++ === 0 ? 255 : 30); return bytes; };
  assert.equal(newCode(fixed), "999999", "byte 255 is skipped; byte 30 is the last character");
  assert.equal(displayCode("K7M2QX"), "K7M 2QX");
});

test("a code typed with different case, spaces or a dash is the same code; anything else is not a code", () => {
  for (const typed of ["K7M2QX", "k7m2qx", " k7m 2qx ", "K7M-2QX", "k 7 m 2 q x", "K7M 2QX\n"]) assert.equal(normaliseCode(typed), "K7M2QX", JSON.stringify(typed));
  for (const typed of ["", null, undefined, "K7M2Q", "K7M2QXX", "K7M2Q0", "K7M2QO", "K7M2Q1", "K7M2QI", "K7M2QL", "K7M2Q!", "246810"]) assert.equal(normaliseCode(typed), null, JSON.stringify(typed));
});

/* ───────────────────────────── The switch ───────────────────────────── */

test("off by default; a rehearsal when switched on with no vendor; a named vendor is never used while its adapter is unbuilt", () => {
  assert.equal(postcardSettings({}).mode, "off");
  assert.equal(postcardSettings({ MAIL_VERIFICATION_ENABLED: "1" }).mode, "off", "verification itself must be on too");
  assert.equal(postcardSettings({ VERIFICATION_ENABLED: "1", MAIL_VERIFICATION_ENABLED: "true" }).mode, "off", "only the value 1 switches it on");
  assert.equal(senderFor(postcardSettings({}), {}), null);
  const rehearsal = postcardSettings(ON);
  assert.deepEqual(rehearsal, { mode: "mock", vendor: "mock", capUsd: 100, pieceCostUsd: 0, notReady: null });
  assert.equal(senderFor(rehearsal, ON), mockSender);
  assert.equal(postcardSettings({ ...ON, POSTCARD_VENDOR: "mock" }).mode, "mock");
  // The cap: 100 unless the owner raises it; a value that is not a number falls back to 100.
  assert.equal(POSTCARD.defaultCapUsd, 100);
  assert.equal(postcardSettings({ ...ON, POSTCARD_MONTHLY_CAP_USD: "250" }).capUsd, 250);
  assert.equal(postcardSettings({ ...ON, POSTCARD_MONTHLY_CAP_USD: "lots" }).capUsd, 100);
  assert.equal(postcardSettings({ ...ON, POSTCARD_MONTHLY_CAP_USD: "-5" }).capUsd, 100);
  assert.equal(postcardSettings({ ...ON, POSTCARD_MONTHLY_CAP_USD: "0" }).capUsd, 0, "a cap of 0 stops every paid card");
  // A vendor: unknown name, no key, no real piece cost, and finally no adapter. Each one means nothing is sent.
  const why = env => { const s = postcardSettings({ ...ON, ...env }); assert.equal(senderFor(s, { ...ON, ...env }), null); return [s.mode, s.notReady]; };
  assert.deepEqual(why({ POSTCARD_VENDOR: "acme" }), ["not_ready", "unknown_vendor"]);
  assert.deepEqual(why({ POSTCARD_VENDOR: "lob" }), ["not_ready", "no_key"]);
  assert.deepEqual(why({ POSTCARD_VENDOR: "lob", POSTCARD_API_KEY: "k" }), ["not_ready", "no_piece_cost"]);
  for (const vendor of Object.keys(VENDOR_ADAPTER_BUILT)) {
    assert.equal(VENDOR_ADAPTER_BUILT[vendor], false, `no adapter is built for ${vendor}`);
    assert.deepEqual(why({ POSTCARD_VENDOR: vendor, POSTCARD_API_KEY: "k", POSTCARD_PIECE_COST_USD: "0.9" }), ["not_ready", "adapter_not_built"]);
  }
  assert.deepEqual(Object.keys(VENDOR_ADAPTER_BUILT).sort(), ["click2mail", "lob", "postgrid", "stannp"]);
});

test("the vendor stub mails nothing: it refuses, reads no address and names no outside host", async () => {
  let addressReads = 0;
  const r = await vendorSender("lob", "a-key", 0.9).send({ postcardId: "p", code: "K7M2QX", expiresAt: T0, address: async () => { addressReads++; return "x"; } });
  assert.deepEqual(r, { ok: false, reason: "adapter_not_built" });
  assert.equal(addressReads, 0);
  for (const f of readdirSync(join(ROOT, "lib/mail-verify"))) assert.doesNotMatch(read(`lib/mail-verify/${f}`), /fetch\(|https?:\/\/|XMLHttpRequest|node:https?/, `${f} calls no outside host`);
});

test("nothing is sent when the flag is off", async () => {
  const r = await matched(), spy = paidSender(0.9);
  const off = postcardSettings({});
  // The site passes the sender for the settings, which is none.
  assert.deepEqual((await ask(r, { mode: off.mode, sender: senderFor(off, {}) })).result, { ok: false, reason: "off" });
  // Even handed a working sender, the switch decides.
  const forced = await ask(r, { mode: "off", sender: spy.sender });
  assert.deepEqual(forced.result, { ok: false, reason: "off" });
  assert.equal(forced.addressReads, 0);
  assert.equal(spy.log.length, 0, "the sender was never called");
  assert.deepEqual(await cardsOf(r), []); assert.deepEqual(await codesOf(r), []);
  // A named vendor that is not ready: the same.
  assert.deepEqual((await ask(r, { mode: "not_ready", sender: null })).result, { ok: false, reason: "not_ready" });
  assert.deepEqual(await cardsOf(r), []);
  assert.equal(requestDecision({ mode: "off", tier: "address", hasAddressOnFile: true, held: false, lastRequestedAt: null, cardsAtAddress: [], spentThisMonthUsd: 0, nextCostUsd: 0, capUsd: 100, now: T0 }).ok, false);
  // The page parts render nothing with the switch off, before reading anything.
  assert.match(read("components/account/mail-verify.tsx"), /if \(!flowVisible\(settings\.mode, isEditor\)\) return null;\n  const now/);
  assert.match(read("components/account/mail-verify-offer.tsx"), /if \(tier !== "address" \|\| \(settings\.mode !== "live" && settings\.mode !== "mock"\)\) return null;/);
  assert.match(read("lib/mail-verify/flow.ts"), /if \(!flowVisible\(settings\.mode, isEditor\) \|\| !sender\) return/);
  assert.equal(flowVisible("off", true), false); assert.equal(flowVisible("not_ready", true), false);
});

/* ───────────────────────────── The mock ───────────────────────────── */

test("the mock sends nothing and costs nothing: one row marked mock, the address never read, only a hash of the code kept", async () => {
  const r = await matched();
  const before = await spentThisMonthUsd(db, T0);
  const { result, code, addressReads } = await ask(r);
  assert.equal(result.ok, true); assert.equal(result.status, "mock");
  assert.equal(result.expiresAt, T0 + 30 * DAY);
  assert.equal(addressReads, 0, "a rehearsal never decrypts the home address");
  const [card] = await cardsOf(r), [stored] = await codesOf(r);
  assert.deepEqual({ vendor: card.vendor, status: card.status, costUsd: card.costUsd, sentAt: card.sentAt, vendorRef: card.vendorRef, addressKey: card.addressKey, codeId: card.codeId },
    { vendor: "mock", status: "mock", costUsd: 0, sentAt: null, vendorRef: null, addressKey: stored.addressKey, codeId: stored.id });
  assert.equal(await spentThisMonthUsd(db, T0), before, "nothing was spent");
  assert.deepEqual(await mockSender.send({ postcardId: "x", code: "K7M2QX", expiresAt: 0, address: async () => { throw new Error("the mock must not read the address"); } }), { ok: true, status: "mock", vendorRef: null, costUsd: 0 });
  // Only the keyed hash is stored: the code itself is in no column of either table.
  assert.equal(stored.codeHash, await keyedHash("mail-code", code));
  assert.match(stored.codeHash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify([card, stored]).includes(code), "the plain code is not in the database");
  assert.equal(stored.expiresAt - stored.issuedAt, RESIDENCE.mailCodeTtlMs);
});

test("a rehearsal card never makes an account mail-verified, even when its code is typed in correctly", async () => {
  const r = await matched(), bill = await federalBill("119-hr-9101");
  await vote(r, bill, "support");
  const { code } = await ask(r);
  assert.deepEqual(await type(r, code.toLowerCase(), T0 + DAY), { ok: true, test: true, revoked: [] });
  assert.equal(await mailVerified(db, r.id), false);
  assert.equal((await accountStanding(db, r.id)).tier, "address");
  assert.deepEqual(await db.select().from(schema.mailVerifications).where(eq(schema.mailVerifications.accountId, r.id)), []);
  assert.deepEqual(await totals(bill, T0 + 2 * DAY), { "US|address": 1, "TX|address": 1, "TX-37|address": 1 }, "still counted as address-matched");
  // The same refusals as a real card: a wrong code, and a code past its 30 days.
  assert.deepEqual(await type(r, "ZZZZZZ", T0 + DAY), { ok: false, reason: "unknown" });
  assert.deepEqual(await type(r, code, T0 + 30 * DAY + 1), { ok: false, reason: "expired" });
});

/* ───────────────────────────── Who may ask ───────────────────────────── */

test("a phone-only account cannot request a card; nor can a visitor, a mail-verified account or one under review", async () => {
  const phoneOnly = await reader();
  assert.equal((await accountStanding(db, phoneOnly.id)).tier, "phone");
  assert.deepEqual((await ask(phoneOnly)).result, { ok: false, reason: "not_address_matched" });
  const emailOnly = await reader({ phone: false });
  assert.deepEqual((await ask(emailOnly)).result, { ok: false, reason: "not_address_matched" });
  assert.deepEqual((await ask({ id: "no-such-account" })).result, { ok: false, reason: "not_address_matched" });
  for (const r of [phoneOnly, emailOnly]) { assert.deepEqual(await cardsOf(r), []); assert.deepEqual(await codesOf(r), []); }
  const base = { mode: "live", hasAddressOnFile: true, held: false, lastRequestedAt: null, cardsAtAddress: [], spentThisMonthUsd: 0, nextCostUsd: 0.9, capUsd: 100, now: T0 };
  assert.deepEqual(requestDecision({ ...base, tier: "none" }), { ok: false, reason: "not_address_matched" });
  assert.deepEqual(requestDecision({ ...base, tier: "phone" }), { ok: false, reason: "not_address_matched" });
  assert.deepEqual(requestDecision({ ...base, tier: "mail" }), { ok: false, reason: "already_mail_verified" });
  assert.deepEqual(requestDecision({ ...base, tier: "address" }), { ok: true });
  assert.deepEqual(requestDecision({ ...base, tier: "address", hasAddressOnFile: false }), { ok: false, reason: "no_address" });
  assert.deepEqual(requestDecision({ ...base, tier: "address", held: true }), { ok: false, reason: "under_review" });
  // In the database: an account set aside for review is refused, and nothing is written.
  const held = await matched();
  await openHold(db, held.id, "household_cap", "addr:x", {}, T0);
  assert.deepEqual((await ask(held)).result, { ok: false, reason: "under_review" });
  assert.deepEqual(await cardsOf(held), []);
});

test("one postcard at a time: a second can be asked for after 14 days, in case the first was lost", async () => {
  const r = await matched();
  assert.equal((await ask(r, { now: T0 })).result.ok, true);
  assert.deepEqual((await ask(r, { now: T0 + 13 * DAY })).result, { ok: false, reason: "already_requested", until: T0 + 14 * DAY });
  assert.equal((await cardsOf(r)).length, 1);
  const state = await postcardStateOf(db, r.id, "mock", T0 + 13 * DAY);
  assert.deepEqual(state.card, { requestedAt: T0, expiresAt: T0 + 30 * DAY, test: true, askAgainAt: T0 + 14 * DAY });
  assert.equal((await ask(r, { now: T0 + 14 * DAY })).result.ok, true, "the second card");
  assert.equal((await postcardStateOf(db, r.id, "mock", T0 + 15 * DAY)).card.requestedAt, T0 + 14 * DAY, "the page shows the latest card");
  assert.equal((await postcardStateOf(db, r.id, "mock", T0 + 50 * DAY)).card, null, "no card is waiting once its code has expired");
});

/* ───────────────────────────── At most 2 postcards per address per year ───────────────────────────── */

test("the third postcard to one address within a year is refused", async () => {
  // The rule.
  assert.equal(POSTCARD.perAddressYear, 2); assert.equal(POSTCARD.yearMs, 365 * DAY);
  assert.deepEqual(addressLimit([], T0), { ok: true });
  assert.deepEqual(addressLimit([T0 - 100 * DAY], T0), { ok: true });
  assert.deepEqual(addressLimit([T0 - 100 * DAY, T0 - 20 * DAY], T0), { ok: false, nextAllowedAt: T0 + 265 * DAY });
  assert.deepEqual(addressLimit([T0 - 365 * DAY, T0 - 20 * DAY], T0), { ok: true }, "a card exactly a year old no longer counts");
  assert.deepEqual(addressLimit([T0 - 364 * DAY, T0 - 20 * DAY, T0 - 5 * DAY], T0), { ok: false, nextAllowedAt: T0 + 345 * DAY });
  // In the database: three people in one home. Two cards go out; the third request is refused for any of them.
  const street = "700 SHARED HOUSE RD", [a, b, c] = [await matched(street), await matched(street), await matched(street)];
  const start = T0 + 400 * DAY;
  assert.equal((await ask(a, { now: start })).result.ok, true);
  assert.equal((await ask(b, { now: start + DAY })).result.ok, true);
  assert.deepEqual((await ask(c, { now: start + 2 * DAY })).result, { ok: false, reason: "address_limit", until: start + 365 * DAY });
  assert.deepEqual((await ask(a, { now: start + 20 * DAY })).result, { ok: false, reason: "address_limit", until: start + 365 * DAY }, "also for the account that got the first");
  assert.deepEqual(await cardsOf(c), []); assert.deepEqual(await codesOf(c), [], "a refused request leaves no code behind");
  const all = await db.select().from(schema.mailPostcards).where(eq(schema.mailPostcards.addressKey, `addr:${street}`));
  assert.equal(all.length, 2);
  // Another address is not affected.
  assert.equal((await ask(await matched(), { now: start + 2 * DAY })).result.ok, true);
  // A year after the first card, one more is allowed.
  assert.deepEqual((await ask(c, { now: start + 365 * DAY - 1 })).result.reason, "address_limit");
  assert.equal((await ask(c, { now: start + 365 * DAY })).result.ok, true);
  assert.deepEqual((await ask(a, { now: start + 365 * DAY + 5 })).result, { ok: false, reason: "address_limit", until: start + 366 * DAY }, "two in the year again: the next is allowed a year after the second card");
});

test("which cards count toward the limits: a failed card never, a rehearsal card only in a rehearsal", async () => {
  assert.deepEqual(["queued", "mock", "sent", "failed"].map(s => countsTowardLimits(s, "mock")), [true, true, true, false]);
  assert.deepEqual(["queued", "mock", "sent", "failed"].map(s => countsTowardLimits(s, "live")), [true, false, true, false]);
  // Two rehearsal cards at an address do not use up the address's two real cards.
  const street = "12 REHEARSAL LN", [a, b] = [await matched(street), await matched(street)], start = T0 + 800 * DAY, paid = paidSender(0.5);
  assert.equal((await ask(a, { now: start })).result.ok, true);
  assert.equal((await ask(b, { now: start })).result.ok, true);
  assert.equal((await ask(a, { now: start + DAY, mode: "live", sender: paid.sender })).result.ok, true);
  assert.equal(paid.log.length, 1);
});

/* ───────────────────────────── The monthly cap ───────────────────────────── */

test("the cap refuses the card that would cross $100", async () => {
  // The rule: spent this month plus the next card must stay at or under the cap, to the cent.
  assert.equal(capAllows(99.1, 0.9, 100), true, "exactly $100.00 is allowed");
  assert.equal(capAllows(99.11, 0.9, 100), false, "$100.01 is not");
  assert.equal(capAllows(0.1 + 0.2, 99.7, 100), true, "no rounding error at the line");
  assert.equal(capAllows(0, 0.9, 0), false); assert.equal(capAllows(0, 0, 0), true, "a rehearsal costs nothing, so no cap stops it");
  assert.equal(capAllows(100, 0.01, 100), false);
  // In the database, in a month of its own (January 2027): cards at $33.40 each.
  const jan = Date.UTC(2027, 0, 10), paid = paidSender(33.4);
  assert.equal(await spentThisMonthUsd(db, jan), 0);
  const [a, b, c, d] = [await matched(), await matched(), await matched(), await matched()];
  assert.equal((await ask(a, { now: jan, mode: "live", sender: paid.sender })).result.ok, true);
  assert.equal((await ask(b, { now: jan + DAY, mode: "live", sender: paid.sender })).result.ok, true);
  assert.equal(await spentThisMonthUsd(db, jan + DAY), 66.8);
  const refused = await ask(c, { now: jan + 2 * DAY, mode: "live", sender: paid.sender });
  assert.deepEqual(refused.result, { ok: false, reason: "cap_reached" }, "$66.80 + $33.40 = $100.20");
  assert.equal(refused.addressReads, 0, "the address is not read for a card that is not sent");
  assert.equal(paid.log.length, 2, "the vendor was not called a third time");
  assert.deepEqual(await cardsOf(c), []); assert.deepEqual(await codesOf(c), []);
  assert.equal(await spentThisMonthUsd(db, jan + 2 * DAY), 66.8, "nothing was added");
  // A card that lands exactly on $100.00 is sent; the next cent is not.
  const exact = paidSender(33.2);
  assert.equal((await ask(c, { now: jan + 3 * DAY, mode: "live", sender: exact.sender })).result.ok, true);
  assert.equal(await spentThisMonthUsd(db, jan + 3 * DAY), 100);
  assert.deepEqual((await ask(d, { now: jan + 4 * DAY, mode: "live", sender: paidSender(0.01).sender })).result, { ok: false, reason: "cap_reached" });
  // The owner raises the cap: the same card is sent.
  assert.equal((await ask(d, { now: jan + 4 * DAY, mode: "live", sender: paidSender(0.01).sender, capUsd: 150 })).result.ok, true);
  // A new month starts from zero.
  assert.equal(monthStart(jan), Date.UTC(2027, 0, 1)); assert.equal(monthStart(Date.UTC(2027, 1, 1)), Date.UTC(2027, 1, 1));
  assert.equal(await spentThisMonthUsd(db, Date.UTC(2027, 1, 1)), 0);
  assert.equal((await ask(await matched(), { now: Date.UTC(2027, 1, 1), mode: "live", sender: paidSender(33.4).sender })).result.ok, true);
});

test("a card set aside by two requests at the same moment cannot slip past the cap", async () => {
  const mar = Date.UTC(2027, 2, 10), [a, b] = [await matched(), await matched()], paid = paidSender(60);
  const results = await Promise.all([ask(a, { now: mar, mode: "live", sender: paid.sender }), ask(b, { now: mar, mode: "live", sender: paid.sender })]);
  assert.ok(results.filter(r => r.result.ok).length <= 1, "at most one $60 card under a $100 cap");
  assert.ok(await spentThisMonthUsd(db, mar) <= 100);
  assert.equal(paid.log.length, results.filter(r => r.result.ok).length, "the vendor was called only for a card that passed");
});

test("a card the vendor could not send costs nothing, and its code can never be used", async () => {
  const r = await matched(), apr = Date.UTC(2027, 3, 10);
  const failing = { vendor: "test-vendor", costUsd: 0.9, async send() { return { ok: false, reason: "vendor_refused" }; } };
  const first = await ask(r, { now: apr, mode: "live", sender: failing });
  assert.deepEqual(first.result, { ok: false, reason: "send_failed" });
  const [card] = await cardsOf(r);
  assert.deepEqual({ status: card.status, costUsd: card.costUsd, sentAt: card.sentAt }, { status: "failed", costUsd: 0, sentAt: null });
  assert.deepEqual(await codesOf(r), []);
  assert.equal(await spentThisMonthUsd(db, apr), 0);
  assert.deepEqual(await type(r, first.code, apr + DAY), { ok: false, reason: "unknown" });
  // A sender that throws is treated the same way, and the reader can ask again at once.
  const throwing = { vendor: "test-vendor", costUsd: 0.9, async send() { throw new Error("network"); } };
  assert.deepEqual((await ask(r, { now: apr + 1, mode: "live", sender: throwing })).result, { ok: false, reason: "send_failed" });
  assert.equal((await ask(r, { now: apr + 2, mode: "live", sender: paidSender(0.9).sender })).result.ok, true);
});

/* ───────────────────────────── Typing the code from a real card ───────────────────────────── */

test("a real card: the address is read once, at sending; the code typed with other case or spaces makes the account mail-verified", async () => {
  const r = await matched(), may = Date.UTC(2027, 4, 10), paid = paidSender(0.9), bill = await federalBill("119-hr-9102");
  await vote(r, bill, "oppose", may);
  assert.deepEqual(await totals(bill, may + DAY), { "US|address": 1, "TX|address": 1, "TX-37|address": 1 });
  const { result, code, addressReads } = await ask(r, { now: may, mode: "live", sender: paid.sender });
  assert.equal(result.status, "sent"); assert.equal(addressReads, 1);
  assert.deepEqual(paid.log, [{ postcardId: result.postcardId, code, address: "1 MAIN ST, AUSTIN, TX 78701" }], "the sender gets the code to print and the address, nothing else");
  const [card] = await cardsOf(r);
  assert.deepEqual({ vendor: card.vendor, status: card.status, costUsd: card.costUsd, sentAt: card.sentAt, vendorRef: card.vendorRef }, { vendor: "test-vendor", status: "sent", costUsd: 0.9, sentAt: may, vendorRef: "ref-1" });
  assert.ok(!JSON.stringify([card, await codesOf(r)]).includes(code), "the plain code is not in the database");
  assert.equal((await postcardStateOf(db, r.id, "live", may + DAY)).card.test, false);
  // Typed in lower case with a space, a week later.
  const typed = `${code.slice(0, 3).toLowerCase()} ${code.slice(3).toLowerCase()}`;
  assert.deepEqual(await type(r, "ZZZZZZ", may + 7 * DAY), { ok: false, reason: "unknown" }, "a wrong code is refused");
  assert.deepEqual(await type(r, typed, may + 7 * DAY), { ok: true, test: false, revoked: [] });
  assert.equal(await mailVerified(db, r.id), true);
  assert.equal((await accountStanding(db, r.id)).tier, "mail"); assert.equal(TIER_NAME.mail, "Mail-verified");
  assert.deepEqual(await totals(bill, may + 8 * DAY), { "US|mail": 1, "TX|mail": 1, "TX-37|mail": 1 }, "the answer moves to the mail-verified group");
  assert.deepEqual(await type(r, code, may + 8 * DAY), { ok: false, reason: "used" }, "a code works once");
  assert.equal((await postcardStateOf(db, r.id, "live", may + 8 * DAY)).card, null);
  assert.deepEqual((await ask(r, { now: may + 30 * DAY, mode: "live", sender: paid.sender })).result, { ok: false, reason: "already_mail_verified" });
});

test("an expired code is refused: a code works for 30 days", async () => {
  assert.equal(POSTCARD.codeTtlMs, 30 * DAY);
  const r = await matched(), jun = Date.UTC(2027, 5, 10);
  const { code } = await ask(r, { now: jun, mode: "live", sender: paidSender(0.9).sender });
  assert.deepEqual(await type(r, code, jun + 30 * DAY + 1), { ok: false, reason: "expired" });
  assert.equal(await mailVerified(db, r.id), false);
  assert.equal((await postcardStateOf(db, r.id, "live", jun + 30 * DAY + 1)).card, null, "the page stops asking for the old code");
  // On the last day it still works.
  const other = await matched(), second = await ask(other, { now: jun, mode: "live", sender: paidSender(0.9).sender });
  assert.deepEqual(await type(other, second.code, jun + 30 * DAY), { ok: true, test: false, revoked: [] });
});

test("one account per code: a code mailed for one account does nothing for another", async () => {
  const street = "5 TWO PEOPLE CT", [a, b] = [await matched(street), await matched(street)], jul = Date.UTC(2027, 6, 10);
  const { code } = await ask(a, { now: jul, mode: "live", sender: paidSender(0.9).sender });
  assert.deepEqual(await type(b, code, jul + DAY), { ok: false, reason: "other_account" });
  assert.equal(await mailVerified(db, b.id), false);
  assert.equal(redeemNote("other_account"), "code_wrong", "the other person is told only that the code did not match");
  assert.equal(redeemNote("unknown"), "code_wrong");
  assert.deepEqual(await type(a, code, jul + DAY), { ok: true, test: false, revoked: [] });
  // After a move, a code mailed to the old address is refused.
  const mover = await matched("1 OLD RD"), aug = Date.UTC(2027, 7, 10);
  const sent = await ask(mover, { now: aug, mode: "live", sender: paidSender(0.9).sender });
  await home(mover, "2 NEW RD", aug + 5 * DAY);
  assert.deepEqual(await type(mover, sent.code, aug + 6 * DAY), { ok: false, reason: "moved" });
  assert.equal(redeemNote("moved"), "code_moved");
});

/* ───────────────────────────── The offer, the words, the editor's counts ───────────────────────────── */

test("the offer comes after the third counted answer, only to an address-matched account, and stays away once dismissed", async () => {
  assert.equal(POSTCARD.offerAfterCountedVotes, 3);
  const r = await matched(), now = T0 + 5 * DAY, bills = [await federalBill("119-hr-9111"), await federalBill("119-hr-9112"), await federalBill("119-hr-9113")];
  const shown = async (extra = {}) => offerShown({ mode: "live", isEditor: false, tier: (await accountStanding(db, r.id)).tier, countedVotes: await countedVotesOf(db, r.userId, now), dismissed: false, cardOutstanding: false, held: false, ...extra });
  await vote(r, bills[0], "support"); await vote(r, bills[1], "unsure");
  assert.equal(await countedVotesOf(db, r.userId, now), 2); assert.equal(await shown(), false, "two counted answers: no offer yet");
  await vote(r, bills[2], "oppose");
  assert.equal(await countedVotesOf(db, r.userId, now), 3); assert.equal(await shown(), true, "the third counted answer");
  assert.equal(await shown({ dismissed: true }), false); assert.equal(await shown({ cardOutstanding: true }), false); assert.equal(await shown({ held: true }), false);
  assert.equal(await shown({ mode: "off" }), false); assert.equal(await shown({ mode: "not_ready" }), false);
  assert.equal(await shown({ mode: "mock" }), false, "a rehearsal is never offered to a reader");
  assert.equal(await shown({ mode: "mock", isEditor: true }), true);
  for (const tier of ["none", "phone", "mail"]) assert.equal(await shown({ tier }), false, tier);
  // A phone-only account's answers are not counted, so it never reaches three.
  const phoneOnly = await reader();
  for (const b of bills) await vote(phoneOnly, b, "support");
  assert.equal(await countedVotesOf(db, phoneOnly.userId, now), 0);
  // One small line under the voting box, with a way to say no that sets a cookie the privacy page lists.
  assert.match(read("components/voice/vote-box.tsx"), /<MailVerifyOffer userId=\{data\.userId\} tier=\{data\.tier\} back=\{back\} \/>/);
  assert.match(read("components/account/mail-verify-offer.tsx"), /<button className="link-button">Not now<\/button>/);
  assert.match(read("app/account/verify-actions.ts"), /\.set\(MAIL_OFFER_COOKIE, "no"/);
  assert.equal(MAIL_OFFER_COOKIE, "or_mvo");
  assert.match(MAIL_OFFER_LINE, /optional and free/);
});

test("honest names: address-matched is never called verified, and every outcome has a plain line", () => {
  const files = [...readdirSync(join(ROOT, "lib/mail-verify")).map(f => `lib/mail-verify/${f}`), ...readdirSync(join(ROOT, "components/account")).filter(f => f.startsWith("mail-verify")).map(f => `components/account/${f}`)];
  assert.ok(files.length >= 7);
  for (const f of files) {
    const text = read(f).replace(/mail-verified/gi, "");
    assert.doesNotMatch(text, /\bverified\b/i, `${f}: the word "verified" appears only in "mail-verified"`);
    assert.doesNotMatch(text, /On Record|Constituent\b/, `${f} does not type the product name`);
    assert.doesNotMatch(text, /\b(upgrade|premium|subscribe|subscription|plan)\b/i, `${f} has no plan or upsell wording`);
  }
  const notes = ["requested", "test_requested", "mail_verified", "test_matched", "off", "not_ready", "not_address_matched", "already_mail_verified", "no_address", "under_review", "already_requested", "address_limit", "cap_reached",
    "rate", "send_failed", "code_format", "code_wrong", "code_used", "code_expired", "code_moved", "code_rate", "no_phone"];
  for (const n of notes) { const line = mailNote(n, T0, "K7M2QX"); assert.ok(line && /[.]$/.test(line), `${n} has a sentence`); assert.doesNotMatch(line.replace(/mail-verified/gi, ""), /\bverified\b/i, n); }
  assert.equal(mailNote("anything-else"), null, "a note name that is not known shows nothing");
  assert.equal(mailNote("<script>"), null);
  assert.equal(mailNote("requested", T0), "A postcard was requested on November 19, 2026. It can take about a week. When it arrives, type its code below.");
  assert.equal(mailNote("mail_verified"), "Mail-verified. From now on your answers count in the mail-verified group for where you live.");
  assert.match(mailNote("cap_reached"), /Your account stays address-matched and your answers still count/);
  assert.match(mailNote("address_limit", T0), /Two postcards have already been requested for this address in the last year/);
  // The code shown in a rehearsal must be a code: nothing else from the web address is shown.
  assert.match(mailNote("test_requested", T0, "k7m2qx"), /The code a real postcard would carry is K7M 2QX\.$/);
  assert.equal(mailNote("test_requested", T0, "<b>hi</b>"), "Test mode: no postcard was mailed and nothing was charged.");
  assert.deepEqual([...MAIL_NOTE_OK], ["requested", "test_requested", "mail_verified", "test_matched"]);
  // The Account page: the step sits after the address step, and uses the owner's words.
  const page = read("app/account/page.tsx"), section = read("components/account/mail-verify.tsx");
  assert.ok(page.indexOf("<MailVerifySection") > page.indexOf("Match my address"), "the postcard step comes after the address step");
  for (const words of ["Get a postcard (optional, free)", "A postcard was requested on", "It can take about a week.", "Enter the code from your postcard", "Mail-verified", "Your account is address-matched"]) assert.ok(section.includes(words), words);
});

test("the postcard says only the site's name and the code; the stored address splits into the parts a mailing service needs", () => {
  const card = postcardLines({ siteName: "Example Site", code: "K7M2QX", expiresAt: T0 + 30 * DAY });
  assert.equal(card.to, "Current resident");
  assert.ok(card.lines.includes("K7M 2QX"));
  assert.match(card.lines.join(" "), /by December 19, 2026/);
  assert.doesNotMatch(card.lines.join(" "), /bill|vote|support|oppose|district|party|verified/i, "nothing about politics on a card anyone can read");
  assert.deepEqual(splitStoredAddress("1100 Congress Ave, Austin, TX 78701"), { street: "1100 Congress Ave", unit: null, city: "Austin", state: "TX", zip: "78701" });
  assert.deepEqual(splitStoredAddress("200 W 6th St, Austin, TX 78701-1234 #4B"), { street: "200 W 6th St", unit: "4B", city: "Austin", state: "TX", zip: "78701-1234" });
  assert.deepEqual(splitStoredAddress("12 Elm St, Bldg C, Round Rock, TX 78664"), { street: "12 Elm St, Bldg C", unit: null, city: "Round Rock", state: "TX", zip: "78664" });
  assert.equal(splitStoredAddress("not an address"), null); assert.equal(splitStoredAddress(null), null);
  // The form the site stores (lib/verify/flow.ts) is the form this reads.
  assert.match(read("lib/verify/flow.ts"), /const street = `\$\{home\.street\}, \$\{parts\[1\]\}, \$\{parts\[2\]\.toUpperCase\(\)\} \$\{parts\[3\]\}`;/);
  assert.match(read("lib/verify/flow.ts"), /encryptAddress\(n\.unit \? `\$\{street\} #\$\{n\.unit\}` : street\)/);
});

test("the home address is decrypted in one place only, when a sender asks, and tries at the code are limited", () => {
  const flow = read("lib/mail-verify/flow.ts"), actions = read("app/account/verify-actions.ts");
  assert.equal(flow.split("decryptAddress(").length - 1, 1, "one call");
  assert.match(flow, /const address = async \(\) => \{ const p = await profileFor\(account\.id\); return p\?\.addressCipher \? decryptAddress\(p\.addressCipher\) : null; \};/);
  for (const f of ["lib/mail-verify/flow.ts", "lib/mail-verify/store.ts", "lib/mail-verify/sender.ts", "lib/mail-verify/rules.ts"]) assert.doesNotMatch(read(f), /console\.|logger/, `${f} logs nothing`);
  assert.doesNotMatch(read("lib/mail-verify/store.ts") + read("components/account/mail-verify.tsx") + read("components/account/mail-verify-counts.tsx") + read("components/account/mail-verify-offer.tsx"), /decryptAddress|addressCipher: /);
  // Limits: three requests a day per account; five tries at a code per account and twenty per network range per day.
  assert.deepEqual(LIMITS.postcard_account_day, { max: 3, windowMs: DAY });
  assert.deepEqual(LIMITS.mail_code_account_day, { max: 5, windowMs: DAY });
  assert.deepEqual(LIMITS.mail_code_ip_day, { max: 20, windowMs: DAY });
  assert.match(flow, /if \(!\(await withinLimit\("postcard_account_day", account\.id\)\)\) return \{ note: "rate" \};/);
  assert.match(flow, /if \(!\(await withinLimit\("mail_code_account_day", account\.id\)\) \|\| !\(await withinLimit\("mail_code_ip_day", ctx\.ipRange\)\)\) return \{ note: "code_rate" \};/);
  assert.ok(flow.indexOf('withinLimit("mail_code_account_day"') < flow.indexOf("redeemPostcardCode(db"), "the limit is checked before the code is looked up");
  // The actions pass only a note name, a time and (rehearsal) a code back to the page.
  assert.match(actions, /redirect\(`\/account\?mv=\$\{r\.note\}/);
});

test("the editor sees counts only: this month's cards by outcome, the money against the cap, codes typed in", async () => {
  const sep = Date.UTC(2027, 8, 10), [a, b, c] = [await matched(), await matched(), await matched()];
  const empty = await postcardCounts(db, sep);
  assert.deepEqual(empty.month, { requested: 0, queued: 0, mock: 0, sent: 0, failed: 0 }); assert.equal(empty.spentMonthUsd, 0); assert.equal(empty.codesRedeemedMonth, 0);
  await ask(a, { now: sep });
  const real = await ask(b, { now: sep, mode: "live", sender: paidSender(0.9).sender });
  await ask(c, { now: sep, mode: "live", sender: { vendor: "test-vendor", costUsd: 0.9, async send() { return { ok: false, reason: "unreachable" }; } } });
  await type(b, real.code, sep + DAY);
  const counts = await postcardCounts(db, sep + 2 * DAY);
  assert.deepEqual(counts.month, { requested: 3, queued: 0, mock: 1, sent: 1, failed: 1 });
  assert.equal(counts.spentMonthUsd, 0.9); assert.equal(counts.codesRedeemedMonth, 1);
  assert.equal(counts.mailVerifiedNow, empty.mailVerifiedNow + 1);
  assert.deepEqual(Object.keys(counts).sort(), ["codesRedeemedMonth", "mailVerifiedNow", "month", "spentMonthUsd"], "numbers only: no account, address or code");
  const block = read("components/account/mail-verify-counts.tsx");
  assert.doesNotMatch(block, /accountId|addressKey|email|codeHash/);
  assert.match(read("app/editor/integrity/page.tsx"), /<MailVerifyCounts \/>/);
});
