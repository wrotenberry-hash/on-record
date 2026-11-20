// The weekly email and closing the loop (owner's points 2, 3, 4 and 12, 18 Nov 2026; docs/PERSUASION_RETENTION.md).
// The pure rules (lib/digest-format.ts, lib/loop/rules.ts, lib/loop/marks.ts) and the same database functions the site
// runs (lib/loop/weekly.ts, notices.ts, alerts.ts, follows.ts) against temporary databases built from the real migrations.
// No email and no push is sent: the mailer and the push sender are stand-ins that record what they were given.
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
import { CAUGHT_UP, formatDigest, planWeekly, WEEKLY_MAX_ITEMS } from "../lib/digest-format.ts";
import { MIN_SHOWN, NOT_ENOUGH_DISTRICT, NOT_SCIENTIFIC } from "../lib/constituent/rules.ts";
import { contactEventAllowed } from "../lib/contact-message.ts";
import { countOpen, countReturn, loopMeasures, mintToken, newMark, PIXEL, PUSH_ARRIVAL, readToken, returnLink, safeReturnPath } from "../lib/loop/marks.ts";
import { alertBundle, ALERT_MAX_VOTES, answerLine, districtLine, districtScope, federalEvents, LOOP_WINDOW_DAYS, memberLines, noticePush, shouldNotify, stageSentence, pickMoved, texasEvents } from "../lib/loop/rules.ts";
import { listNotices, markNoticesSeen, runLoopNotices } from "../lib/loop/notices.ts";
import { runVoteAlerts } from "../lib/loop/alerts.ts";
import { runWeekly, weeklyInput } from "../lib/loop/weekly.ts";
import { followBill, isFollowing, LOOP_STAGES, unfollowBill } from "../lib/loop/follows.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), DAY = 86400e3, HOUR = 3600e3;
const read = p => readFileSync(join(ROOT, p), "utf8");
const SITE = "https://site.test", SECRET = "test-secret";
const open = [];
after(() => { for (const o of open) { o.client.close(); rmSync(o.dir, { recursive: true, force: true }); } });
/** A new, empty database with every migration applied. Each group of tests gets its own, so one group's votes never reach another's email. */
async function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "loop-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
  await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
  open.push({ client, dir });
  return { db, client };
}

const MON = Date.parse("2026-11-16T19:00:00Z"); // a Monday, 19:00 UTC: when the weekly email goes out
const SRC = "https://clerk.house.gov/Votes/2026323";
let seq = 0;

async function people(db) {
  const base = { party: "X", state: "TX", sourceUrl: "https://unitedstates.github.io/", retrievedAt: MON };
  await db.insert(schema.officialPoliticians).values([
    { ...base, id: "C001056", fullName: "John Cornyn", firstName: "John", lastName: "Cornyn", chamber: "senate", district: null },
    { ...base, id: "C001098", fullName: "Ted Cruz", firstName: "Ted", lastName: "Cruz", chamber: "senate", district: null },
    { ...base, id: "D000399", fullName: "Lloyd Doggett", firstName: "Lloyd", lastName: "Doggett", chamber: "house", district: 37 },
    { ...base, id: "F000246", fullName: "Pat Fallon", firstName: "Pat", lastName: "Fallon", chamber: "house", district: 4 },
  ]);
  const tx = { party: "X", sourceUrl: "https://openstates.org/", retrievedAt: MON };
  await db.insert(schema.txPeople).values([{ ...tx, id: "ocd-person/sd14", name: "Sarah Eckhardt", chamber: "upper", district: "14" }, { ...tx, id: "ocd-person/hd49", name: "Gina Hinojosa", chamber: "lower", district: "49" }]);
}
/** A reader. `email: false` is an invited reader who never signed in; `place: false` has no place on file. */
async function reader(db, { email = true, place = true, optIn = 1 } = {}) {
  const n = ++seq, userId = `user-${n}`, accountId = email ? `acct-${n}` : null;
  await db.insert(schema.appUsers).values({ id: userId, kind: "public", externalKey: `k-${n}`, createdAt: MON - 60 * DAY });
  if (accountId) await db.insert(schema.readerAccounts).values({ id: accountId, appUserId: userId, emailHash: `e-${n}`, email: `r${n}@example.test`, createdAt: MON - 60 * DAY, verifiedAt: MON - 60 * DAY, digestOptIn: optIn });
  if (place) await db.insert(schema.readerLocations).values({ userId, state: "TX", congressional: "TX-37", stateUpper: "TX-SD-14", stateLower: "TX-HD-49", source: "address", updatedAt: MON - 30 * DAY });
  return { userId, accountId, email: `r${n}@example.test` };
}
async function fedBill(db, number, title = `Sample ${number} Act`) {
  const id = `119-hr-${number}`;
  await db.insert(schema.officialBills).values({ id, congress: 119, billType: "hr", number, title, congressUrl: "https://www.congress.gov/", sourceUrl: "https://www.congress.gov/", retrievedAt: MON });
  return id;
}
async function rollCall(db, billId, { chamber = "house", at, question = "On Passage", result = "Passed", yea = 392, nay = 18, votes = {} }) {
  const n = ++seq, id = `${chamber}-2026-${n}`;
  await db.insert(schema.officialRollCalls).values({ id, chamber, congress: 119, session: 2, rollNumber: n, votedAt: at, question, title: null, result, billId, yea, nay, sourceUrl: SRC, retrievedAt: at });
  const rows = Object.entries(votes).map(([politicianId, position]) => ({ rollCallId: id, politicianId, position, rawPosition: position }));
  if (rows.length) await db.insert(schema.officialMemberVotes).values(rows);
  return id;
}
const action = (db, billId, seqNo, actionDate, text, stage, chamber = null) => db.insert(schema.officialBillActions).values({ billId, seq: seqNo, actionDate, text, type: "Floor", chamber, stage, sourceUrl: "https://www.congress.gov/", retrievedAt: MON });
const answer = (db, r, billKey, a, at) => db.insert(schema.voiceVotes).values({ userId: r.userId, billKey, accountId: r.accountId, answer: a, createdAt: at, updatedAt: at });
const total = (db, billKey, scope, tier, [support, oppose, unsure]) => db.insert(schema.voiceTotals).values({ billKey, scope, tier, support, oppose, unsure, updatedAt: MON })
  .onConflictDoUpdate({ target: [schema.voiceTotals.billKey, schema.voiceTotals.scope, schema.voiceTotals.tier], set: { support, oppose, unsure } });
/** Stand-ins for the mailer and the push sender: they send nothing and keep what they were given. */
function outbox({ pushed = 1 } = {}) {
  const mail = [], push = [];
  return { mail, push, send: async (to, subject, text, html) => { mail.push({ to, subject, text, html }); return { ok: true }; }, notify: async (userId, alert) => { push.push({ userId, ...alert }); return { pushed }; } };
}
/** Every row of every table except `skip`, as one string: for "this value is stored nowhere else". */
async function everythingBut(client, skip) {
  const tables = (await client.execute("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'")).rows.map(r => r.name);
  let text = "";
  for (const t of tables) if (t !== skip) text += JSON.stringify((await client.execute(`select * from "${t}"`)).rows);
  return text;
}
const CALM = /!|\b(slams?|shocking|outrage|betray(al|s|ed)?|finally|don.t miss|act now|streak|badge)\b/i;

/* ───────────────────────────── 1. The weekly email: order, five items, last line ───────────────────────────── */

const vote = n => ({ result: `The House passed H.R. ${n} (the Sample ${n} Act), 392–18, on 12 November 2026.`, members: ["Rep. Lloyd Doggett voted Yes."], billUrl: `${SITE}/bills/119-hr-${n}`, sourceUrl: SRC });
const moved = { issue: "Health care", bill: "H.R. 50 (the Clinic Act)", what: "It was sent to the President on 13 November 2026.", billUrl: `${SITE}/bills/119-hr-50` };
const coming = { text: "The House plans to take up H.R. 60 (the Roads Act) in the week of 16 November 2026.", url: `${SITE}/bills/119-hr-60` };
const links = { site: SITE, unsubscribe: `${SITE}/account/unsubscribe?t=abc`, pixel: `${SITE}/o/mark.gif` };

test("weekly email: the order is votes, one bill that moved, one thing coming up, then “You're caught up.”", () => {
  const m = formatDigest({ votes: [vote(1), vote(2)], moved, coming, hasIssues: true }, links);
  const at = s => { const i = m.text.indexOf(s); assert.ok(i >= 0, `the email has “${s}”`); return i; };
  const order = [at("How your legislators voted this week"), at("1. The House passed H.R. 1"), at("2. The House passed H.R. 2"), at("One bill in your issues that moved"), at("3. Health care: H.R. 50"),
    at("One thing coming up"), at("4. The House plans to take up H.R. 60"), at(CAUGHT_UP), at("Stop these emails:")];
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "each part comes after the one before it");
  assert.equal(m.items, 4);
  // The last line of the email itself is "You're caught up."; under it only the source note, the one-tap unsubscribe and the no-grades line.
  const lines = m.text.split("\n").filter(Boolean);
  assert.equal(lines[lines.indexOf(CAUGHT_UP) - 1].trim(), `Read more: ${SITE}/bills/119-hr-60`);
  assert.deepEqual(lines.slice(lines.indexOf(CAUGHT_UP) + 1).map(l => l.split(":")[0].split(" ").slice(0, 3).join(" ")), ["Votes are copied", "Stop these emails", lines.at(-1).split(" ").slice(0, 3).join(" ")]);
  assert.match(lines.at(-1), /shows what officials did\. It does not grade them\.$/);
  assert.match(m.text, /Stop these emails: https:\/\/site\.test\/account\/unsubscribe\?t=abc/);
  assert.match(m.text, /Rep\. Lloyd Doggett voted Yes\./);
  assert.match(m.text, /Official record: https:\/\/clerk\.house\.gov/);
  assert.equal(m.subject.replace(/^\[[^\]]+\] /, ""), "How your legislators voted this week: 2 votes");
});

test("weekly email: never more than five items; extra votes are counted and linked, not listed", () => {
  assert.equal(WEEKLY_MAX_ITEMS, 5);
  const nine = Array.from({ length: 9 }, (_, i) => vote(i + 1));
  const full = formatDigest({ votes: nine, moved, coming, hasIssues: true }, links);
  assert.equal(full.items, 5);
  assert.deepEqual(full.text.match(/^\d+\. /gm), ["1. ", "2. ", "3. ", "4. ", "5. "], "five numbered items and no sixth");
  assert.match(full.text, /6 more votes this week are listed on your Following page: https:\/\/site\.test\/following/);
  assert.doesNotMatch(full.text, /H\.R\. 4 \(/, "the fourth vote is counted, not printed");
  assert.equal(full.votes, 9);
  // With nothing moved and nothing scheduled, votes may take all five places.
  const votesOnly = formatDigest({ votes: nine, moved: null, coming: null, hasIssues: true }, links);
  assert.deepEqual(planWeekly({ votes: nine, moved: null, coming: null }).votes.length, 5);
  assert.equal(votesOnly.items, 5);
  assert.match(votesOnly.text, /4 more votes this week are listed/);
  assert.match(votesOnly.text, /No bill in your issues moved this week\./);
  assert.match(votesOnly.text, /Nothing is on the floor schedule yet\./);
  assert.match(formatDigest({ votes: [vote(1), vote(2), vote(3), vote(4), vote(5), vote(6)], moved: null, coming: null }, links).text, /1 more vote this week is listed/);
});

test("weekly email: a week with nothing sends nothing; a week with no votes still says so and keeps the order", () => {
  assert.equal(formatDigest({ votes: [], moved: null, coming: null, hasIssues: true }, links), null);
  const m = formatDigest({ votes: [], moved, coming: null, hasIssues: true }, links);
  assert.equal(m.items, 1);
  assert.match(m.text, /None of your legislators had a recorded vote on a bill this week\./);
  assert.ok(m.text.indexOf("None of your legislators") < m.text.indexOf("1. Health care"));
  assert.equal(m.subject.replace(/^\[[^\]]+\] /, ""), "Your weekly update");
  assert.match(formatDigest({ votes: [vote(1)], moved: null, coming: null, hasIssues: false }, links).text, /You have not picked any issues yet\. Pick up to three on the home screen: https:\/\/site\.test\//);
});

test("weekly email: the HTML says the same things, labels Analysis apart from the record, and carries the picture; the text does not", () => {
  const m = formatDigest({ votes: [{ ...vote(1), headline: "Raises pay for <nurses> & aides." }], moved, coming, hasIssues: true }, links);
  assert.match(m.text, /\[Analysis\] Raises pay for <nurses> & aides\./);
  assert.match(m.html, />Analysis<\/span> Raises pay for &lt;nurses&gt; &amp; aides\./, "text from the record is escaped");
  for (const s of ["How your legislators voted this week", "One bill in your issues that moved", "One thing coming up", "You&#39;re caught up.".replace("&#39;", "'"), "Stop these emails", "It does not grade them."]) assert.ok(m.html.includes(s), `the HTML has “${s}”`);
  assert.ok(m.html.includes(`<img src="${SITE}/o/mark.gif" width="1" height="1" alt=""`), "the picture is in the HTML");
  assert.doesNotMatch(m.text, /\/o\/mark\.gif/, "the plain text has no picture");
  assert.doesNotMatch(formatDigest({ votes: [vote(1)], moved: null, coming: null }, { site: SITE, unsubscribe: "u" }).html, /<img/, "no picture without a mark");
  assert.doesNotMatch(m.html, /<script|https?:\/\/(?!site\.test|clerk\.house\.gov)/, "nothing is loaded from anywhere but the site and the official record");
});

/* ───────────────────────────── 2–4. The Monday send, against a real database ───────────────────────────── */

test("weekly email: a reader with a place and no follows gets it, in order, five items at most; then once a week", async () => {
  const { db, client } = await freshDb();
  await people(db);
  const a = await reader(db), followsOnly = await reader(db, { place: false }), nobody = await reader(db, { place: false }), optedOut = await reader(db, { optIn: 0 }), unconfirmed = await reader(db, { email: false });
  await db.insert(schema.userFollows).values({ userId: followsOnly.userId, politicianId: "C001098", createdAt: MON - 20 * DAY });
  assert.equal((await db.select().from(schema.userFollows).where(eq(schema.userFollows.userId, a.userId))).length, 0, "the first reader follows nobody by hand");
  // Six House passage votes and one Senate vote in the week, a procedural House vote, and one House vote from the week before.
  for (let i = 1; i <= 6; i++) await rollCall(db, await fedBill(db, 100 + i), { at: MON - (7 - i) * DAY + HOUR, votes: { D000399: i % 2 ? "Yea" : "Nay", F000246: "Yea" } });
  await rollCall(db, await fedBill(db, 107), { chamber: "senate", at: MON - HOUR, question: "On Passage of the Bill", result: "Bill Passed", yea: 60, nay: 38, votes: { C001056: "Yea", C001098: "Not Voting" } });
  await rollCall(db, "119-hr-101", { at: MON - 3 * DAY, question: "On Ordering the Previous Question", votes: { D000399: "Nay" } });
  await rollCall(db, await fedBill(db, 108), { at: MON - 9 * DAY, votes: { D000399: "Yea" } });
  // A Texas record vote on a bill, on a day before the send day.
  await db.insert(schema.txBills).values({ id: "tx-90-hb7", session: "90", identifier: "HB 7", title: "Relating to school lunches.", chamber: "lower", classification: ["bill"], subjects: [], stage: "passed_first",
    tloUrl: "https://capitol.texas.gov/BillLookup/History.aspx?LegSess=90R&Bill=HB7", feed: "openstates", sourceUrl: "https://capitol.texas.gov/", retrievedAt: MON });
  await db.insert(schema.txVotes).values({ id: "tv-1", billId: "tx-90-hb7", motion: "Passed (third reading)", date: "2026-11-15", result: "pass", chamber: "lower", counts: { yes: 85, no: 60 }, tallyOk: 1, retrievedAt: MON });
  await db.insert(schema.txVotes).values({ id: "tv-today", billId: "tx-90-hb7", motion: "Adopted (conference committee report)", date: "2026-11-16", result: "pass", chamber: "lower", counts: { yes: 90, no: 50 }, tallyOk: 1, retrievedAt: MON });
  await db.insert(schema.txMemberVotes).values({ voteId: "tv-today", personId: "ocd-person/hd49", name: "Hinojosa", option: "yes" });
  await db.insert(schema.txMemberVotes).values({ voteId: "tv-1", personId: "ocd-person/hd49", name: "Hinojosa", option: "yes" });
  // One bill in the reader's issue that moved, and one on the floor schedule.
  await db.insert(schema.issueCategories).values({ slug: "health-care", name: "Health care", sortOrder: 1 });
  await db.insert(schema.readerIssues).values({ userId: a.userId, slug: "health-care", createdAt: MON - 30 * DAY });
  const clinic = await fedBill(db, 150, "Clinic Access Act"), early = await fedBill(db, 151, "Earlier Health Act");
  await db.insert(schema.billCategories).values([{ billId: clinic, categorySlug: "health-care", method: "mapping", createdAt: MON }, { billId: early, categorySlug: "health-care", method: "mapping", createdAt: MON }]);
  await db.insert(schema.officialBillDepth).values([{ billId: clinic, stage: "president", stageDate: "2026-11-13" }, { billId: early, stage: "committee", stageDate: "2026-11-12" }]);
  const roads = await fedBill(db, 160, "Roads Act");
  await db.insert(schema.officialFloorSchedule).values({ chamber: "house", weekOf: "20261116", label: "H.R. 160", billId: roads, description: "Roads Act", sourceUrl: "https://docs.house.gov/floor/", retrievedAt: MON });

  const box = outbox(), deps = { site: SITE, secret: SECRET, send: box.send, unsubscribe: async id => `${SITE}/account/unsubscribe?t=${id}` };
  const first = await runWeekly(db, MON, deps);
  assert.deepEqual(first, { accounts: 3, sent: 2, empty: 1, failed: 0, domainNeeded: false }, "the opted-out and the unconfirmed reader are not asked; the reader with no place, follows or issues gets nothing");
  const mine = box.mail.find(m => m.to === a.email).text;
  assert.deepEqual(mine.match(/^\d+\. /gm), ["1. ", "2. ", "3. ", "4. ", "5. "]);
  // Own legislators from the place: both senators, the representative and the Texas representative, with no follow on file.
  assert.match(mine, /1\. The Senate passed H\.R\. 107 \(the Sample 107 Act\), 60–38, on 16 November 2026\.\n   Sen\. John Cornyn voted Yes\.\n   Sen\. Ted Cruz did not vote\./);
  assert.match(mine, /2\. The House passed H\.R\. 106 \(the Sample 106 Act\), 392–18, on 15 November 2026\.\n   Rep\. Lloyd Doggett voted No\./);
  assert.match(mine, /3\. The Texas House passed HB 7 \(a bill relating to school lunches\), 85–60, on 15 November 2026\.\n   State Rep\. Gina Hinojosa voted Yes\./);
  assert.doesNotMatch(mine, /final House–Senate version/, "a Texas vote dated on the send day waits for next week's email, so it is listed once");
  assert.match(mine, /5 more votes this week are listed on your Following page/);
  assert.match(mine, /4\. Health care: H\.R\. 150 \(the Clinic Access Act\)\. It was sent to the President on 13 November 2026\./, "of two bills that moved, the one that went furthest");
  assert.match(mine, /5\. The House plans to take up H\.R\. 160 \(the Roads Act\) in the week of 16 November 2026\./);
  assert.doesNotMatch(mine, /Previous Question|H\.R\. 108|Pat Fallon/, "no procedural vote, nothing from before the week, nobody else's legislator");
  assert.ok(mine.indexOf(CAUGHT_UP) > mine.indexOf("5. The House plans"));
  assert.doesNotMatch(mine + box.mail[0].html, CALM);
  // A reader who only follows one senator gets that senator's vote.
  const theirs = box.mail.find(m => m.to === followsOnly.email).text;
  assert.match(theirs, /Sen\. Ted Cruz did not vote\./); assert.doesNotMatch(theirs, /Cornyn|Doggett/);

  // Once a week: the same Monday again, and the next day, send nothing more.
  for (const again of [MON + 60_000, MON + DAY]) assert.equal((await runWeekly(db, again, deps)).sent, 0);
  assert.equal(box.mail.length, 2);
  assert.equal((await db.select().from(schema.digestSends)).length, 2);
  // The next Monday: the Texas vote dated on last week's send day is in this email, once.
  const next = await runWeekly(db, MON + 7 * DAY, deps);
  assert.deepEqual([next.sent, next.empty], [1, 2]);
  assert.match(box.mail[2].text, /1\. The Texas House approved the final House–Senate version of HB 7 \(a bill relating to school lunches\), 90–50, on 16 November 2026\.\n   State Rep\. Gina Hinojosa voted Yes\./);
  assert.doesNotMatch(box.mail[2].text, /85–60|H\.R\. 10\d/, "nothing from the week before is repeated");
  // A Monday when nothing happened: no email and no row in the send log.
  const quiet = await runWeekly(db, MON + 14 * DAY, deps);
  assert.deepEqual([quiet.sent, quiet.empty, box.mail.length], [0, 3, 3]);
  assert.equal((await db.select().from(schema.digestSends).where(eq(schema.digestSends.week, "2026-W49"))).length, 0);
  // And when something does happen, the next week's email goes out again.
  await rollCall(db, await fedBill(db, 170), { at: MON + 17 * DAY, votes: { D000399: "Yea" } });
  assert.equal((await runWeekly(db, MON + 21 * DAY, deps)).sent, 1);
  void nobody; void optedOut; void unconfirmed;

  /* The open mark: counted once, tied to nobody. */
  const sent = box.mail.find(m => m.to === a.email), token = sent.html.match(/\/o\/([^"]+)\.gif"/)[1], other = box.mail.find(m => m.to === followsOnly.email).html.match(/\/o\/([^"]+)\.gif"/)[1];
  assert.notEqual(token, other, "each email has its own mark");
  const mark = token.split(".")[0];
  assert.match(mark, /^[A-Za-z0-9_-]{22}$/);
  assert.doesNotMatch(await everythingBut(client, "anon_marks"), new RegExp(mark), "the mark is stored nowhere when the email is sent: not with the account and not in the send log");
  assert.equal((await db.select().from(schema.anonMarks)).length, 0, "nothing is counted until the picture is loaded");
  assert.equal(await countOpen(db, `${token}.gif`, SECRET, MON + HOUR), true);
  for (let i = 0; i < 4; i++) assert.equal(await countOpen(db, token, SECRET, MON + (i + 2) * HOUR), false, "the same email opened again is not a second open");
  const rows = await db.select().from(schema.anonMarks);
  assert.deepEqual(rows, [{ kind: "weekly_open", mark, period: "2026-W47", at: MON + HOUR }]);
  assert.deepEqual(Object.keys(rows[0]), ["kind", "mark", "period", "at"], "a row is a kind, a mark, a week and a time: no reader, no account, no address");
  for (const id of [a.userId, a.accountId, a.email, "r1"]) assert.ok(!token.includes(id));
  assert.doesNotMatch(await everythingBut(client, "anon_marks"), new RegExp(mark), "and still nowhere else after it was counted");
  // Opened the following Monday, it still counts for the week it was sent in.
  assert.equal(await countOpen(db, other, SECRET, MON + 8 * DAY), true);
  assert.equal((await db.select().from(schema.anonMarks).where(eq(schema.anonMarks.period, "2026-W47"))).length, 2);
  // Made-up addresses count nothing.
  for (const bad of ["", "x", newMark(), `${newMark()}.2026-W47.AAAAAAAAAAAAAAAAAAAAAA`, mintToken("weekly_open", "another-secret", "2026-W47"), mintToken("loop_return", SECRET), token.replace("W47", "W48")])
    assert.equal(await countOpen(db, bad, SECRET, MON + HOUR), false, `“${bad.slice(0, 12)}…” is not counted`);
  assert.equal((await db.select().from(schema.anonMarks)).length, 2);
  // The measure: two emails went out in that week, two were opened.
  const m = await loopMeasures(db, MON + 2 * DAY);
  assert.deepEqual([m.week, m.weeklyEmailsSent, m.weeklyOpens, m.weeklyOpenRate], ["2026-W47", 2, 2, 1]);
});

test("the mark: random, signed by the site, and the routes show nothing", () => {
  const a = mintToken("weekly_open", SECRET, "2026-W47"), b = mintToken("weekly_open", SECRET, "2026-W47");
  assert.notEqual(a, b);
  assert.deepEqual(readToken("weekly_open", a, SECRET), { mark: a.split(".")[0], period: "2026-W47" });
  assert.equal(readToken("loop_return", a, SECRET), null, "a mark for one use is not accepted for another");
  assert.equal(new Set(Array.from({ length: 200 }, newMark)).size, 200);
  assert.equal(PIXEL.length, 42); assert.equal(PIXEL.subarray(0, 6).toString("latin1"), "GIF89a");
  // A notice's link can only lead to a page on this site.
  for (const [to, want] of [["/bills/119-hr-2102", "/bills/119-hr-2102"], ["/texas/bills/tx-90-hb2", "/texas/bills/tx-90-hb2"], ["/notices", "/notices"], ["/", "/"], [null, "/"], ["https://evil.example/", "/"], ["//evil.example", "/"],
    ["/bills/../editor", "/"], ["/editor", "/"], ["/bills/x?next=//evil.example", "/"]]) assert.equal(safeReturnPath(to), want);
  assert.equal(returnLink(SITE, "tok", "/bills/119-hr-1"), `${SITE}/n/tok?to=%2Fbills%2F119-hr-1`);
  // The two routes: no page content, no cookie set, nothing read about the visitor but (for a push) whether they are an invited reader.
  const picture = read("app/o/[mark]/route.ts"), link = read("app/n/[mark]/route.ts");
  assert.match(picture, /"Content-Type": "image\/gif"/); assert.match(picture, /new Uint8Array\(PIXEL\)/);
  assert.doesNotMatch(picture, /cookies\(|headers\(|currentAppUserId|currentAccount|viewerAccess/, "the picture reads nothing about who asked");
  assert.match(link, /Location: safeReturnPath\(/);
  for (const f of [picture, link]) assert.doesNotMatch(f, /currentAppUserId|currentAccount|readerAccounts|\.set\(|userId/, "neither route learns or stores who the visitor is");
  assert.match(read("lib/loop/marks.ts"), /load pictures ahead of time/, "the file says what inflates the open rate");
});

/* ───────────────────────────── 5. Closing the loop ───────────────────────────── */

const BILL = { label: "H.R. 2102", title: "Major Richard Star Act", billType: "hr" };
const NOV12 = Date.parse("2026-11-12T20:00:00Z");

test("loop events: one notice per roll call, with the result in it; a passage with no roll call says nobody's vote was recorded", () => {
  const pass = { id: "house-2026-323", chamber: "house", votedAt: NOV12, question: "On Passage", title: null, result: "Passed", yea: 392, nay: 18 };
  const actions = [
    { actionDate: "2026-11-12", text: "Passed/agreed to in House: On passage Passed by the Yeas and Nays: 392 - 18 (Roll no. 323).", type: "Floor", chamber: null, stage: "passed_first" },
    { actionDate: "2026-11-13", text: "Passed/agreed to in Senate: Passed Senate without amendment by Unanimous Consent.", type: "Floor", chamber: "senate", stage: "passed_first" },
    { actionDate: "2026-11-14", text: "Signed by President.", type: "President", chamber: null, stage: "law" },
    { actionDate: "2026-11-14", text: "Became Public Law No: 119-99.", type: "BecameLaw", chamber: null, stage: "law" },
  ];
  const events = federalEvents({ bill: BILL, rollCalls: [pass, { ...pass, id: "house-2026-322", question: "On Ordering the Previous Question" }, { ...pass, id: "house-2026-321", question: "On Agreeing to the Amendment" }], actions, now: NOV12 + 3 * DAY });
  assert.deepEqual(events.map(e => [e.event, e.ref]), [["floor_vote", "rc:house-2026-323"], ["passed", "passed:senate"], ["signed", "law"]], "the House passage is the roll call's notice, not a second one; procedure and amendments give none");
  assert.equal(events[0].result, "The House passed H.R. 2102 (the Major Richard Star Act), 392–18, on 12 November 2026.");
  assert.equal(events[0].title, "H.R. 2102 passed the House, 392–18");
  assert.equal(events[1].result, "The Senate passed H.R. 2102 (the Major Richard Star Act) on 13 November 2026 by unanimous consent. No member’s vote was recorded by name.");
  assert.equal(events[2].result, "The President signed H.R. 2102 (the Major Richard Star Act) into law on 14 November 2026.");
  assert.deepEqual(events.map(e => e.advanced), [true, true, true]);
  // A failed passage, a veto, a failed vote to end debate, and a tally under review (no numbers).
  const fail = federalEvents({ bill: BILL, rollCalls: [{ ...pass, question: "On Motion to Suspend the Rules and Pass", result: "Failed", yea: 250, nay: 170 }], actions: [], now: NOV12 });
  assert.equal(fail[0].result, "H.R. 2102 (the Major Richard Star Act) did not pass the House, 250–170, on 12 November 2026. It needed two-thirds.");
  assert.equal(fail[0].advanced, false);
  const veto = federalEvents({ bill: BILL, rollCalls: [], actions: [{ actionDate: "2026-11-20", text: "Vetoed by President.", type: "Veto", chamber: null, stage: "vetoed" }], now: NOV12 + 9 * DAY });
  assert.deepEqual([veto[0].event, veto[0].ref, veto[0].result, veto[0].advanced], ["vetoed", "vetoed", "The President vetoed H.R. 2102 (the Major Richard Star Act) on 20 November 2026.", false]);
  const cloture = federalEvents({ bill: BILL, rollCalls: [{ ...pass, id: "senate-119-2-9", chamber: "senate", question: "On the Cloture Motion", result: "Cloture Motion Rejected", yea: 48, nay: 51 }], actions: [], now: NOV12 });
  assert.equal(cloture[0].result, "A Senate vote to end debate on H.R. 2102 (the Major Richard Star Act) failed, 48–51, on 12 November 2026 (60 votes were needed).");
  assert.equal(federalEvents({ bill: BILL, rollCalls: [{ ...pass, question: "On the Cloture Motion", chamber: "senate", result: "Cloture Motion Agreed to" }], actions: [], now: NOV12 }).length, 0, "debate went on: the vote on the bill is the one that counts");
  assert.equal(federalEvents({ bill: BILL, rollCalls: [{ ...pass, underReview: true }], actions: [], now: NOV12 })[0].result, "The House passed H.R. 2102 (the Major Richard Star Act) on 12 November 2026.");
  // The record says a vote was taken by name, but the roll call is not loaded yet: wait three days, then say what is known.
  const waiting = { bill: BILL, rollCalls: [], actions: [actions[0]] };
  assert.equal(federalEvents({ ...waiting, now: NOV12 + DAY }).length, 0);
  assert.equal(federalEvents({ ...waiting, now: NOV12 + 5 * DAY })[0].result, "The House passed H.R. 2102 (the Major Richard Star Act) on 12 November 2026. Each member’s vote is not on this site yet.");
  // Became law with no signing on record (the stage alone).
  assert.equal(federalEvents({ bill: BILL, rollCalls: [], actions: [], depth: { stage: "law", stageDate: "2026-11-15" }, now: NOV12 + 4 * DAY })[0].result, "H.R. 2102 (the Major Richard Star Act) became law on 15 November 2026.");
});

test("loop events: only after the reader answered or followed, and only news (14 days)", () => {
  const rc = { date: "2026-11-12", at: NOV12 }, dayOnly = { date: "2026-11-13", at: null };
  assert.equal(shouldNotify(rc, NOV12 - 1, NOV12 + HOUR), true);
  assert.equal(shouldNotify(rc, NOV12 + 1, NOV12 + HOUR), false, "answered after the vote: they already know");
  assert.equal(shouldNotify(dayOnly, Date.parse("2026-11-13T23:00:00Z"), NOV12 + 2 * DAY), true, "the record gives only the day, so the same day counts");
  assert.equal(shouldNotify(dayOnly, Date.parse("2026-11-14T01:00:00Z"), NOV12 + 2 * DAY), false);
  assert.equal(LOOP_WINDOW_DAYS, 14);
  assert.equal(shouldNotify(rc, 0, NOV12 + 15 * DAY), false, "a record that arrives a fortnight late is not announced");
  assert.equal(shouldNotify(dayOnly, 0, NOV12 + 16 * DAY), false);
});

test("loop notices: each legislator's line, the same form for everyone, and never a guess", () => {
  const members = [{ id: "S1", short: "Sen. John Cornyn", chamber: "senate" }, { id: "S2", short: "Sen. Ted Cruz", chamber: "senate" }, { id: "H1", short: "Rep. Lloyd Doggett", chamber: "house" }];
  const houseVote = { voteId: "rc1", chamber: "house", date: "2026-11-12" };
  assert.deepEqual(memberLines(members, houseVote, [{ voteId: "rc1", memberId: "H1", position: "Nay", chamber: "house", date: "2026-11-12" }]),
    ["Sen. John Cornyn has not voted on this bill.", "Sen. Ted Cruz has not voted on this bill.", "Rep. Lloyd Doggett voted No."]);
  assert.deepEqual(memberLines(members, houseVote, []).at(-1), "Rep. Lloyd Doggett is not listed in this recorded vote.");
  // The Senate then passes it with no vote by name: the senators' lines say so, and the representative's earlier vote is given with its date.
  const senate = { voteId: null, chamber: "senate", date: "2026-11-13" };
  assert.deepEqual(memberLines(members, senate, [{ voteId: "rc1", memberId: "H1", position: "Not Voting", chamber: "house", date: "2026-11-12" }]),
    ["Sen. John Cornyn: the vote was not recorded by name.", "Sen. Ted Cruz: the vote was not recorded by name.", "Rep. Lloyd Doggett did not vote when the House voted on 12 November 2026."]);
  // Signed: no chamber acted. One senator voted earlier; the House passed it without names.
  const signed = { voteId: null, chamber: null, date: "2026-11-14" };
  assert.deepEqual(memberLines(members, signed, [{ voteId: "rc9", memberId: "S1", position: "Yea", chamber: "senate", date: "2026-11-10" }], { unrecorded: new Map([["house", true]]) }),
    ["Sen. John Cornyn voted Yes when the Senate voted on 10 November 2026.", "Sen. Ted Cruz has not voted on this bill.", "Rep. Lloyd Doggett: the House passed it with no vote recorded by name."]);
  assert.equal(memberLines(members, signed, [], { unrecorded: new Map([["senate", false]]) })[0], "Sen. John Cornyn: it failed in the Senate with no vote recorded by name.");
  assert.match(memberLines([], houseVote, [])[0], /^Your legislators are not on file/);
  assert.equal(memberLines([{ id: "T1", short: "State Rep. Gina Hinojosa", chamber: "lower" }], { voteId: "tv1", chamber: "lower", date: "2026-11-13" }, [], { unlisted: new Set(["tv1"]) })[0],
    "State Rep. Gina Hinojosa: this site’s copy of the vote does not list each member.");
});

test("loop notices: the district line appears only from 25 counted residents, mail-verified first, a small group by size only", () => {
  assert.equal(MIN_SHOWN, 25);
  const under = districtLine("TX-37", { mail: { support: 12, oppose: 6, unsure: 2 }, address: { support: 3, oppose: 1, unsure: 0 } }, true);
  assert.equal(under, `Counted residents of TX-37: ${NOT_ENOUGH_DISTRICT} ${NOT_SCIENTIFIC}`, "24 counted residents: the fixed line and no number");
  assert.doesNotMatch(under, /\d+ (support|oppose|voters)/);
  const over = districtLine("TX-37", { mail: { support: 12, oppose: 6, unsure: 2 }, address: { support: 3, oppose: 1, unsure: 1 } }, true);
  assert.equal(over, "Counted residents of TX-37, 25 voters: Mail-verified, 20 voters: 12 support · 6 oppose · 2 unsure; Address-matched, 5 voters: 3 support · 1 oppose · 1 unsure. More of them supported this bill than opposed it. The result matched that. Not a scientific poll.");
  assert.ok(over.indexOf("Mail-verified") < over.indexOf("Address-matched"));
  // A group under 5 is listed by size only, and its answers take no part in the comparison.
  const small = districtLine("TX-37", { mail: { support: 20, oppose: 9, unsure: 2 }, address: { support: 0, oppose: 3, unsure: 0 } }, false);
  assert.equal(small, "Counted residents of TX-37, 34 voters: Mail-verified, 31 voters: 20 support · 9 oppose · 2 unsure; Address-matched: fewer than 5 voters. More of them supported this bill than opposed it. The result did not match that. Not a scientific poll.");
  assert.match(districtLine("TX-37", { mail: { support: 5, oppose: 25, unsure: 0 }, address: null }, false), /More of them opposed this bill than supported it\. The result matched that\./);
  assert.match(districtLine("TX-37", { mail: { support: 5, oppose: 25, unsure: 0 }, address: null }, true), /The result did not match that\./);
  assert.match(districtLine("TX-37", { mail: { support: 15, oppose: 15, unsure: 0 }, address: null }, true), /They were evenly split between support and oppose\. Not a scientific poll\.$/);
  assert.doesNotMatch(districtLine("TX-37", { mail: { support: 20, oppose: 9, unsure: 2 }, address: null }, null), /matched|did not match/);
  for (const line of [under, over, small, districtLine(null, null, true)]) { assert.ok(line.endsWith(NOT_SCIENTIFIC)); assert.doesNotMatch(line, /%|\bverified residents\b|(?<!Mail-)verified/); }
  // Which district: the congressional district for Congress; the acting chamber's district for a state bill.
  const place = { congressional: "TX-37", stateUpper: "TX-SD-14", stateLower: "TX-HD-49" };
  assert.deepEqual([districtScope("federal", place, "senate"), districtScope("state", place, "upper"), districtScope("state", place, "lower"), districtScope("state", place, null), districtScope("federal", null, null)],
    ["TX-37", "TX-SD-14", "TX-HD-49", "TX-HD-49", null]);
  assert.deepEqual([answerLine("support", false), answerLine("oppose", true), answerLine("unsure", false), answerLine(null, true), answerLine(null, false)], ["You said Support.", "You said Oppose.", "You said Unsure.", "You follow this bill.", null]);
});

test("loop notices: written once per reader, bill and event, for answered and for followed bills; one email for several events", async () => {
  const { db, client } = await freshDb();
  await people(db);
  const bill = await fedBill(db, 2102, "Major Richard Star Act");
  const answered = await reader(db), follower = await reader(db, { email: false }), late = await reader(db), noPlace = await reader(db, { place: false }), off = await reader(db), bystander = await reader(db);
  await answer(db, answered, bill, "support", NOV12 - 2 * DAY);
  await followBill(db, follower.userId, bill, NOV12 - 3 * DAY);
  await answer(db, late, bill, "oppose", NOV12 + 30 * 60_000);          // answered half an hour after the House vote
  await answer(db, noPlace, bill, "unsure", NOV12 - 2 * DAY);
  await answer(db, off, bill, "oppose", NOV12 - 2 * DAY);
  await db.insert(schema.alertPrefs).values({ userId: off.userId, instantVotes: 0, instantBills: 0, push: 1, updatedAt: NOV12 });
  await total(db, bill, "TX-37", "mail", [12, 6, 2]); await total(db, bill, "TX-37", "address", [3, 1, 0]); // 24 counted residents
  const roll = await rollCall(db, bill, { at: NOV12, votes: { D000399: "Yea", F000246: "Nay" } });
  await rollCall(db, bill, { at: NOV12 - HOUR, question: "On Motion to Recommit", result: "Failed", votes: { D000399: "Nay" } });

  const box = outbox(), deps = { site: SITE, secret: SECRET, send: box.send, notify: box.notify };
  const first = await runLoopNotices(db, NOV12 + HOUR, deps);
  assert.deepEqual(first, { bills: 1, written: 4, readers: 4, pushed: 3, emailed: 2, emailFailed: 0, emailCapped: 0 });
  const rows = await db.select().from(schema.loopNotices);
  assert.deepEqual(rows.map(r => r.userId).sort(), [answered.userId, follower.userId, noPlace.userId, off.userId].sort(), "the answerer, the follower, the reader with no place and the reader with alerts off; not the late answerer, not a bystander");
  for (const r of rows) { assert.equal(r.event, "floor_vote"); assert.equal(r.eventRef, `rc:${roll}`); assert.equal(r.url, `/bills/${bill}`); assert.equal(r.title, "H.R. 2102 passed the House, 392–18"); }
  const mine = rows.find(r => r.userId === answered.userId);
  assert.deepEqual(mine.body.split("\n"), ["The House passed H.R. 2102 (the Major Richard Star Act), 392–18, on 12 November 2026.", "Sen. John Cornyn has not voted on this bill.", "Sen. Ted Cruz has not voted on this bill.",
    "Rep. Lloyd Doggett voted Yes.", `Counted residents of TX-37: ${NOT_ENOUGH_DISTRICT} ${NOT_SCIENTIFIC}`]);
  assert.match(rows.find(r => r.userId === noPlace.userId).body, /Your legislators are not on file[^\n]*\nYour district is not on file, so there is no district total to compare\. Not a scientific poll\.$/);
  // The notice keeps no answer; the reader's own answer is read when it is shown or emailed.
  assert.deepEqual(Object.keys(mine), ["id", "userId", "billKey", "event", "eventRef", "title", "body", "url", "createdAt", "pushedAt", "emailedAt", "seenAt"], "the table has no place for an answer");
  assert.doesNotMatch(rows.map(r => r.body).join("\n"), /You said|Pat Fallon/, "no answer in the stored notice, and nobody else's legislator");
  // Sent: a push for each reader with bill alerts on, an email for each with a confirmed address.
  assert.deepEqual(box.push.map(p => p.userId).sort(), [answered.userId, follower.userId, noPlace.userId].sort());
  const push = box.push.find(p => p.userId === answered.userId);
  assert.equal(push.url, `/n/${PUSH_ARRIVAL}?to=${encodeURIComponent(`/bills/${bill}`)}`, "the push's address holds no mark, because its text is kept beside the reader's id");
  assert.doesNotMatch(push.title + push.body, /You said|Counted residents/);
  assert.deepEqual(box.mail.map(m => m.to).sort(), [answered.email, noPlace.email].sort(), "the follower has no confirmed email; the reader who switched bill alerts off gets neither");
  const mail = box.mail.find(m => m.to === answered.email);
  assert.equal(mail.subject, "H.R. 2102 passed the House, 392–18");
  assert.match(mail.text, /Rep\. Lloyd Doggett voted Yes\.\n[^\n]*Not a scientific poll\.\nYou said Support\.\nSee the bill: https:\/\/site\.test\/n\/[A-Za-z0-9_.-]+\?to=%2Fbills%2F119-hr-2102\n/);
  assert.match(box.mail.find(m => m.to === noPlace.email).text, /You said Unsure\./);
  assert.match(mail.text, /You're caught up\./); assert.match(mail.text, /It does not grade them\.$/);
  const sentRows = await db.select().from(schema.loopNotices);
  assert.deepEqual(sentRows.filter(r => r.pushedAt).length, 3); assert.deepEqual(sentRows.filter(r => r.emailedAt).length, 2);
  assert.equal(sentRows.find(r => r.userId === off.userId).pushedAt, null);

  // Idempotent: run again, and again a day later. Nothing is written and nothing is sent.
  for (const again of [NOV12 + HOUR + 1, NOV12 + 12 * HOUR]) assert.deepEqual(await runLoopNotices(db, again, deps), { bills: 1, written: 0, readers: 0, pushed: 0, emailed: 0, emailFailed: 0, emailCapped: 0 });
  assert.equal(box.mail.length, 2); assert.equal(box.push.length, 3);
  assert.equal((await db.select().from(schema.loopNotices)).length, 4);
  await assert.rejects(db.insert(schema.loopNotices).values({ ...mine, id: "another-id" }), "the table itself refuses a second notice for the same reader, bill and event");

  // Two days later the Senate passes it by unanimous consent and the President signs it; the district total is now 34.
  await action(db, bill, 1, "2026-11-12", "Passed/agreed to in House: On passage Passed by the Yeas and Nays: 392 - 18 (Roll no. 323).", "passed_first");
  await action(db, bill, 2, "2026-11-13", "Passed/agreed to in Senate: Passed Senate without amendment by Unanimous Consent.", "passed_first", "senate");
  await action(db, bill, 3, "2026-11-14", "Signed by President.", "law");
  await total(db, bill, "TX-37", "mail", [20, 9, 2]); await total(db, bill, "TX-37", "address", [0, 3, 0]);
  box.mail.length = 0; box.push.length = 0;
  const second = await runLoopNotices(db, NOV12 + 2 * DAY, deps);
  // Five readers now have something due: the late answerer answered before the Senate acted.
  assert.deepEqual(second, { bills: 1, written: 10, readers: 5, pushed: 8, emailed: 3, emailFailed: 0, emailCapped: 0 });
  const two = box.mail.find(m => m.to === answered.email);
  assert.equal(box.mail.filter(m => m.to === answered.email).length, 1, "two events in one run are ONE email");
  assert.equal(two.subject, "2 updates on bills you weighed in on");
  assert.match(two.text, /H\.R\. 2102 passed the Senate\nThe Senate passed H\.R\. 2102 \(the Major Richard Star Act\) on 13 November 2026 by unanimous consent\. No member’s vote was recorded by name\.\nSen\. John Cornyn: the vote was not recorded by name\.\nSen\. Ted Cruz: the vote was not recorded by name\.\nRep\. Lloyd Doggett voted Yes when the House voted on 12 November 2026\./);
  assert.match(two.text, /H\.R\. 2102 became law\nThe President signed H\.R\. 2102 \(the Major Richard Star Act\) into law on 14 November 2026\./);
  assert.match(two.text, /Counted residents of TX-37, 34 voters: Mail-verified, 31 voters: 20 support · 9 oppose · 2 unsure; Address-matched: fewer than 5 voters\. More of them supported this bill than opposed it\. The result matched that\. Not a scientific poll\./);
  assert.equal((two.text.match(/You said Support\./g) ?? []).length, 2);
  const twoPush = box.push.find(p => p.userId === answered.userId);
  assert.equal(box.push.filter(p => p.userId === answered.userId).length, 1, "and one push");
  assert.deepEqual([twoPush.title, twoPush.url], ["2 updates on bills you weighed in on", `/n/${PUSH_ARRIVAL}?to=%2Fnotices`]);
  assert.equal((await db.select().from(schema.loopNotices).where(and(eq(schema.loopNotices.userId, answered.userId), eq(schema.loopNotices.billKey, bill)))).length, 3, "three events, three notices, one each");
  assert.doesNotMatch([...box.mail.map(m => m.subject + m.text), ...box.push.map(p => p.title + p.body), ...(await db.select().from(schema.loopNotices)).map(r => r.title + r.body)].join("\n"), CALM);

  // On the site: newest first, capped, the answer read now, "New" once.
  const list = await listNotices(db, answered.userId, { limit: 2, now: NOV12 + 2 * DAY });
  assert.deepEqual([list.items.length, list.total, list.more], [2, 3, 1]);
  assert.deepEqual((await listNotices(db, answered.userId, { limit: 30 })).items.map(n => n.title), ["H.R. 2102 became law", "H.R. 2102 passed the Senate", "H.R. 2102 passed the House, 392–18"], "the newest event first");
  assert.ok(list.items.every(n => n.isNew && n.answer === "You said Support."));
  assert.equal((await listNotices(db, follower.userId, { limit: 30 })).items[0].answer, "You follow this bill.");
  await db.update(schema.voiceVotes).set({ answer: "oppose" }).where(and(eq(schema.voiceVotes.userId, answered.userId), eq(schema.voiceVotes.billKey, bill)));
  assert.equal((await listNotices(db, answered.userId, { limit: 1 })).items[0].answer, "You said Oppose.", "a changed answer shows as it now is, because the notice never stored it");
  await markNoticesSeen(db, answered.userId, list.items.map(n => n.id), NOV12 + 3 * DAY);
  assert.deepEqual((await listNotices(db, answered.userId, { limit: 30 })).items.map(n => n.isNew), [false, false, true]);
  assert.equal((await listNotices(db, bystander.userId)).items.length, 0);
  // The home screen's short list: seen notices older than 14 days drop off; unseen ones stay.
  assert.equal((await listNotices(db, answered.userId, { limit: 30, recentOnly: true, now: NOV12 + 40 * DAY })).items.length, 1);

  // Coming back through the email's link: counted once, by a mark kept nowhere else.
  const token = two.text.match(/\/n\/([A-Za-z0-9_.-]+)\?to=/)[1], mark = token.split(".")[0];
  assert.doesNotMatch(await everythingBut(client, "anon_marks"), new RegExp(mark), "the mark in the link is not in the notice, the alert list or anywhere else");
  assert.equal(await countReturn(db, token, SECRET, NOV12 + 3 * DAY, false), true);
  assert.equal(await countReturn(db, token, SECRET, NOV12 + 4 * DAY, false), false);
  assert.equal(await countReturn(db, mintToken("loop_return", "another-secret"), SECRET, NOV12 + 3 * DAY, false), false, "a made-up link counts nothing");
  // A push's link has no mark: one is made on arrival, and only for an invited reader's own device.
  assert.equal(await countReturn(db, PUSH_ARRIVAL, SECRET, NOV12 + 3 * DAY, false), false);
  assert.equal(await countReturn(db, PUSH_ARRIVAL, SECRET, NOV12 + 3 * DAY, true), true);
  const marks = await db.select().from(schema.anonMarks);
  assert.deepEqual(marks.map(m => [m.kind, m.period]), [["loop_return", "2026-W46"], ["loop_return", "2026-W46"]]);
  assert.deepEqual(Object.keys(marks[0]), ["kind", "mark", "period", "at"]);
  // The measure: notices that left the site by push or email, and returns.
  const m = await loopMeasures(db, NOV12 + 4 * DAY);
  assert.deepEqual([m.noticesSent, m.noticeReturns, m.noticeReturnRate, m.noticeDays], [11, 2, 0.182, 28]);
  assert.deepEqual([m.weeklyEmailsSent, m.weeklyOpens, m.weeklyOpenRate], [0, 0, null]);
});

test("loop notices: a Texas bill, from the record votes and the bill's history", async () => {
  const { db } = await freshDb();
  await people(db);
  await db.insert(schema.txBills).values({ id: "tx-90-hb777", session: "90", identifier: "HB 777", title: "Relating to school lunches.", chamber: "lower", classification: ["bill"], subjects: [], stage: "passed_both",
    tloUrl: "https://capitol.texas.gov/", feed: "openstates", sourceUrl: "https://capitol.texas.gov/", retrievedAt: MON });
  await db.insert(schema.txVotes).values([
    { id: "tv-2nd", billId: "tx-90-hb777", motion: "Passed to engrossment", date: "2026-11-12", result: "pass", chamber: "lower", counts: { yes: 90, no: 55 }, tallyOk: 1, retrievedAt: MON },
    { id: "tv-3rd", billId: "tx-90-hb777", motion: "Passed (third reading)", date: "2026-11-13", result: "pass", chamber: "lower", counts: { yes: 85, no: 60 }, tallyOk: 1, retrievedAt: MON }]);
  await db.insert(schema.txMemberVotes).values([{ voteId: "tv-3rd", personId: "ocd-person/hd49", name: "Hinojosa", option: "no" }, { voteId: "tv-2nd", personId: "ocd-person/hd49", name: "Hinojosa", option: "yes" }]);
  await db.insert(schema.txBillActions).values([
    { billId: "tx-90-hb777", seq: 1, date: "2026-11-13", description: "Passed", chamber: "lower", classification: ["passage", "reading-3"] },
    { billId: "tx-90-hb777", seq: 2, date: "2026-11-14", description: "Passed", chamber: "upper", classification: ["passage", "reading-3"] }]);
  const r = await reader(db);
  await answer(db, r, "tx-90-hb777", "support", NOV12 - 2 * DAY);
  await total(db, "tx-90-hb777", "TX-HD-49", "mail", [10, 20, 0]);
  const box = outbox();
  const out = await runLoopNotices(db, NOV12 + 2 * DAY + HOUR, { site: SITE, secret: SECRET, send: box.send, notify: box.notify });
  assert.equal(out.written, 2);
  const rows = await db.select().from(schema.loopNotices);
  assert.deepEqual(rows.map(x => [x.event, x.eventRef, x.url]).sort(), [["floor_vote", "tv:tv-3rd", "/texas/bills/tx-90-hb777"], ["passed", "passed:upper", "/texas/bills/tx-90-hb777"]],
    "the vote on passing it and the Senate's passage; the first floor vote that carried gives no notice of its own");
  assert.deepEqual(rows.find(x => x.eventRef === "tv:tv-3rd").body.split("\n"), ["The Texas House passed HB 777 (a bill relating to school lunches), 85–60, on 13 November 2026.", "State Sen. Sarah Eckhardt has not voted on this bill.",
    "State Rep. Gina Hinojosa voted No.", "Counted residents of TX-HD-49, 30 voters: Mail-verified, 30 voters: 10 support · 20 oppose · 0 unsure. More of them opposed this bill than supported it. The result did not match that. Not a scientific poll."]);
  assert.deepEqual(rows.find(x => x.eventRef === "passed:upper").body.split("\n").slice(0, 3), ["The Texas Senate passed HB 777 (a bill relating to school lunches) on 14 November 2026. No vote by name is on file here for this decision.",
    "State Sen. Sarah Eckhardt: the vote was not recorded by name.", "State Rep. Gina Hinojosa voted No when the Texas House voted on 13 November 2026."]);
  assert.match(rows.find(x => x.eventRef === "passed:upper").body, /Counted residents of TX-SD-14: Not enough constituents yet/);
  // The pure rule on its own: a signing, a veto and a first floor vote that stopped the bill.
  const tx = texasEvents({ bill: { label: "SB 5", title: "Relating to water.", billType: "sb" }, votes: [{ id: "v", motion: "Passed to engrossment", date: "2026-11-10", result: "fail", chamber: "upper", counts: { yes: 10, no: 21 }, tallyOk: true }],
    actions: [{ date: "2026-12-01", description: "Signed by the Governor", chamber: "executive", classification: ["executive-signature"] }, { date: "2026-12-02", description: "Vetoed by the Governor", chamber: "executive", classification: ["executive-veto"] }] });
  assert.deepEqual(tx.map(e => e.result), ["The Texas Senate stopped SB 5 (a bill relating to water) at its first floor vote, 10–21, on 10 November 2026.", "The Governor signed SB 5 (a bill relating to water) on 1 December 2026.", "The Governor vetoed SB 5 (a bill relating to water) on 2 December 2026."]);
});

test("loop notices: the push never carries the reader's answer, and the old stage email stands aside", () => {
  const one = { title: "H.R. 1 passed the House, 300–120", body: "The House passed H.R. 1.\nRep. A voted Yes.\nCounted residents of TX-37: x", path: "/bills/119-hr-1", answer: "You said Support." };
  assert.deepEqual(noticePush([one]), { title: one.title, body: "The House passed H.R. 1. Rep. A voted Yes.", path: "/bills/119-hr-1" });
  assert.deepEqual(noticePush([one, one]).path, "/notices");
  for (const s of ["passed_first", "passed_second", "law", "vetoed", "failed"]) assert.ok(LOOP_STAGES.has(s));
  for (const s of ["committee", "resolving", "president", "introduced"]) assert.ok(!LOOP_STAGES.has(s), `“${s}” still gets the bill-moved email`);
  assert.match(read("lib/bill-follows.ts"), /if \(m\.stage && LOOP_STAGES\.has\(m\.stage\)\)/);
  assert.equal(stageSentence("president", "2026-11-13"), "It was sent to the President on 13 November 2026.");
  assert.equal(pickMoved([{ stage: "committee", stageDate: "2026-11-14", billId: "a" }, { stage: "passed_first", stageDate: "2026-11-12", billId: "b" }, { stage: "unknown", stageDate: "2026-11-15", billId: "c" }]).billId, "b");
});

/* ───────────────────────────── 6. Contacting an office about a bill ───────────────────────────── */

test("contacts: using the contact panel follows the bill and nothing else is stored: no office, no message, no button", async () => {
  const { db, client } = await freshDb();
  const bill = await fedBill(db, 300), r = await reader(db);
  const before = await everythingBut(client, "bill_follows");
  assert.equal(await followBill(db, r.userId, bill, MON), true);
  assert.equal(await followBill(db, r.userId, bill, MON + 5), false, "a second use changes nothing");
  assert.equal(await everythingBut(client, "bill_follows"), before, "no other table changed");
  const rows = await db.select().from(schema.billFollows);
  assert.deepEqual(rows, [{ userId: r.userId, billId: bill, createdAt: MON, lastStage: null, lastAlertAt: null }]);
  assert.deepEqual(Object.keys(rows[0]), ["userId", "billId", "createdAt", "lastStage", "lastAlertAt"], "the row says who follows which bill since when: nothing about an office, a member or a message");
  assert.equal(await isFollowing(db, r.userId, bill), true);
  await unfollowBill(db, r.userId, bill); // "Stop"
  assert.equal(await isFollowing(db, r.userId, bill), false);
  assert.equal((await db.select().from(schema.billFollows)).length, 0);
  // The tap counter is unchanged: a tap name and a kind of page, never a bill or a member.
  for (const bad of [[bill, "bill"], ["contact_call", bill], ["contact_call", "C001056"], ["contact_follow", "bill"]]) assert.equal(contactEventAllowed(...bad), false);
  assert.equal(contactEventAllowed("contact_call", "bill"), true);
  assert.match(read("components/contact/contact-tool.tsx"), /body: JSON\.stringify\(\{ event, dim \}\)/, "the tap still sends a tap name and a page kind only");
  assert.match(read("app/api/contact/event/route.ts"), /logContactTap\(body\?\.event, body\?\.dim\)/);
  // The new server actions take the bill's id and nothing else.
  const actions = read("components/contact/actions.ts");
  assert.deepEqual([...actions.matchAll(/export async function (\w+)\(([^)]*)\)/g)].map(m => [m[1], m[2]]), [["followAfterContact", "billId: string"], ["stopFollowing", "billId: string"]]);
  assert.doesNotMatch(actions.replace(/\/\*\*[\s\S]*?\*\//g, ""), /member|office|message|phone|legislatorContacts/i, "the code of the actions never touches a member, an office or a message");
  const tool = read("components/contact/contact-tool.tsx");
  assert.match(tool, /followAfterContact\(follow\.billId\)/); assert.match(tool, /stopFollowing\(follow\.billId\)/);
  assert.match(tool, /We&rsquo;ll tell you what happens to this bill\./); assert.match(tool, />Stop<\/button>/);
  assert.doesNotMatch(read("db/schema.ts").match(/export const billFollows = sqliteTable[\s\S]*?\]\);/)[0], /member|office|contact|message/i);
});

/* ───────────────────────────── 7. Vote alerts ───────────────────────────── */

test("vote alerts: every vote on a bill by a followed legislator, one message per update, five votes and how many more", async () => {
  const { db } = await freshDb();
  await people(db);
  const NOW = NOV12 + DAY;
  const a = await reader(db), offReader = await reader(db), noFollows = await reader(db);
  await db.insert(schema.alertPrefs).values([{ userId: a.userId, instantVotes: 1, instantBills: 1, push: 0, updatedAt: NOW }, { userId: offReader.userId, instantVotes: 0, instantBills: 1, push: 0, updatedAt: NOW },
    { userId: noFollows.userId, instantVotes: 1, instantBills: 1, push: 0, updatedAt: NOW }]);
  for (const id of ["D000399", "C001056", "ocd-person/hd49"]) await db.insert(schema.userFollows).values([{ userId: a.userId, politicianId: id, createdAt: NOW - 30 * DAY }, { userId: offReader.userId, politicianId: id, createdAt: NOW - 30 * DAY }]);
  assert.equal((await db.select().from(schema.readerIssues)).length, 0, "nobody here picked an issue: issues no longer decide who is alerted");
  await db.insert(schema.ingestCursors).values({ key: "alerts:lastVotedAt", value: String(NOW - 12 * HOUR), updatedAt: NOW });
  for (let i = 1; i <= 6; i++) await rollCall(db, await fedBill(db, 400 + i), { at: NOW - (7 - i) * HOUR, votes: { D000399: "Yea", F000246: "Nay" } });
  await rollCall(db, await fedBill(db, 407), { chamber: "senate", at: NOW - 30 * 60_000, question: "On Passage of the Bill", result: "Bill Passed", yea: 60, nay: 38, votes: { C001056: "Nay", C001098: "Yea" } });
  await rollCall(db, "119-hr-401", { at: NOW - 2 * HOUR, question: "On Agreeing to the Amendment", votes: { D000399: "Yea" } });
  await rollCall(db, "119-hr-401", { at: NOW - 2 * HOUR, question: "On Ordering the Previous Question", votes: { D000399: "Yea" } });
  await rollCall(db, await fedBill(db, 408), { at: NOW - 2 * DAY, votes: { D000399: "Yea" } }); // before the last update
  await db.insert(schema.txBills).values({ id: "tx-90-hb9", session: "90", identifier: "HB 9", title: "Relating to road repair.", chamber: "lower", classification: ["bill"], subjects: [], stage: "passed_first",
    tloUrl: "https://capitol.texas.gov/", feed: "openstates", sourceUrl: "https://capitol.texas.gov/", retrievedAt: NOW });
  await db.insert(schema.txVotes).values({ id: "tv-9", billId: "tx-90-hb9", motion: "Passed (third reading)", date: new Date(NOW).toISOString().slice(0, 10), result: "pass", chamber: "lower", counts: { yes: 100, no: 45 }, tallyOk: 1, retrievedAt: NOW });
  await db.insert(schema.txMemberVotes).values({ voteId: "tv-9", personId: "ocd-person/hd49", name: "Hinojosa", option: "yes" });

  const box = outbox();
  const out = await runVoteAlerts(db, NOW, { site: SITE, send: box.send, notify: box.notify });
  assert.deepEqual(out, { readers: 2, sent: 1, votes: 8, emailed: 1, emailFailed: 0, emailCapped: 0 }, "one message, to the one reader whose setting is on and who follows someone");
  assert.equal(box.push.length, 1); assert.equal(box.mail.length, 1);
  const p = box.push[0], mail = box.mail[0];
  assert.deepEqual([p.userId, p.title, p.url], [a.userId, "8 new votes by legislators you follow", "/following"]);
  assert.equal(ALERT_MAX_VOTES, 5);
  assert.equal((mail.text.match(/^(Rep\.|Sen\.|State Rep\.) /gm) ?? []).length, 5, "five votes are listed");
  assert.match(mail.text, /And 3 more votes by legislators you follow\. They are listed here: https:\/\/site\.test\/following/);
  // 20 Nov 2026: the email is in the vote row's order: what the bill is, the explanation line, who voted and how, the number, the labelled link.
  assert.match(mail.text, /Sample 407 Act\nPlain-English explanation coming\nSen\. John Cornyn voted No on passing this bill\. It passed 60–38\.\nH\.R\. 407\nWhat this bill does: https:\/\/site\.test\/bills\/119-hr-407/);
  assert.match(mail.text, /Sample 406 Act\nPlain-English explanation coming\nRep\. Lloyd Doggett voted Yes to pass this bill\. It passed 392–18\./);
  assert.doesNotMatch(mail.text, /Hinojosa/, "the Texas vote is one of the three that are counted, not listed: it carries a day, not a time, so it sorts as the oldest");
  assert.doesNotMatch(mail.text + p.body, /Amendment|Previous Question|Sample 408 Act|Ted Cruz|Pat Fallon/, "no amendment, no procedural step, nothing from before the last update, nobody the reader does not follow");
  assert.match(mail.text, /Turn them off on your Account page: https:\/\/site\.test\/account/);
  assert.doesNotMatch(mail.subject + mail.text + p.title + p.body, CALM);
  // The next update with nothing new sends nothing; one new vote then sends one message that names it.
  assert.equal((await runVoteAlerts(db, NOW + HOUR, { site: SITE, send: box.send, notify: box.notify })).sent, 0);
  assert.equal(box.push.length, 1);
  await rollCall(db, await fedBill(db, 409), { at: NOW + 2 * HOUR, result: "Failed", yea: 200, nay: 220, votes: { D000399: "Not Voting" } });
  assert.equal((await runVoteAlerts(db, NOW + 3 * HOUR, { site: SITE, send: box.send, notify: box.notify })).sent, 1);
  assert.deepEqual([box.push[1].title, box.push[1].url], ["Rep. Lloyd Doggett voted on H.R. 409", "/bills/119-hr-409"]);
  assert.equal(box.push[1].body, "Rep. Lloyd Doggett did not vote on passing the Sample 409 Act. It did not pass, 200–220.");
  // A Texas record vote the next day: announced once, and not again when the same day is read a second time.
  await db.insert(schema.txVotes).values({ id: "tv-10", billId: "tx-90-hb9", motion: "Passed to engrossment", date: new Date(NOW + DAY).toISOString().slice(0, 10), result: "pass", chamber: "lower", counts: { yes: 99, no: 46 }, tallyOk: 1, retrievedAt: NOW + DAY });
  await db.insert(schema.txMemberVotes).values({ voteId: "tv-10", personId: "ocd-person/hd49", name: "Hinojosa", option: "no" });
  assert.equal((await runVoteAlerts(db, NOW + DAY + HOUR, { site: SITE, send: box.send, notify: box.notify })).sent, 1);
  assert.deepEqual([box.push[2].title, box.push[2].url, box.push[2].body], ["State Rep. Gina Hinojosa voted on HB 9", "/texas/bills/tx-90-hb9", "State Rep. Gina Hinojosa voted No on moving a bill relating to road repair forward. It went on to a final vote, 99–46."]);
  assert.equal((await runVoteAlerts(db, NOW + DAY + 2 * HOUR, { site: SITE, send: box.send, notify: box.notify })).sent, 0);
  assert.equal(box.push.length, 3);
  void noFollows;
});

test("vote alerts: the bundle on its own", () => {
  const v = (n, at) => ({ member: "Rep. A B", line: `Voted Yes to pass the Act ${n}. It passed 300–120.`, billLabel: `H.R. ${n}`, path: `/bills/119-hr-${n}`, at });
  assert.equal(alertBundle([], { site: SITE, brand: "X" }), null);
  const one = alertBundle([v(1, 5)], { site: SITE, brand: "X" });
  assert.deepEqual([one.title, one.path, one.body, one.shown, one.more], ["Rep. A B voted on H.R. 1", "/bills/119-hr-1", "Rep. A B voted Yes to pass the Act 1. It passed 300–120.", 1, 0]);
  const five = alertBundle([1, 2, 3, 4, 5].map(n => v(n, n)), { site: SITE, brand: "X" });
  assert.deepEqual([five.shown, five.more], [5, 0]); assert.doesNotMatch(five.text, /more vote/);
  const six = alertBundle([1, 2, 3, 4, 5, 6].map(n => v(n, n)), { site: SITE, brand: "X" });
  assert.deepEqual([six.shown, six.more, six.title, six.path], [5, 1, "6 new votes by legislators you follow", "/following"]);
  assert.match(six.body, /^Rep\. A B voted Yes to pass the Act 6\./, "newest first");
  assert.match(six.body, /And 1 more vote by legislators you follow\.$/); assert.doesNotMatch(six.body, /Act 1\./);
});

test("vote alerts: the email uses the vote row's order, with the labelled link and never a bare bill number as the link", () => {
  const base = { member: "Rep. A B", line: "Voted Yes to pass the Tax Relief Act. It passed 300–120.", vote: "Voted Yes to pass this bill. It passed 300–120.", billLabel: "H.R. 7", path: "/bills/119-hr-7", at: 9 };
  const withSummary = alertBundle([{ ...base, row: { main: "Lets fraud victims deduct stolen money.", does: "This bill would let fraud victims deduct stolen money.", coming: false, label: "Analysis", number: "H.R. 7" } }], { site: SITE, brand: "X" });
  const lines = withSummary.text.split("\n"), at = lines.indexOf("Lets fraud victims deduct stolen money.");
  assert.ok(at > 0);
  assert.deepEqual(lines.slice(at, at + 5), ["Lets fraud victims deduct stolen money.", "This bill would let fraud victims deduct stolen money.", "Rep. A B voted Yes to pass this bill. It passed 300–120.", "H.R. 7", `What this bill does: ${SITE}/bills/119-hr-7`]);
  assert.doesNotMatch(withSummary.text, /H\.R\. 7: http/, "the link is labelled, not a bill number");
  // The push stays one self-contained sentence that names the bill.
  assert.equal(withSummary.body, "Rep. A B voted Yes to pass the Tax Relief Act. It passed 300–120.");
  const none = alertBundle([{ ...base, row: { main: "Tax Relief Act", does: null, coming: true, label: "Official", number: "H.R. 7" } }], { site: SITE, brand: "X" });
  const l2 = none.text.split("\n"), a2 = l2.indexOf("Tax Relief Act");
  assert.deepEqual(l2.slice(a2, a2 + 4), ["Tax Relief Act", "Plain-English explanation coming", "Rep. A B voted Yes to pass this bill. It passed 300–120.", "H.R. 7"]);
});

/* ───────────────────────────── The rules that hold everywhere ───────────────────────────── */

test("identical for every party, no grades, calm: the code reads no party and the words carry no verdict", () => {
  for (const f of ["lib/loop/rules.ts", "lib/loop/notices.ts", "lib/loop/alerts.ts", "lib/loop/weekly.ts", "lib/loop/people.ts", "lib/digest-format.ts", "components/loop/notices.tsx"]) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    assert.doesNotMatch(code, /\bparty\b|Republican|Democrat/i, `${f} never reads or names a party`);
    assert.doesNotMatch(code, /\b(score|scores|rating|ratings|percent|percentage)\b|%/i, `${f} has no score, rating or percentage`);
  }
  const page = read("components/loop/notices.tsx") + read("app/notices/page.tsx");
  assert.match(page, /You&rsquo;re caught up\./); assert.match(read("app/notices/page.tsx"), /if \(!access\.allowed\) return <PublicShell current="\/notices" access=\{access\}>\{null\}<\/PublicShell>;/);
  assert.doesNotMatch(page, /load more|infinite/i);
});

test("weeklyInput: nothing that is not the reader's own", async () => {
  const { db } = await freshDb();
  await people(db);
  const r = await reader(db, { place: false });
  assert.deepEqual(await weeklyInput(db, r.userId, MON - 7 * DAY, MON, { site: SITE }), { votes: [], moved: null, coming: null, hasIssues: false, nobody: true });
});

test("the site emails readers on its own initiative only once it has its own sending address (lead, 18 Nov)", async () => {
  const { readerEmailReady } = await import("../lib/mailer.ts");
  assert.equal(readerEmailReady({}), false); assert.equal(readerEmailReady({ READER_FROM_EMAIL: "  " }), false);
  assert.equal(readerEmailReady({ READER_FROM_EMAIL: "News <news@example.org>" }), true);
  const { readFileSync } = await import("node:fs");
  for (const f of ["lib/loop/run.ts", "lib/digest.ts", "lib/instant-alerts.ts"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.match(src, /send: sendToReader/, `${f} sends through the guarded sender`); assert.doesNotMatch(src, /send: sendTo\b(?!Reader)/);
  }
});
