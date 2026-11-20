// Owner, 20 Nov 2026 ("Revised item 1"): readers answer on every bill, at every stage, and every answer counts the same
// way. A settled bill (became law, failed, vetoed) asks "Do you agree with this law?" or "Would you have supported this
// bill?", with one line under it. Counting, tiers and the 25-per-district threshold are the same. After any answer on a
// bill that has had a vote the reader sees how each of their own legislators voted and whether it matched. Until
// counting is on and a legislator's office has signed in, wording says answers "will be included", never that they are
// being seen now. (The office dashboard's two sections are tested in tests/office.test.mjs.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { billQuestion, deliveryOf, SETTLED_LINE, SETTLED_QUESTION, settledFromStage, UNSURE_NOT_COMPARED, YOUR_LEGISLATORS_VOTED } from "../lib/constituent/settled.ts";
import { federalSettled, federalWindow, texasSettled, texasWindow, congressEnd } from "../lib/changes/window.ts";
import { voteCounts, shownTotals, MIN_SHOWN } from "../lib/constituent/rules.ts";
import { sameWayCount, sameWayLine, OWN_COMPARISON } from "../lib/agreement.ts";
import { matchMark, MARK_LABEL, settledMemberLine } from "../lib/voice-rules.ts";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const NOW = Date.UTC(2026, 10, 20, 15);

test("the question: pending bills as before; a law and a bill that did not become law each get the owner's words", () => {
  const pending = { question: "Do you support capping insulin at $35 a month?", plain: true };
  assert.deepEqual(billQuestion(null, pending, "off"), { ...pending, line: null });
  assert.deepEqual(billQuestion(undefined, pending, "live"), { ...pending, line: null });
  assert.equal(SETTLED_QUESTION.law, "Do you agree with this law?");
  assert.equal(SETTLED_QUESTION.not_law, "Would you have supported this bill?");
  assert.equal(billQuestion("law", pending, "live").question, "Do you agree with this law?");
  assert.equal(billQuestion("not_law", pending, "live").question, "Would you have supported this bill?");
  // The settled question does not carry the headline, so the official title is printed beside it.
  assert.equal(billQuestion("law", pending, "live").plain, false);
});

test("the one line under it is the owner's sentence once answers reach an office, and says 'will be included' until then", () => {
  assert.equal(SETTLED_LINE.live, "This is settled, so your answer can't change it. It tells your legislators what their district thinks of it, and lets you see how often they vote the way you would.");
  assert.deepEqual([deliveryOf({ countingOn: false, officeSignedIn: false }), deliveryOf({ countingOn: false, officeSignedIn: true }), deliveryOf({ countingOn: true, officeSignedIn: false }), deliveryOf({ countingOn: true, officeSignedIn: true })],
    ["off", "off", "no_office", "live"], "both are needed: counting on, and an office signed in");
  for (const d of ["off", "no_office"]) {
    assert.match(SETTLED_LINE[d], /^This is settled, so your answer can't change it\. /);
    assert.match(SETTLED_LINE[d], /will be included in what your legislators see/);
    assert.doesNotMatch(SETTLED_LINE[d], /tells your legislators|your legislators (?:see|know|have seen|are seeing) (?!of)|is included|are included|has been sent|is sent/, `${d}: nothing says an office is seeing answers now`);
    assert.match(SETTLED_LINE[d], /lets you see how often they vote the way you would/);
  }
  assert.equal(billQuestion("law", { question: "q", plain: true }, "off").line, SETTLED_LINE.off);
  // The office check reads active, confirmed office accounts of the reader's own legislators, and only when counting is on.
  const view = read("lib/constituent/view.ts"), store = read("lib/record/store.ts");
  assert.match(view, /vc\.enabled \? readerMembers\(db, place\)\.then\(m => anyOfficeSignedIn\(db, m\)\)\.catch\(\(\) => false\) : false/);
  assert.match(view, /delivery: deliveryOf\(\{ countingOn: vc\.enabled, officeSignedIn: officeIn \}\)/);
  assert.match(store, /eq\(officeAccounts\.status, "active"\), sql`\$\{officeAccounts\.emailVerifiedAt\} is not null`/);
});

test("which bills are settled: became law, failed, vetoed, or ended with their Congress or session; nothing still pending", () => {
  assert.deepEqual(["law", "vetoed", "failed", "president", "passed_first", "committee", null].map(settledFromStage), ["law", "not_law", "not_law", null, null, null, null]);
  const fed = stage => federalWindow({ stage, stageDate: "2026-10-07", congress: 119, billType: "hr", committees: [], meetings: [], floorChambers: [], floorUrl: null, stalledIn: null, actionsUrl: "https://www.congress.gov/x/all-actions", now: NOW });
  const FED = ["introduced", "committee", "passed_first", "passed_second", "resolving", "president", "law", "vetoed", "failed", "not_taken_up", "debate_blocked"];
  for (const stage of FED) assert.equal(fed(stage).settled ?? null, federalSettled(stage, 119, NOW), `Congress, ${stage}: the list rule and the page agree`);
  assert.deepEqual(FED.filter(s => fed(s).settled === "law"), ["law"]);
  assert.deepEqual(FED.filter(s => fed(s).settled === "not_law"), ["vetoed", "failed"]);
  assert.equal(fed("president").settled, undefined, "on the President's desk: not settled, the reader is still asked whether they support it");
  // After its Congress ended, a bill that had not become law is settled.
  const after = congressEnd(119).ms + 1;
  for (const stage of FED) assert.equal(federalWindow({ stage, stageDate: null, congress: 119, billType: "hr", committees: [], meetings: [], floorChambers: [], stalledIn: null, actionsUrl: "u", now: after }).settled ?? null, federalSettled(stage, 119, after), stage);
  assert.equal(federalSettled("committee", 119, after), "not_law"); assert.equal(federalSettled("law", 119, after), "law"); assert.equal(federalSettled("president", 119, after), null);

  const S = { start: "2027-01-12", end: "2027-05-31", regular: true };
  const tx = (stage, today) => texasWindow({ stage, session: S, today, origin: "lower", committee: null, reportedOut: false, passedFirst: null, eventListed: false, tloUrl: "https://capitol.texas.gov/x" });
  const TX = ["filed", "committee", "passed_first", "passed_both", "governor", "law", "vetoed", "failed"];
  for (const today of ["2026-12-01", "2027-03-01", "2027-07-01"]) for (const stage of TX)
    assert.equal(tx(stage, today).settled ?? null, texasSettled(stage, S, today), `Texas, ${stage}, ${today}: the list rule and the page agree`);
  assert.equal(texasSettled("law", S, "2027-07-01"), "law"); assert.equal(texasSettled("committee", S, "2027-07-01"), "not_law"); assert.equal(texasSettled("committee", S, "2027-03-01"), null);
  assert.equal(texasSettled("governor", S, "2027-07-01"), null, "on the Governor's desk: not settled");
});

test("a settled-bill answer is counted exactly as a pending one: same rule, same tiers, same 25", () => {
  // The counting rule is given the answer, the account and the bill's jurisdiction. It is not told the bill's stage, so it cannot treat a settled bill differently.
  const rules = read("lib/constituent/rules.ts"), store = read("lib/constituent/store.ts"), action = read("app/voice/actions.ts");
  for (const [name, src] of [["rules", rules], ["store", store], ["the answer action", action]])
    assert.doesNotMatch(src, /settled|officialBillDepth|\bstage\b|billWindow/, `${name} never reads a bill's stage`);
  const facts = { answer: "support", consent: true, tier: "address", accountCreatedAt: NOW - 3 * 86400e3, home: { state: "TX", congressional: "TX-37", stateUpper: "TX-SD-14", stateLower: "TX-HD-49" }, quarantined: false, held: false };
  assert.deepEqual(voteCounts(facts, { code: "US", level: "federal" }, NOW), { counts: true, tier: "address", scopes: ["US", "TX", "TX-37"] });
  assert.equal(MIN_SHOWN, 25);
  assert.equal(shownTotals({ mail: null, address: { support: 20, oppose: 4, unsure: 0 } }, "district").show, false);
  assert.equal(shownTotals({ mail: null, address: { support: 20, oppose: 4, unsure: 1 } }, "district").show, true);
  // One table for every answer, and the pages change only the question.
  for (const page of ["app/bills/[id]/page.tsx", "app/texas/bills/[id]/page.tsx"]) {
    const s = read(page);
    assert.match(s, /const voiceAsk = voice \? billQuestion\(changeWindow\?\.settled, ask, voice\.delivery\) : null;/, page);
    assert.match(s, /<VoteBox billKey=\{bill\.id\} question=\{voiceAsk\.question\} plain=\{voiceAsk\.plain\} settledLine=\{voiceAsk\.line\}/, page);
  }
  assert.match(read("app/share/card/page.tsx"), /billQuestion\(\(await billWindow\(bill\.key\)\.catch\(\(\) => null\)\)\?\.settled,/);
  const box = read("components/voice/vote-box.tsx");
  assert.match(box, /\{settledLine && <p className="settled-line">\{settledLine\}<\/p>\}/);
  assert.equal((box.match(/<form action=\{castBillVote\}/g) ?? []).length, 1, "one form, one action, for every bill at every stage");
});

test("after an answer on a bill that has had a vote: each of the reader's own legislators, their vote, and whether it matched", () => {
  assert.equal(YOUR_LEGISLATORS_VOTED, "How your legislators voted");
  assert.deepEqual([matchMark("support", "Yea", "passage"), matchMark("support", "Nay", "passage"), matchMark("oppose", "Nay", "passage"), matchMark("oppose", "Yea", "passage")], ["same", "different", "same", "different"]);
  assert.deepEqual(MARK_LABEL, { same: "Same as you", different: "Different from you" });
  // Never a mark for Unsure, an absence, or a vote on a step: the page says why instead.
  assert.deepEqual([matchMark("unsure", "Yea", "passage"), matchMark("support", "Not Voting", "passage"), matchMark("support", "Yea", "stopped")], [null, null, null]);
  assert.equal(UNSURE_NOT_COMPARED, "You answered Unsure, so their votes are not compared with your answer.");
  // A bill that failed has no "yet": a legislator whose chamber never voted on it is said not to have voted.
  const notYet = { state: "not_yet", text: "Has not voted on it yet", mark: null, note: null };
  assert.equal(settledMemberLine(notYet, "failed", "senate").text, "No vote: the bill failed before the Senate voted on it");
  assert.equal(settledMemberLine(notYet, "waiting", "senate").text, "Has not voted on it yet");
  assert.deepEqual(settledMemberLine({ state: "voted", text: "Voted yes on passing it, Nov 11, 2026", mark: "same", note: null }, "failed", "house"), { state: "voted", text: "Voted yes on passing it, Nov 11, 2026", mark: "same", note: null });
  const box = read("components/voice/vote-box.tsx"), view = read("lib/constituent/view.ts"), store = read("lib/record/store.ts");
  assert.match(view, /answer \? ownVotesOnBill\(db, userId, billKey, place\)\.catch\(\(\) => \[\]\) : \[\]/, "only after an answer");
  assert.match(store, /return rows\.some\(r => r\.line\.state !== "not_yet"\) \? rows : \[\];/, "only on a bill that has had a vote");
  assert.match(store, /if \(!userId \|\| !place\) return \[\];/);
  assert.match(box, /\{data\.answer && data\.yours\.length > 0 && <div className="your-legislators-voted"/);
  assert.match(box, /\{line\.mark && <span className=\{`voice-mark voice-mark-\$\{line\.mark\}`\}>\{MARK_LABEL\[line\.mark\]\}<\/span>\}/);
  assert.match(box, /data\.answer === "unsure" \? `\$\{UNSURE_NOT_COMPARED\} ` : ""/);
  assert.match(box, /\{OWN_COMPARISON\} Only you see it\./);
});

test("Your record: a count per legislator, private, never a grade, score, percentage or ranking", () => {
  const votes = Array.from({ length: 10 }, (_, i) => ({ billId: `b${i}`, position: i < 7 ? "Yea" : "Nay", kind: "passage", votedAt: 1 }));
  const mine = new Map(votes.map(v => [v.billId, "support"]));
  assert.deepEqual(sameWayCount(mine, votes), { same: 7, compared: 10 });
  assert.equal(sameWayLine({ same: 7, compared: 10 }), "Voted the way you did on 7 of 10 bills.");
  assert.equal(sameWayLine({ same: 0, compared: 0 }), "No bills to compare yet.");
  assert.equal(OWN_COMPARISON, "Your own comparison, not a grade or score of the legislator.");
  // Settled bills count in it like any other: the count reads every answer, whatever the bill's stage.
  mine.set("law-1", "oppose"); votes.push({ billId: "law-1", position: "Nay", kind: "passage", votedAt: 2 });
  assert.deepEqual(sameWayCount(mine, votes), { same: 8, compared: 11 });
  const agreement = read("lib/agreement.ts"), page = read("app/voice/page.tsx"), store = read("lib/record/store.ts");
  const line = agreement.slice(agreement.indexOf("export function sameWayLine"), agreement.indexOf("export const OWN_COMPARISON"));
  assert.doesNotMatch(line, /%|percent|grade|score|rank/i);
  // The legislators keep their own order (senators, representative, state senator, state representative), never an order by count.
  assert.doesNotMatch(store.slice(store.indexOf("const counts = members.map")), /\.sort\(/, "the counts are never sorted");
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.doesNotMatch(page, /%\}|percent/i);
  // Nothing outside the reader's own pages reads the count: no card, no share, no office page.
  for (const f of ["lib/share-cards.ts", "lib/card-content.ts", "lib/office/store.ts", "lib/office/rules.ts", "app/politicians/[id]/page.tsx"].filter(f => { try { read(f); return true; } catch { return false; } }))
    assert.doesNotMatch(read(f), /sameWayCount|sameWayLine|recordFor\(/, `${f} never reads a reader's count`);
});
