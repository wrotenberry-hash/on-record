// Legislator office access (owner, 18 Nov 2026, point 7; docs/CONSTITUENT_VOICE.md). The rules in lib/office/domains.ts,
// lib/office/rules.ts and lib/office/email.ts, and the same database functions the site runs (lib/office/store.ts)
// against a temporary database built from the real migrations. Votes are cast and totals rebuilt with the site's own
// functions (lib/constituent/store.ts), so the office reads exactly what a bill page would show.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { MIN_GROUP, MIN_SHOWN, NOT_ENOUGH, NOT_ENOUGH_DISTRICT, NOT_SCIENTIFIC } from "../lib/constituent/rules.ts";
import { castVote, recomputeVoice } from "../lib/constituent/store.ts";
import { issueMailCode, redeemMailCode, setResidence } from "../lib/verify/residence-store.ts";
import { LIMITS } from "../lib/verify/rules.ts";
import { domainOf, matchDomain, OFFICE_DOMAINS, officeEmail, officeProof, senateSiteLabel, statusOnConfirm } from "../lib/office/domains.ts";
import { longDate, OFFICE_LINK_TTL_MS, OFFICE_SESSION_MS, officeCsv, officeView, parseCsv, trendWeeks, weekStart, weekVoters } from "../lib/office/rules.ts";
import { composeOfficeEmail, OFFICE_EMAIL_MAX_PER_RUN, officeEmailCap, officeEmailEnabled } from "../lib/office/email.ts";
import { decideOffice, memberOf, officeById, officeDashboard, officesForEditor, purgeOfficeData, redeemOfficeLink, requestOfficeAccess, sendOfficeEmails, setWeeklyEmail } from "../lib/office/store.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), DAY = 86400e3, MIN = 60e3;
const read = f => readFileSync(join(ROOT, f), "utf8");
const dir = mkdtempSync(join(tmpdir(), "office-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
after(() => { client.close(); rmSync(dir, { recursive: true, force: true }); });

// Friday 20 November 2026, 15:00 UTC. The week starts Monday 16 November.
const NOW = Date.UTC(2026, 10, 20, 15);
const AUSTIN = { congressional: "TX-37", state: "TX", stateUpper: "TX-SD-14", stateLower: "TX-HD-49" };
const HOUSTON = { congressional: "TX-07", state: "TX", stateUpper: "TX-SD-15", stateLower: "TX-HD-134" };
const TULSA = { congressional: "OK-01", state: "OK", stateUpper: "OK-SD-35", stateLower: "OK-HD-71" };
const SRC = "https://example.test/", GOT = { sourceUrl: SRC, retrievedAt: NOW };
let seq = 0;

/* ───────────────────────────── The official record the tests stand on ───────────────────────────── */

// Members of two parties in every chamber. No test below passes a party to the office code: it never reads one.
await db.insert(schema.officialPoliticians).values([
  { id: "H000037", fullName: "Avery Stone", firstName: "Avery", lastName: "Stone", party: "Democratic", state: "TX", district: 37, chamber: "house", officialUrl: "https://stone.house.gov", ...GOT },
  { id: "H000007", fullName: "Blake Marsh", firstName: "Blake", lastName: "Marsh", party: "Republican", state: "TX", district: 7, chamber: "house", officialUrl: "https://marsh.house.gov", ...GOT },
  { id: "H000099", fullName: "Former Member", firstName: "Former", lastName: "Member", party: "Republican", state: "TX", district: 37, chamber: "house", isCurrent: 0, ...GOT },
  { id: "S000001", fullName: "Casey Field", firstName: "Casey", lastName: "Field", party: "Republican", state: "TX", district: null, chamber: "senate", officialUrl: "https://www.field.senate.gov/", ...GOT },
  { id: "S000002", fullName: "Devon Hale", firstName: "Devon", lastName: "Hale", party: "Democratic", state: "TX", district: null, chamber: "senate", officialUrl: "https://www.hale.senate.gov", ...GOT },
  { id: "S000003", fullName: "Emery Lake", firstName: "Emery", lastName: "Lake", party: "Republican", state: "OK", district: null, chamber: "senate", officialUrl: "https://www.lake.senate.gov", ...GOT },
]);
await db.insert(schema.txPeople).values([
  { id: "ocd-person/sd14", name: "Finley Ward", party: "Democratic", chamber: "upper", district: "14", ...GOT },
  { id: "ocd-person/hd49", name: "Dana Lee", party: "Democratic", chamber: "lower", district: "49", ...GOT },
  { id: "ocd-person/hd134", name: "Gray Cole", party: "Republican", chamber: "lower", district: "134", ...GOT },
]);
// The member's own official address, as the Texas member list gives it (stored in mixed case on purpose).
await db.insert(schema.legislatorContacts).values({ id: "texas:ocd-person/hd49", kind: "texas", memberId: "ocd-person/hd49", email: "Dana.Lee@house.texas.gov", ...GOT });
await db.insert(schema.issueCategories).values([{ slug: "health-care", name: "Health care", sortOrder: 1 }, { slug: "taxes", name: "Taxes", sortOrder: 2 }, { slug: "education", name: "Education", sortOrder: 3 }]);

const F1 = "119-hr-9001", F2 = "119-hr-9002", F3 = "119-hr-9003", F4 = "119-s-9004", T1 = "tx-90-hb9001", T2 = "tx-90-hb9002";
await db.insert(schema.officialBills).values([[F1, "hr", 9001, "A bill to lower the cost of insulin."], [F2, "hr", 9002, "A bill to fund school meals."], [F3, "hr", 9003, "A bill to change the child tax credit."], [F4, "s", 9004, "A bill about rural hospitals."]]
  .map(([id, billType, number, title]) => ({ id, congress: 119, billType, number, title, congressUrl: "https://www.congress.gov/", ...GOT })));
await db.insert(schema.billCategories).values([[F1, "health-care"], [F2, "education"], [F3, "taxes"], [F3, "health-care"]].map(([billId, categorySlug]) => ({ billId, categorySlug, method: "mapping", createdAt: NOW })));
await db.insert(schema.officialFloorSchedule).values([
  { chamber: "house", weekOf: "20261116", label: "H.R. 9001", billId: F1, ...GOT }, { chamber: "senate", weekOf: "20261116", label: "S. 9004", billId: F4, ...GOT },
  { chamber: "house", weekOf: "20261109", label: "H.R. 9003", billId: F3, ...GOT }, // last week's schedule: not "coming up"
]);
const rollCall = (id, at, question, billId, votes) => db.insert(schema.officialRollCalls).values({ id, chamber: "house", congress: 119, session: 2, rollNumber: ++seq, votedAt: at, question, billId, ...GOT })
  .then(() => db.insert(schema.officialMemberVotes).values(Object.entries(votes).map(([politicianId, position]) => ({ rollCallId: id, politicianId, position, rawPosition: position }))));
await rollCall("house-2026-901", NOW - 5 * DAY, "On Passage", F2, { H000037: "Yea", H000007: "Nay" });
await rollCall("house-2026-902", NOW - 3 * DAY, "On Motion to Recommit", F1, { H000037: "Nay", H000007: "Yea" });
await rollCall("house-2026-800", NOW - 200 * DAY, "On Passage", F3, { H000037: "Yea", H000007: "Yea" });
await db.insert(schema.txBills).values([[T1, "HB 9001", ["Education", "Taxation"]], [T2, "HB 9002", ["Education"]]].map(([id, identifier, subjects]) => ({ id, session: "90", identifier, title: `Relating to a test (${identifier}).`, chamber: "lower",
  classification: ["bill"], subjects, stage: "committee", latestActionDate: "2026-10-01", latestActionDescription: "Referred to Public Education", tloUrl: "https://capitol.texas.gov/", feed: "openstates", ...GOT })));
await db.insert(schema.txEvents).values({ id: "ocd-event/901", name: "House Public Education: public hearing", start: "2026-12-01T09:00:00-06:00", bills: ["HB 9001"], retrievedAt: NOW });
await db.insert(schema.txVotes).values({ id: "ocd-vote/902", billId: T2, motion: "Passed to engrossment", date: "2026-11-16", result: "pass", chamber: "lower", counts: { yes: 80, no: 60 }, tallyOk: 1, retrievedAt: NOW });
await db.insert(schema.txMemberVotes).values([{ voteId: "ocd-vote/902", personId: "ocd-person/hd49", name: "Lee", option: "yes" }, { voteId: "ocd-vote/902", personId: "ocd-person/hd134", name: "Cole", option: "no" }]);

/* ───────────────────────────── Residents and their answers ───────────────────────────── */

/** An address-matched resident of `districts` (`mail`: mail-verified too). The account is two months old. */
async function resident(districts, { mail = false, phone = true } = {}) {
  const n = ++seq, userId = `user-${n}`, id = `acct-${n}`, createdAt = NOW - 60 * DAY;
  await db.insert(schema.appUsers).values({ id: userId, kind: "public", externalKey: `k-${n}`, createdAt });
  await db.insert(schema.readerAccounts).values({ id, appUserId: userId, emailHash: `e-${n}`, email: `resident${n}@example.test`, createdAt, verifiedAt: createdAt });
  await db.insert(schema.verificationProfiles).values({ accountId: id, tier: 2, signupChallengeAt: createdAt, phoneHash: phone ? `phone-${n}` : null, phoneVerifiedAt: phone ? createdAt : null, createdAt, updatedAt: createdAt });
  const res = await setResidence(db, { accountId: id, addressKey: `addr:${n}`, buildingKey: `bldg:${n}`, hasUnit: false, districts, device: null, ipRange: null, voteSoon: { federal: false, state: false }, now: createdAt + DAY });
  assert.equal(res.ok, true);
  if (mail) { await issueMailCode(db, { accountId: id, codeHash: `code-${n}`, now: createdAt + DAY }); assert.equal((await redeemMailCode(db, { accountId: id, codeHash: `code-${n}`, now: createdAt + 2 * DAY })).ok, true); }
  return { id, userId };
}
const answer = (r, billKey, a, at, reason = null) => castVote(db, { userId: r.userId, accountId: r.id, billKey, answer: a, reason, reasonHash: null, device: null, ipRange: null, now: at });
/** `plan`: [[resident, answer, when], …]. Then the totals are rebuilt, as the site does after each answer. */
async function answers(billKey, plan) { for (const [r, a, at] of plan) await answer(r, billKey, a, at); await recomputeVoice(db, billKey, NOW); }
const spread = (people, counts) => { const out = []; let i = 0; for (const [a, n] of Object.entries(counts)) for (let k = 0; k < n; k++) out.push([people[i++], a]); assert.equal(i, people.length); return out; };

// Austin (TX-37, TX-SD-14, TX-HD-49): 6 mail-verified residents (0–5) and 25 address-matched (6–30). Houston (TX-07): 30.
const austin = []; for (let i = 0; i < 31; i++) austin.push(await resident(AUSTIN, { mail: i < 6 }));
const houston = []; for (let i = 0; i < 30; i++) houston.push(await resident(HOUSTON));
const wk = { now: NOW - 2 * DAY, last: NOW - 8 * DAY, nov2: NOW - 15 * DAY, oct19: NOW - 29 * DAY, oct26: NOW - 22 * DAY };
assert.deepEqual([wk.now, wk.last, wk.nov2, wk.oct26, wk.oct19].map(weekStart), ["2026-11-16", "2026-11-09", "2026-11-02", "2026-10-26", "2026-10-19"]);

// F1 (on the House floor schedule): Austin 26 = mail 4/1/1 + address-matched 12/7/1; Houston 30 = 5 support, 25 oppose.
await answers(F1, [...spread(austin.slice(0, 6), { support: 4, oppose: 1, unsure: 1 }), ...spread(austin.slice(6, 26), { support: 12, oppose: 7, unsure: 1 })].map(([r, a], i) => [r, a, i < 20 ? wk.last : wk.now])
  .concat(spread(houston, { support: 5, oppose: 25 }).map(([r, a]) => [r, a, wk.last])));
// F2 (the member voted on it five days ago): Austin 24, one short of the line. Each carries a private reason.
for (const [r, a] of spread(austin.slice(6, 30), { support: 10, oppose: 10, unsure: 4 })) await answer(r, F2, a, wk.oct26, "MY PRIVATE REASON about school meals");
await recomputeVoice(db, F2, NOW);
// F3 (no schedule, an old vote): Austin 27 = 2 mail-verified + 25 address-matched, given over three different weeks.
await answers(F3, [...spread(austin.slice(0, 2), { support: 1, oppose: 1 }), ...spread(austin.slice(6, 31), { support: 15, oppose: 8, unsure: 2 })].map(([r, a], i) => [r, a, i < 3 ? wk.now : i === 26 ? wk.oct19 : wk.nov2]));
// T1 (a Texas bill with a hearing set): Austin 26. T2 (a Texas bill the member voted on): Austin 3.
await answers(T1, [...spread(austin.slice(0, 6), { support: 2, oppose: 3, unsure: 1 }), ...spread(austin.slice(6, 26), { support: 9, oppose: 10, unsure: 1 })].map(([r, a]) => [r, a, wk.last]));
await answers(T2, spread(austin.slice(0, 3), { support: 3 }).map(([r, a]) => [r, a, wk.last]));

const member = async key => { const m = await memberOf(db, key); assert.ok(m, key); return m; };
const board = async (key, now = NOW) => officeDashboard(db, await member(key), now);
const tableOf = (view, id) => view.tables.find(t => t.id === id);
const hash = email => `h:${email}`;
const ask = (email, pickedMemberKey = null, now = NOW) => requestOfficeAccess(db, { email, emailHash: hash(email.trim().toLowerCase()), pickedMemberKey, now });
/** Asks for a link and uses it, as a person who can open that mailbox would. */
async function signIn(email, picked = null, now = NOW) {
  const r = await ask(email, picked, now);
  assert.equal(r.ok, true, `${email}: ${JSON.stringify(r).slice(0, 120)}`);
  return redeemOfficeLink(db, { nonce: r.send.nonce, memberKey: r.send.memberKey, now: now + MIN });
}

/* ───────────────────────────── 1. Who may sign in ───────────────────────────── */

test("an address on a domain that is not on the list is refused, and nothing about it is stored", async () => {
  const refused = ["someone@gmail.com", "staff@house.gov", "staff@www.house.gov", "staff@mail.house.gov.example.com", "staff@x.mail.house.gov", "staff@notsenate.gov", "staff@senate.gov.example.com",
    "staff@www.senate.gov", "staff@a.b.senate.gov", "staff@texas.gov", "staff@capitol.texas.gov", "staff@house.texas.gov.example.com", "staff@senate.texas.gov.co", "staff@mail.house.gov@gmail.com", "staff@state.tx.us"];
  for (const e of refused) {
    const email = officeEmail(e);
    assert.equal(email ? matchDomain(domainOf(email)) : null, null, e);
    const r = await ask(e, "fed:H000037");
    assert.equal(r.ok, false, e); assert.ok(["domain_not_allowed", "bad_email"].includes(r.reason), `${e}: ${r.reason}`);
  }
  for (const e of ["", "no-at-sign", "a@b", "two words@mail.house.gov", "<x>@mail.house.gov"]) assert.equal((await ask(e)).reason, "bad_email", e);
  assert.equal((await db.select().from(schema.officeAccounts)).length, 0, "no account row for a refused address");
  assert.equal((await db.select().from(schema.accessLinks)).length, 0, "no link for a refused address");
  // The accepted ones, exactly.
  assert.deepEqual(matchDomain("mail.house.gov"), { ruleId: "us-house", senateLabel: null });
  assert.deepEqual(matchDomain("field.senate.gov"), { ruleId: "us-senate", senateLabel: "field" });
  assert.deepEqual(matchDomain("senate.gov"), { ruleId: "us-senate", senateLabel: null });
  assert.deepEqual(matchDomain("senate.texas.gov"), { ruleId: "tx-senate", senateLabel: null });
  assert.deepEqual(matchDomain("HOUSE.texas.gov"), { ruleId: "tx-house", senateLabel: null });
  assert.equal(officeEmail("  Jane.Doe@Mail.House.Gov "), "jane.doe@mail.house.gov");
});

test("the list of domains is one list a person can read, and each entry says what it proves", () => {
  assert.deepEqual(OFFICE_DOMAINS.map(d => d.id), ["us-senate-office", "us-senate", "us-house", "tx-senate", "tx-house"]);
  for (const d of OFFICE_DOMAINS) {
    assert.ok(d.proves.length > 40 && d.then.length > 20, d.id);
    assert.equal(d.namesOffice, d.doesNotProve === "", `${d.id}: an entry either names the office or says what it does not prove`);
  }
  assert.deepEqual(OFFICE_DOMAINS.filter(d => d.namesOffice).map(d => d.id), ["us-senate-office"], "only a senator's own office domain names the office by itself");
  // The page for offices prints this list; it does not keep a second one.
  assert.match(read("app/office/page.tsx"), /OFFICE_DOMAINS\.map\(/);
  assert.doesNotMatch(read("lib/office/domains.ts"), /^import /m, "the list is pure: no imports");
  assert.equal(senateSiteLabel("https://www.field.senate.gov/contact"), "field"); assert.equal(senateSiteLabel("https://www.senate.gov/"), null); assert.equal(senateSiteLabel("https://stone.house.gov"), null);
});

test("what each address proves: a senator's own office domain opens that state; every other address waits for the editor", async () => {
  // A Senate address whose name is a sitting senator's own website: that senator's office, no choice offered, no review.
  const field = await signIn("jo_smith@field.senate.gov", "fed:S000003"); // the choice is ignored: the address names the office
  assert.equal(field.status, "active"); assert.equal(field.memberKey, "fed:S000001"); assert.equal(field.level, "federal");
  assert.equal((await member(field.memberKey)).scope, "TX");
  // A committee's Senate address, and senate.gov itself: the Senate, but no senator. The person must choose; then review.
  for (const e of ["clerk@judiciary.senate.gov", "aide@senate.gov"]) {
    const first = await ask(e);
    assert.equal(first.reason, "pick_member"); assert.equal(first.rule.id, "us-senate");
    assert.deepEqual(first.options.map(o => o.key), ["fed:S000003", "fed:S000001", "fed:S000002"], "sitting senators only, by state then name");
    assert.equal((await ask(e, "fed:H000037")).reason, "pick_member", "a House member cannot be chosen with a Senate address");
    const a = await signIn(e, "fed:S000002");
    assert.equal(a.status, "review"); assert.equal(a.memberKey, "fed:S000002");
  }
  // mail.house.gov: the House, but not which member.
  const house = await ask("pat.jones@mail.house.gov");
  assert.equal(house.reason, "pick_member"); assert.equal(house.rule.id, "us-house");
  assert.deepEqual(house.options, [{ key: "fed:H000007", label: "Texas, district 7: Blake Marsh" }, { key: "fed:H000037", label: "Texas, district 37: Avery Stone" }], "sitting members only, no party in the label");
  assert.equal((await ask("pat.jones@mail.house.gov", "fed:H000099")).reason, "pick_member", "a former member cannot be chosen");
  assert.equal((await ask("pat.jones@mail.house.gov", "fed:S000001")).reason, "pick_member", "a senator cannot be chosen with a House address");
  const staff = await signIn("pat.jones@mail.house.gov", "fed:H000037");
  assert.equal(staff.status, "review"); assert.equal(staff.memberKey, "fed:H000037"); assert.ok(staff.emailVerifiedAt);
  // Texas: staff addresses are a person's own name, so they wait; the member's own official address on file does not.
  const txStaff = await signIn("sam.ortiz@house.texas.gov", "tx:ocd-person/hd49");
  assert.equal(txStaff.status, "review"); assert.equal(txStaff.level, "state");
  assert.equal((await ask("sam.ortiz@senate.texas.gov", "tx:ocd-person/hd49")).reason, "pick_member", "a House member cannot be chosen with a Senate address");
  const own = await signIn("dana.lee@house.texas.gov", "tx:ocd-person/hd134"); // the choice is ignored: this is the member's own address
  assert.equal(own.status, "active"); assert.equal(own.memberKey, "tx:ocd-person/hd49");
  // The rule itself.
  const unproven = officeProof({ ruleId: "us-house", senateLabel: null }, { senatorForLabel: null, memberForAddress: null });
  assert.deepEqual(unproven, { proven: false, ruleId: "us-house" });
  assert.equal(statusOnConfirm("fed:H000037", unproven), "review");
  assert.equal(statusOnConfirm("fed:S000001", officeProof({ ruleId: "us-senate", senateLabel: "field" }, { senatorForLabel: "fed:S000001", memberForAddress: null })), "active");
  assert.equal(statusOnConfirm("fed:S000002", officeProof({ ruleId: "us-senate", senateLabel: "field" }, { senatorForLabel: "fed:S000001", memberForAddress: null })), "review", "proof of one office never opens another");
});

test("the editor confirms an office that is waiting, can close one, and can let a closed one ask again", async () => {
  const waiting = (await officesForEditor(db)).filter(o => o.account.status === "review");
  assert.deepEqual(waiting.map(o => o.account.email).sort(), ["aide@senate.gov", "clerk@judiciary.senate.gov", "pat.jones@mail.house.gov", "sam.ortiz@house.texas.gov"]);
  const pat = waiting.find(o => o.account.email === "pat.jones@mail.house.gov");
  assert.equal(pat.member.name, "Avery Stone"); assert.deepEqual(pat.proof, { proven: false, ruleId: "us-house" });
  assert.equal(await decideOffice(db, { id: pat.account.id, decision: "confirm", by: "editor-1", now: NOW }), true);
  const confirmed = await officeById(db, pat.account.id);
  assert.equal(confirmed.status, "active"); assert.equal(confirmed.decidedBy, "editor-1");
  assert.equal(await decideOffice(db, { id: pat.account.id, decision: "confirm", by: "editor-1", now: NOW }), false, "only an account that is waiting can be confirmed");
  // An address that never used its link cannot be confirmed: nobody has shown the mailbox is theirs.
  const typed = await ask("never.clicked@mail.house.gov", "fed:H000007");
  const pending = await db.select().from(schema.officeAccounts).where(eq(schema.officeAccounts.emailHash, hash("never.clicked@mail.house.gov"))).get();
  assert.equal(pending.status, "pending"); assert.equal(pending.emailVerifiedAt, null);
  assert.equal(await decideOffice(db, { id: pending.id, decision: "confirm", by: "editor-1", now: NOW }), false);
  // Closing: the next link asked for is not sent, an unused link stops working, and the caller is told nothing different.
  assert.equal(await decideOffice(db, { id: pending.id, decision: "revoke", by: "editor-1", now: NOW }), true);
  assert.deepEqual(await ask("never.clicked@mail.house.gov", "fed:H000007"), { ok: true, send: null });
  assert.equal(await redeemOfficeLink(db, { nonce: typed.send.nonce, memberKey: typed.send.memberKey, now: NOW + MIN }), null);
  assert.equal(await decideOffice(db, { id: pending.id, decision: "reopen", by: "editor-1", now: NOW }), true);
  assert.equal((await signIn("never.clicked@mail.house.gov", "fed:H000007")).status, "review", "a reopened address goes through the same rule as a new one");
});

/* ───────────────────────────── 2. The link ───────────────────────────── */

test("the emailed link is single-use and expires after 30 minutes", async () => {
  assert.equal(OFFICE_LINK_TTL_MS, 30 * MIN); assert.equal(OFFICE_SESSION_MS, 30 * DAY);
  const a = await ask("jo_smith@field.senate.gov");
  assert.equal(a.send.expiresAt, NOW + 30 * MIN); assert.equal(a.send.to, "jo_smith@field.senate.gov");
  const row = await db.select().from(schema.accessLinks).where(eq(schema.accessLinks.nonce, a.send.nonce)).get();
  assert.equal(row.kind, "office"); assert.equal(row.usedAt, null);
  const first = await redeemOfficeLink(db, { nonce: a.send.nonce, memberKey: a.send.memberKey, now: NOW + 29 * MIN });
  assert.equal(first.status, "active");
  assert.equal(await redeemOfficeLink(db, { nonce: a.send.nonce, memberKey: a.send.memberKey, now: NOW + 29 * MIN + 1 }), null, "the same link a second time");
  const b = await ask("jo_smith@field.senate.gov");
  assert.equal(await redeemOfficeLink(db, { nonce: b.send.nonce, memberKey: b.send.memberKey, now: NOW + 30 * MIN + 1 }), null, "one millisecond past 30 minutes");
  assert.equal((await db.select().from(schema.accessLinks).where(eq(schema.accessLinks.nonce, b.send.nonce)).get()).usedAt, null, "an expired link is not marked used");
  assert.equal(await redeemOfficeLink(db, { nonce: "no-such-link", memberKey: null, now: NOW }), null);
  // Two people pressing the button at the same moment: one gets in.
  const c = await ask("jo_smith@field.senate.gov");
  const both = await Promise.all([1, 2].map(() => redeemOfficeLink(db, { nonce: c.send.nonce, memberKey: c.send.memberKey, now: NOW + MIN })));
  assert.equal(both.filter(Boolean).length, 1);
  // A link made for association administrators is not an office link.
  await db.insert(schema.accessLinks).values({ nonce: "assoc-1", kind: "association", subjectId: first.id, createdAt: NOW, expiresAt: NOW + 30 * MIN });
  assert.equal(await redeemOfficeLink(db, { nonce: "assoc-1", memberKey: null, now: NOW + MIN }), null);
  // The page the link opens does not use the link up: only the button (a form post) does.
  assert.match(read("app/office/verify/page.tsx"), /<form action=\{openOffice\}/);
  assert.doesNotMatch(read("app/office/verify/page.tsx"), /redeemOfficeLink/);
  assert.match(read("app/office/actions.ts"), /redeemOfficeLink\(getDb\(\), \{ nonce: link\.nonce, memberKey: link\.memberKey/);
});

test("which member a waiting office is for is set only by the person who opens the mailbox", async () => {
  // A stranger types a staff address and picks another member. The stranger's link is never used.
  const real = await signIn("lee.park@mail.house.gov", "fed:H000037");
  assert.equal(real.memberKey, "fed:H000037");
  const stranger = await ask("lee.park@mail.house.gov", "fed:H000007");
  assert.equal(stranger.ok, true);
  assert.equal((await officeById(db, real.id)).memberKey, "fed:H000037", "asking for a link changes nothing");
  // Once the editor has confirmed the office, a later link cannot move it to another member either.
  await decideOffice(db, { id: real.id, decision: "confirm", by: "editor-1", now: NOW });
  const moved = await redeemOfficeLink(db, { nonce: stranger.send.nonce, memberKey: "fed:H000007", now: NOW + MIN });
  assert.equal(moved.memberKey, "fed:H000037"); assert.equal(moved.status, "active");
});

test("an address that asks for a link and never uses it is deleted after a week; confirmed offices are kept", async () => {
  await ask("typo.person@senate.texas.gov", "tx:ocd-person/sd14", NOW - 8 * DAY);
  await ask("recent.person@senate.texas.gov", "tx:ocd-person/sd14", NOW - 6 * DAY);
  const before = (await db.select().from(schema.officeAccounts)).length;
  assert.equal(await purgeOfficeData(db, NOW), 1);
  const left = (await db.select({ email: schema.officeAccounts.email }).from(schema.officeAccounts)).map(r => r.email);
  assert.equal(left.length, before - 1); assert.ok(!left.includes("typo.person@senate.texas.gov")); assert.ok(left.includes("recent.person@senate.texas.gov"));
  assert.ok(left.includes("pat.jones@mail.house.gov"));
  assert.match(read("app/office/actions.ts"), /await purgeOfficeData\(getDb\(\), Date\.now\(\)\)/, "the tidy-up the privacy page describes runs when a link is asked for");
});

/* ───────────────────────────── 3. The dashboard: one district, totals only ───────────────────────────── */

test("an office sees its own member's district: a senator's state, a representative's district, a state legislator's district", async () => {
  assert.deepEqual((({ scope, scopeKind, scopeName, seat }) => ({ scope, scopeKind, scopeName, seat }))(await member("fed:S000001")), { scope: "TX", scopeKind: "state", scopeName: "Texas", seat: "U.S. Senator" });
  assert.deepEqual((({ scope, scopeKind, scopeName, seat }) => ({ scope, scopeKind, scopeName, seat }))(await member("fed:H000037")), { scope: "TX-37", scopeKind: "district", scopeName: "congressional district TX-37", seat: "U.S. Representative" });
  assert.deepEqual((({ scope, scopeName, seat }) => ({ scope, scopeName, seat }))(await member("tx:ocd-person/sd14")), { scope: "TX-SD-14", scopeName: "Texas Senate district 14", seat: "Texas Senator" });
  assert.deepEqual((({ scope, scopeName, seat }) => ({ scope, scopeName, seat }))(await member("tx:ocd-person/hd49")), { scope: "TX-HD-49", scopeName: "Texas House district 49", seat: "Texas Representative" });
  assert.equal(await memberOf(db, "fed:NOBODY"), null); assert.equal(await memberOf(db, "zz:1"), null); assert.equal((await member("fed:H000099")).current, false);
  assert.ok(!("party" in (await member("fed:H000037"))), "the member an office works for carries no party");
});

test("one office never sees another district's totals", async () => {
  const stone = await board("fed:H000037"), marsh = await board("fed:H000007");
  // TX-37 on F1: 26 voters, mail-verified 4/1/1, address-matched 12/7/1. TX-07 on F1: 30 voters, 5/25/0.
  const f1 = d => d.upcoming.find(b => b.billKey === F1).total;
  assert.deepEqual(f1(stone), { show: true, voters: 26, label: NOT_SCIENTIFIC, groups: [
    { tier: "mail", label: "Mail-verified", voters: 6, counts: { support: 4, oppose: 1, unsure: 1 } }, { tier: "address", label: "Address-matched", voters: 20, counts: { support: 12, oppose: 7, unsure: 1 } }] });
  assert.deepEqual(f1(marsh), { show: true, voters: 30, label: NOT_SCIENTIFIC, groups: [{ tier: "address", label: "Address-matched", voters: 30, counts: { support: 5, oppose: 25, unsure: 0 } }] });
  // Nothing of TX-37 is anywhere in what the TX-07 office gets, and the other way round: not on the page, not in the file, not in the email.
  const all = d => JSON.stringify(d) + officeCsv(officeView(d)) + composeOfficeEmail(d, { dashboard: "D", optOut: "O" }).text;
  assert.doesNotMatch(all(marsh), /TX-37|\b12 support|\b4 support|\b26 voters|\b27 voters|"support":12|"support":4,|"voters":2[67]|Avery Stone/);
  assert.doesNotMatch(all(stone), /TX-07|\b5 support|\b25 oppose|\b30 voters|"support":5,|"oppose":25|"voters":30|Blake Marsh/);
  assert.equal(marsh.other.length, 0, "F3 has a total in TX-37 only");
  assert.deepEqual(marsh.issues, [{ name: "Health care", voters: 30, bills: 1 }]);
  // A U.S. senator's office sees the state: both districts added together, and still not either district by itself.
  const field = await board("fed:S000001");
  assert.deepEqual(field.other.map(b => [b.billKey, b.total.voters]).sort(), [[F1, 56], [F3, 27]]);
  assert.deepEqual(field.other.find(b => b.billKey === F1).total.groups.map(g => g.counts), [{ support: 4, oppose: 1, unsure: 1 }, { support: 17, oppose: 32, unsure: 1 }]);
  assert.doesNotMatch(all(field), /TX-37|TX-07|TX-SD|TX-HD/);
  // A senator from another state sees nothing from Texas.
  const lake = await board("fed:S000003");
  assert.deepEqual([lake.other.length, lake.issues.length, lake.trend.length], [0, 0, 0]);
  assert.doesNotMatch(JSON.stringify(lake), /support|voters":/);
  // A Texas office sees Texas bills for its own district; a federal office never sees a state bill, and the other way round.
  const lee = await board("tx:ocd-person/hd49"), cole = await board("tx:ocd-person/hd134");
  assert.deepEqual(lee.upcoming.map(b => [b.billKey, b.total.show && b.total.voters]), [[T1, 26]]);
  assert.equal(cole.upcoming.find(b => b.billKey === T1).total.show, false);
  assert.doesNotMatch(all(cole), /TX-HD-49|26 voters|Dana Lee/);
  for (const d of [stone, marsh, field]) assert.ok(![...d.upcoming, ...d.recent, ...d.other].some(b => b.billKey.startsWith("tx-")), "no state bill on a federal office's dashboard");
  for (const d of [lee, cole]) assert.ok(![...d.upcoming, ...d.recent, ...d.other].some(b => !b.billKey.startsWith("tx-")), "no federal bill on a state office's dashboard");
  // The scope is never a choice: it comes from the member the signed-in account is for, not from anything in the request.
  for (const f of ["app/office/dashboard/page.tsx", "app/office/print/page.tsx", "app/office/export/route.ts"]) {
    const t = read(f);
    assert.match(t, /officeDashboard\((db|getDb\(\)), (member|office\.member), /, `${f} reads the signed-in office's own member`);
    assert.match(t, /const office = await currentOffice\(\);/, f);
    assert.doesNotMatch(t, /searchParams[^;]*(scope|member|district)|request\.url|scope=/, `${f} takes no scope from the request`);
  }
  assert.match(read("lib/office/session.ts"), /member: await memberOf\(db, account\.memberKey\)/);
});

test("nothing below 25 counted voters is shown, exported or emailed", async () => {
  assert.equal(MIN_SHOWN, 25);
  const d = await board("fed:H000037"), view = officeView(d), csv = officeCsv(view), email = composeOfficeEmail(d, { dashboard: "D", optOut: "O" });
  // F2 has 24 counted voters in TX-37 (10 support, 10 oppose, 4 unsure). It is listed, because the member voted on it, with no number.
  const f2 = d.recent.find(b => b.billKey === F2);
  assert.deepEqual(f2.total, { show: false, message: NOT_ENOUGH_DISTRICT });
  const row = tableOf(view, "recent").rows.find(r => r[0] === "H.R. 9002");
  assert.deepEqual(row.slice(3, 6), [NOT_ENOUGH_DISTRICT, "", ""]);
  for (const [name, text] of [["model", JSON.stringify(d)], ["page", JSON.stringify(view)], ["file", csv]]) {
    assert.doesNotMatch(text, /\b24 voters|\b10 support|\b10 oppose|\b4 unsure|"voters":24|"support":10|"oppose":10|"unsure":4/, `${name} holds no number for the bill below the line`);
    assert.doesNotMatch(text, /MY PRIVATE REASON/, `${name} holds no reason`);
  }
  assert.doesNotMatch(email.text, /9002|school meals|24|10 support/, "a bill below the line is not in the email at all");
  // It feeds neither the trend nor the issues: its 24 answers were given in the week of 26 October, under Education.
  assert.deepEqual(d.trend.find(w => w.week === "2026-10-26"), { week: "2026-10-26", voters: 0 });
  assert.ok(!d.issues.some(i => i.name === "Education"));
  // For a state (a U.S. senator) the message is the general one, with no number either.
  assert.deepEqual((await board("fed:S000001")).upcoming.map(b => [b.billKey, b.total]), [[F4, { show: false, message: NOT_ENOUGH }]]);
  // A group of fewer than 5 is given by its size only: F3 has 2 mail-verified voters (1 support, 1 oppose).
  const f3 = tableOf(view, "other").rows.find(r => r[0] === "H.R. 9003");
  assert.deepEqual(f3.slice(3, 6), ["27 voters", `fewer than ${MIN_GROUP} voters`, "25 voters: 15 support · 8 oppose · 2 unsure"]);
  // The 25th voter makes the total appear.
  await answers(F2, [[austin[30], "unsure", NOW - DAY]]);
  const after = (await board("fed:H000037")).recent.find(b => b.billKey === F2).total;
  assert.equal(after.show, true); assert.equal(after.voters, 25);
  await answer(austin[30], F2, null, NOW); await recomputeVoice(db, F2, NOW); // the 25th voter clears the answer: back to 24 for the tests below
  assert.equal((await board("fed:H000037")).recent.find(b => b.billKey === F2).total.show, false);
  // Every total on the dashboard is made by shownTotals, the same function the bill pages use.
  assert.match(read("lib/office/store.ts"), /total: shownTotals\(totals\.get\(billKey\), m\.scopeKind\)/);
  assert.equal((read("lib/office/store.ts").match(/voiceTotals|totalsForScope\(/g) ?? []).length, 1, "totals are read in one place only");
});

test("the dashboard: bills coming up, recent votes, other bills, each with the member's own recorded vote beside the total", async () => {
  const d = await board("fed:H000037"), view = officeView(d);
  assert.equal(view.heading, "What residents of congressional district TX-37 say"); assert.equal(view.who, "For the office of U.S. Representative Avery Stone."); assert.equal(view.asOf, "As of November 20, 2026.");
  assert.equal(view.label, NOT_SCIENTIFIC);
  assert.deepEqual(view.tables.map(t => t.title), ["Coming up", "Recent votes", "Other bills with a total", "Trend over time", "Top issues"]);
  assert.deepEqual(tableOf(view, "upcoming").columns, ["Bill", "Title", "Why it is listed", "Counted voters", "Mail-verified", "Address-matched", "The member's recorded vote"]);
  assert.ok(tableOf(view, "upcoming").columns.indexOf("Mail-verified") < tableOf(view, "upcoming").columns.indexOf("Address-matched"), "mail-verified first");
  // Coming up: this week's House floor schedule (last week's entry for F3 is not "coming up"). The vote beside it was procedural and says so.
  assert.deepEqual(tableOf(view, "upcoming").rows, [["H.R. 9001", "A bill to lower the cost of insulin.", "On the House floor schedule for the week of November 16, 2026.", "26 voters",
    "6 voters: 4 support · 1 oppose · 1 unsure", "20 voters: 12 support · 7 oppose · 1 unsure", "Voted no on a procedural step (not a vote on the bill itself) (On Motion to Recommit, November 17, 2026)"]]);
  // Recent: the member's recorded vote in the last 90 days.
  assert.deepEqual(tableOf(view, "recent").rows, [["H.R. 9002", "A bill to fund school meals.", "The member voted on November 15, 2026.", NOT_ENOUGH_DISTRICT, "", "", "Voted yes on passing it (On Passage, November 15, 2026)"]]);
  // Other: a bill with a total that is neither; the member's vote on it is 200 days old and is still shown beside the total.
  assert.deepEqual(tableOf(view, "other").rows.map(r => [r[0], r[3], r[6]]), [["H.R. 9003", "27 voters", "Voted yes on passing it (On Passage, May 4, 2026)"]]);
  assert.deepEqual(tableOf(view, "upcoming").hrefs, [`/bills/${F1}`]);
  // The other member's own vote is beside the other district's total.
  assert.match(tableOf(officeView(await board("fed:H000007")), "recent").rows[0][6], /^Voted no on passing it/);
  // A senator with no recorded vote on a bill: the page says so and implies nothing.
  assert.equal(tableOf(officeView(await board("fed:S000001")), "upcoming").rows[0][6], "No recorded vote on file");
  // Texas: a hearing on the agenda, and the member's vote as the official record lists it.
  const tx = officeView(await board("tx:ocd-person/hd49"));
  assert.deepEqual(tableOf(tx, "upcoming").rows, [["HB 9001", "Relating to a test (HB 9001).", "On the agenda for December 1, 2026: House Public Education: public hearing.", "26 voters",
    "6 voters: 2 support · 3 oppose · 1 unsure", "20 voters: 9 support · 10 oppose · 1 unsure", "No recorded vote on file"]]);
  assert.deepEqual(tableOf(tx, "recent").rows, [["HB 9002", "Relating to a test (HB 9002).", "The member voted on November 16, 2026.", NOT_ENOUGH_DISTRICT, "", "", "Voted yes (Passed to engrossment, November 16, 2026)"]]);
  assert.match(tableOf(officeView(await board("tx:ocd-person/hd134")), "recent").rows[0][6], /^Voted no \(Passed to engrossment/);
  assert.deepEqual(tableOf(tx, "issues").rows, [["Education", "26", "1"], ["Taxation", "26", "1"]], "a state bill's issues are the Legislature's own subjects");
  // A Texas bill that moved in the last two weeks is listed as coming up, with the action as the reason.
  await db.update(schema.txBills).set({ latestActionDate: "2026-11-18", latestActionDescription: "Reported favorably without amendments" }).where(eq(schema.txBills.id, T2));
  assert.deepEqual((await board("tx:ocd-person/sd14")).upcoming.map(b => [b.billKey, b.why]), [[T1, "On the agenda for December 1, 2026: House Public Education: public hearing."], [T2, "Latest action on November 18, 2026: Reported favorably without amendments."]]);
  await db.update(schema.txBills).set({ latestActionDate: "2026-10-01", latestActionDescription: "Referred to Public Education" }).where(eq(schema.txBills.id, T2));
});

test("trend over time and top issues count only bills with a total, each voter once a week, and a week of one to four by size only", async () => {
  const d = await board("fed:H000037");
  assert.deepEqual(trendWeeks(NOW).slice(-5), ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]); assert.equal(trendWeeks(NOW).length, 12);
  assert.deepEqual([weekVoters(0), weekVoters(1), weekVoters(4), weekVoters(5)], [0, null, null, 5]);
  // 19 Oct: one voter on F3 → by size only. 26 Oct: only F2's 24 hidden answers → 0. 2 Nov: 23 on F3. 9 Nov: 20 on F1.
  // 16 Nov: 6 on F1 and 3 on F3 → 9 people (nobody is in both groups that week).
  assert.deepEqual(d.trend.slice(-5), [{ week: "2026-10-19", voters: null }, { week: "2026-10-26", voters: 0 }, { week: "2026-11-02", voters: 23 }, { week: "2026-11-09", voters: 20 }, { week: "2026-11-16", voters: 9 }]);
  assert.deepEqual(d.trend.slice(0, 7).map(w => w.voters), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(tableOf(officeView(d), "trend").rows.slice(-5), [["October 19, 2026", `fewer than ${MIN_GROUP}`], ["October 26, 2026", "0"], ["November 2, 2026", "23"], ["November 9, 2026", "20"], ["November 16, 2026", "9"]]);
  // A person who answers two bills in one week is one voter that week.
  await answer(austin[20], F3, "support", wk.now); await recomputeVoice(db, F3, NOW); // austin[20] answered F1 this week too
  assert.equal((await board("fed:H000037")).trend.at(-1).voters, 9);
  // Issues: Health care = everyone who answered F1 or F3 (31 people, 2 bills); Taxes = F3 (27). Education (F2, hidden) is absent.
  assert.deepEqual(d.issues, [{ name: "Health care", voters: 31, bills: 2 }, { name: "Taxes", voters: 27, bills: 1 }]);
  // The trend counts the same people the totals count: an account with only a phone, an account set aside, an answer
  // given under the old promise and a resident of another district add nothing to TX-37's trend.
  const before = (await board("fed:H000037")).trend.at(-1).voters;
  const phoneOnly = await resident(AUSTIN, { phone: false }), held = await resident(AUSTIN), old = await resident(AUSTIN), elsewhere = await resident(TULSA);
  await db.insert(schema.accountHolds).values({ id: crypto.randomUUID(), accountId: held.id, kind: "household_cap", subject: "addr:x", status: "open", createdAt: NOW });
  for (const r of [phoneOnly, held, elsewhere]) await answer(r, F1, "support", wk.now);
  await castVote(db, { userId: old.userId, accountId: old.id, billKey: F1, answer: "support", reason: null, reasonHash: null, device: null, ipRange: null, now: wk.now, counts: -1 });
  const totals = await recomputeVoice(db, F1, NOW);
  assert.equal(totals.get("TX-37|address").support, 12, "the totals did not move");
  assert.equal((await board("fed:H000037")).trend.at(-1).voters, before);
  // The weeks add up to the totals when each person answers once: F1 in TX-07 has 30 voters, all in the week of 9 November.
  assert.deepEqual((await board("fed:H000007")).trend.filter(w => w.voters !== 0), [{ week: "2026-11-09", voters: 30 }]);
  // The query that reads single answers stays inside the store.
  assert.match(read("lib/office/store.ts"), /\nasync function countedInScope\(/); assert.doesNotMatch(read("lib/office/store.ts"), /export async function countedInScope/);
});

test("aggregates only: no name, email, account, single answer or reason reaches an office", async () => {
  for (const key of ["fed:H000037", "fed:S000001", "tx:ocd-person/hd49"]) {
    const d = await board(key), out = JSON.stringify(d) + officeCsv(officeView(d)) + JSON.stringify(composeOfficeEmail(d, { dashboard: "D", optOut: "O" }));
    assert.doesNotMatch(out, /user-\d|acct-\d|resident\d+@|example\.test|MY PRIVATE REASON|phone-\d|addr:/, key);
    assert.deepEqual(Object.keys(d).sort(), ["asOf", "issues", "member", "other", "recent", "trend", "upcoming"]);
    for (const b of [...d.upcoming, ...d.recent, ...d.other]) assert.deepEqual(Object.keys(b).sort(), ["billKey", "href", "label", "memberVote", "title", "total", "why"]);
  }
  // The office code never selects a reader's email or a reason. Of a reader's account it reads two dates only: when
  // the account was made and when its email was confirmed, which the counting rule needs.
  for (const f of ["lib/office/store.ts", "lib/office/rules.ts", "lib/office/email.ts"]) assert.doesNotMatch(read(f), /readerAccounts|voiceVotes\.reason|reasonHash|reason_hash|positionHistory/, f);
  assert.deepEqual([...read("lib/office/store.ts").matchAll(/select a\.(\w+) from reader_accounts/g)].map(m => m[1]), ["created_at", "verified_at"]);
});

/* ───────────────────────────── 4. The export ───────────────────────────── */

test("the file to download holds exactly what the dashboard shows", async () => {
  for (const key of ["fed:H000037", "fed:H000007", "fed:S000001", "fed:S000003", "tx:ocd-person/hd49"]) {
    const view = officeView(await board(key)), rows = parseCsv(officeCsv(view));
    // Rebuild the file's rows from the page, in order: nothing more, nothing less, nothing changed.
    const expected = [[view.heading], [view.who], [view.asOf], [view.label], ...view.notes.map(n => [n])];
    for (const t of view.tables) expected.push([""], [t.title], [t.intro], ...(t.rows.length ? [t.columns, ...t.rows] : [[t.empty]]));
    assert.deepEqual(rows, expected, key);
    assert.match(officeCsv(view), new RegExp(NOT_SCIENTIFIC.replace(".", "\\.")));
  }
  // A cell with a comma, a quote or a new line survives; a cell a spreadsheet would run as a formula is written as text.
  const odd = { heading: "h", who: "w", asOf: "a", label: NOT_SCIENTIFIC, notes: [], tables: [{ id: "other", title: "t", intro: "i", columns: ["A", "B"], rows: [['He said "no", twice', "line one\nline two"], ["=SUM(A1)", "+1"]], hrefs: [null, null], empty: "e" }] };
  assert.deepEqual(parseCsv(officeCsv(odd)).slice(-2), [['He said "no", twice', "line one\nline two"], ["'=SUM(A1)", "'+1"]]);
  // The dashboard page, the print page and the download are all written from the one view.
  const page = read("app/office/dashboard/page.tsx"), print = read("app/office/print/page.tsx"), route = read("app/office/export/route.ts"), draw = read("components/office/dashboard-view.tsx");
  assert.match(page, /const view = officeView\(await officeDashboard\(db, member, now\)\);/); assert.match(page, /<DashboardView view=\{view\} \/>/);
  assert.match(print, /const view = officeView\(await officeDashboard\(getDb\(\), office\.member, requestTime\(\)\)\);/); assert.match(print, /<DashboardView view=\{view\} links=\{false\} \/>/);
  assert.match(route, /view = officeView\(await officeDashboard\(getDb\(\), office\.member, now\)\)/); assert.match(route, /officeCsv\(view\)/);
  for (const [name, t] of [["page", page], ["print", print], ["route", route], ["drawing", draw]]) assert.doesNotMatch(t, /\.upcoming|\.recent|\.other\b|\.trend|\.issues|\.total\b|shownTotals|totalsForScope/, `${name} reads the view, not the numbers behind it`);
  // The PDF is the print page: "Save as PDF" in the browser. The print page is a signed-in page like the dashboard.
  assert.match(read("components/office/print-button.tsx"), /window\.print\(\)/); assert.match(read("app/office/office.css"), /@media print\{/);
  // Only a signed-in, confirmed office gets the file.
  assert.match(route, /if \(!\(await officeDoor\(\)\)\.allowed\) return gone\(\);/);
  assert.match(route, /if \(!office \|\| office\.account\.status !== "active" \|\| !office\.member\?\.current\) return gone\(\);/);
});

/* ───────────────────────────── 5. The weekly email ───────────────────────────── */

const LINKS = { dashboard: "https://site.test/office/dashboard", optOut: "https://site.test/office/email-off?t=x" };
const mailer = (fail = () => false) => { const sent = []; return { sent, send: async (to, subject, text) => { if (fail(to)) return { ok: false, error: "refused by the mail service" }; sent.push({ to, subject, text }); return { ok: true }; } }; };
const weekly = (m, over = {}) => sendOfficeEmails(db, { enabled: true, now: NOW, maxPerRun: OFFICE_EMAIL_MAX_PER_RUN, send: m.send, links: async id => ({ dashboard: LINKS.dashboard, optOut: `${LINKS.optOut}-${id}` }), ...over });

test("the weekly email: one template, totals at or above 25 only, Not a scientific poll, a link to the dashboard and a link to stop it", async () => {
  const e = composeOfficeEmail(await board("fed:H000037"), LINKS);
  assert.match(e.subject, /^.+: what residents of congressional district TX-37 say about this week's bills$/);
  assert.equal(e.items, 1); assert.deepEqual(e.billKeys, [F1]);
  const lines = e.text.split("\n");
  assert.equal(lines[0], "To the office of U.S. Representative Avery Stone.");
  assert.ok(lines[2].startsWith(`${NOT_SCIENTIFIC} These are totals from residents of congressional district TX-37`));
  assert.deepEqual(lines.slice(lines.indexOf("COMING UP"), lines.indexOf("COMING UP") + 7), ["COMING UP", "- H.R. 9001: A bill to lower the cost of insulin.", "  On the House floor schedule for the week of November 16, 2026.", "  26 counted voters.",
    "  Mail-verified: 6 voters: 4 support · 1 oppose · 1 unsure", "  Address-matched: 20 voters: 12 support · 7 oppose · 1 unsure",
    "  The member's recorded vote: Voted no on a procedural step (not a vote on the bill itself) (On Motion to Recommit, November 17, 2026)"]);
  assert.ok(e.text.indexOf("Mail-verified:") < e.text.indexOf("Address-matched:"), "mail-verified first");
  assert.ok(lines.includes(`See all of it, and download or print it: ${LINKS.dashboard}`)); assert.equal(lines.at(-1), `Stop this weekly email: ${LINKS.optOut}`);
  assert.ok(lines.includes("- No bill with a total had a recorded vote by the member."), "F2 was voted on this week but has 24 voters: it is not listed");
  // An office whose bills have no total yet gets no email: there is nothing it may be told.
  assert.equal(composeOfficeEmail(await board("fed:S000001"), LINKS).items, 0);
  // Address-matched is never called verified, anywhere an office reads.
  for (const key of ["fed:H000037", "tx:ocd-person/hd49"]) {
    const d = await board(key), text = `${composeOfficeEmail(d, LINKS).text}\n${officeCsv(officeView(d))}`;
    assert.doesNotMatch(text.replace(/mail-verified/gi, ""), /verified/i, key);
  }
  for (const f of ["app/office/page.tsx", "app/office/dashboard/page.tsx", "app/office/verify/page.tsx", "app/office/email-off/page.tsx", "lib/office/domains.ts", "components/office/office-shell.tsx"])
    assert.doesNotMatch(read(f).replace(/mail-verified|emailVerified|email_verified/gi, ""), /verified/i, `${f} does not call anything else verified`);
});

test("the weekly email is off unless OFFICE_EMAIL_ENABLED is 1", async () => {
  for (const v of [undefined, null, "", "0", "true", "yes", "on", " 2 "]) assert.equal(officeEmailEnabled(v), false, String(v));
  assert.equal(officeEmailEnabled("1"), true); assert.equal(officeEmailEnabled(" 1 "), true);
  assert.equal(officeEmailCap(undefined), 50); assert.equal(officeEmailCap("5"), 5); assert.equal(officeEmailCap("0"), 0); assert.equal(officeEmailCap("many"), 50); assert.equal(officeEmailCap("-1"), 50);
  const m = mailer();
  const run = await weekly(m, { enabled: false });
  assert.deepEqual(run, { enabled: false, week: "2026-11-16", due: 0, sent: 0, failed: 0, nothingToShow: 0, held: 0, memberGone: 0, overCap: 0 });
  assert.equal(m.sent.length, 0); assert.equal((await db.select().from(schema.officeEmailSends)).length, 0);
  // The switch is read from the environment in one place, and nothing calls the sender yet: the scheduled update is not touched.
  assert.match(read("lib/office/weekly.ts"), /enabled: officeEmailEnabled\(process\.env\[OFFICE_EMAIL_FLAG\]\)/);
  assert.doesNotMatch(read("app/api/automation/tick/route.ts"), /office/i);
  const callers = [];
  for (const d of ["app", "lib", "components"]) (function walk(p) { for (const f of readdirSync(p)) { const q = join(p, f); if (statSync(q).isDirectory()) walk(q); else if (/\.tsx?$/.test(f) && /runOfficeEmails\(/.test(readFileSync(q, "utf8"))) callers.push(q.slice(ROOT.length + 1)); } })(join(ROOT, d));
  assert.deepEqual(callers, ["lib/office/weekly.ts"]);
});

test("the weekly email goes once a week to confirmed offices that left it on, and every attempt is recorded", async () => {
  // Confirmed offices so far: jo_smith (Sen. Field: nothing to show), pat.jones and lee.park (Rep. Stone), dana.lee (Texas Rep. Lee).
  const m = mailer(to => to === "lee.park@mail.house.gov");
  const run = await weekly(m);
  assert.deepEqual(run, { enabled: true, week: "2026-11-16", due: 4, sent: 2, failed: 1, nothingToShow: 1, held: 0, memberGone: 0, overCap: 0 });
  assert.deepEqual(m.sent.map(s => s.to).sort(), ["dana.lee@house.texas.gov", "pat.jones@mail.house.gov"]);
  const pat = m.sent.find(s => s.to === "pat.jones@mail.house.gov");
  assert.match(pat.text, /H\.R\. 9001/); assert.match(pat.text, new RegExp(`^Stop this weekly email: ${LINKS.optOut.replace("?", "\\?")}-[0-9a-f-]{36}$`, "m"), "each office gets its own link to stop the email");
  // Offices still waiting for the editor, or closed, get nothing.
  for (const s of m.sent) assert.equal((await db.select().from(schema.officeAccounts).where(eq(schema.officeAccounts.email, s.to)).get()).status, "active");
  const rows = await db.select().from(schema.officeEmailSends);
  assert.deepEqual(rows.map(r => [r.week, r.ok, r.items, r.error]).sort(), [["2026-11-16", 0, 1, "refused by the mail service"], ["2026-11-16", 1, 1, null], ["2026-11-16", 1, 1, null]]);
  // A second run in the same week sends nothing again to those who got it, and tries the failed one once more.
  const again = mailer();
  assert.deepEqual(await weekly(again, { now: NOW + DAY }), { enabled: true, week: "2026-11-16", due: 2, sent: 1, failed: 0, nothingToShow: 1, held: 0, memberGone: 0, overCap: 0 });
  assert.deepEqual(again.sent.map(s => s.to), ["lee.park@mail.house.gov"]);
  assert.equal((await db.select().from(schema.officeEmailSends)).filter(r => r.ok === 1).length, 3); assert.equal((await db.select().from(schema.officeEmailSends)).length, 3, "one row per office and week");
  assert.deepEqual(await weekly(mailer(), { now: NOW + 2 * DAY }), { enabled: true, week: "2026-11-16", due: 1, sent: 0, failed: 0, nothingToShow: 1, held: 0, memberGone: 0, overCap: 0 });
  // The next week it goes again, at most `maxPerRun` a run.
  const next = mailer(), nextWeek = NOW + 7 * DAY;
  await db.insert(schema.officialFloorSchedule).values({ chamber: "house", weekOf: "20261123", label: "H.R. 9001", billId: F1, ...GOT });
  const capped = await weekly(next, { now: nextWeek, maxPerRun: 1 });
  assert.equal(capped.week, "2026-11-23"); assert.equal(capped.sent, 1); assert.equal(capped.overCap, 2, "the other two wait for the next run");
  assert.equal((await weekly(next, { now: nextWeek, maxPerRun: 0 })).sent, 0);
});

test("opt-out works: an office that stops the weekly email gets no more, and can turn it back on", async () => {
  const pat = await db.select().from(schema.officeAccounts).where(eq(schema.officeAccounts.email, "pat.jones@mail.house.gov")).get();
  assert.equal(pat.weeklyEmail, 1, "on until the office stops it");
  assert.equal(await setWeeklyEmail(db, pat.id, false), true);
  assert.equal((await officeById(db, pat.id)).weeklyEmail, 0);
  const later = NOW + 14 * DAY, m = mailer();
  await db.insert(schema.officialFloorSchedule).values({ chamber: "house", weekOf: "20261130", label: "H.R. 9001", billId: F1, ...GOT });
  await weekly(m, { now: later });
  assert.ok(m.sent.length >= 1); assert.ok(!m.sent.some(s => s.to === "pat.jones@mail.house.gov"));
  assert.equal(await setWeeklyEmail(db, pat.id, true), true);
  const back = mailer(); await weekly(back, { now: later });
  assert.deepEqual(back.sent.map(s => s.to), ["pat.jones@mail.house.gov"]);
  assert.equal(await setWeeklyEmail(db, "no-such-office", false), false);
  // The link in the email opens a page with one button; the page itself changes nothing, the button flips the switch.
  const page = read("app/office/email-off/page.tsx"), actions = read("app/office/actions.ts");
  assert.match(page, /<form action=\{stopOfficeEmail\}/); assert.doesNotMatch(page, /setWeeklyEmail/);
  assert.match(actions, /const ok = accountId \? await setWeeklyEmail\(getDb\(\), accountId, false\) : false;/);
  assert.match(read("lib/office/session.ts"), /signAction\(key\(\), "office-email-off", accountId/);
  assert.match(read("app/office/dashboard/page.tsx"), /<form action=\{setOfficeWeekly\}>/, "and there is a switch on the dashboard");
});

test("the weekly email is held while answers on one of its bills are under review, and stops when the member leaves the seat", async () => {
  const at = NOW + 21 * DAY;
  await db.insert(schema.officialFloorSchedule).values({ chamber: "house", weekOf: "20261207", label: "H.R. 9001", billId: F1, ...GOT });
  const flagId = crypto.randomUUID();
  await db.insert(schema.integrityFlags).values({ id: flagId, kind: "bill_surge", subject: F1, status: "open", createdAt: at });
  await db.insert(schema.flaggedPositions).values({ flagId, userId: houston[0].userId, billId: F1 });
  const held = mailer(), run = await weekly(held, { now: at });
  assert.equal(held.sent.filter(s => /H\.R\. 9001/.test(s.text)).length, 0); assert.equal(run.held, 2, "both of Rep. Stone's office accounts wait");
  await db.update(schema.integrityFlags).set({ status: "cleared", decidedAt: at }).where(eq(schema.integrityFlags.id, flagId));
  const freed = mailer(); await weekly(freed, { now: at });
  assert.deepEqual(freed.sent.map(s => s.to).sort(), ["lee.park@mail.house.gov", "pat.jones@mail.house.gov"]);
  // The member leaves the seat: the office gets no email, and the count says why.
  await db.update(schema.officialPoliticians).set({ isCurrent: 0 }).where(eq(schema.officialPoliticians.id, "H000037"));
  await db.insert(schema.officialFloorSchedule).values({ chamber: "house", weekOf: "20261214", label: "H.R. 9001", billId: F1, ...GOT });
  const gone = mailer(), goneRun = await weekly(gone, { now: NOW + 28 * DAY });
  assert.equal(goneRun.memberGone, 2); assert.ok(!gone.sent.some(s => /mail\.house\.gov/.test(s.to)));
  await db.update(schema.officialPoliticians).set({ isCurrent: 1 }).where(eq(schema.officialPoliticians.id, "H000037"));
});

/* ───────────────────────────── 6. The same for every party ───────────────────────────── */

test("the same input produces the same email and the same dashboard for any party", async () => {
  const strip = d => ({ ...d, member: { ...d.member, name: "X", key: "k" } });
  const email = async key => composeOfficeEmail(await board(key), LINKS);
  // 1. Change the member's party in the record: nothing an office reads changes by one character.
  const before = { board: await board("fed:H000037"), email: await email("fed:H000037") };
  for (const party of ["Republican", "Independent", "Libertarian", ""]) {
    await db.update(schema.officialPoliticians).set({ party }).where(eq(schema.officialPoliticians.id, "H000037"));
    assert.deepEqual(await board("fed:H000037"), before.board, party); assert.deepEqual(await email("fed:H000037"), before.email, party);
  }
  await db.update(schema.officialPoliticians).set({ party: "Democratic" }).where(eq(schema.officialPoliticians.id, "H000037"));
  // 2. Two senators of different parties from the same state get the same dashboard, file and email, apart from their own names.
  const [field, hale] = [await board("fed:S000001"), await board("fed:S000002")];
  assert.notEqual((await db.select().from(schema.officialPoliticians).where(eq(schema.officialPoliticians.id, "S000001")).get()).party, (await db.select().from(schema.officialPoliticians).where(eq(schema.officialPoliticians.id, "S000002")).get()).party);
  assert.deepEqual(strip(field), strip(hale));
  assert.equal(officeCsv(officeView(field)).replace("Casey Field", "X"), officeCsv(officeView(hale)).replace("Devon Hale", "X"));
  assert.deepEqual({ ...composeOfficeEmail(field, LINKS), text: composeOfficeEmail(field, LINKS).text.replace("Casey Field", "X") }, { ...composeOfficeEmail(hale, LINKS), text: composeOfficeEmail(hale, LINKS).text.replace("Devon Hale", "X") });
  // 3. Two Texas representatives of different parties with the same district's answers would differ only by name and vote:
  //    the composer is a function of the dashboard alone, and the dashboard type has no party in it.
  const d = await board("tx:ocd-person/hd49");
  assert.deepEqual(composeOfficeEmail({ ...d, member: { ...d.member, name: "X" } }, LINKS), composeOfficeEmail({ ...d, member: { ...d.member, name: "X", party: "Republican", key: "tx:other" } }, LINKS));
  // 4. No office code reads a party, and none grades, scores, praises or blames.
  for (const d2 of ["lib/office", "components/office", "app/office", "app/editor/offices", "app/editor/office-email"]) for (const f of readdirSync(join(ROOT, d2), { recursive: true }).filter(x => /\.(tsx?|css)$/.test(x))) {
    const t = read(join(d2, f));
    assert.doesNotMatch(t, /\.party\b|party:|partyLetter|partyKey|Republican|Democrat|\bGOP\b/, `${d2}/${f} reads no party`);
    assert.doesNotMatch(t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), /\bgrade|\bscore|\brating|\brank|out of step|agrees with|defied|ignored (the|their)/i, `${d2}/${f} grades nobody`);
  }
  // 5. Free: no price, plan or upsell anywhere an office reads.
  for (const f of ["app/office/page.tsx", "app/office/dashboard/page.tsx", "lib/office/email.ts", "lib/office/rules.ts", "lib/office/domains.ts"])
    assert.doesNotMatch(read(f), /\$\d|\bpric|\bplan\b|\bupgrade|\bpremium|\bsubscri|\bpaid\b|\btrial offer|\bbilling/i, `${f} has no payment or upsell language`);
  assert.match(read("app/office/page.tsx"), /It is free, and it is the same for every office\./);
});

/* ───────────────────────────── 7. Nothing new is public; sign-in is separate, quiet and limited ───────────────────────────── */

test("the office pages are behind the same gate as the reader pages, with their own sign-in", () => {
  // Every page and the download ask the gate first; the gate is the reader pages' gate.
  assert.match(read("lib/office/session.ts"), /export async function officeDoor\(\) \{ return viewerAccess\(\); \}/);
  for (const f of ["app/office/page.tsx", "app/office/verify/page.tsx", "app/office/dashboard/page.tsx", "app/office/print/page.tsx"]) {
    const t = read(f);
    assert.match(t, /const access = await officeDoor\(\);\n  if \(!access\.allowed\) return <OfficeShell access=\{access\}>\{null\}<\/OfficeShell>;/, `${f} shows nothing when closed`);
    assert.match(t, /robots: \{ index: false, follow: false \}/, `${f} is not indexed`);
  }
  const actions = read("app/office/actions.ts");
  assert.match(actions, /if \(!\(await officeDoor\(\)\)\.allowed\) return fail\("This page is not open yet\."\);/);
  assert.match(actions, /export async function openOffice\(formData: FormData\) \{\n  if \(!\(await officeDoor\(\)\)\.allowed\) redirect\("\/office"\);/);
  // The one page open while the site is private shows nothing and only stops email.
  assert.doesNotMatch(read("app/office/email-off/page.tsx"), /officeDashboard|officeView|currentOffice/);
  // Separate from reader sign-in: its own cookie, its own signed purposes, its own table; no reader cookie or account is read.
  const session = read("lib/office/session.ts");
  assert.match(session, /export const OFFICE_COOKIE = "or_office";/);
  for (const purpose of ['"office-link"', '"office"', '"office-email-off"']) assert.ok(session.includes(`signAction(key(), ${purpose}`), purpose);
  for (const f of ["lib/office/session.ts", "lib/office/store.ts", "app/office/actions.ts", "app/office/dashboard/page.tsx"]) assert.doesNotMatch(read(f), /READER_COOKIE|currentAccount|readerAccounts|magicLinks|"magic-link"|"reader"/, `${f} does not touch reader sign-in`);
  // It does not say whether an address is registered: after an accepted domain the answer is one fixed sentence.
  assert.match(actions, /const SENT = "If that address can use this page, a link is on its way to it\./);
  assert.match(actions, /return \{ step: "sent", message: SENT, error: false, email: "", options: \[\], n: prev\.n \+ 1 \};/);
  assert.equal((actions.match(/step: "sent"/g) ?? []).length, 1, "one way to answer, whether a link was sent or not");
  assert.doesNotMatch(actions, /already|not registered|no account|unknown address/i);
  assert.match(actions, /console\.error\(`OFFICE_LINK not sent: \$\{sent\.error\}`\)/, "a failed send is logged without the address");
  // Rate limits: per network range and device for asking, per address for links sent, per network range for opening.
  for (const name of ["office_link_ip_hour", "office_link_device_hour", "office_link_address_day", "office_open_ip_hour"]) { assert.ok(LIMITS[name].max > 0, name); assert.ok(actions.includes(`withinLimit("${name}"`), name); }
  // Email goes through the site's one mailer; the address typed is never put in a page address.
  assert.match(actions, /await sendTo\(result\.send\.to, /); assert.doesNotMatch(actions, /redirect\(`[^`]*\$\{[^}]*(email|typed)/);
  // The footer has a small link; the reader menu does not.
  const shell = read("components/public/public-shell.tsx");
  assert.ok(shell.includes(`{ href: "/office", label: "For legislators' offices" }`));
  assert.ok(shell.match(/const INFO_PAGES = new Set\(\[([^\]]+)\]\)/)[1].includes('"/office"'), "a footer page, not a menu item");
});

test("no table, column or migration was added for office access", () => {
  const journal = JSON.parse(read("drizzle/meta/_journal.json")).entries;
  assert.equal(journal.at(-1).tag, "0036_constituent_voice", "0036 is still the last migration");
  assert.equal(readdirSync(join(ROOT, "drizzle")).filter(f => f.endsWith(".sql")).length, journal.length);
  const sql = read("drizzle/0036_constituent_voice.sql");
  for (const t of ["office_accounts", "access_links", "office_email_sends"]) assert.ok(sql.includes(`CREATE TABLE \`${t}\``), t);
  // Dates are written out.
  assert.equal(longDate("2026-11-16"), "November 16, 2026"); assert.equal(longDate("20261116"), "November 16, 2026"); assert.equal(longDate("2026-12-01T09:00:00-06:00"), "December 1, 2026");
});
