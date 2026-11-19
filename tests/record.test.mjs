// "Your record", aggregate social proof and the welcome wording (owner, 18 Nov 2026, points 5 and 9).
// The rules in lib/voice-rules.ts, lib/agreement.ts and lib/constituent/proof.ts, and the same database functions the
// site runs (lib/record/store.ts, lib/constituent/store.ts) against a temporary database built from the real migrations.
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
import ts from "typescript";
import * as schema from "../db/schema.ts";
import { billOutcome, txBillOutcome, chamberPassed, originChamber, outcomeDay, recordMemberLine, txMemberLine, txShownVote, txPassageVote, recordPage, recordEndLine, RECORD_PAGE_SIZE,
  meaningfulVote } from "../lib/voice-rules.ts";
import { sameWayCount, sameWayLine, OWN_COMPARISON, COMPARISON_LEFT_OUT } from "../lib/agreement.ts";
import { weighedInLine, socialProof, scopeWords } from "../lib/constituent/proof.ts";
import { FEDERAL, MIN_SHOWN, NOT_SCIENTIFIC } from "../lib/constituent/rules.ts";
import { castVote, recomputeVoice, totalsForBill } from "../lib/constituent/store.ts";
import { setResidence } from "../lib/verify/residence-store.ts";
import { readerMembers, recordFor, RECORD_MAX } from "../lib/record/store.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), DAY = 86400e3;
const read = f => readFileSync(join(ROOT, f), "utf8");
/**
 * Every piece of text a page file can put in front of a reader: the text between tags and every string in the file
 * (import paths, class names and other attribute values left out). Read with the TypeScript parser, so code such as
 * `!access.allowed` or `width: 50%` in a style is never mistaken for words.
 */
function shownText(file) {
  const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), out = [];
  const visit = node => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isJsxAttribute(node) && ["className", "href", "id", "role", "key", "name", "value", "rel", "target", "type"].includes(node.name.getText(sf))) return;
    if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) out.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.join("\n");
}
const dir = mkdtempSync(join(tmpdir(), "record-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
after(() => { client.close(); rmSync(dir, { recursive: true, force: true }); });

const T0 = Date.UTC(2026, 10, 20);
const day = n => Date.UTC(2026, 10, n, 17);
const roll = (id, chamber, question, votedAt, extra = {}) => ({ id, chamber, question, votedAt, title: "A bill to do a thing", result: "Passed", yea: 60, nay: 40, rollNumber: 1, ...extra });
/** Words the tone rule keeps out of every sentence a reader sees (owner's point 7). */
const LOUD = /!|slams|shocking|outrage|betray|finally|don't miss|act now|streak|badge|\bpoints\b/i;

/* ───────────────────────────── 1. The outcome, stage by stage ───────────────────────────── */

test("a bill's outcome is said in plain words with its numbers and date, for every stage", () => {
  const passedHouse = roll("h1", "house", "On Passage", day(4), { yea: 392, nay: 18 });
  const passedSenate = roll("s1", "senate", "On Passage of the Bill", day(9), { result: "Bill Passed", yea: 51, nay: 49 });
  const o = (stage, stageDate, votes = [], billType = "hr") => billOutcome({ stage, stageDate, billType, votes });

  assert.deepEqual(o("introduced", "2026-11-02"), { kind: "waiting", text: "Still waiting. It was introduced in the House on Nov 2, 2026 and no committee has acted on it." });
  assert.deepEqual(o("committee", "2026-11-03", [], "s"), { kind: "waiting", text: "Still waiting in committee in the Senate, where it was sent on Nov 3, 2026. No vote on passing it has been held." });
  assert.deepEqual(o("passed_first", "2026-11-04", [passedHouse]), { kind: "passed", text: "Passed the House 392–18 on Nov 4, 2026. Still waiting in the Senate." });
  assert.deepEqual(o("passed_first", "2026-11-04", []), { kind: "passed", text: "Passed the House on Nov 4, 2026. Still waiting in the Senate." }, "passed without a recorded vote: no number is made up");
  assert.deepEqual(o("passed_first", "2026-11-09", [passedSenate], "s"), { kind: "passed", text: "Passed the Senate 51–49 on Nov 9, 2026. Still waiting in the House." });
  assert.deepEqual(o("passed_second", "2026-11-09", [passedHouse, passedSenate]),
    { kind: "passed", text: "Passed the House 392–18 and the Senate 51–49, the second of them on Nov 9, 2026. Still waiting to be sent to the President." });
  assert.deepEqual(o("resolving", "2026-11-10", [passedHouse, passedSenate]),
    { kind: "passed", text: "Passed the House 392–18 and the Senate 51–49 in different versions. Still waiting: the two chambers have to agree on one final version. The latest step was on Nov 10, 2026." });
  assert.deepEqual(o("president", "2026-11-12", [passedHouse]),
    { kind: "passed", text: "Passed the House 392–18 and the Senate. Still waiting: it went to the President on Nov 12, 2026 and has not been signed or vetoed." });
  assert.deepEqual(o("law", "2026-11-14", [passedHouse, passedSenate]), { kind: "law", text: "Became law on Nov 14, 2026. Passed the House 392–18 and the Senate 51–49." });
  assert.deepEqual(o("law", "2026-11-14"), { kind: "law", text: "Became law on Nov 14, 2026." });
  assert.deepEqual(o("vetoed", "2026-11-15", [passedHouse]), { kind: "vetoed", text: "Vetoed by the President on Nov 15, 2026." });
  const override = roll("h9", "house", "On Overriding the Veto", day(17), { result: "Failed", yea: 250, nay: 170 });
  assert.deepEqual(o("vetoed", "2026-11-15", [passedHouse, override]), { kind: "vetoed", text: "Vetoed by the President on Nov 15, 2026. House vote to override the veto failed, 250–170 (two-thirds needed)." });

  const failedSenate = roll("s2", "senate", "On Passage of the Bill", day(6), { result: "Bill Defeated", yea: 47, nay: 52 });
  assert.deepEqual(o("failed", "2026-11-06", [passedHouse, failedSenate]), { kind: "failed", text: "Failed in the Senate 47–52 on Nov 6, 2026." });
  assert.deepEqual(o("failed", "2026-11-06"), { kind: "failed", text: "Failed a vote on passing it on Nov 6, 2026." });
  const suspension = roll("h4", "house", "On Motion to Suspend the Rules and Pass", day(6), { result: "Failed", yea: 250, nay: 170 });
  assert.equal(o("failed", "2026-11-06", [suspension]).text, "Failed in the House 250–170 on Nov 6, 2026 (two-thirds needed).");

  const cloture = roll("s3", "senate", "On Cloture on the Motion to Proceed", day(3), { result: "Cloture on the Motion to Proceed Rejected", yea: 47, nay: 52 });
  const blocked = o("debate_blocked", "2026-11-03", [cloture], "s");
  assert.equal(blocked.kind, "stopped");
  assert.match(blocked.text, /^Stopped for now on Nov 3, 2026: the Senate voted 47–52 not to end debate on taking it up\. Ending debate needs 60 votes/);
  assert.deepEqual(o("debate_blocked", "2026-11-03", [], "s"), { kind: "stopped", text: "Stopped for now on Nov 3, 2026: a vote to end debate failed." });
  const proceed = roll("s5", "senate", "On the Motion to Proceed", day(5), { result: "Motion to Proceed Rejected", yea: 48, nay: 51 });
  assert.match(o("not_taken_up", "2026-11-05", [proceed], "s").text, /^Stopped for now on Nov 5, 2026: the Senate voted 48–51 not to take it up\./);
  assert.deepEqual(o("not_taken_up", "2026-11-05", [], "s"), { kind: "stopped", text: "Stopped for now on Nov 5, 2026: a vote to take it up failed." });

  // No stored stage yet: only what the recorded votes on file show.
  assert.deepEqual(o(null, null), { kind: "waiting", text: "Still waiting. No vote on passing it is on record here yet." });
  assert.deepEqual(o(null, null, [passedHouse]), { kind: "passed", text: "Passed the House 392–18 on Nov 4, 2026. Nothing later is on record here yet." });
  assert.equal(o(undefined, null, [failedSenate]).kind, "failed");

  // Every stage the record can hold has a sentence, a date where one is on file, and calm words.
  for (const stage of ["introduced", "committee", "passed_first", "passed_second", "resolving", "president", "law", "vetoed", "failed", "not_taken_up", "debate_blocked"]) {
    const out = o(stage, "2026-11-04", [passedHouse, passedSenate, failedSenate, cloture]);
    assert.match(out.text, /\.$/, stage);
    assert.match(out.text, /Nov \d{1,2}, 2026/, `${stage} carries a date`);
    assert.doesNotMatch(out.text, LOUD, stage);
    assert.doesNotMatch(out.text, /%|undefined|null/, stage);
  }
  // The same sentence whoever passed it: only the chamber's name and the numbers differ.
  assert.equal(o("passed_first", "2026-11-04", [roll("h1", "house", "On Passage", day(4), { yea: 220, nay: 210 })]).text.replace("220–210", "392–18"), o("passed_first", "2026-11-04", [passedHouse]).text);

  assert.equal(originChamber("hjres"), "house"); assert.equal(originChamber("sjres"), "senate"); assert.equal(originChamber(null), null);
  assert.equal(outcomeDay("2026-11-04T05:00:00Z"), "Nov 4, 2026"); assert.equal(outcomeDay(""), null); assert.equal(outcomeDay(day(4)), "Nov 4, 2026");
});

test("a Texas bill's outcome uses the same words, with the Governor in the President's place", () => {
  const act = (date, chamber, ...classification) => ({ date, chamber, classification });
  const o = (stage, actions = [], votes = [], chamber = "lower") => txBillOutcome({ stage, chamber, actions, votes });
  const third = { id: "v1", chamber: "lower", motion: "Read 3rd time", date: "2027-04-02", result: "pass", yes: 98, no: 45, tallyOk: true };
  assert.deepEqual(o("filed", [act("2026-11-09", "lower", "filing")]), { kind: "waiting", text: "Still waiting. It was filed in the Texas House on Nov 9, 2026 and no committee has acted on it." });
  assert.deepEqual(o("committee", [act("2026-11-14", "lower", "referral-committee")]), { kind: "waiting", text: "Still waiting in committee in the Texas House, where it was sent on Nov 14, 2026. No vote on passing it has been held." });
  assert.deepEqual(o("passed_first", [act("2027-04-02", "lower", "passage")], [third]), { kind: "passed", text: "Passed the Texas House 98–45 on Apr 2, 2027. Still waiting in the Texas Senate." });
  assert.deepEqual(o("passed_first", [act("2027-04-02", "lower", "passage")], [{ ...third, tallyOk: false }]), { kind: "passed", text: "Passed the Texas House on Apr 2, 2027. Still waiting in the Texas Senate." },
    "a count that did not match the listed members is not printed");
  assert.deepEqual(o("passed_first", [act("2027-04-02", "lower", "passage")], []), { kind: "passed", text: "Passed the Texas House on Apr 2, 2027. Still waiting in the Texas Senate." }, "a voice vote has no numbers");
  assert.deepEqual(o("passed_both", [], [third]), { kind: "passed", text: "Passed the Texas House 98–45 and the Texas Senate. Still waiting to be sent to the Governor." });
  assert.deepEqual(o("governor", [act("2027-05-20", "executive", "executive-receipt")]), { kind: "passed", text: "Passed the Texas House and the Texas Senate. Still waiting: it went to the Governor on May 20, 2027 and has not been signed or vetoed." });
  assert.deepEqual(o("law", [act("2027-06-01", "executive", "executive-signature")]), { kind: "law", text: "Became law on Jun 1, 2027." });
  assert.deepEqual(o("vetoed", [act("2027-06-02", "executive", "executive-veto")]), { kind: "vetoed", text: "Vetoed by the Governor on Jun 2, 2027." });
  assert.deepEqual(o("failed", [act("2027-04-09", "upper", "failure")]), { kind: "failed", text: "Failed a vote on Apr 9, 2027." });
  for (const stage of ["filed", "committee", "passed_first", "passed_both", "governor", "law", "vetoed", "failed"]) { const t = o(stage).text; assert.match(t, /\.$/); assert.doesNotMatch(t, LOUD); assert.doesNotMatch(t, /%|undefined|null/); }
});

test("a legislator's row never implies a vote that is not on record by name", () => {
  const passage = meaningfulVote([roll("h3", "house", "On Passage", day(12))], "house");
  assert.deepEqual(recordMemberLine(passage, "Yea", "support", "Nov 12, 2026", { passed: true, chamber: "house" }), { state: "voted", text: "Voted yes on passing it, Nov 12, 2026", mark: "same", note: null });
  assert.deepEqual(recordMemberLine(null, null, "support", "", { passed: false, chamber: "senate" }), { state: "not_yet", text: "Has not voted on it yet", mark: null, note: null });
  assert.deepEqual(recordMemberLine(null, null, "support", "", { passed: true, chamber: "senate" }),
    { state: "not_recorded", text: "No vote by name: the Senate passed it without a recorded vote on file", mark: null, note: null });
  assert.equal(chamberPassed("passed_first", "hr", "house"), true); assert.equal(chamberPassed("passed_first", "hr", "senate"), false);
  assert.equal(chamberPassed("law", "s", "house"), true); assert.equal(chamberPassed("committee", "hr", "house"), false); assert.equal(chamberPassed(null, "hr", "house"), false);

  // Texas: third reading is the vote on passing it; the vote before it is shown and never compared; a voice vote lists nobody.
  const second = { id: "a", chamber: "lower", motion: "Passed to engrossment", date: "2027-04-01", result: "pass" }, third = { id: "b", chamber: "lower", motion: "Read 3rd time", date: "2027-04-02", result: "pass" };
  const table = { id: "c", chamber: "lower", motion: "Motion to table", date: "2027-04-03", result: "fail" }, amend = { id: "d", chamber: "lower", motion: "Amendment 3 by Smith", date: "2027-04-03", result: "pass" };
  assert.equal(txPassageVote([second, third, table, amend], "lower").id, "b");
  assert.equal(txPassageVote([second, table, amend], "lower"), null);
  assert.deepEqual(txShownVote([second, table, amend], "lower"), { vote: second, role: "advance" });
  assert.equal(txShownVote([table, amend], "lower"), null, "a procedural motion or an amendment is never the vote shown");
  const here = { passed: true, chamber: "lower" };
  assert.deepEqual(txMemberLine({ vote: third, role: "passage" }, "no", "oppose", here), { state: "voted", text: "Voted no on passing it, Apr 2, 2027", mark: "same", note: null });
  assert.equal(txMemberLine({ vote: third, role: "passage" }, "yes", "unsure", here).mark, null, "Unsure is never compared");
  assert.equal(txMemberLine({ vote: third, role: "passage" }, "absent", "support", here).text, "Did not vote, Apr 2, 2027");
  const moved = txMemberLine({ vote: second, role: "advance" }, "yes", "support", here);
  assert.equal(moved.text, "Voted yes on moving it to a final vote, Apr 1, 2027"); assert.equal(moved.mark, null); assert.match(moved.note, /not compared with your answer/);
  assert.equal(txMemberLine({ vote: third, role: "passage" }, null, "support", here).text, "Not listed by name in the recorded vote of Apr 2, 2027");
  assert.equal(txMemberLine(null, null, "support", here).text, "No vote by name: the Texas House passed it without a recorded vote on file");
  assert.equal(txMemberLine(null, null, "support", { passed: false, chamber: "upper" }).text, "Has not voted on it yet");
});

/* ───────────────────────────── 2. One plain count per legislator ───────────────────────────── */

test("the count per legislator uses votes on passing a bill only; Unsure never counts; never a percentage", () => {
  const answers = new Map([["b1", "support"], ["b2", "oppose"], ["b3", "support"], ["b4", "unsure"], ["b5", "support"], ["b6", "oppose"], ["b7", "support"]]);
  const v = (billId, position, kind = "passage", votedAt = 1) => ({ billId, position, kind, votedAt });
  const votes = [
    v("b1", "Yea"),                              // same
    v("b2", "Yea"),                              // different
    v("b3", "Nay", "procedural"),                // a procedural vote: left out
    v("b3", "Yea", "amendment"),                 // an amendment: left out
    v("b4", "Yea"),                              // the reader said Unsure: left out
    v("b5", "Not Voting"),                       // absent: left out
    v("b6", "Present"),                          // present: left out
    v("b7", "Nay", "passage", 1), v("b7", "Yea", "passage", 2), // the latest vote on passing it is the one compared: same
    v("b9", "Yea"),                              // a bill the reader did not answer
  ];
  const c = sameWayCount(answers, votes);
  assert.deepEqual(c, { same: 2, compared: 3 });
  assert.equal(sameWayLine(c), "Voted the way you did on 2 of 3 bills.");
  assert.equal(sameWayLine({ same: 1, compared: 1 }), "Voted the way you did on 1 of 1 bill.");
  assert.equal(sameWayLine({ same: 0, compared: 4 }), "Voted the way you did on 0 of 4 bills.");
  assert.equal(sameWayLine({ same: 0, compared: 0 }), "No bills to compare yet.", "never 0 of 0");
  assert.deepEqual(sameWayCount(new Map([["b1", "unsure"], ["b2", "unsure"]]), votes), { same: 0, compared: 0 }, "only Unsure answers: nothing is compared");
  assert.deepEqual(sameWayCount(answers, votes.filter(x => x.kind !== "passage")), { same: 0, compared: 0 }, "only procedural and amendment votes: nothing is compared");
  for (const line of [sameWayLine(c), sameWayLine({ same: 0, compared: 0 }), OWN_COMPARISON, COMPARISON_LEFT_OUT]) {
    assert.doesNotMatch(line, /%|percent|score of \d|rating of|rank/i);
    assert.doesNotMatch(line, LOUD);
  }
  assert.equal(OWN_COMPARISON, "Your own comparison, not a grade or score of the legislator.");
  for (const left of ["procedure", "amendments", "without a recorded vote", "Unsure"]) assert.ok(COMPARISON_LEFT_OUT.includes(left), `says that ${left} is left out`);
});

/* ───────────────────────────── 3. The same functions the page runs, against a database ───────────────────────────── */

let seq = 0;
const AUSTIN = { state: "TX", congressional: "TX-37", stateUpper: "TX-SD-14", stateLower: "TX-HD-49" };
async function reader({ createdAt = T0 - 30 * DAY } = {}) {
  const userId = `user-${++seq}`, id = `acct-${seq}`;
  await db.insert(schema.appUsers).values({ id: userId, kind: "public", externalKey: `k-${seq}`, createdAt });
  await db.insert(schema.readerAccounts).values({ id, appUserId: userId, emailHash: `e-${seq}`, email: `r${seq}@example.test`, createdAt, verifiedAt: createdAt });
  await db.insert(schema.verificationProfiles).values({ accountId: id, tier: 1, signupChallengeAt: createdAt, phoneHash: `phone-${seq}`, phoneVerifiedAt: createdAt, createdAt, updatedAt: createdAt });
  return { id, userId };
}
/** An address-matched resident: one home, placed in the districts given. */
async function resident(districts, now = T0) {
  const r = await reader(), street = `${++seq} MAIN ST`;
  const res = await setResidence(db, { accountId: r.id, addressKey: `addr:${street}:${districts.congressional}`, buildingKey: `bldg:${street}`, hasUnit: false, districts, device: null, ipRange: null, voteSoon: { federal: false, state: false }, now });
  assert.equal(res.ok, true);
  await db.update(schema.verificationProfiles).set({ tier: 2, districtId: districts.congressional, stateCode: districts.state, addressMatchedAt: now }).where(eq(schema.verificationProfiles.accountId, r.id));
  return r;
}
const answer = (r, billKey, a, now) => castVote(db, { userId: r.userId, accountId: r.id, billKey, answer: a, reason: null, reasonHash: null, device: null, ipRange: null, now });
async function federalBill(id, billType, number, stage, stageDate) {
  await db.insert(schema.officialBills).values({ id, congress: 119, billType, number, title: `A bill to test ${id}`, congressUrl: "https://www.congress.gov/", sourceUrl: "https://www.congress.gov/", retrievedAt: T0 });
  if (stage) await db.insert(schema.officialBillDepth).values({ billId: id, stage, stageDate });
}
async function rollCall(id, billId, chamber, question, votedAt, positions, extra = {}) {
  await db.insert(schema.officialRollCalls).values({ id, chamber, congress: 119, session: 2, rollNumber: ++seq, votedAt, question, title: null, result: "Passed", billId, yea: 300, nay: 120,
    sourceUrl: `https://clerk.house.gov/Votes/${id}`, retrievedAt: T0, ...extra });
  for (const [politicianId, position] of Object.entries(positions)) await db.insert(schema.officialMemberVotes).values({ rollCallId: id, politicianId, position, rawPosition: position });
}
const member = (id, lastName, chamber, district = null, party = "Republican") => db.insert(schema.officialPoliticians).values({ id, fullName: `Pat ${lastName}`, firstName: "Pat", lastName, party, state: "TX", district, chamber,
  sourceUrl: "https://bioguide.congress.gov/", retrievedAt: T0 });

test("the record lists each answered bill with its outcome, each legislator's vote and the district line, then one count per legislator", async () => {
  // The reader's five legislators. Parties are mixed on purpose: nothing below may depend on them.
  await member("S001", "Zeller", "senate", null, "Democrat"); await member("S002", "Adams", "senate"); await member("H037", "Brook", "house", 37, "Independent");
  await member("H007", "Other", "house", 7);
  await db.insert(schema.txPeople).values([
    { id: "ocd-person/sd14", name: "Sam Upper", party: "Democratic", chamber: "upper", district: "14", sourceUrl: "https://capitol.texas.gov/", retrievedAt: T0 },
    { id: "ocd-person/hd49", name: "Lee Lower", party: "Republican", chamber: "lower", district: "49", sourceUrl: "https://capitol.texas.gov/", retrievedAt: T0 }]);
  const members = await readerMembers(db, AUSTIN);
  assert.deepEqual(members.map(m => m.name), ["Pat Adams", "Pat Zeller", "Pat Brook", "Sam Upper", "Lee Lower"], "senators by last name, the representative, the state senator, the state representative");
  assert.deepEqual(members.map(m => m.role), ["U.S. Senator, TX", "U.S. Senator, TX", "U.S. Representative, TX-37", "Texas State Senator, District 14", "Texas State Representative, District 49"]);
  assert.deepEqual(await readerMembers(db, null), []);
  assert.deepEqual((await readerMembers(db, { state: "TX", congressional: null, stateUpper: null, stateLower: null })).map(m => m.name), ["Pat Adams", "Pat Zeller"], "a ZIP alone gives the two senators");

  // Five federal bills and two Texas bills.
  await federalBill("119-hr-1", "hr", 1, "passed_first", "2026-11-04");   // passed the House 392–18; the Senate has not voted
  await rollCall("h-1", "119-hr-1", "house", "On Passage", day(4), { H037: "Yea" }, { yea: 392, nay: 18 });
  await rollCall("h-1p", "119-hr-1", "house", "On Motion to Recommit", day(3), { H037: "Nay" }, { result: "Failed" }); // procedural: never compared
  await federalBill("119-s-2", "s", 2, "law", "2026-11-14");               // became law; both chambers voted by name
  await rollCall("s-2", "119-s-2", "senate", "On Passage of the Bill", day(6), { S001: "Yea", S002: "Nay" }, { result: "Bill Passed", yea: 51, nay: 49 });
  await rollCall("h-2", "119-s-2", "house", "On Passage", day(9), { H037: "Nay" }, { yea: 220, nay: 210 });
  await federalBill("119-hr-3", "hr", 3, "committee", "2026-11-03");        // still in committee
  await federalBill("119-s-4", "s", 4, "debate_blocked", "2026-11-05");     // stopped in the Senate
  await rollCall("s-4", "119-s-4", "senate", "On Cloture on the Motion to Proceed", day(5), { S001: "Yea", S002: "Nay" }, { result: "Cloture on the Motion to Proceed Rejected", yea: 47, nay: 52 });
  await federalBill("119-hr-5", "hr", 5, "president", "2026-11-12");        // the Senate passed it without a recorded vote
  await rollCall("h-5", "119-hr-5", "house", "On Passage", day(10), { H037: "Not Voting" }, { yea: 400, nay: 10 });
  await db.insert(schema.txBills).values([
    { id: "tx-90-hb7", session: "90", identifier: "HB 7", title: "Relating to a test of record votes.", chamber: "lower", classification: ["bill"], subjects: [], stage: "passed_first",
      tloUrl: "https://capitol.texas.gov/hb7", feed: "openstates", sourceUrl: "https://capitol.texas.gov/", retrievedAt: T0 },
    { id: "tx-90-sb8", session: "90", identifier: "SB 8", title: "Relating to a test of voice votes.", chamber: "upper", classification: ["bill"], subjects: [], stage: "passed_first",
      tloUrl: "https://capitol.texas.gov/sb8", feed: "openstates", sourceUrl: "https://capitol.texas.gov/", retrievedAt: T0 }]);
  await db.insert(schema.txBillActions).values([
    { billId: "tx-90-hb7", seq: 1, date: "2027-04-02", description: "Read 3rd time", chamber: "lower", classification: ["passage"] },
    { billId: "tx-90-sb8", seq: 1, date: "2027-04-05", description: "Passed", chamber: "upper", classification: ["passage"] }]);
  await db.insert(schema.txVotes).values([
    { id: "txv-7-3", billId: "tx-90-hb7", motion: "Read 3rd time", date: "2027-04-02", result: "pass", chamber: "lower", counts: { yes: 98, no: 45 }, tallyOk: 1, retrievedAt: T0 },
    { id: "txv-7-2", billId: "tx-90-hb7", motion: "Passed to engrossment", date: "2027-04-01", result: "pass", chamber: "lower", counts: { yes: 97, no: 46 }, tallyOk: 1, retrievedAt: T0 }]);
  await db.insert(schema.txMemberVotes).values([
    { voteId: "txv-7-3", personId: "ocd-person/hd49", name: "Lower", option: "no" }, { voteId: "txv-7-2", personId: "ocd-person/hd49", name: "Lower", option: "yes" }]);

  // The reader's answers, oldest to newest. Another reader answers the same bills the other way.
  const me = await resident({ ...AUSTIN }), neighbour = await resident({ ...AUSTIN });
  const mine = [["119-hr-1", "support"], ["119-s-2", "oppose"], ["119-hr-3", "support"], ["119-s-4", "support"], ["119-hr-5", "unsure"], ["tx-90-hb7", "oppose"], ["tx-90-sb8", "support"]];
  for (const [i, [bill, a]] of mine.entries()) { await answer(me, bill, a, T0 + (i + 1) * 1000); await answer(neighbour, bill, a === "support" ? "oppose" : "support", T0 + (i + 1) * 1000); }

  const record = await recordFor(db, me.userId, { place: AUSTIN, verificationOn: true });
  assert.equal(record.answered, 7);
  assert.deepEqual(record.bills.map(b => b.billKey), ["tx-90-sb8", "tx-90-hb7", "119-hr-5", "119-s-4", "119-hr-3", "119-s-2", "119-hr-1"], "newest answer first");
  const bill = key => record.bills.find(b => b.billKey === key), lines = b => Object.fromEntries(b.members.map(r => [r.member.name, r.line.text])), marks = b => Object.fromEntries(b.members.map(r => [r.member.name, r.line.mark]));

  // H.R. 1: passed the House; the senators have not voted.
  assert.equal(bill("119-hr-1").answer, "support");
  assert.equal(bill("119-hr-1").outcome.text, "Passed the House 392–18 on Nov 4, 2026. Still waiting in the Senate.");
  assert.deepEqual(lines(bill("119-hr-1")), { "Pat Adams": "Has not voted on it yet", "Pat Zeller": "Has not voted on it yet", "Pat Brook": "Voted yes on passing it, Nov 4, 2026" });
  assert.deepEqual(marks(bill("119-hr-1")), { "Pat Adams": null, "Pat Zeller": null, "Pat Brook": "same" });
  assert.equal(bill("119-hr-1").members.find(r => r.member.id === "H037").sourceUrl, "https://clerk.house.gov/Votes/h-1");
  assert.equal(bill("119-hr-1").href, "/bills/119-hr-1");
  // S. 2: became law; the reader said Oppose.
  assert.equal(bill("119-s-2").outcome.text, "Became law on Nov 14, 2026. Passed the Senate 51–49 and the House 220–210.");
  assert.deepEqual(marks(bill("119-s-2")), { "Pat Adams": "same", "Pat Zeller": "different", "Pat Brook": "same" });
  // H.R. 3: still in committee, nobody has voted.
  assert.match(bill("119-hr-3").outcome.text, /^Still waiting in committee in the House/);
  assert.ok(bill("119-hr-3").members.every(r => r.line.state === "not_yet"));
  // S. 4: stopped by a vote on a step, which is shown and never compared with the answer.
  assert.match(bill("119-s-4").outcome.text, /^Stopped for now on Nov 5, 2026: the Senate voted 47–52 not to end debate on taking it up\./);
  assert.deepEqual(marks(bill("119-s-4")), { "Pat Adams": null, "Pat Zeller": null, "Pat Brook": null });
  assert.match(bill("119-s-4").members[0].line.note, /not on the bill itself/);
  // H.R. 5: the Senate passed it with no vote by name; the representative was absent; the answer was Unsure.
  assert.deepEqual(lines(bill("119-hr-5")), { "Pat Adams": "No vote by name: the Senate passed it without a recorded vote on file", "Pat Zeller": "No vote by name: the Senate passed it without a recorded vote on file",
    "Pat Brook": "Did not vote, Nov 10, 2026" });
  // Texas: only the state legislators are listed on a state bill; a voice vote lists nobody.
  assert.equal(bill("tx-90-hb7").outcome.text, "Passed the Texas House 98–45 on Apr 2, 2027. Still waiting in the Texas Senate.");
  assert.deepEqual(lines(bill("tx-90-hb7")), { "Sam Upper": "Has not voted on it yet", "Lee Lower": "Voted no on passing it, Apr 2, 2027" });
  assert.deepEqual(marks(bill("tx-90-hb7")), { "Sam Upper": null, "Lee Lower": "same" });
  assert.equal(bill("tx-90-hb7").href, "/texas/bills/tx-90-hb7");
  assert.deepEqual(lines(bill("tx-90-sb8")), { "Sam Upper": "No vote by name: the Texas Senate passed it without a recorded vote on file", "Lee Lower": "Has not voted on it yet" });

  // One count per legislator, in the legislators' own order, never sorted by the count.
  assert.deepEqual(record.counts.map(c => [c.member.name, c.line]), [
    ["Pat Adams", "Voted the way you did on 1 of 1 bill."],       // S. 2 only: the cloture vote on S. 4 is a step, not passage
    ["Pat Zeller", "Voted the way you did on 0 of 1 bill."],
    ["Pat Brook", "Voted the way you did on 2 of 2 bills."],       // H.R. 1 and S. 2; H.R. 5 is Unsure and he was absent; the recommit vote is left out
    ["Sam Upper", "No bills to compare yet."],
    ["Lee Lower", "Voted the way you did on 1 of 1 bill."]]);      // third reading only: the vote before it is left out
  assert.deepEqual(record.counts.map(c => c.member.id), members.map(m => m.id), "the order of the reader's own legislators, whatever the counts are");

  // The district line: nothing under 25, and never a number.
  for (const b of record.bills) for (const d of b.districts) { assert.equal(d.view.kind, "below"); assert.doesNotMatch(d.view.text, /\d/); }
  assert.deepEqual(bill("tx-90-hb7").districts.map(d => d.scope), ["TX-SD-14", "TX-HD-49"]); assert.deepEqual(bill("119-hr-1").districts.map(d => d.scope), ["TX-37"]);

  // No percentage sign, grade word or loud word anywhere in what the page is given.
  const everything = JSON.stringify(record);
  // Web addresses are left out of this one check: a Texas member's address has an escaped slash in it ("%2F").
  assert.doesNotMatch(JSON.stringify(record, (k, v) => (k === "href" || k === "sourceUrl" ? undefined : v)), /%/, "no percentage sign in anything a reader is shown");
  assert.doesNotMatch(everything, /\bscore\b|\bgrade\b|\brating\b|\brank/i);
  assert.doesNotMatch(everything, LOUD);
  assert.doesNotMatch(everything, /Republican|Democrat|Independent/, "no party is read or shown: the wording cannot depend on one");
  // Nothing of the other reader is in it.
  assert.ok(!everything.includes(neighbour.userId) && !everything.includes(neighbour.id));

  // Counting switched off: no totals are read, and the page says so.
  const off = await recordFor(db, me.userId, { place: AUSTIN, verificationOn: false });
  assert.ok(off.bills.every(b => b.districts.every(d => d.view.kind === "off")));
  // No place saved: the answers and outcomes are still listed, with no legislators and no count.
  const nowhere = await recordFor(db, me.userId, { place: null, verificationOn: true });
  assert.equal(nowhere.bills.length, 7); assert.deepEqual(nowhere.members, []); assert.deepEqual(nowhere.counts, []);
  assert.ok(nowhere.bills.every(b => b.members.length === 0 && b.districts.every(d => d.view.kind === "unknown")));
  // A reader whose place is in another state: a Texas bill is still listed, with no Texas legislators and no district of theirs.
  const tulsa = await recordFor(db, me.userId, { place: { state: "OK", congressional: "OK-01", stateUpper: "OK-SD-35", stateLower: "OK-HD-71" }, verificationOn: true });
  const far = tulsa.bills.find(b => b.billKey === "tx-90-hb7");
  assert.deepEqual(far.members, []); assert.equal(far.outcome.text, bill("tx-90-hb7").outcome.text);
  assert.deepEqual(far.districts, [{ scope: null, view: { kind: "outside", text: "Your saved place is outside this bill's state, so you have no district on it. The bill's page shows the state's totals." } }]);
  assert.deepEqual(tulsa.bills.find(b => b.billKey === "119-hr-1").districts.map(d => d.scope), ["OK-01"]);
  // Nobody signed in, or a reader with no answers.
  assert.deepEqual(await recordFor(db, null, { place: AUSTIN, verificationOn: true }), { bills: [], members: [], counts: [], answered: 0 });
  const fresh = await reader(), empty = await recordFor(db, fresh.userId, { place: AUSTIN, verificationOn: true });
  assert.equal(empty.bills.length, 0); assert.ok(empty.counts.every(c => c.line === "No bills to compare yet."));
  assert.equal(RECORD_MAX, 500);
});

test("the district line on the record appears at 25 counted residents and not at 24, mail-verified first", async () => {
  await federalBill("119-hr-25", "hr", 25, "committee", "2026-11-03");
  const me = await resident({ ...AUSTIN }, T0 - 20 * DAY);
  await answer(me, "119-hr-25", "support", T0);
  for (let i = 0; i < 23; i++) await answer(await resident({ ...AUSTIN }, T0 - 20 * DAY), "119-hr-25", i < 14 ? "support" : i < 20 ? "oppose" : "unsure", T0); // 24 counted residents of TX-37, the reader included
  await recomputeVoice(db, "119-hr-25", T0 + DAY);
  const at24 = (await recordFor(db, me.userId, { place: AUSTIN, verificationOn: true })).bills.find(b => b.billKey === "119-hr-25").districts[0].view;
  assert.equal(at24.kind, "below"); assert.equal(at24.text, "Not enough constituents yet — share this bill."); assert.doesNotMatch(JSON.stringify(at24), /\d/);
  await answer(await resident({ ...AUSTIN }, T0 - 20 * DAY), "119-hr-25", "oppose", T0);
  await recomputeVoice(db, "119-hr-25", T0 + DAY);
  const at25 = (await recordFor(db, me.userId, { place: AUSTIN, verificationOn: true })).bills.find(b => b.billKey === "119-hr-25").districts[0].view;
  assert.equal(at25.kind, "total");
  assert.equal(at25.text, "25 counted residents of TX-37 answered.");
  assert.deepEqual(at25.groups, ["Address-matched, 25 voters: 15 support · 7 oppose · 3 unsure"]);
  assert.doesNotMatch(JSON.stringify(at25), /verified/i, "address-matched residents are never called verified");
});

/* ───────────────────────────── 4. Where the list ends ───────────────────────────── */

test("the list of answers is capped a screen at a time, and every screen ends with a line", () => {
  assert.equal(RECORD_PAGE_SIZE, 20);
  assert.deepEqual(recordPage(7, undefined), { page: 1, pages: 1, from: 0, to: 7 });
  assert.equal(recordEndLine(7, recordPage(7, undefined)), "That is all 7 bills you have answered.");
  assert.equal(recordEndLine(1, recordPage(1, "1")), "That is the one bill you have answered.");
  assert.equal(recordEndLine(0, recordPage(0, "1")), "");
  assert.deepEqual(recordPage(45, "1"), { page: 1, pages: 3, from: 0, to: 20 });
  assert.equal(recordEndLine(45, recordPage(45, "1")), "These are bills 1 to 20 of the 45 you have answered, newest first.");
  assert.equal(recordEndLine(45, recordPage(45, "3")), "That is all 45. These were bills 41 to 45, your earliest answers.");
  for (const bad of ["0", "-3", "abc", "99", "1e9", null, "2.7"]) { const r = recordPage(45, bad); assert.ok(r.page >= 1 && r.page <= 3 && r.to - r.from <= RECORD_PAGE_SIZE && r.to <= 45, String(bad)); }
});

test("the page is called Your record, keeps its address, labels the count every time and makes no percentage", () => {
  const page = read("app/voice/page.tsx"), shell = read("components/public/public-shell.tsx");
  assert.match(page, /<h1>Your record<\/h1>/); assert.match(page, /title: brandTitle\("Your record"\)/);
  assert.ok(shell.includes('{ href: "/voice", label: "Your record" }'), "the menu entry");
  assert.doesNotMatch(page + shell, /Your voice/);
  // It still asks who is reading before anything else, and shows nothing to a visitor with no invite.
  assert.match(page, /const access = await viewerAccess\(\);\s*if \(!access\.allowed\) return <PublicShell current="\/voice" access=\{access\} page="\/voice">\{null\}<\/PublicShell>;/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  // /record leads to it and shows nothing itself.
  const alias = read("app/record/page.tsx");
  assert.match(alias, /redirect\("\/voice"\)/); assert.doesNotMatch(alias, /PublicShell|getDb|<h1/);
  // The count is labelled beside every legislator, and what is left out is said.
  assert.match(page, /record\.counts\.map\(c => <li[\s\S]*?\{c\.line\}[\s\S]*?<small>\{OWN_COMPARISON\}<\/small><\/li>\)/);
  assert.ok(page.includes("{COMPARISON_LEFT_OUT}"));
  // Never a percentage, and nothing sorts the legislators.
  for (const f of ["app/voice/page.tsx", "lib/record/store.ts", "lib/voice.ts"]) assert.doesNotMatch(read(f), /%/, `${f} has no percentage sign`);
  assert.doesNotMatch(read("lib/record/store.ts").split("export async function recordFor")[1], /\.sort\(/, "bills keep the order of the answers and counts keep the order of the legislators");
  assert.doesNotMatch(read("lib/record/store.ts") + read("lib/voice-rules.ts") + read("lib/agreement.ts"), /\.party\b/, "no rule reads a party");
  // Finite: a list end on the page, and no endless loading.
  assert.ok(page.includes("{recordEndLine(total, r)}"));
  assert.doesNotMatch(page, /load more|infinite|IntersectionObserver/i);
  // What the page itself can show: no percentage sign, no exclamation mark, no loud word, no grade word used as praise or blame.
  const shown = shownText("app/voice/page.tsx");
  assert.ok(shown.includes("How often each of your legislators voted the way you did") && shown.includes("What happened"), "the reader's text was read");
  assert.doesNotMatch(shown, /%/, "no percentage sign in the page's own words");
  assert.doesNotMatch(shown, LOUD);
  assert.doesNotMatch(shown, /agreement rate|match rate|\branked?\b|best|worst|top legislator/i);
});

/* ───────────────────────────── 5. Aggregate social proof ───────────────────────────── */

test("before an answer, only how many counted residents have weighed in, from 25, never the split", async () => {
  const c = (support, oppose, unsure = 0) => ({ support, oppose, unsure });
  assert.equal(MIN_SHOWN, 25);
  assert.equal(weighedInLine("TX-37", { mail: null, address: c(17, 6, 1) }, "district"), null, "24: nothing is said about numbers");
  assert.equal(weighedInLine("TX-37", { mail: null, address: c(17, 6, 2) }, "district"), "25 counted residents of TX-37 have weighed in on this bill.");
  assert.equal(weighedInLine("TX-37", { mail: c(190, 70, 9), address: c(31, 8, 4) }, "district"), "312 counted residents of TX-37 have weighed in on this bill.");
  assert.equal(weighedInLine("TX", { mail: c(900, 300, 34), address: null }, "state"), "1,234 counted residents of Texas have weighed in on this bill.");
  assert.equal(weighedInLine("TX-37", null, "district"), null); assert.equal(weighedInLine("TX-37", undefined, "district"), null);
  // The mail-verified and address-matched groups are added together: 12 and 12 is under 25, 12 and 13 is not.
  assert.equal(weighedInLine("TX-37", { mail: c(12, 0), address: c(0, 12) }, "district"), null);
  assert.equal(weighedInLine("TX-37", { mail: c(12, 0), address: c(0, 13) }, "district"), "25 counted residents of TX-37 have weighed in on this bill.");
  // Never the split: whatever the answers were, the line is the same, and it holds no other number and no answer word.
  const lines = [{ mail: c(190, 70, 9), address: c(31, 8, 4) }, { mail: c(9, 70, 190), address: c(4, 31, 8) }, { mail: null, address: c(0, 312, 0) }].map(t => weighedInLine("TX-37", t, "district"));
  assert.equal(new Set(lines).size, 1, "the same line however people answered");
  assert.deepEqual(lines[0].match(/\d+/g), ["312", "37"], "the only numbers are the count and the district's own number");
  assert.doesNotMatch(lines[0], /support|oppose|unsure|verified|neighbou?r|%/i);
  assert.equal(scopeWords("TX-SD-14"), "Texas Senate district 14"); assert.equal(scopeWords("TX-HD-49"), "Texas House district 49"); assert.equal(scopeWords("DC"), "the District of Columbia");

  // The lines for one reader: the district first, then the state; nothing for a place under 25 or a place not known.
  const totals = new Map([["TX-37", { mail: null, address: c(20, 9, 2) }], ["TX", { mail: c(40, 10), address: c(100, 50, 5) }], ["US", { mail: null, address: c(5000, 4000) }], ["TX-07", { mail: null, address: c(10, 2) }]]);
  assert.deepEqual(socialProof(FEDERAL, AUSTIN, totals), ["31 counted residents of TX-37 have weighed in on this bill.", "205 counted residents of Texas have weighed in on this bill."]);
  assert.deepEqual(socialProof(FEDERAL, { ...AUSTIN, congressional: "TX-07" }, totals), ["205 counted residents of Texas have weighed in on this bill."], "a district under 25 is left out, not shown as a small number");
  assert.deepEqual(socialProof(FEDERAL, null, totals), []); assert.deepEqual(socialProof(FEDERAL, AUSTIN, new Map()), []);
  const txTotals = new Map([["TX", { mail: null, address: c(30, 2) }], ["TX-SD-14", { mail: null, address: c(25, 0) }], ["TX-HD-49", { mail: null, address: c(3, 0) }]]);
  assert.deepEqual(socialProof({ code: "TX", level: "state" }, AUSTIN, txTotals), ["25 counted residents of Texas Senate district 14 have weighed in on this bill.", "32 counted residents of Texas have weighed in on this bill."]);
  assert.deepEqual(socialProof({ code: "TX", level: "state" }, { state: "OK", congressional: "OK-01", stateUpper: null, stateLower: null }, txTotals), [], "a reader outside the state is shown the totals instead, as before");

  // The same line from the totals table itself: 24 residents say nothing; the 25th makes the line appear.
  await federalBill("119-hr-26", "hr", 26, "committee", "2026-11-03");
  for (let i = 0; i < 24; i++) await answer(await resident({ ...AUSTIN }, T0 - 20 * DAY), "119-hr-26", i % 3 === 0 ? "oppose" : "support", T0);
  await recomputeVoice(db, "119-hr-26", T0 + DAY);
  assert.deepEqual(socialProof(FEDERAL, AUSTIN, await totalsForBill(db, "119-hr-26", ["TX-37", "TX"])), []);
  await answer(await resident({ ...AUSTIN }, T0 - 20 * DAY), "119-hr-26", "unsure", T0);
  await recomputeVoice(db, "119-hr-26", T0 + DAY);
  assert.deepEqual(socialProof(FEDERAL, AUSTIN, await totalsForBill(db, "119-hr-26", ["TX-37", "TX"])),
    ["25 counted residents of TX-37 have weighed in on this bill.", "25 counted residents of Texas have weighed in on this bill."]);
});

test("the voting box shows that line only before an answer, with the not-a-poll label, and never inside the totals", () => {
  const view = read("lib/constituent/view.ts"), box = read("components/voice/vote-box.tsx");
  assert.match(view, /const showTotals = !!answer \|\| st === "outside";/);
  assert.match(view, /proof: canAnswer && !showTotals \? socialProof\(jurisdiction, place, totals\) : \[\]/, "empty once the reader has answered or cannot answer: the totals themselves are then on the page");
  assert.match(box, /\{data\.proof\.length > 0 && <p className="voice-proof" role="note">\{data\.proof\.map\(l => <span key=\{l\}>\{l\} <\/span>\)\}<span className="not-poll">\{NOT_SCIENTIFIC\}<\/span><\/p>\}/);
  assert.equal(NOT_SCIENTIFIC, "Not a scientific poll.");
  // The split is still shown only after an answer (or to someone who cannot answer), exactly as before.
  assert.match(box, /\{data\.showTotals \|\| !data\.canAnswer \? <TotalsList totals=\{data\.totals\} \/>/);
  assert.doesNotMatch(box.match(/voice-proof[\s\S]*?<\/p>\}/)[0], /groupLine|TotalsList|voice-totals|\.support|\.oppose/);
  assert.doesNotMatch(read("lib/constituent/proof.ts"), /groupLine|\.support|\.oppose|\.unsure|reason|userId|accountId/, "the rule cannot reach a split or a person");
});

/* ───────────────────────────── 6. Honest names ───────────────────────────── */

test("the welcome screen says counted residents, and no reader page calls address-matched people verified", () => {
  const welcome = read("app/welcome/page.tsx");
  assert.ok(welcome.includes("Totals for a district are shown only once {MIN_SHOWN} counted residents of that district have answered."));
  assert.ok(welcome.includes("Counted residents are people whose home address has been matched."));
  assert.doesNotMatch(welcome, /verified people|verified residents|verified readers/i);
  for (const f of ["app/welcome/page.tsx", "app/voice/page.tsx", "app/about/page.tsx", "app/terms/page.tsx", "components/voice/vote-box.tsx", "lib/constituent/proof.ts", "lib/voice-rules.ts", "lib/agreement.ts", "lib/record/store.ts"]) {
    const text = read(f).replace(/mail-verified|Mail-verified/g, "");
    assert.doesNotMatch(text, /verified (people|residents|readers|voters|total)|verify (that )?you are a real person/i, `${f} does not call address-matched residents verified`);
  }
  assert.match(read("app/about/page.tsx"), /only once enough counted residents have answered/);
  assert.match(read("app/terms/page.tsx"), /what counted residents who use this site answered/);
});
