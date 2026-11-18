// Associations (owner, 18 Nov 2026; docs/CONSTITUENT_VOICE.md point 9): "May see totals only for their own verified
// members, aggregates only." The rules in lib/associations/rules.ts, and the same database functions the site runs
// (lib/associations/store.ts, with the site's own counting rule) against a temporary database built from the real migrations.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { groupLine, MIN_GROUP, MIN_SHOWN, NOT_SCIENTIFIC } from "../lib/constituent/rules.ts";
import { castVote, recomputeVoice, voteFacts } from "../lib/constituent/store.ts";
import { issueMailCode, openHold, redeemMailCode, setResidence } from "../lib/verify/residence-store.ts";
import { LIMITS } from "../lib/verify/rules.ts";
import { COOKIES, STORED } from "../lib/trust.ts";
import * as rules from "../lib/associations/rules.ts";
import { adminEmailHash, joinCodeHash, newJoinCode } from "../lib/associations/codes.ts";
import { addAdmin, adminsForEmail, adminSession, associationsForEditor, createAssociation, issueAccessLink, joinAssociation, leaveAssociation, memberCountShown, memberTotals, memberVoteFacts,
  membershipsOf, redeemAccessLink, removeAdmin, replaceJoinCode, setAssociationStatus, viewForAdmin } from "../lib/associations/store.ts";

const { associationsOn, canMove, cleanName, freeSlug, JOIN_CODE_ALPHABET, makeJoinCode, memberCountLine, normaliseJoinCode, rowLines, signInEmail, slugFor, tallyMembers, totalsCsv, viewRows } = rules;

process.env.EDITOR_ACCESS_KEY ||= "test-key-for-associations"; // the keyed hashes of lib/verify/crypto.ts need a secret; this one exists only in this test
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), DAY = 86400e3;
const read = f => readFileSync(join(ROOT, f), "utf8");
const dir = mkdtempSync(join(tmpdir(), "associations-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
after(() => { client.close(); rmSync(dir, { recursive: true, force: true }); });

const T0 = Date.UTC(2026, 10, 20), NOW = T0 + 2 * DAY;
const AUSTIN = { congressional: "TX-37", state: "TX", stateUpper: "TX-SD-14", stateLower: "TX-HD-49" };
const TULSA = { congressional: "OK-01", state: "OK", stateUpper: "OK-SD-35", stateLower: "OK-HD-71" };
const FEDERAL = { code: "US", level: "federal" };
let seq = 0;

/** A reader. `phone: false` is an account with an email only. */
async function reader({ phone = true, createdAt = T0 - 30 * DAY } = {}) {
  const userId = `user-${++seq}`, id = `acct-${seq}`;
  await db.insert(schema.appUsers).values({ id: userId, kind: "public", externalKey: `k-${seq}`, createdAt });
  await db.insert(schema.readerAccounts).values({ id, appUserId: userId, emailHash: `e-${seq}`, email: `r${seq}@example.test`, createdAt, verifiedAt: createdAt });
  await db.insert(schema.verificationProfiles).values({ accountId: id, tier: phone ? 1 : 0, signupChallengeAt: createdAt, phoneHash: phone ? `phone-${seq}` : null, phoneVerifiedAt: phone ? createdAt : null, createdAt, updatedAt: createdAt });
  return { id, userId };
}
/** The address step: the account's one home, then "address-matched". */
async function home(r, districts = AUSTIN, now = T0) {
  const street = `${++seq} MAIN ST`;
  const res = await setResidence(db, { accountId: r.id, addressKey: `addr:${street}:${districts.congressional}`, buildingKey: `bldg:${street}`, hasUnit: false, districts, device: null, ipRange: null, voteSoon: { federal: false, state: false }, now });
  assert.equal(res.ok, true);
  await db.update(schema.verificationProfiles).set({ tier: 2, districtId: districts.congressional, stateCode: districts.state, addressMatchedAt: now }).where(eq(schema.verificationProfiles.accountId, r.id));
}
/** A postcard code mailed and typed in: "mail-verified". */
async function mail(r, now = T0) {
  const code = `code-${++seq}`;
  await issueMailCode(db, { accountId: r.id, codeHash: code, now });
  assert.equal((await redeemMailCode(db, { accountId: r.id, codeHash: code, now: now + DAY })).ok, true);
}
const vote = (r, billKey, answer, now = T0 + 1, extra = {}) => castVote(db, { userId: r.userId, accountId: r.id, billKey, answer, reason: null, reasonHash: null, device: null, ipRange: null, now, ...extra });
async function federalBill(id) {
  await db.insert(schema.officialBills).values({ id, congress: 119, billType: "hr", number: ++seq, title: `A bill to test ${id}`, congressUrl: `https://www.congress.gov/bill/${id}`, sourceUrl: "https://www.congress.gov/", retrievedAt: T0 });
  return id;
}
async function texasBill(id) {
  await db.insert(schema.txBills).values({ id, session: "90", identifier: `HB ${++seq}`, title: `Relating to a test (${id}).`, chamber: "lower", classification: ["bill"], subjects: [], stage: "filed",
    tloUrl: `https://capitol.texas.gov/${id}`, feed: "openstates", sourceUrl: "https://capitol.texas.gov/", retrievedAt: T0 });
  return id;
}

/** An association as the editor makes it: the code is made and hashed by the site's own function, and only the hash is passed on. */
async function association(name, { open = true } = {}) {
  const { code, hash } = await newJoinCode();
  const a = await createAssociation(db, { name, joinCodeHash: hash, now: T0 });
  if (open) assert.equal(await setAssociationStatus(db, a.id, "active", T0), true);
  return { ...a, name, code };
}
/** A reader types the code on the Account page. */
const joinWith = async (r, code, now = T0) => joinAssociation(db, { accountId: r.id, joinCodeHash: await joinCodeHash(code), now });
/** An administrator the editor added, signed in with a link. */
async function administrator(a, email) {
  assert.equal(await addAdmin(db, { associationId: a.id, email, emailHash: await adminEmailHash(email), now: T0 }), true);
  const [row] = (await adminsForEmail(db, await adminEmailHash(email))).filter(x => x.associationName === a.name);
  assert.equal(await redeemAccessLink(db, await issueAccessLink(db, row.adminId, T0), T0 + 1000), row.adminId);
  return row.adminId;
}
/** `n` address-matched readers in Austin who join `a` (if given) and answer `bill`. */
async function crowd(n, bill, answer, a = null, { mailVerified = false } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = await reader(); await home(r); if (mailVerified) await mail(r);
    if (a) assert.equal((await joinWith(r, a.code)).ok, true);
    await vote(r, bill, answer); out.push(r);
  }
  return out;
}
const totalsOf = async (a, bill, now = NOW) => (await memberTotals(db, a.id, now)).get(bill) ?? null;
const sum = t => (t ? ["mail", "address"].reduce((n, k) => n + (t[k] ? t[k].support + t[k].oppose + t[k].unsure : 0), 0) : 0);

/* ───────────────────────────── The switch ───────────────────────────── */

test("associations are off unless ASSOCIATIONS_ENABLED is exactly 1, and every way in checks the switch", () => {
  for (const v of [undefined, null, "", "0", "true", "yes", "on", "2"]) assert.equal(associationsOn(v), false, `${v} is off`);
  assert.equal(associationsOn("1"), true); assert.equal(associationsOn(" 1 "), true);
  assert.equal(rules.ASSOCIATIONS_FLAG, "ASSOCIATIONS_ENABLED");
  assert.match(read("lib/associations/session.ts"), /export const associationsEnabled = \(\) => associationsOn\(process\.env\[ASSOCIATIONS_FLAG\]\)/);
  // The association's page, the page the emailed link opens and the file to download do not exist while it is off.
  assert.match(read("app/association/page.tsx"), /if \(!associationsEnabled\(\)\) notFound\(\);/);
  assert.match(read("app/association/open/page.tsx"), /if \(!associationsEnabled\(\)\) notFound\(\);/);
  assert.match(read("app/association/export/route.ts"), /if \(!associationsEnabled\(\)\) return new NextResponse\("Not found", \{ status: 404 \}\);/);
  // No join form for a reader, no joining, no sign-in link, no session, nothing for the editor to add.
  assert.match(read("components/associations/account-block.tsx"), /if \(!associationsEnabled\(\)\) return null;/);
  assert.match(read("app/association/member-actions.ts"), /if \(!associationsEnabled\(\)\) return say\(false,/);
  const session = read("lib/associations/session.ts");
  assert.match(session, /if \(!associationsEnabled\(\) \|\| !key\(\)\) return \{ ok: true, message: LINK_REQUESTED \};/);
  assert.match(session, /export async function redeemAssociationLink[^\n]*\n  if \(!associationsEnabled\(\)\) return null;/);
  assert.match(session, /export async function currentAssociationAdmin[^\n]*\n  if \(!associationsEnabled\(\)\) return null;/);
  const editor = read("app/editor/associations/actions.ts");
  assert.match(editor, /const allowed = async \(\) => associationsEnabled\(\) && !!\(await getEditorUser\(\)\);/);
  assert.equal(editor.split("if (!(await allowed()))").length - 1, 5, "each of the five editor actions checks it first");
  // The Account page gets one line, and the block decides for itself whether to draw.
  assert.equal(read("app/account/page.tsx").split("<AssociationsBlock accountId={account.id} />").length - 1, 1);
});

/* ───────────────────────────── Names, statuses, the join code ───────────────────────────── */

test("the join code: ten characters with no look-alikes, and typing it in another case or with spaces is the same code", () => {
  assert.equal(JOIN_CODE_ALPHABET.length, 31); assert.doesNotMatch(JOIN_CODE_ALPHABET, /[01OIL]/);
  for (let i = 0; i < 200; i++) assert.match(makeJoinCode(), /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}$/);
  assert.equal(new Set(Array.from({ length: 500 }, () => makeJoinCode())).size, 500, "codes do not repeat");
  // Bytes of 248 and above are thrown away, so every character is equally likely.
  assert.equal(makeJoinCode(() => Uint8Array.from([255, 248, 0, 1, 2, 3, 4, 30, 31, 32, 33, 34, 250, 7, 8, 9, 10, 11, 12, 13])), "ABCDE-9ABCD");
  assert.equal(normaliseJoinCode("abcde-fghjk"), "ABCDEFGHJK"); assert.equal(normaliseJoinCode("  ABCDE fghjk "), "ABCDEFGHJK"); assert.equal(normaliseJoinCode("A B C D E - F G H J K"), "ABCDEFGHJK");
  for (const bad of ["", null, undefined, "ABCDE", "ABCDE-FGHJ", "ABCDE-FGHJKM", "ABCDE-FGHJ0", "ABCDE-FGHJO", "ABCDE-FGHJ1", "ABCDE-FGHJL", "ABCDE-FGHJ!", "' or 1=1 --"]) assert.equal(normaliseJoinCode(bad), null, `${bad} is not a code`);
});

test("names, page slugs and the three statuses", () => {
  assert.equal(cleanName("  Texas   Nurses'  Association "), "Texas Nurses' Association"); assert.equal(cleanName("ab"), null); assert.equal(cleanName("x".repeat(81)), null); assert.equal(cleanName(null), null);
  assert.equal(slugFor("Texas Nurses' Association"), "texas-nurses-association"); assert.equal(slugFor("Société Générale  des Électeurs!"), "societe-generale-des-electeurs");
  assert.equal(slugFor("!!!"), "association"); assert.match(slugFor("a".repeat(47) + " b c d"), /^a{47}$/);
  assert.equal(freeSlug("nurses", new Set()), "nurses"); assert.equal(freeSlug("nurses", new Set(["nurses"])), "nurses-2"); assert.equal(freeSlug("nurses", new Set(["nurses", "nurses-2"])), "nurses-3");
  assert.deepEqual(["pending", "active", "closed"].flatMap(f => ["pending", "active", "closed"].filter(t => canMove(f, t)).map(t => `${f}→${t}`)), ["pending→active", "pending→closed", "active→closed"]);
});

/* ───────────────────────────── The join code is stored only as a hash ───────────────────────────── */

test("the join code is stored only as a keyed hash: the code itself is nowhere in the database", async () => {
  const a = await association("Hash Test League");
  const row = await db.select().from(schema.associations).where(eq(schema.associations.id, a.id)).get();
  assert.match(row.joinCodeHash, /^[0-9a-f]{64}$/); assert.equal(row.joinCodeHash, await joinCodeHash(a.code));
  const plain = normaliseJoinCode(a.code);
  for (const [k, v] of Object.entries(row)) { assert.ok(!String(v).includes(a.code), `${k} does not hold the code`); assert.ok(!String(v).toUpperCase().includes(plain), `${k} does not hold the code without its dash`); }
  // Not in any table either: every file of the database is read, byte for byte.
  await client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  for (const f of readdirSync(dir)) { const bytes = readFileSync(join(dir, f)).toString("latin1"); assert.ok(!bytes.includes(a.code) && !bytes.includes(plain), `${f} does not hold the code`); }
  assert.ok(readFileSync(join(dir, "test.db")).toString("latin1").includes(row.joinCodeHash), "the hash is what is stored (so the search above would have found the code)");
  // The table has no column a code could go in, and the hash is keyed: it is not a plain SHA-256 of the code.
  const table = read("db/schema.ts").match(/export const associations = sqliteTable[\s\S]*?\]\);/)[0];
  assert.deepEqual([...table.matchAll(/text\("([a-z_]+)"/g)].map(m => m[1]), ["id", "name", "slug", "join_code_hash", "status"]);
  const sha = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain))).toString("hex");
  assert.notEqual(row.joinCodeHash, sha);
  assert.match(read("lib/associations/codes.ts"), /keyedHash\("association-join", code\)/);
  // The editor's action passes only the hash to the database, and hands the code back once in its answer.
  const action = read("app/editor/associations/actions.ts");
  assert.match(action, /const \{ code, hash \} = await newJoinCode\(\);\n  await createAssociation\(getDb\(\), \{ name, joinCodeHash: hash, now: Date\.now\(\) \}\);/);
  assert.doesNotMatch(action, /redirect|searchParams|cookies\(/, "the code is never put in an address or a cookie");

  // Typed in lower case with a space, it is the same code. A wrong code matches nothing.
  const r = await reader();
  assert.deepEqual(await joinAssociation(db, { accountId: r.id, joinCodeHash: await joinCodeHash(a.code.toLowerCase().replace("-", " ")), now: T0 }), { ok: true, name: "Hash Test League", already: false });
  assert.deepEqual(await joinWith(r, a.code), { ok: true, name: "Hash Test League", already: true }, "joining twice changes nothing");
  assert.deepEqual(await joinWith(await reader(), makeJoinCode()), { ok: false, why: "no_match" });
  assert.equal(await joinCodeHash("not a code"), null);
  // A new code replaces the old one at once; members who already joined stay.
  const fresh = await newJoinCode();
  assert.equal(await replaceJoinCode(db, a.id, fresh.hash), true);
  assert.deepEqual(await joinWith(await reader(), a.code), { ok: false, why: "no_match" });
  assert.equal((await joinWith(await reader(), fresh.code)).ok, true);
  assert.deepEqual((await membershipsOf(db, r.id)).map(m => m.name), ["Hash Test League"]);
});

test("only an open association takes members; two associations with the same name get different page slugs", async () => {
  const pending = await association("Not Yet Open", { open: false }), r = await reader();
  assert.deepEqual(await joinWith(r, pending.code), { ok: false, why: "not_open" });
  assert.deepEqual(await membershipsOf(db, r.id), []);
  assert.equal(await setAssociationStatus(db, pending.id, "active", T0), true);
  assert.equal((await joinWith(r, pending.code)).ok, true);
  assert.equal(await setAssociationStatus(db, pending.id, "pending", T0), false, "an open association cannot go back");
  const twin = await association("Not Yet Open");
  assert.equal(pending.slug, "not-yet-open"); assert.equal(twin.slug, "not-yet-open-2");
});

/* ───────────────────────────── What an association may see ───────────────────────────── */

test("an association never sees a non-member's vote", async () => {
  const bill = await federalBill("119-hr-assoc-1"), nurses = await association("Nurses United"), teachers = await association("Teachers Guild");
  await crowd(20, bill, "support", nurses); await crowd(6, bill, "oppose", nurses);
  await crowd(25, bill, "unsure", teachers);
  await crowd(40, bill, "oppose"); // readers who joined nothing
  assert.deepEqual(await totalsOf(nurses, bill), { mail: null, address: { support: 20, oppose: 6, unsure: 0 } });
  assert.deepEqual(await totalsOf(teachers, bill), { mail: null, address: { support: 0, oppose: 0, unsure: 25 } });
  // The site's own total for the nation holds all 91; each association's holds only its own members.
  const site = await recomputeVoice(db, bill, NOW);
  assert.deepEqual(site.get("US|address"), { support: 20, oppose: 46, unsure: 25 });
  // A member of both is counted once in each, and a non-member's bill does not appear at all.
  const other = await federalBill("119-hr-assoc-2");
  await crowd(30, other, "support");
  assert.equal(await totalsOf(nurses, other), null);
  assert.deepEqual([...(await memberTotals(db, nurses.id, NOW)).keys()], [bill]);
  const both = await reader(); await home(both); await joinWith(both, nurses.code); await joinWith(both, teachers.code); await vote(both, bill, "support");
  assert.equal(sum(await totalsOf(nurses, bill)), 27); assert.equal(sum(await totalsOf(teachers, bill)), 26);
});

test("nothing is shown below 25 counted members voting: not on the page, not in the file", async () => {
  const bill = await federalBill("119-hr-assoc-3"), a = await association("Small Club"), admin = await administrator(a, "chair@smallclub.example");
  await crowd(24, bill, "support", a);
  assert.equal(await memberCountShown(db, a.id), null, "24 members: no number is given");
  assert.equal(memberCountLine(await memberCountShown(db, a.id)), "Fewer than 25 members have joined so far.");
  // Six more members who answered but are not counted: an email-only account does not make it 25.
  for (let i = 0; i < 6; i++) { const r = await reader({ phone: false }); await joinWith(r, a.code); await vote(r, bill, "oppose"); }
  assert.equal(await memberCountShown(db, a.id), 30, "30 have joined");
  assert.equal(sum(await totalsOf(a, bill)), 24, "24 of them are counted on this bill");
  let view = await viewForAdmin(db, admin, NOW);
  assert.deepEqual(view, { name: "Small Club", members: 30, rows: [] });
  assert.equal(totalsCsv(view.rows), `${rules.CSV_HEADER.join(",")}\r\n`, "the file has its heading line and nothing else");
  // The 25th counted member: the bill appears, with all 25.
  await crowd(1, bill, "unsure", a);
  view = await viewForAdmin(db, admin, NOW);
  assert.equal(view.rows.length, 1); assert.equal(view.rows[0].voters, 25);
  assert.deepEqual(rowLines(view.rows[0]), ["Address-matched, 25 voters: 24 support · 0 oppose · 1 unsure"]);
  assert.equal(MIN_SHOWN, 25);
});

test("a member who leaves is gone from the next total", async () => {
  const bill = await federalBill("119-hr-assoc-4"), a = await association("Leavers Circle"), admin = await administrator(a, "lead@leavers.example");
  const yes = await crowd(20, bill, "support", a), no = await crowd(6, bill, "oppose", a);
  assert.deepEqual(await totalsOf(a, bill), { mail: null, address: { support: 20, oppose: 6, unsure: 0 } });
  assert.deepEqual((await membershipsOf(db, no[0].id)).map(m => m.name), ["Leavers Circle"], "a member sees which associations they are in");
  assert.equal(await leaveAssociation(db, { accountId: no[0].id, associationId: a.id }), "Leavers Circle");
  assert.deepEqual(await membershipsOf(db, no[0].id), []);
  assert.equal(await db.select().from(schema.associationMembers).where(and(eq(schema.associationMembers.accountId, no[0].id), eq(schema.associationMembers.associationId, a.id))).get(), undefined, "the membership row is deleted");
  assert.deepEqual(await totalsOf(a, bill), { mail: null, address: { support: 20, oppose: 5, unsure: 0 } });
  assert.equal(await leaveAssociation(db, { accountId: no[0].id, associationId: a.id }), null, "leaving twice does nothing");
  // Their answer is still theirs and still counts on the site; it is only out of the association's total.
  assert.equal((await recomputeVoice(db, bill, NOW)).get("US|address").oppose, 6);
  // One more leaves: 24 counted members, so the bill is no longer shown at all.
  await leaveAssociation(db, { accountId: yes[0].id, associationId: a.id });
  assert.deepEqual((await viewForAdmin(db, admin, NOW)).rows, []);
  // Totals are worked out when asked for and kept nowhere: no table holds an association's totals.
  assert.doesNotMatch(read("lib/associations/store.ts"), /insert\(voiceTotals\)|voiceTotals/);
  // Deleting the account removes the membership row too (the site's deletion; checked by reading it, it is not run here).
  assert.ok(read("lib/verify/store.ts").match(/export async function deleteAccountAndPositions[\s\S]*?\n}/)[0].includes("db.delete(associationMembers).where(eq(associationMembers.accountId, account.id))"));
});

test("a phone-only member is not counted, nor is any member whose answer does not count on the site", async () => {
  const bill = await federalBill("119-hr-assoc-5"), tx = await texasBill("tx-90-hb-assoc-5"), a = await association("Mixed Members");
  await crowd(25, bill, "support", a); // enough counted members that the bill is shown
  const phoneOnly = await reader(); await joinWith(phoneOnly, a.code); await vote(phoneOnly, bill, "oppose");
  const emailOnly = await reader({ phone: false }); await joinWith(emailOnly, a.code); await vote(emailOnly, bill, "oppose");
  const tooNew = await reader({ createdAt: NOW - 3600e3 }); await home(tooNew); await joinWith(tooNew, a.code); await vote(tooNew, bill, "oppose");
  const held = await reader(); await home(held); await joinWith(held, a.code); await vote(held, bill, "oppose"); await openHold(db, held.id, "household_cap", "addr:x", {}, T0);
  const flagged = await reader(); await home(flagged); await joinWith(flagged, a.code); await vote(flagged, bill, "oppose");
  await db.insert(schema.integrityFlags).values({ id: "flag-assoc-1", kind: "same_reason", subject: "r", status: "open", createdAt: T0 });
  await db.insert(schema.flaggedPositions).values({ flagId: "flag-assoc-1", userId: flagged.userId, billId: bill });
  const earlier = await reader(); await home(earlier); await joinWith(earlier, a.code); await vote(earlier, bill, "oppose", T0 + 1, { counts: -1 }); // saved as a private position only
  const oklahoman = await reader(); await home(oklahoman, TULSA); await joinWith(oklahoman, a.code); await vote(oklahoman, tx, "oppose"); // outside the Texas bill's jurisdiction
  const verifiedByMail = await reader(); await home(verifiedByMail); await mail(verifiedByMail); await joinWith(verifiedByMail, a.code); await vote(verifiedByMail, bill, "unsure");
  assert.deepEqual(await totalsOf(a, bill), { mail: { support: 0, oppose: 0, unsure: 1 }, address: { support: 25, oppose: 0, unsure: 0 } }, "none of the six Oppose answers is counted");
  assert.deepEqual(await totalsOf(a, tx), { mail: null, address: null }, "the Oklahoman is not counted on a Texas bill");
  // The new account counts once it is 24 hours old, exactly as on the site.
  assert.equal((await totalsOf(a, bill, NOW + DAY)).address.oppose, 1);
  // The pure rule gives the same answer from the same facts.
  assert.deepEqual(tallyMembers((await memberVoteFacts(db, a.id)).get(bill), FEDERAL, NOW), await totalsOf(a, bill));
});

test("the member total uses the site's own rule: when every voter on a bill is a member, it equals the site's total", async () => {
  // Every reader who answered the two bills of the test above is a member of "Mixed Members". So the facts read for
  // members must be the facts the site reads for the bill, and the totals must match the site's own.
  const a = (await associationsForEditor(db)).find(x => x.name === "Mixed Members");
  const facts = await memberVoteFacts(db, a.id), sort = rows => rows.map(r => JSON.stringify(r)).sort();
  for (const [bill, scope] of [["119-hr-assoc-5", "US"], ["tx-90-hb-assoc-5", "TX"]]) {
    assert.deepEqual(sort(facts.get(bill)), sort(await voteFacts(db, bill)), `${bill}: the same facts, answer for answer`);
    const site = await recomputeVoice(db, bill, NOW), mine = (await memberTotals(db, a.id, NOW)).get(bill);
    assert.deepEqual(mine, { mail: site.get(`${scope}|mail`) ?? null, address: site.get(`${scope}|address`) ?? null }, `${bill}: the same totals`);
  }
  // The counting itself is not written twice: the member tally calls voteCounts and nothing else decides.
  const src = read("lib/associations/rules.ts").match(/export function tallyMembers[\s\S]*?\n}/)[0];
  assert.match(src, /const c = voteCounts\(r, j, now\);\n    if \(!c\.counts\) continue;/);
});

test("one account is one voter on a bill, even if it answered from two devices", async () => {
  const bill = await federalBill("119-hr-assoc-6"), a = await association("Two Devices");
  await crowd(25, bill, "support", a);
  const r = await reader(); await home(r); await joinWith(r, a.code); await vote(r, bill, "support", T0 + 5);
  // The same account, signed in on a second device that has its own reader id: a second row for the same bill.
  await db.insert(schema.appUsers).values({ id: "user-second-device", kind: "public", externalKey: "k-second-device", createdAt: T0 });
  await castVote(db, { userId: "user-second-device", accountId: r.id, billKey: bill, answer: "oppose", reason: null, reasonHash: null, device: null, ipRange: null, now: T0 + 10 });
  assert.deepEqual(await totalsOf(a, bill), { mail: null, address: { support: 25, oppose: 1, unsure: 0 } }, "26 voters, and the later answer is the one read");
});

test("groups: mail-verified first, a group under 5 by size only, never a combined breakdown that would give it away", async () => {
  const bill = await federalBill("119-hr-assoc-7"), tx = await texasBill("tx-90-hb-assoc-7"), a = await association("Groups Society"), admin = await administrator(a, "sec@groups.example");
  const members = await crowd(22, bill, "support", a); await crowd(8, bill, "oppose", a);
  await crowd(3, bill, "unsure", a, { mailVerified: true });
  for (const r of members) await vote(r, tx, "oppose"); // 22 on the Texas bill: below 25, so it is not listed
  const view = await viewForAdmin(db, admin, NOW);
  assert.equal(view.rows.length, 1);
  const [row] = view.rows;
  assert.equal(row.voters, 33); assert.match(row.label, /^H\.R\. \d+$/); assert.equal(row.title, "A bill to test 119-hr-assoc-7"); assert.equal(row.url, "https://www.congress.gov/bill/119-hr-assoc-7");
  assert.deepEqual(row.groups.map(g => g.label), ["Mail-verified", "Address-matched"]);
  assert.deepEqual(rowLines(row), ["Mail-verified: fewer than 5 voters", "Address-matched, 30 voters: 22 support · 8 oppose · 0 unsure"]);
  assert.equal(row.groups[0].counts, null, "the three mail-verified answers are not passed on, only that there are fewer than 5");
  assert.equal(MIN_GROUP, 5);
  // The row has no total by answer for both groups together: subtracting the large group from it would show the small one.
  assert.deepEqual(Object.keys(row).sort(), ["billKey", "groups", "label", "title", "url", "voters"]);
  // With five mail-verified voters the group is shown, first.
  await crowd(2, bill, "support", a, { mailVerified: true });
  assert.deepEqual(rowLines((await viewForAdmin(db, admin, NOW)).rows[0]), ["Mail-verified, 5 voters: 2 support · 0 oppose · 3 unsure", "Address-matched, 30 voters: 22 support · 8 oppose · 0 unsure"]);
  // A Texas bill is labelled as one, with its page on the legislature's site.
  await crowd(3, tx, "support", a);
  const texas = (await viewForAdmin(db, admin, NOW)).rows.find(r => r.billKey === tx);
  assert.match(texas.label, /^Texas HB \d+$/); assert.equal(texas.url, `https://capitol.texas.gov/${tx}`); assert.equal(texas.voters, 25);
  assert.deepEqual((await viewForAdmin(db, admin, NOW)).rows.map(r => r.voters), [35, 25], "most voters first");
});

test("no person in what an association is given: no name, email, account, single answer or reason; no place below the whole membership", async () => {
  const a = (await associationsForEditor(db)).find(x => x.name === "Groups Society");
  const [admin] = a.admins;
  const r = await reader(); await home(r); await joinAssociation(db, { accountId: r.id, joinCodeHash: (await db.select().from(schema.associations).where(eq(schema.associations.id, a.id)).get()).joinCodeHash, now: T0 });
  await castVote(db, { userId: r.userId, accountId: r.id, billKey: "119-hr-assoc-7", answer: "oppose", reason: "A private reason nobody else may read.", reasonHash: "rh", device: "dev", ipRange: "ip", now: T0 + 1 });
  const view = await viewForAdmin(db, admin.id, NOW), text = JSON.stringify(view), csv = totalsCsv(view.rows);
  for (const out of [text, csv]) {
    assert.doesNotMatch(out, /acct-|user-|@example\.test|private reason|TX-37|TX-SD|TX-HD|\bAustin\b/i);
    assert.doesNotMatch(out, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, "no id of any kind");
  }
  assert.deepEqual(Object.keys(view).sort(), ["members", "name", "rows"]);
  for (const g of view.rows.flatMap(x => x.groups)) assert.deepEqual(Object.keys(g).sort(), ["counts", "label", "tier", "voters"]);
  // The functions an association's page can reach return nothing about a member. The store has no function that lists members,
  // and the columns that could name one (email, reason, device) are never read from a reader's rows.
  const store = read("lib/associations/store.ts");
  assert.doesNotMatch(store, /readerAccounts|voiceVotes\.reason|voiceVotes\.device|voiceVotes\.ipRange|reason_hash|a\.email/);
  assert.deepEqual([...store.matchAll(/select\(\{[^}]*accountId: associationMembers\.accountId/g)], [], "no query hands back a member's account");
  // The page and the file take the association from the signed-in administrator, never from the address.
  const page = read("app/association/page.tsx"), route = read("app/association/export/route.ts");
  assert.match(page, /searchParams: Promise<\{ m\?: string \}>/, "the page reads one thing from its address: which message to show");
  assert.match(page, /const view = admin \? await viewForAdmin\(getDb\(\), admin\.adminId\) : null;/);
  assert.match(route, /export async function GET\(\) \{/, "the file route reads nothing from the request");
  assert.match(route, /const view = admin \? await viewForAdmin\(getDb\(\), admin\.adminId\) : null;/);
  assert.match(page, /\{NOT_SCIENTIFIC\}/); assert.equal(NOT_SCIENTIFIC, "Not a scientific poll.");
  // The editor's list is the same: administrators' addresses (the editor typed them), and a member count only from 25.
  assert.equal(a.members, 38); assert.deepEqual(Object.keys(a).sort(), ["admins", "createdAt", "decidedAt", "id", "members", "name", "slug", "status"]);
  assert.equal((await associationsForEditor(db)).find(x => x.name === "Hash Test League").members, null, "fewer than 25: the editor gets no number either");
});

test("the file to download holds exactly what the page shows", async () => {
  const a = (await associationsForEditor(db)).find(x => x.name === "Groups Society");
  const view = await viewForAdmin(db, a.admins[0].id, NOW), lines = totalsCsv(view.rows).trimEnd().split("\r\n");
  assert.equal(lines[0], "bill,official_title,voters_on_this_bill,group,group_voters,support,oppose,unsure,note");
  assert.equal(lines.length - 1, view.rows.reduce((n, r) => n + r.groups.length, 0), "one line for each group of each bill shown, and no others");
  const cells = lines.slice(1).map(l => l.split(","));
  let i = 0;
  for (const r of view.rows) for (const g of r.groups) {
    const [bill, title, voters, group, groupVoters, support, oppose, unsure, note] = cells[i++];
    assert.deepEqual([bill, title, voters, group, note], [r.label, r.title, String(r.voters), g.label, "Not a scientific poll."]);
    // Rebuilding the page's line from the file's cells gives the page's line.
    const rebuilt = groupVoters === "fewer than 5" ? `${group}: fewer than 5 voters` : `${group}, ${groupVoters} voters: ${support} support · ${oppose} oppose · ${unsure} unsure`;
    assert.equal(rebuilt, groupLine(g));
    if (!g.counts) assert.deepEqual([support, oppose, unsure], ["", "", ""], "a group under 5 has no answers in the file");
  }
  // A small group, a title with a comma or a quote, and a title a spreadsheet would run as a formula.
  const odd = viewRows(new Map([["b1", { mail: { support: 1, oppose: 1, unsure: 1 }, address: { support: 20, oppose: 9, unsure: 1 } }], ["b2", { mail: null, address: { support: 10, oppose: 10, unsure: 4 } }]]),
    new Map([["b1", { label: "H.R. 1", title: '=HYPERLINK("x"), a "bill"', url: null }]]));
  assert.deepEqual(odd.map(r => r.billKey), ["b1"], "b2 has 24 voters and is not in the list");
  assert.equal(totalsCsv(odd).split("\r\n")[1], 'H.R. 1,"\'=HYPERLINK(""x""), a ""bill""",33,Mail-verified,fewer than 5,,,,Not a scientific poll.');
  // The route writes that file and nothing else.
  assert.match(read("app/association/export/route.ts"), /return new NextResponse\(totalsCsv\(view\.rows\), /);
});

/* ───────────────────────────── Administrators ───────────────────────────── */

test("an administrator of one association cannot open another's view", async () => {
  const bill = await federalBill("119-hr-assoc-8"), red = await association("Red Rose Society"), blue = await association("Blue Bonnet League");
  await crowd(25, bill, "support", red); await crowd(30, bill, "oppose", blue);
  const redAdmin = await administrator(red, "ana@redrose.example"), blueAdmin = await administrator(blue, "ben@bluebonnet.example");
  const redView = await viewForAdmin(db, redAdmin, NOW), blueView = await viewForAdmin(db, blueAdmin, NOW);
  assert.equal(redView.name, "Red Rose Society"); assert.deepEqual(rowLines(redView.rows[0]), ["Address-matched, 25 voters: 25 support · 0 oppose · 0 unsure"]);
  assert.equal(blueView.name, "Blue Bonnet League"); assert.deepEqual(rowLines(blueView.rows[0]), ["Address-matched, 30 voters: 0 support · 30 oppose · 0 unsure"]);
  // The view is found from the administrator's own row. It takes no association, so there is nothing to swap.
  assert.equal(viewForAdmin.length, 2, "viewForAdmin(db, adminId): no association is passed in");
  assert.deepEqual(await adminSession(db, redAdmin), { adminId: redAdmin, associationId: red.id, associationName: "Red Rose Society" });
  // An address is an administrator only where the editor listed it.
  assert.deepEqual((await adminsForEmail(db, await adminEmailHash("ana@redrose.example"))).map(x => x.associationName), ["Red Rose Society"]);
  assert.deepEqual(await adminsForEmail(db, await adminEmailHash("stranger@elsewhere.example")), []);
  assert.equal(await adminEmailHash(" ANA@RedRose.example "), await adminEmailHash("ana@redrose.example"));
  // Someone who is not an administrator, an association's id used as if it were one, a reader's account id: nothing.
  for (const id of [red.id, blue.id, "acct-1", "", "nobody"]) { assert.equal(await adminSession(db, id), null); assert.equal(await viewForAdmin(db, id, NOW), null); }
  // The same address listed for both sees each only through that association's own row and link.
  assert.equal(await addAdmin(db, { associationId: blue.id, email: "ana@redrose.example", emailHash: await adminEmailHash("ana@redrose.example"), now: T0 }), true);
  assert.equal(await addAdmin(db, { associationId: blue.id, email: "ana@redrose.example", emailHash: await adminEmailHash("ana@redrose.example"), now: T0 }), false, "not listed twice");
  const rows = await adminsForEmail(db, await adminEmailHash("ana@redrose.example"));
  assert.deepEqual(rows.map(x => x.associationName).sort(), ["Blue Bonnet League", "Red Rose Society"]);
  const anaBlue = rows.find(x => x.associationName === "Blue Bonnet League").adminId;
  assert.equal(await adminSession(db, anaBlue), null, "listed, but no link used yet for this association: not signed in to it");
  // Taken off the list: out on the next request, and the address is no longer stored.
  await removeAdmin(db, redAdmin);
  assert.equal(await adminSession(db, redAdmin), null); assert.equal(await viewForAdmin(db, redAdmin, NOW), null);
  assert.deepEqual((await adminsForEmail(db, await adminEmailHash("ana@redrose.example"))).map(x => x.associationName), ["Blue Bonnet League"]);
  assert.equal((await db.select().from(schema.associationAdmins).where(eq(schema.associationAdmins.id, redAdmin))).length, 0);
  // The session is read again on every request, and its cookie is good for this page only.
  const session = read("lib/associations/session.ts");
  assert.match(session, /return v \? await adminSession\(getDb\(\), v\.subject\) : null;/);
  assert.match(session, /verifyAction\(key\(\), "association", /); assert.match(session, /path: "\/association"/);
  assert.doesNotMatch(session, /READER_COOKIE|"reader"|"magic-link"/, "separate from reader sign-in");
});

test("the sign-in link works once, for 30 minutes, and only for an association that is open", async () => {
  const a = await association("Link Lodge"), email = "keys@linklodge.example", hash = await adminEmailHash(email);
  assert.equal(await addAdmin(db, { associationId: a.id, email, emailHash: hash, now: T0 }), true);
  const [{ adminId }] = await adminsForEmail(db, hash);
  assert.equal(await adminSession(db, adminId), null, "being listed is not being signed in");
  assert.equal(rules.ASSOC_LINK_TTL_MS, 30 * 60 * 1000);
  // Once.
  const first = await issueAccessLink(db, adminId, T0);
  assert.equal(await redeemAccessLink(db, first, T0 + 60e3), adminId);
  assert.equal(await redeemAccessLink(db, first, T0 + 61e3), null, "the second tap gets nothing");
  const admin = await db.select().from(schema.associationAdmins).where(eq(schema.associationAdmins.id, adminId)).get();
  assert.equal(admin.status, "active"); assert.equal(admin.verifiedAt, T0 + 60e3);
  // Two taps at the same moment: one gets in.
  const racing = await issueAccessLink(db, adminId, T0);
  assert.deepEqual((await Promise.all([redeemAccessLink(db, racing, T0 + 5), redeemAccessLink(db, racing, T0 + 5)])).filter(Boolean), [adminId]);
  // Thirty minutes.
  const late = await issueAccessLink(db, adminId, T0);
  assert.equal(await redeemAccessLink(db, late, T0 + 30 * 60e3 + 1), null, "a minute late is too late");
  const onTime = await issueAccessLink(db, adminId, T0);
  assert.equal(await redeemAccessLink(db, onTime, T0 + 30 * 60e3), adminId);
  // A made-up link, and a link of the other kind (an office's) with the same subject.
  assert.equal(await redeemAccessLink(db, crypto.randomUUID(), T0), null);
  await db.insert(schema.accessLinks).values({ nonce: "office-nonce", kind: "office", subjectId: adminId, createdAt: T0, expiresAt: T0 + 30 * 60e3 });
  assert.equal(await redeemAccessLink(db, "office-nonce", T0 + 1), null);
  assert.equal((await db.select().from(schema.accessLinks).where(eq(schema.accessLinks.nonce, "office-nonce")).get()).usedAt, null, "and it is left untouched for the office");
  // Asking for a new link clears this administrator's used and expired ones.
  await issueAccessLink(db, adminId, T0 + DAY);
  assert.equal((await db.select().from(schema.accessLinks).where(and(eq(schema.accessLinks.kind, "association"), eq(schema.accessLinks.subjectId, adminId)))).length, 1);
  // Not open yet, or closed: no link is made, a link already sent does not work, and a session stops.
  const pending = await association("Pending Lodge", { open: false });
  await addAdmin(db, { associationId: pending.id, email, emailHash: hash, now: T0 });
  assert.deepEqual((await adminsForEmail(db, hash)).map(x => x.associationName), ["Link Lodge"]);
  const sent = await issueAccessLink(db, adminId, NOW);
  assert.equal(await setAssociationStatus(db, a.id, "closed", NOW), true);
  assert.equal(await redeemAccessLink(db, sent, NOW + 1), null);
  assert.equal(await adminSession(db, adminId), null); assert.equal(await viewForAdmin(db, adminId, NOW), null);
  assert.deepEqual(await adminsForEmail(db, hash), []);
  // The link in the email only opens a page with a button: it is used on the tap, so a mail program that opens links cannot spend it.
  assert.match(read("app/association/open/page.tsx"), /<form action=\{openLink\}/); assert.doesNotMatch(read("app/association/open/page.tsx"), /redeem/);
});

test("closing an association removes every membership, and it cannot be reopened or joined", async () => {
  const bill = await federalBill("119-hr-assoc-9"), a = await association("Closing Guild"), admin = await administrator(a, "last@closing.example");
  const members = await crowd(25, bill, "support", a);
  assert.equal((await viewForAdmin(db, admin, NOW)).rows.length, 1);
  assert.equal(await setAssociationStatus(db, a.id, "closed", NOW), true);
  assert.equal((await db.select().from(schema.associationMembers).where(eq(schema.associationMembers.associationId, a.id))).length, 0);
  assert.deepEqual(await membershipsOf(db, members[0].id), []);
  assert.deepEqual(await joinWith(await reader(), a.code), { ok: false, why: "not_open" });
  assert.equal(await setAssociationStatus(db, a.id, "active", NOW), false);
  assert.equal(await replaceJoinCode(db, a.id, (await newJoinCode()).hash), false);
  assert.equal(await addAdmin(db, { associationId: a.id, email: "new@closing.example", emailHash: await adminEmailHash("new@closing.example"), now: NOW }), false);
  assert.equal(sum(await totalsOf(a, bill)), 0);
  assert.equal((await recomputeVoice(db, bill, NOW)).get("US|address").support, 25, "the members' answers are untouched on the site");
});

/* ───────────────────────────── Words, limits, the privacy page ───────────────────────────── */

test("asking for a sign-in link says the same thing for every address, and is limited", () => {
  const session = read("lib/associations/session.ts"), body = session.match(/export async function requestAssociationLink[\s\S]*?\n}/)[0];
  // Three answers only: not an email address, too many requests, or the one sentence that names no one.
  assert.deepEqual([...body.matchAll(/message: ([A-Z_]+)\b/g)].map(m => m[1]), ["LINK_BAD_EMAIL", "LINK_REQUESTED", "LINK_TOO_MANY", "LINK_REQUESTED"]);
  assert.match(rules.LINK_REQUESTED, /^If that address is listed as an administrator/);
  // The limits come before the list is looked at, and the list is looked at only after the answer has gone.
  assert.ok(body.indexOf("withinLimit(") < body.indexOf("after(async") && body.indexOf("after(async") < body.indexOf("adminsForEmail("));
  assert.match(body, /withinLimit\("assoc_link_ip_hour", ctx\.ipRange\)/); assert.match(body, /withinLimit\("assoc_link_email_hour", emailHash\)/);
  assert.deepEqual(LIMITS.assoc_link_ip_hour, { max: 10, windowMs: 3600e3 }); assert.deepEqual(LIMITS.assoc_link_email_hour, { max: 3, windowMs: 3600e3 });
  // Tries at a join code are limited per reader account, before the code is looked at.
  const joinSrc = read("app/association/member-actions.ts");
  assert.ok(joinSrc.indexOf('withinLimit("assoc_join_account_day", a.id)') > 0 && joinSrc.indexOf('withinLimit("assoc_join_account_day", a.id)') < joinSrc.indexOf("joinCodeHash(formData"));
  assert.deepEqual(LIMITS.assoc_join_account_day, { max: 10, windowMs: 86400e3 });
  // The email: the same words for every association but its name, and the label that is on every total.
  const mail = signInEmail("Red Rose Society", "https://site.example/association/open?t=x"), other = signInEmail("Blue Bonnet League", "https://site.example/association/open?t=x");
  assert.equal(mail.text.replaceAll("Red Rose Society", "N"), other.text.replaceAll("Blue Bonnet League", "N"));
  assert.match(mail.text, /works once, for 30 minutes/); assert.match(mail.text, /Not a scientific poll\.$/); assert.match(mail.text, /\nhttps:\/\/site\.example\/association\/open\?t=x\n/);
});

test("words a person reads: address-matched is never called verified, nothing is for sale, and the product is not named", () => {
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const files = ["lib/associations/rules.ts", "lib/associations/store.ts", "lib/associations/codes.ts", "lib/associations/session.ts", "app/association/page.tsx", "app/association/open/page.tsx", "app/association/actions.ts",
    "app/association/member-actions.ts", "app/association/export/route.ts", "app/editor/associations/page.tsx", "app/editor/associations/actions.ts", "components/associations/account-block.tsx",
    "components/associations/member-forms.tsx", "components/associations/editor-forms.tsx"];
  for (const f of files) {
    const text = strip(read(f));
    assert.doesNotMatch(text, /(?<!mail-)\bverified\b/i, `${f}: "verified" appears only in "mail-verified"`);
    assert.doesNotMatch(text, /\b(price|paid|pay|premium|upgrade|subscription|plan)\b/i, `${f}: no payment or plan language`);
    assert.doesNotMatch(text, /\b(republican|democrat|party|gop)\b/i, `${f}: no branch or word that depends on a party`);
    assert.doesNotMatch(text, /\b(score|grade|rating)\b/i, `${f}: no grade or score`);
  }
  for (const [k, v] of Object.entries(rules)) if (typeof v === "string") assert.doesNotMatch(v, /(?<!mail-)\bverified\b/i, k);
  for (const s of [rules.joinedMessage("X"), rules.alreadyMessage("X"), rules.leftMessage("X"), memberCountLine(30), memberCountLine(null), signInEmail("X", "l").text]) assert.doesNotMatch(s, /(?<!mail-)\bverified\b/i);
  assert.match(rules.WHAT_AN_ASSOCIATION_SEES, /address-matched or mail-verified/); assert.match(rules.WHAT_IS_COUNTED, /counted member/);
  assert.match(rules.WHAT_AN_ASSOCIATION_SEES, /never shown your name, your email, whether you joined, or your own answer/);
  assert.equal(memberCountLine(24), "Fewer than 25 members have joined so far."); assert.equal(memberCountLine(25), "25 members have joined.");
});

test("the privacy page says what is stored for associations, and the code does what it says", () => {
  const member = STORED.find(s => s.what === "Associations you join"), admin = STORED.find(s => s.what === "Association administrators");
  assert.equal(member.when, "optional"); assert.equal(admin.when, "optional");
  // A membership is two facts: the account and the date.
  const table = read("db/schema.ts").match(/export const associationMembers = sqliteTable[\s\S]*?\]\);/)[0];
  assert.deepEqual([...table.matchAll(/(?:text|integer)\("([a-z_]+)"/g)].map(m => m[1]), ["association_id", "account_id", "joined_at"]);
  assert.match(member.detail, /that your account is a member, and the date you joined/); assert.match(member.detail, /from 25 of them/);
  assert.match(member.detail, /Leaving removes the record at once, and so does deleting your account or the association closing/);
  assert.match(member.detail, /The join code is not stored, only a scrambled form of it/);
  const store = read("lib/associations/store.ts");
  assert.match(store, /export async function leaveAssociation[\s\S]*?db\.delete\(associationMembers\)/);
  assert.match(store, /if \(to === "closed"\) \{\n    await db\.delete\(associationMembers\)/);
  // An administrator: the address, the links, the first sign-in; all gone when taken off the list.
  assert.match(admin.detail, /your email address, kept to send your sign-in link, the sign-in links you asked for, and the date you first signed in/);
  assert.match(store, /export async function removeAdmin[\s\S]*?db\.delete\(accessLinks\)[\s\S]*?db\.delete\(associationAdmins\)/);
  // The cookie and how long it lasts.
  const cookie = COOKIES.find(c => c.name === "or_assoc");
  assert.match(read("lib/associations/session.ts"), /export const ASSOC_COOKIE = "or_assoc";/);
  assert.match(read("lib/associations/rules.ts"), /ASSOC_SESSION_MS = 7 \* 24 \* 3600 \* 1000/); assert.equal(cookie.lasts, "7 days");
  assert.match(cookie.purpose, /Not set for anyone else/);
  // No new outside service: the only thing sent anywhere is the sign-in email, through the site's existing mailer.
  for (const f of ["lib/associations/rules.ts", "lib/associations/store.ts", "lib/associations/codes.ts", "lib/associations/session.ts"]) assert.doesNotMatch(read(f).replace(/https:\/\/on-record-wrotenberry\.vercel\.app/, ""), /https?:\/\/|fetch\(/, `${f} calls no outside host`);
  assert.match(read("lib/associations/session.ts"), /await sendTo\(a\.email, mail\.subject, mail\.text\)/);
});
