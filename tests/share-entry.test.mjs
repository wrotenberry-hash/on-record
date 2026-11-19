// Share cards and the entry pages (owner's points 10, 11 and 12, 18 Nov 2026). The pure rules (lib/card-content.ts,
// lib/entry/rules.ts, lib/public-access.ts, lib/seo.ts) and the same database functions the site runs
// (lib/entry/store.ts, lib/entry/cards.ts) against a temporary database built from the real migrations.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "../db/schema.ts";
import { agreementCard, changeCard, changeItems, oneFact, rollCard, STANCE_LABEL, STANCE_LINE, stanceToDraw, totalCard, visibleBlocks, voteCard, withStance } from "../lib/card-content.ts";
import { entryAccess, publicReadEnabled, SHARED_PAGES_FLAG, sharedPagesEnabled, TAKE_PART_LINE } from "../lib/public-access.ts";
import { BILL_VIEW_DIMS, billRefOfTarget, cardTarget, earlierEnd, EARLIER_CAP, easternDay, issueHeading, issueIntro, MONTH_END, monthWindow, nothingThisMonth, otherVotesLine, shareRate, sharedBillAddress,
  voteSentence, actionSentence } from "../lib/entry/rules.ts";
import { cardStance, issueBills, issueMonth, ownAnswer, pictureShared, shareGrant, shareMeasures } from "../lib/entry/store.ts";
import { billChanges, changeCardFor, rollCardFor, totalCardFor } from "../lib/entry/cards.ts";
import { castVote } from "../lib/constituent/store.ts";
import { MIN_SHOWN, NOT_SCIENTIFIC } from "../lib/constituent/rules.ts";
import { ISSUE_CATEGORIES } from "../lib/federal/categories.ts";
import { issueMeta, robotsRules, sitemapPaths, TITLE_MAX, DESCRIPTION_MAX } from "../lib/seo.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), DAY = 86400e3;
const read = p => readFileSync(join(ROOT, p), "utf8");
function files(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) { const p = `${dir}/${name}`; if (statSync(join(ROOT, p)).isDirectory()) files(p, out); else if (/\.(ts|tsx)$/.test(name)) out.push(p); }
  return out;
}
const dir = mkdtempSync(join(tmpdir(), "share-entry-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
after(() => { client.close(); rmSync(dir, { recursive: true, force: true }); });

// 18 Nov 2026, 15:00 in Washington.
const NOW = Date.UTC(2026, 10, 18, 20);
let seq = 0;
const OUTRAGE = /slams|shocking|outrage|betray|finally|don't miss|act now|!/i;
const textOf = card => JSON.stringify(card);

async function bill(id, { billType = "hr", title = `Test Act ${id}` } = {}) {
  await db.insert(schema.officialBills).values({ id, congress: 119, billType, number: ++seq, title, congressUrl: `https://www.congress.gov/bill/119th-congress/house-bill/${seq}`, sourceUrl: "https://www.congress.gov/", retrievedAt: NOW });
  return id;
}
async function roll(id, billId, { chamber = "house", at = NOW - DAY, question = "On Passage", result = "Passed", yea = 230, nay = 190, title = null } = {}) {
  await db.insert(schema.officialRollCalls).values({ id, chamber, congress: 119, session: 2, rollNumber: ++seq, votedAt: at, question, title, result, billId, yea, nay,
    sourceUrl: chamber === "house" ? `https://clerk.house.gov/evs/2026/roll${seq}.xml` : `https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_${seq}.xml`, retrievedAt: NOW });
  return id;
}
async function action(billId, date, stage, chamber, text) {
  await db.insert(schema.officialBillActions).values({ billId, seq: ++seq, actionDate: date, text, type: "Floor", chamber, stage, sourceUrl: "https://api.congress.gov/v3/bill", retrievedAt: NOW });
}
async function totals(billKey, scope, mail, address) {
  for (const [tier, c] of [["mail", mail], ["address", address]]) if (c) await db.insert(schema.voiceTotals).values({ billKey, scope, tier, support: c[0], oppose: c[1], unsure: c[2], updatedAt: NOW - 2 * DAY });
}
async function reader(answerOn, answer) {
  const userId = `user-${++seq}`;
  await db.insert(schema.appUsers).values({ id: userId, kind: "public", externalKey: `k-${seq}`, createdAt: NOW - 30 * DAY });
  if (answerOn) await castVote(db, { userId, accountId: null, billKey: answerOn, answer, reason: null, reasonHash: null, device: null, ipRange: null, now: NOW - DAY });
  return userId;
}
const link = (code, target, kind) => db.insert(schema.shareLinks).values({ code, target, kind, createdAt: NOW });

/* ───────────────────────────── 1. One sourced fact per card ───────────────────────────── */

const VOTE = { billLabel: "H.R. 2102", billTitle: "Major Richard Star Act", headline: null, voteText: "Voted yes on passing it", kind: "passage", kindLabel: "Vote on the bill", votedAt: Date.parse("2026-11-12T20:21:00Z"),
  sourceUrl: "https://clerk.house.gov/evs/2026/roll323.xml" };

test("every kind of card carries exactly one fact, with its date and its source line", () => {
  const cards = {
    "a member's vote": voteCard({ name: "Raul Ruiz", seat: "Representative · D-CA-25" }, VOTE),
    "a roll call's result": rollCard({ ...VOTE, chamber: "house", question: "On Passage", result: "Passed", yea: 392, nay: 18, tallyOk: true }),
    "a bill change": changeCard({ billLabel: "H.R. 2102", billTitle: "Major Richard Star Act", fromType: "Introduced in House", toType: "Engrossed in House", item: changeItems({ changed: ["2"] })[0], at: "2026-11-12", sourceUrl: "https://www.govinfo.gov/content/pkg/BILLS-119hr2102eh/html/BILLS-119hr2102eh.htm" }),
    "a district total": totalCard({ billLabel: "H.R. 2102", billTitle: "Major Richard Star Act", scope: "TX-37", kind: "district", totals: { mail: { support: 20, oppose: 9, unsure: 2 }, address: { support: 8, oppose: 3, unsure: 1 } }, updatedAt: NOW }),
    "the reader's own comparison": agreementCard({ name: "Raul Ruiz", seat: "Representative · D-CA-25" }, "Health care", 4, 2, [VOTE]),
  };
  for (const [name, card] of Object.entries(cards)) {
    assert.ok(card, name);
    assert.equal(card.lines.length, 1, `${name}: one block`);
    assert.ok(oneFact(card), `${name}: one fact with a date and a source`);
    assert.match(card.lines[0].date, /^[A-Z][a-z]{2} \d{1,2}, 20\d\d$/, `${name}: dated`);
    assert.ok(card.lines[0].source.length > 5, `${name}: a source line`);
    assert.ok(["Official", "Analysis", "Readers"].includes(card.lines[0].describe.label), `${name}: a badge`);
    assert.equal(card.footer, "Talk is cheap.");
    assert.doesNotMatch(textOf(card), OUTRAGE, `${name}: calm wording`);
    // The link preview draws the same single block.
    assert.equal(visibleBlocks(card, "link").lines.length, 1);
  }
  assert.equal(cards["a roll call's result"].lines[0].vote, "House: Passed, 392–18");
  assert.equal(cards["a roll call's result"].lines[0].source, "clerk.house.gov/evs/2026/roll323.xml");
  assert.equal(cards["a bill change"].lines[0].vote, "Section 2 was changed.");
  assert.equal(cards["a bill change"].lines[0].describe.label, "Official");
  assert.equal(cards["a bill change"].lines[0].date, "Nov 12, 2026");
  // Two facts are not one.
  assert.equal(oneFact({ lines: [cards["a member's vote"].lines[0], cards["a roll call's result"].lines[0]] }), false);
  assert.equal(oneFact({ lines: [{ ...cards["a member's vote"].lines[0], source: "" }] }), false, "a fact with no source is not handed out");
  assert.equal(oneFact({ lines: [] }), false);
});

test("a roll call's count is left off while it is under review, and a procedural vote says it is not a vote on the bill", () => {
  const f = { ...VOTE, chamber: "senate", question: "On the Cloture Motion", result: "Cloture Motion Rejected", yea: 48, nay: 51, tallyOk: false, kind: "procedural", kindLabel: "Procedural vote" };
  assert.equal(rollCard(f).lines[0].vote, "Senate: Cloture Motion Rejected");
  assert.equal(rollCard({ ...f, tallyOk: true }).lines[0].vote, "Senate: Cloture Motion Rejected, 48–51");
  assert.match(rollCard(f).note, /not a vote on the bill itself/);
  assert.equal(rollCard({ ...f, kind: "passage" }).note, null);
});

test("a district total card: only from 25 counted voters, mail-verified first, a group under 5 by size only, never called verified", () => {
  const base = { billLabel: "H.R. 1", billTitle: "A bill", scope: "TX-37", kind: "district", updatedAt: NOW };
  assert.equal(MIN_SHOWN, 25);
  assert.equal(totalCard({ ...base, totals: { mail: { support: 10, oppose: 5, unsure: 1 }, address: { support: 5, oppose: 3, unsure: 0 } } }), null, "24 counted voters: no card at all");
  assert.equal(totalCard({ ...base, totals: null }), null);
  const card = totalCard({ ...base, totals: { mail: { support: 2, oppose: 1, unsure: 0 }, address: { support: 14, oppose: 7, unsure: 1 } } });
  assert.equal(card.lines[0].vote, "Mail-verified: fewer than 5 voters; Address-matched, 22 voters: 14 support · 7 oppose · 1 unsure");
  assert.equal(card.lines[0].what, "25 counted residents of TX-37 answered on H.R. 1");
  assert.ok(card.lines[0].describe.text.includes(NOT_SCIENTIFIC) && card.note === NOT_SCIENTIFIC, "the poll line is on the block and in the note");
  assert.equal(card.lines[0].describe.label, "Readers");
  assert.doesNotMatch(textOf(card).replace(/mail-verified/gi, ""), /verified/i, "address-matched is never called verified");
  assert.doesNotMatch(textOf(card), /%/, "counts, never a percentage");
});

test("the reader's own comparison is one count, labelled as the reader's own: no percentage, no list of bills, no grade", () => {
  const card = agreementCard({ name: "A B", seat: "Senator · R-TX" }, "Taxes", 4, 2, [VOTE, { ...VOTE, votedAt: VOTE.votedAt - 9 * DAY, sourceUrl: "https://www.senate.gov/x.xml" }]);
  assert.equal(card.lines[0].vote, "Voted the way I did on 4 of 6 bills");
  assert.equal(card.lines[0].kindLabel, "My own comparison");
  assert.match(card.eyebrow, /^MY OWN COMPARISON/);
  assert.match(card.lines[0].describe.text, /Not a grade or score of the legislator/);
  assert.match(card.note, /Left out: procedural votes, bills with no recorded vote on passing, and my Unsure answers/);
  assert.equal(card.lines[0].date, "Nov 12, 2026", "dated by the most recent vote counted");
  assert.match(card.lines[0].source, /clerk\.house\.gov, senate\.gov/);
  assert.doesNotMatch(textOf(card), /%|score of \d|rating of|grade [A-F]\b/);
  assert.equal(agreementCard({ name: "A", seat: "B" }, "Taxes", 1, 0, []).lines[0].vote, "Voted the way I did on 1 of 1 bill");
});

test("the three kinds of card read from the database: a roll call, a bill change, a district total", async () => {
  const b = await bill("119-hr-7001", { title: "Clean Water Act of 2026" });
  await roll("house-2026-900", b, { yea: 232, nay: 198, at: Date.parse("2026-11-10T21:00:00Z") });
  const r = await rollCardFor(db, "house-2026-900", { headlines: async () => new Map([[b, "Requires cities to test tap water for lead every year."]]) });
  assert.equal(r.billKey, b);
  assert.ok(oneFact(r.card));
  assert.equal(r.card.lines[0].vote, "House: Passed, 232–198");
  assert.deepEqual(r.card.lines[0].describe, { label: "Analysis", text: "Requires cities to test tap water for lead every year." });
  assert.match(r.card.lines[0].source, /^clerk\.house\.gov\/evs\/2026\/roll\d+\.xml$/);
  assert.equal((await rollCardFor(db, "house-2026-900")).card.lines[0].describe.label, "Official", "with no summary on show, the official title");
  await db.insert(schema.officialTallyChecks).values({ rollCallId: "house-2026-900", ok: 0, detail: {}, checkedAt: NOW });
  assert.equal((await rollCardFor(db, "house-2026-900")).card.lines[0].vote, "House: Passed", "the count is left off while the tally is under review");
  assert.equal(await rollCardFor(db, "house-2026-000"), null);

  await db.insert(schema.analysisVersionChanges).values({ billId: b, fromType: "Introduced in House", toType: "Engrossed in House", added: ["5"], removed: [], changed: ["2"],
    bullets: [{ text: "Raises the yearly testing limit from 10 to 15 parts per billion.", section: "Sec. 2" }], status: "explained", createdAt: NOW - DAY });
  await db.insert(schema.officialBillTexts).values({ billId: b, type: "Engrossed in House", date: "2026-11-10", htmlUrl: "https://www.govinfo.gov/content/pkg/BILLS-119hr7001eh/html/BILLS-119hr7001eh.htm", retrievedAt: NOW });
  const changes = await billChanges(db, b);
  assert.deepEqual(changes.items.map(i => i.key), ["b1", "a-5", "c-2"]);
  const analysis = await changeCardFor(db, b, "b1"), official = await changeCardFor(db, b, "a-5");
  for (const c of [analysis, official]) { assert.ok(oneFact(c)); assert.equal(c.lines[0].kindLabel, "Bill change"); assert.equal(c.lines[0].date, "Nov 10, 2026"); assert.match(c.lines[0].source, /^govinfo\.gov\//); }
  assert.equal(analysis.lines[0].vote, "Raises the yearly testing limit from 10 to 15 parts per billion.");
  assert.equal(analysis.lines[0].describe.label, "Analysis", "a plain-language change is labelled Analysis");
  assert.equal(official.lines[0].vote, "Section 5 was added.");
  assert.equal(official.lines[0].describe.label, "Official");
  assert.match(official.lines[0].what, /from the introduced in house text to the engrossed in house text/);
  assert.equal(await changeCardFor(db, b, "b4"), null, "a change that is not on the bill page has no card");
  assert.equal(await changeCardFor(db, b, "c-2; drop"), null);

  await totals(b, "TX-37", [20, 9, 2], [8, 3, 1]);
  await totals(b, "TX-35", [10, 5, 1], [5, 3, 0]);
  const total = await totalCardFor(db, b, "TX-37");
  assert.ok(oneFact(total));
  assert.equal(total.lines[0].vote, "Mail-verified, 31 voters: 20 support · 9 oppose · 2 unsure; Address-matched, 12 voters: 8 support · 3 oppose · 1 unsure");
  assert.match(total.lines[0].what, /^43 counted residents of TX-37 answered on H\.R\. \d+$/);
  assert.equal(total.note, NOT_SCIENTIFIC);
  assert.equal(await totalCardFor(db, b, "TX-35"), null, "24 counted voters: not made");
  assert.equal(await totalCardFor(db, b, "TX-01"), null, "no total on file: not made");
  assert.equal(await totalCardFor(db, b, "US"), null, "the card is for a district or a state, never the nation");
  assert.equal(await totalCardFor(db, "119-hr-0000", "TX-37"), null);
});

test("no card is handed out unless it carries one fact, and the share menu offers only the one-fact kinds", () => {
  const resolve = read("lib/share-resolve.ts");
  assert.match(resolve, /card && oneFact\(card\) \?/, "resolveShare refuses a card with more or less than one sourced fact");
  assert.match(resolve, /slides\.some\(s => s\.points\.length !== 1 \|\| !s\.source \|\| !s\.date\)\) return null/, "each carousel slide is one sourced fact");
  assert.match(resolve, /case "vote": case "ranks": return vote\(/, "an old breaking-ranks link opens the vote alone");
  assert.match(resolve, /case "district": \{ const scope = await scopeOfMember/, "an old district link opens the total alone");
  const menu = read("components/share/bill-share-menu.tsx");
  const kinds = [...menu.matchAll(/t=([a-z$"{} ?:]+?)&/g)].map(m => m[1]);
  assert.deepEqual(kinds, ['${quiet ? "quiet" : "roll"}', "change", "total", "bill", "carousel"]);
  const cards = read("lib/share-cards.ts");
  assert.doesNotMatch(cards, /export async function (breakingRanksCard|districtVsLegislatorCard|saidVsDidCard)\b/, "the two-fact cards are gone");
  assert.doesNotMatch(cards, /\.limit\(2\)/, "no card lists two votes");
});

/* ───────────────────────────── 2. The reader's stance, if they choose ───────────────────────────── */

test("the stance line: only when asked for, and only a reader's own answer", () => {
  assert.deepEqual(STANCE_LINE, { support: "I support this bill.", oppose: "I oppose this bill.", unsure: "I'm unsure about this bill." });
  assert.equal(stanceToDraw({ requested: null, own: "support", recorded: true }), null, "not asked for: nothing is drawn, even for a reader who answered");
  assert.equal(stanceToDraw({ requested: undefined, own: "support", recorded: false }), null);
  assert.equal(stanceToDraw({ requested: "support", own: "support", recorded: false }), "support");
  assert.equal(stanceToDraw({ requested: "oppose", own: "support", recorded: false }), null, "a reader cannot put an answer they did not give on a card");
  assert.equal(stanceToDraw({ requested: "oppose", own: null, recorded: false }), null, "no answer, no line");
  assert.equal(stanceToDraw({ requested: "unsure", own: null, recorded: true }), "unsure", "a card a reader already shared with that line keeps it");
  assert.equal(stanceToDraw({ requested: "SUPPORT", own: "support", recorded: true }), null);
  assert.equal(stanceToDraw({ requested: "I love this bill", own: "support", recorded: true }), null, "nothing a reader types reaches the picture");
  const card = voteCard({ name: "A", seat: "B" }, VOTE);
  assert.equal("stance" in withStance(card, null), false);
  const withLine = withStance(card, "oppose");
  assert.equal(withLine.stance, "I oppose this bill.");
  assert.deepEqual(withLine.lines, card.lines, "the fact is untouched: the stance is not part of the record");
  assert.ok(oneFact(withLine));
  assert.match(STANCE_LABEL, /ADDED BY THE PERSON SHARING/);
  const image = read("components/cards/card-image.tsx");
  assert.match(image, /\{card\.stance && <div style=\{\{[^}]*border: "3px dashed/s, "the stance is drawn in its own dashed box");
  assert.match(image, /\{STANCE_LABEL\}/);
});

test("the stance comes from the reader's own answer in the database, or from the share record of that exact card", async () => {
  const b = await bill("119-hr-7002");
  const ann = await reader(b, "support"), ben = await reader(null);
  const query = `t=bill&bill=${b}`, target = s => cardTarget(`${query}&stance=${s}`);
  assert.equal(await ownAnswer(db, ann, b), "support");
  assert.equal(await ownAnswer(db, ben, b), null, "no answer: the share screen offers the vote box first");
  assert.equal(await ownAnswer(db, null, b), null);
  const ask = (userId, requested) => cardStance(db, { userId, billKey: b, requested, targetWithStance: requested ? target(requested) : null });
  assert.equal(await ask(ann, "support"), "support", "her own answer");
  assert.equal(await ask(ann, "oppose"), null, "not her answer");
  assert.equal(await ask(ann, null), null, "switch off: no line");
  assert.equal(await ask(ben, "support"), null, "another reader's answer is never his");
  assert.equal(await ask(null, "support"), null, "a visitor asking for a line nobody shared gets the plain card");
  // Ann turns the switch on: the share screen makes the share record of the card with her line.
  await link("Stance1", target("support"), "bill");
  assert.equal(await ask(null, "support"), "support", "the card she shared keeps her line for whoever opens the link");
  assert.equal(await ask(ben, "support"), "support");
  assert.equal(await ask(null, "oppose"), null, "and no other line");
  assert.equal(await cardStance(db, { userId: ann, billKey: null, requested: "support", targetWithStance: null }), null, "a card about no bill takes no stance");
  // Nothing about the stance is stored beyond that share record, and the record names nobody.
  assert.deepEqual(Object.keys(schema.shareLinks).filter(k => !k.startsWith("_") && k !== "enableRLS").sort(), ["code", "createdAt", "kind", "signups", "target", "visits"]);
  const page = read("app/share/card/page.tsx");
  assert.match(page, /sp\.mine === "1"/, "the switch is off until the reader turns it on");
  assert.match(page, /const own = wantMine \? await ownAnswer\(db, userId, r\.billKey\)/, "the line is read from the reader's own answer on the server");
  assert.match(page, /needAnswer && voice && bill && <VoteBox/, "a reader with no answer is offered the vote box first");
});

/* ───────────────────────────── 3. The switch: off today, and what it opens when on ───────────────────────────── */

test("SHARED_PAGES_PUBLIC is off unless it is explicitly turned on, and nothing in the repository turns it on", () => {
  assert.equal(SHARED_PAGES_FLAG, "SHARED_PAGES_PUBLIC");
  for (const v of [undefined, null, "", "0", "false", "off", "no", " "]) assert.equal(sharedPagesEnabled(v), false, String(v));
  for (const v of ["1", "true", "on", "yes"]) assert.equal(sharedPagesEnabled(v), true);
  for (const f of ["vercel.json", "next.config.ts", "package.json", "instrumentation.ts"]) assert.doesNotMatch(read(f), /SHARED_PAGES_PUBLIC/, `${f} does not set the switch`);
  for (const f of [...files("app"), ...files("components"), ...files("lib"), ...files("scripts").filter(x => /\.(ts|tsx)$/.test(x))])
    assert.doesNotMatch(read(f), /SHARED_PAGES_PUBLIC\s*=\s*["']?(1|true|on|yes)/i, `${f} does not turn the switch on`);
  // It is a separate switch: public reading still means what it meant.
  assert.equal(publicReadEnabled("1"), true); assert.equal(publicReadEnabled(undefined), false);
});

test("switch off: a visitor with no invite gets the private notice on a shared bill, an issue page and a card picture", () => {
  const off = page => entryAccess({ base: false, sharedPages: false, page, grant: "119-hr-1" });
  for (const page of [{ kind: "bill", billKey: "119-hr-1" }, { kind: "issue" }, { kind: "picture", shared: true }, { kind: "other" }])
    assert.deepEqual(off(page), { allowed: false, shared: false }, page.kind);
  // The editor, an invited reader and public reading are untouched by the new switch, on or off.
  for (const sharedPages of [false, true]) for (const page of [{ kind: "bill", billKey: "119-hr-1" }, { kind: "issue" }, { kind: "picture", shared: false }, { kind: "other" }])
    assert.deepEqual(entryAccess({ base: true, sharedPages, page, grant: null }), { allowed: true, shared: false });
});

test("switch on: the shared bill, the issue pages and a shared card's picture open, and still nothing else", () => {
  const on = (page, grant = null) => entryAccess({ base: false, sharedPages: true, page, grant });
  assert.deepEqual(on({ kind: "bill", billKey: "119-hr-1" }, "119-hr-1"), { allowed: true, shared: true }, "the bill the share link is about");
  assert.deepEqual(on({ kind: "bill", billKey: "119-hr-2" }, "119-hr-1"), { allowed: false, shared: false }, "another bill stays private");
  assert.deepEqual(on({ kind: "bill", billKey: "119-hr-1" }, null), { allowed: false, shared: false }, "the same bill without a share link stays private");
  assert.deepEqual(on({ kind: "bill", billKey: "119-hr-1" }, ""), { allowed: false, shared: false });
  assert.deepEqual(on({ kind: "issue" }), { allowed: true, shared: true });
  assert.deepEqual(on({ kind: "picture", shared: true }), { allowed: true, shared: true });
  assert.deepEqual(on({ kind: "picture", shared: false }), { allowed: false, shared: false }, "a card nobody shared has no public picture");
  assert.deepEqual(on({ kind: "other" }, "119-hr-1"), { allowed: false, shared: false }, "every other page stays private");
  assert.match(TAKE_PART_LINE, /Support, Oppose or Unsure/);
  assert.match(TAKE_PART_LINE, /by invitation/);
});

test("only four places ask the narrower switch, and each shared view drops what is a reader's", () => {
  const callers = files("app").filter(f => /entryViewer\(/.test(read(f))).sort();
  assert.deepEqual(callers, ["app/api/cards/g/route.tsx", "app/bills/[id]/page.tsx", "app/issues/[slug]/page.tsx", "app/texas/bills/[id]/page.tsx"]);
  const flagUsers = [...files("app"), ...files("components"), ...files("lib")].filter(f => /SHARED_PAGES_FLAG|sharedPagesOn\(/.test(read(f))).sort();
  assert.deepEqual(flagUsers, ["app/api/cards/g/route.tsx", "app/issues/[slug]/page.tsx", "app/robots.ts", "app/sitemap.ts", "lib/public-access.ts", "lib/share.ts", "lib/viewer.ts"]);
  const viewer = read("lib/viewer.ts");
  assert.match(viewer, /if \(base\.allowed \|\| !sharedPages\) return \{ \.\.\.base, shared: false \};/, "switch off: exactly the present rule");
  assert.match(viewer, /\{ allowed: true, preview: false, editor: null, invite: null, audience: "public", shared: true \}/, "a shared visitor is given no identity");
  // The pages that stay private whatever the switch says.
  for (const p of ["app/issues/page.tsx", "app/share/card/page.tsx", "app/share/agreement/[member]/[issue]/page.tsx", "app/api/cards/agreement/route.tsx", "app/api/cards/recap/route.tsx", "app/api/cards/briefing/route.tsx",
    "app/api/cards/vote/route.tsx", "app/politicians/[id]/page.tsx", "app/page.tsx"]) {
    const t = read(p);
    assert.ok(t.includes("await viewerAccess()") && !/entryViewer|sharedPages/.test(t), `${p} keeps the present rule only`);
  }
  for (const p of ["app/bills/[id]/page.tsx", "app/texas/bills/[id]/page.tsx"]) {
    const t = read(p);
    assert.match(t, /if \(!access\.allowed\) return <EntryShell current="\/[a-z]+" access=\{access\} page="[^"]+">\{null\}<\/EntryShell>;/, `${p} shows the private notice when closed`);
    assert.match(t, /const voice = shared \? null : await voteBoxData\(/, `${p}: no vote box and no reader's totals for a shared visitor`);
    assert.match(t, /<TakePart \/>/, `${p}: a plain line on how to take part instead`);
    assert.match(t, /\{?!?shared \? <TakePart \/> : <ContactForTxBill|\{!shared && <ContactForBill/, `${p}: no contact panel for a shared visitor`);
  }
  assert.match(read("app/bills/[id]/page.tsx"), /\{!shared && <BillShareMenu/);
  const shell = read("components/share/entry-shell.tsx");
  assert.match(shell, /if \(!access\.shared\) return <PublicShell current=\{current\} access=\{access\} page=\{page\}>\{children\}<\/PublicShell>;/, "everyone else gets the usual frame, private notice included");
  assert.doesNotMatch(shell.split("await countEvent")[1], /VisitMarker|SwRegister|FeedbackPrompt|mobile-nav/, "the shared frame has no menu and no reader features");
  const picture = read("app/api/cards/g/route.tsx");
  assert.match(picture, /if \(!base\.allowed && !sharedPagesOn\(\)\) return new Response\("Not available", \{ status: 404 \}\);/, "switch off: no picture without an invite");
  assert.match(picture, /if \(!access\.allowed\) return new Response\("Not available", \{ status: 404 \}\);/);
});

test("what a share link opens: the one bill it is about, or nothing", async () => {
  const b = await bill("119-hr-7003"), other = await bill("119-hr-7004");
  await roll("house-2026-901", b);
  await db.insert(schema.txBills).values({ id: "tx-90-hb77", session: "90", identifier: "HB 77", title: "Relating to a test.", chamber: "lower", classification: ["bill"], subjects: [], stage: "filed",
    tloUrl: "https://capitol.texas.gov/", feed: "openstates", sourceUrl: "https://capitol.texas.gov/", retrievedAt: NOW });
  await link("Bill001", `/share/card?t=bill&bill=${b}`, "bill");
  await link("Vote001", "/share/card?t=vote&member=A000001&roll=house-2026-901", "vote");
  await link("Dash001", "/share/card?t=dash&kind=funnel", "dash");
  await link("Texas01", "/share/card?t=bill&bill=tx-90-hb77", "bill");
  await link("Gone001", "/share/card?t=bill&bill=119-hr-9999", "bill");
  assert.deepEqual(await shareGrant(db, "Bill001"), { code: "Bill001", target: `/share/card?t=bill&bill=${b}`, kind: "bill", billKey: b, level: "federal" });
  assert.equal((await shareGrant(db, "Vote001")).billKey, b, "a vote card opens the bill that was voted on");
  assert.equal((await shareGrant(db, "Dash001")).billKey, null, "a card about no bill opens no bill");
  assert.deepEqual([(await shareGrant(db, "Texas01")).billKey, (await shareGrant(db, "Texas01")).level], ["tx-90-hb77", "state"]);
  assert.equal((await shareGrant(db, "Gone001")).billKey, null, "a bill the site does not hold");
  for (const bad of ["Nope001", "", null, undefined, "bill001 ", "../../etc", "Bill001x"]) assert.equal(await shareGrant(db, bad), null, String(bad));
  // The grant opens that bill and no other.
  const grant = (await shareGrant(db, "Bill001")).billKey;
  assert.equal(entryAccess({ base: false, sharedPages: true, page: { kind: "bill", billKey: b }, grant }).allowed, true);
  assert.equal(entryAccess({ base: false, sharedPages: true, page: { kind: "bill", billKey: other }, grant }).allowed, false);
  assert.equal(entryAccess({ base: false, sharedPages: false, page: { kind: "bill", billKey: b }, grant }).allowed, false, "and nothing at all with the switch off");
  assert.equal(sharedBillAddress(b, "federal", "Bill001"), `/bills/${b}?s=Bill001`);
  assert.equal(sharedBillAddress("tx-90-hb77", "state", "Texas01"), "/texas/bills/tx-90-hb77?s=Texas01");
  // A card's picture is open only when a reader made a share link for exactly that card.
  assert.equal(await pictureShared(db, cardTarget(`t=bill&bill=${b}`)), true);
  assert.equal(await pictureShared(db, cardTarget(`t=bill&bill=${other}`)), false);
  assert.equal(await pictureShared(db, cardTarget(`t=bill&bill=${b}&stance=support`)), false);
  assert.deepEqual(billRefOfTarget("/share/card?t=change&bill=119-hr-1&c=b1"), { billKey: "119-hr-1" });
  assert.deepEqual(billRefOfTarget("/share/card?t=quiet&roll=senate-119-2-231"), { rollId: "senate-119-2-231" });
  assert.deepEqual(billRefOfTarget("/bills/119-hr-1"), { billKey: "119-hr-1" });
  assert.deepEqual(billRefOfTarget("/texas/bills/tx-90-hb1"), { billKey: "tx-90-hb1" });
  for (const t of ["/share/card?t=member&member=A000001", "/politicians/A000001", "/dashboard", "/editor", "/share/card?t=bill&bill=../x"]) assert.equal(billRefOfTarget(t), null, t);
});

test("crawlers, titles and the sitemap follow the switch", () => {
  const slugs = ISSUE_CATEGORIES.map(c => c.slug);
  assert.equal(slugs.length, 14);
  assert.deepEqual(sitemapPaths(false, false, slugs), [], "both switches off: nothing in the sitemap, as now");
  assert.deepEqual(sitemapPaths(false, true, slugs), slugs.map(s => `/issues/${s}`), "the 14 issue pages and nothing else");
  assert.deepEqual(robotsRules(false, "https://x.test"), { rules: [{ userAgent: "*", disallow: "/" }] });
  assert.deepEqual(robotsRules(false, "https://x.test", false), { rules: [{ userAgent: "*", disallow: "/" }] });
  const open = robotsRules(false, "https://x.test", true);
  assert.deepEqual(open.rules, [{ userAgent: "*", allow: ["/issues/", "/s/", "/bills/", "/texas/bills/", "/api/cards/g"], disallow: "/" }]);
  assert.deepEqual(robotsRules(true, "https://x.test", true), robotsRules(true, "https://x.test", false), "public reading means what it meant");
  const sitemap = read("app/sitemap.ts");
  assert.match(sitemap, /if \(!publicRead && !sharedPages\) return \[\];/);
  const issue = read("app/issues/[slug]/page.tsx");
  assert.match(issue, /if \(!\(await entryViewer\(\{ kind: "issue" \}\)\)\.allowed\) return \{ title: BRAND\.name \};/, "no title or description for a visitor who may not read the page");
  assert.match(read("app/bills/[id]/page.tsx"), /if \(access\.shared\) \{[\s\S]*robots: \{ index: false, follow: false \}/, "a bill opened through a share link stays out of search results");
});

/* ───────────────────────────── 4. The issue entry page ───────────────────────────── */

test("the heading and the opening lines, for each of the 14 issues", () => {
  assert.equal(issueHeading("health-care", "Health care"), "What Congress did on health care this month");
  assert.equal(issueHeading("economy-jobs", "Economy & jobs"), "What Congress did on the economy and jobs this month");
  for (const c of ISSUE_CATEGORIES) {
    const h = issueHeading(c.slug, c.name), intro = issueIntro(c.slug, c.name);
    assert.match(h, /^What Congress did on [a-z, ]+ this month$/, h);
    assert.ok(intro.length >= 2 && intro.length <= 3, "two or three sentences");
    assert.match(intro.join(" "), /official record/);
    assert.doesNotMatch(`${h} ${intro.join(" ")} ${nothingThisMonth(c.slug, c.name, "November 2026")}`, OUTRAGE);
    const meta = issueMeta(h, "x", "November 2026");
    assert.ok(meta.title.length <= TITLE_MAX && meta.description.length <= DESCRIPTION_MAX);
  }
  assert.equal(nothingThisMonth("guns", "Guns", "November 2026"), "In November 2026, the records on this site show no vote on a bill about guns, and no such bill passed the House or the Senate, became law or was vetoed.");
  assert.equal(MONTH_END, "That is everything this month.");
});

test("this month is the calendar month in Washington", () => {
  assert.deepEqual(monthWindow(NOW), { key: "2026-11", label: "November 2026" });
  assert.deepEqual(monthWindow(Date.UTC(2026, 10, 1, 3)), { key: "2026-10", label: "October 2026" }, "3am UTC on 1 Nov is still 31 Oct in Washington");
  assert.deepEqual(monthWindow(Date.UTC(2026, 10, 1, 5)), { key: "2026-11", label: "November 2026" });
  assert.deepEqual(monthWindow(Date.UTC(2027, 0, 1, 4, 59)), { key: "2026-12", label: "December 2026" });
  assert.equal(easternDay(Date.parse("2026-11-12T03:30:00Z")), "2026-11-11");
});

test("every line is fixed wording: the result with its numbers, the same words whichever side won", () => {
  const v = (kind, result, yea, nay, extra = {}) => voteSentence({ chamber: "house", kind, result, yea, nay, tallyOk: true, question: "On Passage", ...extra }, "the GUARD Act");
  assert.equal(v("pass", "Passed", 232, 198), "The House passed the GUARD Act, 232–198.");
  assert.equal(v("pass", "Failed", 198, 232), "The House voted on passing the GUARD Act. It did not pass, 198–232.");
  assert.equal(v("pass", "Passed", 232, 198, { tallyOk: false }), "The House passed the GUARD Act.", "no count while it is under review");
  assert.equal(v("override", "Passed", 290, 130), "The House overrode the President’s veto of the GUARD Act, 290–130.");
  assert.equal(v("override", "Failed", 250, 170), "The House voted on overriding the President’s veto of the GUARD Act. The veto stood, 250–170.");
  assert.equal(v("other_chamber", "Passed", 220, 210), "The House accepted the Senate’s changes to the GUARD Act, 220–210.");
  assert.equal(v("final_version", "Agreed to", 220, 210), "The House approved the final House–Senate version of the GUARD Act, 220–210.");
  assert.equal(voteSentence({ chamber: "senate", kind: "end_debate", result: "Cloture Motion Rejected", yea: 48, nay: 51, tallyOk: true, question: "On the Cloture Motion" }, "the GUARD Act"),
    "The Senate voted on ending debate on the GUARD Act. The vote failed, 48–51 (60 votes were needed), so the bill stalled.");
  assert.equal(voteSentence({ chamber: "senate", kind: "take_up", result: "Motion to Proceed Rejected", yea: 49, nay: 50, tallyOk: true, question: "On the Motion to Proceed" }, "the GUARD Act"),
    "The Senate voted on taking up the GUARD Act. The vote failed, 49–50, so the bill stalled.");
  assert.equal(actionSentence({ stage: "passed", chamber: "senate", text: "Passed/agreed to in Senate: Passed Senate without amendment by Unanimous Consent." }, "the GUARD Act"), "The Senate passed the GUARD Act without a recorded vote (by unanimous consent).");
  assert.equal(actionSentence({ stage: "passed", chamber: "house", text: "Passed/agreed to in House: On passage Passed by voice vote." }, "the GUARD Act"), "The House passed the GUARD Act by voice vote.");
  assert.equal(actionSentence({ stage: "law", chamber: null, text: "Became Public Law No: 119-99." }, "the GUARD Act"), "The GUARD Act became law.");
  assert.equal(actionSentence({ stage: "vetoed", chamber: null, text: "Vetoed by President." }, "the GUARD Act"), "The President vetoed the GUARD Act.");
  assert.equal(otherVotesLine(0), null);
  assert.match(otherVotesLine(3), /^3 other recorded votes this month were steps on the way to a decision/);
  assert.match(otherVotesLine(1), /^1 other recorded vote this month was a step/);
  assert.equal(earlierEnd(5, 7), "Those are the 5 most recent before this month. 7 older ones are not listed here.");
  assert.equal(earlierEnd(3, 0), "That is all 3 before this month.");
});

test("an issue's month, built from the record: votes and results, bills that passed, became law or were vetoed; then Earlier, capped", async () => {
  for (const c of ISSUE_CATEGORIES.slice(0, 3)) await db.insert(schema.issueCategories).values({ slug: c.slug, name: c.name, sortOrder: ++seq }).onConflictDoNothing();
  const [health, taxes, empty] = ISSUE_CATEGORIES.slice(0, 3).map(c => c.slug);
  const a = await bill("119-hr-7101", { title: "Rural Clinics Act" }), b2 = await bill("119-s-7102", { billType: "s", title: "A bill to lower the cost of insulin." }), tax = await bill("119-hr-7103", { title: "Tax Act" });
  const rule = await bill("119-hres-7104", { billType: "hres", title: "Providing for consideration of the bill (H.R. 7101)" });
  for (const [billId, slug] of [[a, health], [b2, health], [tax, taxes], [rule, health]]) await db.insert(schema.billCategories).values({ billId, categorySlug: slug, method: "mapping", createdAt: NOW });
  // This month.
  await roll("house-2026-910", a, { at: Date.parse("2026-11-10T21:00:00Z"), yea: 392, nay: 18 });
  await action(a, "2026-11-10", "passed_first", "house", "Passed/agreed to in House: On passage Passed by the Yeas and Nays: 392 - 18 (Roll no. 910).");
  await action(a, "2026-11-12", "passed_first", "senate", "Passed/agreed to in Senate: Passed Senate without amendment by Unanimous Consent.");
  await action(a, "2026-11-17", "law", null, "Became Public Law No: 119-88.");
  await roll("senate-119-2-911", b2, { chamber: "senate", at: Date.parse("2026-11-05T19:00:00Z"), question: "On the Cloture Motion", result: "Cloture Motion Rejected", yea: 48, nay: 51, title: "Motion to Invoke Cloture: S. 7102" });
  await roll("house-2026-912", a, { at: Date.parse("2026-11-09T21:00:00Z"), question: "On Motion to Recommit", result: "Failed", yea: 190, nay: 230 }); // a step on the way: counted, not listed
  await roll("house-2026-913", rule, { at: Date.parse("2026-11-09T18:00:00Z"), question: "On Agreeing to the Resolution", result: "Passed", yea: 220, nay: 205 }); // a House rule is not a bill that can become law
  await roll("house-2026-914", tax, { at: Date.parse("2026-11-11T21:00:00Z") }); // another issue
  await roll("house-2026-915", a, { at: NOW + 3 * DAY }); // dated after today: never shown
  // Earlier: seven items before this month.
  for (let i = 0; i < 7; i++) await roll(`senate-119-2-92${i}`, b2, { chamber: "senate", at: Date.parse(`2026-10-${10 + i}T19:00:00Z`), yea: 60 + i, nay: 40 - i });

  const headlines = async ids => new Map(ids.includes(b2) ? [[b2, "Caps the price of insulin at $35 a month."]] : []);
  const m = await issueMonth(db, health, NOW, { headlines });
  assert.equal(m.label, "November 2026");
  assert.deepEqual(m.month.map(i => `${i.day} ${i.sentence}`), [
    "2026-11-17 The Rural Clinics Act became law.",
    "2026-11-12 The Senate passed the Rural Clinics Act without a recorded vote (by unanimous consent).",
    "2026-11-10 The House passed the Rural Clinics Act, 392–18.",
    "2026-11-05 The Senate voted on ending debate on a bill that caps the price of insulin at $35 a month. The vote failed, 48–51 (60 votes were needed), so the bill stalled.",
  ], "newest first; the House passage is listed once, as the recorded vote");
  assert.equal(m.month[3].nameLabel, "Analysis", "the plain headline when a summary is on show");
  assert.equal(m.month[0].nameLabel, "Official", "the official title otherwise");
  for (const i of [...m.month, ...m.earlier]) {
    assert.match(i.day, /^2026-\d\d-\d\d$/, "each line has its date");
    assert.match(i.source.url, /^https:\/\/(clerk\.house\.gov|www\.senate\.gov|www\.congress\.gov)\//, "each line has its official source");
    assert.doesNotMatch(i.sentence, OUTRAGE);
    assert.doesNotMatch(i.sentence, /Democrat|Republican|\bGOP\b/, "no party in any line");
  }
  assert.equal(m.month[0].source.url.endsWith("/all-actions"), true);
  assert.equal(m.otherVotes, 1, "the vote on a motion to recommit is counted as a step, not listed");
  assert.ok(m.month.every(i => i.day.startsWith("2026-11") && i.day <= "2026-11-18"), "only this calendar month, and nothing dated after today");
  assert.equal(m.earlier.length, EARLIER_CAP);
  assert.equal(m.earlierMore, 2);
  assert.deepEqual(m.earlier.map(i => i.day), ["2026-10-16", "2026-10-15", "2026-10-14", "2026-10-13", "2026-10-12"], "Earlier: the most recent before this month, capped");
  assert.equal(m.earlier[0].sentence, "The Senate passed a bill that caps the price of insulin at $35 a month, 66–34.");
  // Without the gate's headline, the official title is used.
  assert.equal((await issueMonth(db, health, NOW)).month[3].nameLabel, "Official");
  // Another issue sees only its own bill; an issue with nothing says so; an unknown issue is not a page.
  assert.deepEqual((await issueMonth(db, taxes, NOW)).month.map(i => i.billId), [tax]);
  const none = await issueMonth(db, empty, NOW);
  assert.deepEqual([none.month.length, none.earlier.length, none.earlierMore, none.otherVotes], [0, 0, 0, 0]);
  assert.equal(await issueMonth(db, "no-such-issue", NOW), null);
  // In December the same November items are "Earlier".
  const december = await issueMonth(db, health, Date.UTC(2026, 11, 3, 20));
  assert.equal(december.label, "December 2026");
  assert.equal(december.month.length, 0);
  assert.deepEqual([december.earlier[0].day, december.earlier[0].sentence], ["2026-11-21", "The House passed the Rural Clinics Act, 230–190."], "the vote dated 21 Nov is in the past by then");
  // The list of bills on the issue is capped and says how many there are.
  const list = await issueBills(db, health, 1);
  assert.deepEqual([list.bills.length, list.total], [1, 2], "bills that can become law only: the House rule is not listed");
  const page = read("app/issues/[slug]/page.tsx");
  for (const piece of ["{MONTH_END}", "<h2>Earlier</h2>", "earlierEnd(data.earlier.length, data.earlierMore)", "nothingThisMonth(slug, category.name, data.label)", "issueHeading(slug, category.name)"]) assert.ok(page.includes(piece), piece);
  assert.doesNotMatch(page, /automated-research|openai/i, "no model call builds this page");
});

/* ───────────────────────────── 5. Share rate per bill view ───────────────────────────── */

test("share rate per bill view: bill-page views, shares started from a bill, and the rate, for 7 and 28 days", async () => {
  const day = back => new Date(NOW - back * DAY).toISOString().slice(0, 10);
  const count = (back, name, dim, n) => db.insert(schema.eventCounts).values({ day: day(back), name, dim, n });
  assert.deepEqual(await shareMeasures(db, NOW).then(m => [m.last7, m.last28]), [{ days: 7, billViews: 0, sharesStarted: 0, rate: null }, { days: 28, billViews: 0, sharesStarted: 0, rate: null }]);
  await count(0, "page_view", "trial:/bills/[id]", 10);
  await count(0, "page_view", "trial:/texas/bills/[id]", 2);
  await count(1, "page_view", "shared:/bills/[id]", 3);
  await count(0, "page_view", "editor:/bills/[id]", 50); // the editor's own views: left out
  await count(0, "page_view", "closed:/bills/[id]", 9); // the private notice: left out
  await count(0, "page_view", "trial:/share/card", 7); // not a bill page
  await count(6, "page_view", "public:/bills/[id]", 5);
  await count(7, "page_view", "trial:/bills/[id]", 30); // eight days ago counting today: outside 7, inside 28
  await count(27, "page_view", "trial:/bills/[id]", 10);
  await count(28, "page_view", "trial:/bills/[id]", 1000); // outside 28
  await count(0, "share_start", "bill:roll", 3);
  await count(2, "share_start", "bill:change", 1);
  await count(20, "share_start", "bill:carousel", 2);
  await count(0, "share_native", "vote", 40); // a share action on a card, not a share started from a bill
  await count(0, "share_start", "member:vote", 9);
  const m = await shareMeasures(db, NOW);
  assert.deepEqual(m.last7, { days: 7, billViews: 20, sharesStarted: 4, rate: 0.2 });
  assert.deepEqual(m.last28, { days: 28, billViews: 60, sharesStarted: 6, rate: 0.1 });
  assert.deepEqual(BILL_VIEW_DIMS, ["trial:/bills/[id]", "trial:/texas/bills/[id]", "public:/bills/[id]", "public:/texas/bills/[id]", "shared:/bills/[id]", "shared:/texas/bills/[id]"]);
  assert.match(m.counted.billViews, /editor's own views and the private notice are left out/);
  assert.match(m.counted.sharesStarted, /share_start/);
  assert.equal(shareRate(0, 5), null); assert.equal(shareRate(3, 1), 0.333);
  // Aggregate only: the counter has a day, a name and a kind of page or card. No reader, no bill.
  assert.deepEqual(Object.keys(schema.eventCounts).filter(k => !k.startsWith("_") && k !== "enableRLS").sort(), ["day", "dim", "n", "name"]);
  assert.match(read("lib/share.ts"), /countEvent\(SHARE_START_EVENT, `bill:\$\{kind\.replace\(\/\[\^a-z\]\/g, ""\)\.slice\(0, 20\)\}`\)/, "the dimension is the kind of card, never which bill");
  assert.match(read("app/share/card/page.tsx"), /if \(sp\.src === "bill" && !fromShare\) await countShareStart\(r\.type\);/);
});
