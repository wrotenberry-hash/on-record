// Suggest changes, the editor's approval queue (owner, 20 Nov 2026; docs/SUGGEST_CHANGES.md): "AI drafts the menu;
// nothing goes live until the editor approves it in a queue that shows the option beside its source text."
// The rules in lib/changes/queue-rules.ts, and the same database functions the site runs (lib/changes/queue-store.ts)
// against a temporary database built from the real migrations. The pages and the server actions import "@/..." and
// cannot be loaded here, so their source text is read instead.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { SOURCE_LABEL } from "../lib/changes/types.ts";
import { approvedProblems, canGoLive, checkLine, DIRECTION_ORDER, directionWord, groupOptions, groupProblems, groupTitle, highlightQuote, MENU_STATUS_WORD, NOT_YET_SHOWN, NOTHING_SHOWN,
  optionCounts, optionWord, quoteFound, readChecks, sectionAnchor, sectionHref, sectionTitle, sentenceCount, STATUS_WORD, windowWords, billHref } from "../lib/changes/queue-rules.ts";
import { closeMenu, decideGroup, decideOption, makeLive, menuDetail, menusForReview } from "../lib/changes/queue-store.ts";
import { BILL, MENU, NOW, OPTIONS, SECTIONS, seedMenu } from "./change-queue-helpers.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const dir = mkdtempSync(join(tmpdir(), "change-queue-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
after(() => { client.close(); rmSync(dir, { recursive: true, force: true }); });

const RH3 = SECTIONS.find(s => s.version === "rh" && s.num === "3"), RH4 = SECTIONS.find(s => s.version === "rh" && s.num === "4");
const stored = SECTIONS.map(s => ({ ...s, sourceUrl: `https://example.test/${s.version}` }));
/** The fixture's options with some changed: `{ "opt-up": { status: "approved" } }`; a value of null drops the option. */
const options = (changes = {}) => OPTIONS.filter(o => changes[o.id] !== null).map(o => ({ ...o, ...(changes[o.id] ?? {}) }));
const groupsOf = (changes, sections = stored) => groupOptions(options(changes), sections);
const all = status => Object.fromEntries(OPTIONS.map(o => [o.id, { status }]));

/* ───────────────────────────── Finding the quoted words ───────────────────────────── */

test("highlightQuote finds a quote whose line breaks differ from the section's, and changes no text", () => {
  const quote = "$40,000,000 for each of fiscal years 2027 through 2031";
  assert.ok(!RH3.body.includes(quote), "the published text breaks the line inside the quote");
  const h = highlightQuote(RH3.body, quote);
  assert.ok(h);
  assert.equal(h.match, "$40,000,000 for each of fiscal years 2027 through\n2031", "the match is the section's own characters, line break included");
  assert.equal(h.before + h.match + h.after, RH3.body, "the three parts are the section, unchanged");
  assert.ok(h.before.endsWith("Secretary ") && h.after.startsWith(" to carry out this Act."));

  const other = highlightQuote("one   two\n\n three\tfour", "  two three\nfour ");
  assert.deepEqual(other, { before: "one   ", match: "two\n\n three\tfour", after: "" }, "a quote with its own extra spaces and breaks");
  assert.deepEqual(highlightQuote("abc abc", "abc"), { before: "", match: "abc", after: " abc" }, "the first place it appears");
});

test("highlightQuote returns null when the words are not in the section", () => {
  assert.equal(highlightQuote(RH3.body, "$45,000,000 for each of fiscal years"), null, "a different number");
  assert.equal(highlightQuote(RH3.body, "there is authorized to be appropriated"), null, "capitals count: word for word");
  assert.equal(highlightQuote(RH3.body, "authorized to be appropriated to theSecretary"), null, "a missing space is not forgiven");
  assert.equal(highlightQuote(RH3.body, "  \n "), null, "an empty quote finds nothing");
  assert.equal(highlightQuote("", "anything"), null);
});

/* ───────────────────────────── Groups ───────────────────────────── */

test("groupOptions: one group per group_key, in drafting order, options in the reader's order, beside the cited section", () => {
  assert.deepEqual(DIRECTION_ORDER, ["up", "down", "keep", "remove", "adopt", "reject", "this_version", "other_version"]);
  const groups = groupsOf();
  assert.deepEqual(groups.map(g => g.key), ["dial:rh:3:1", "version:4:1"], "by the lowest seq in each group");
  const [amount, counties] = groups;
  assert.deepEqual(amount.options.map(o => o.direction), ["up", "down", "keep", "remove"], "drafted keep, up, down, remove");
  assert.deepEqual(counties.options.map(o => o.direction), ["this_version", "other_version"], "drafted the other way round");
  assert.equal(amount.source, "dial"); assert.equal(amount.sourceLabel, "Section 3 of the bill as reported in the House");
  assert.equal(amount.sectionVersion, "rh"); assert.equal(amount.sectionNum, "3"); assert.equal(amount.kind, "amount");
  assert.equal(amount.quote, "$40,000,000 for each of fiscal years 2027 through 2031"); assert.equal(amount.about, "the yearly amount the program may receive");
  assert.equal(groupTitle(amount), "The yearly amount the program may receive");
  assert.equal(amount.section.heading, "Authorization of appropriations"); assert.equal(amount.section.version, "rh", "the version it cites, not the other one");
  assert.equal(amount.other, null, "only a difference between versions has another side");
  assert.equal(counties.section.versionLabel, "Reported in House"); assert.equal(counties.other.versionLabel, "Introduced in House");
  assert.ok(highlightQuote(counties.other.body, counties.otherQuote), "the other version's words are in the other version's section");
  assert.equal(groupOptions([]).length, 0);
  assert.equal(groupOptions(options())[0].section, null, "no stored sections given: none attached");
  // Options are not reordered in place and the input is left alone.
  const input = options(); groupOptions(input, stored);
  assert.deepEqual(input.map(o => o.id), OPTIONS.map(o => o.id));
});

test("groupOptions: when two stored sections share a number, the one that holds the quote is the one shown", () => {
  const twice = [{ ...stored.find(s => s.version === "rh" && s.num === "1"), num: "3", heading: "Division A, section 3" }, ...stored];
  assert.equal(groupOptions(options(), twice)[0].section.heading, "Authorization of appropriations");
});

/* ───────────────────────────── What an editor must not miss ───────────────────────────── */

test("groupProblems: a clean group has none", () => {
  for (const g of groupsOf()) assert.deepEqual(groupProblems(g), [], g.key);
});

test("groupProblems: up without down, and down without up", () => {
  const [noDown] = groupsOf({ "opt-down": null });
  assert.deepEqual(groupProblems(noDown), ["“Higher” is offered without “Lower”. Both directions must be offered together."]);
  const [noUp] = groupsOf({ "opt-up": null });
  assert.deepEqual(groupProblems(noUp), ["“Lower” is offered without “Higher”. Both directions must be offered together."]);
  const [retired] = groupsOf({ "opt-down": { status: "retired" } });
  assert.equal(groupProblems(retired).length, 1, "a retired option is not on offer");
  const [rejected] = groupsOf({ "opt-down": { status: "rejected" } });
  assert.deepEqual(groupProblems(rejected), [], "rejecting one direction is the editor's doing, reported by approvedProblems instead");
  const [, oneSided] = groupsOf({ "opt-other": null });
  assert.deepEqual(groupProblems(oneSided), ["“Reported in House” is offered without “Introduced in House”. Both directions must be offered together."]);
  const [neither] = groupsOf({ "opt-up": null, "opt-down": null });
  assert.deepEqual(groupProblems(neither), [], "keep and remove alone are a whole group");
});

test("groupProblems: a number, date or limit without keep or without remove is reported", () => {
  const [noKeep] = groupsOf({ "opt-keep": null });
  assert.deepEqual(groupProblems(noKeep), ["“Keep as written” is missing. It is always offered for a number, date or limit in the bill's own text."]);
  const [noRemove] = groupsOf({ "opt-remove": null });
  assert.deepEqual(groupProblems(noRemove), ["“Remove” is missing. It is always offered for a number, date or limit in the bill's own text."]);
  const [neither] = groupsOf({ "opt-keep": null, "opt-remove": null });
  assert.equal(groupProblems(neither).length, 2);
  const [, counties] = groupsOf();
  assert.ok(!groupProblems(counties).some(p => /Keep as written|Remove/.test(p)), "a difference between versions is not a dial");
});

test("groupProblems: a failed check, a quote that is not in the section, and a wording of two sentences", () => {
  const [failed] = groupsOf({ "opt-up": { checks: { passed: false, failures: ["The sentence names a person.", "Too long for the average reader"] } } });
  assert.deepEqual(groupProblems(failed), ["“Higher” did not pass the automatic checks: The sentence names a person; Too long for the average reader."]);
  const [bare] = groupsOf({ "opt-up": { checks: { passed: false, failures: [] } } });
  assert.deepEqual(groupProblems(bare), ["“Higher” did not pass the automatic checks."]);

  const [unsourced] = groupsOf({ "opt-down": { quote: "$45,000,000 for each of fiscal years 2027 through 2031" } });
  assert.deepEqual(groupProblems(unsourced), ["“Lower”: its quoted words are not found in the stored text of section 3."]);
  const [elsewhere] = groupsOf({ "opt-down": { sectionNum: "4" } });
  assert.deepEqual(groupProblems(elsewhere), ["“Lower” cites a different section than the rest of its group."]);

  const [two] = groupsOf({ "opt-keep": { wording: "Keep the yearly amount at $40 million. It is the right amount." } });
  assert.deepEqual(groupProblems(two), ["“Keep as written”: the wording is more than one sentence."]);
  const [empty] = groupsOf({ "opt-keep": { wording: "  " } });
  assert.deepEqual(groupProblems(empty), ["“Keep as written” has no wording."]);

  const [rejected] = groupsOf({ "opt-up": { status: "rejected", checks: { passed: false, failures: ["x"] }, wording: "One. Two." } });
  assert.deepEqual(groupProblems(rejected), [], "an option the editor already rejected raises nothing more");
});

test("groupProblems: a section that is not stored, and another version's words that cannot be found", () => {
  const [amount, counties] = groupsOf({}, stored.filter(s => s.version === "ih"));
  assert.deepEqual(groupProblems(amount), ["The text of section 3 in version “rh” is not stored, so the quoted words cannot be checked against it."]);
  assert.equal(quoteFound(amount, amount.options[0]), false, "nothing stored: nothing found");
  assert.ok(groupProblems(counties).length >= 1);

  const [, lone] = groupsOf({}, stored.filter(s => s.version === "rh"));
  assert.deepEqual(groupProblems(lone), ["The other version's words are not found in section 4 of any other stored version."]);
  const [, wrong] = groupsOf({ "opt-other": { otherQuote: "serves a county with fewer than 10,000 residents" }, "opt-this": { otherQuote: "serves a county with fewer than 10,000 residents" } });
  assert.deepEqual(groupProblems(wrong), ["The other version's words are not found in section 4 of Introduced in House."]);
  const full = groupOptions([{ ...OPTIONS[0], sectionNum: "FULL" }], []);
  assert.match(groupProblems(full[0])[0], /^The text of the full text in version “rh” is not stored/);
});

test("sentenceCount: a full stop in a number or after a short form is not the end of a sentence", () => {
  assert.equal(sentenceCount("Raise the yearly amount above $40 million."), 1);
  assert.equal(sentenceCount("Raise the amount in H.R. 9100 above $1.5 billion."), 1);
  assert.equal(sentenceCount("Change Sec. 3 so the U.S. Secretary reports by Jan. 1, 2028."), 1);
  assert.equal(sentenceCount("Adopt H.Amdt. 274 to H.Con.Res. 5"), 1, "no full stop at the end is still one sentence");
  assert.equal(sentenceCount("Raise it. Lower it."), 2);
  assert.equal(sentenceCount("Should it go up? It should."), 2);
  assert.equal(sentenceCount("Keep it (as written.) Remove it."), 2);
  assert.equal(sentenceCount("   "), 0);
});

/* ───────────────────────────── Going live ───────────────────────────── */

test("canGoLive: nothing approved, nothing to approve", () => {
  assert.deepEqual(canGoLive(groupsOf()), { ok: false, reasons: ["No option is approved yet."] });
  assert.deepEqual(canGoLive(groupsOf(all("rejected"))), { ok: false, reasons: ["No option is approved yet."] });
  assert.deepEqual(canGoLive([]), { ok: false, reasons: ["No option is approved yet."] });
});

test("canGoLive: approving up while rejecting down blocks the menu; both directions travel together", () => {
  const blocked = canGoLive(groupsOf({ ...all("approved"), "opt-down": { status: "rejected" } }));
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.reasons, ["The yearly amount the program may receive: “Higher” is approved but “Lower” is not. Both directions go together: approve both or reject both."]);
  const waiting = canGoLive(groupsOf({ ...all("approved"), "opt-up": { status: "draft" } }));
  assert.deepEqual(waiting.reasons, ["The yearly amount the program may receive: “Lower” is approved but “Higher” is not. Both directions go together: approve both or reject both."], "an undecided opposite blocks too");
  const sided = canGoLive(groupsOf({ ...all("approved"), "opt-other": { status: "rejected" } }));
  assert.deepEqual(sided.reasons, ["Which counties a clinic must serve: “Reported in House” is approved but “Introduced in House” is not. Both directions go together: approve both or reject both."]);
  const amendment = groupOptions([{ ...OPTIONS[0], id: "a1", source: "amendment", groupKey: "amdt:1", direction: "adopt", status: "approved" }, { ...OPTIONS[0], id: "a2", source: "amendment", groupKey: "amdt:1", direction: "reject", status: "rejected" }], stored);
  assert.deepEqual(approvedProblems(amendment[0]), ["“Adopt this amendment” is approved but “Do not adopt it” is not. Both directions go together: approve both or reject both."]);
});

test("canGoLive: an approved number, date or limit always carries keep and remove", () => {
  const noKeep = canGoLive(groupsOf({ ...all("approved"), "opt-keep": { status: "rejected" } }));
  assert.deepEqual(noKeep.reasons, ["The yearly amount the program may receive: “Keep as written” is not approved. It goes with every approved option about a number, date or limit."]);
  const noRemove = canGoLive(groupsOf({ ...all("approved"), "opt-remove": { status: "draft" } }));
  assert.deepEqual(noRemove.reasons, ["The yearly amount the program may receive: “Remove” is not approved. It goes with every approved option about a number, date or limit."]);
  assert.equal(canGoLive(groupsOf({ ...all("approved"), "opt-up": { status: "rejected" }, "opt-down": { status: "rejected" } })).ok, true, "keep and remove alone may go");
});

test("canGoLive: a whole group may be left out, and a fully approved menu may go", () => {
  assert.deepEqual(canGoLive(groupsOf(all("approved"))), { ok: true, reasons: [] });
  const oneGroup = { ...all("rejected"), "opt-this": { status: "approved" }, "opt-other": { status: "approved" } };
  assert.deepEqual(canGoLive(groupsOf(oneGroup)), { ok: true, reasons: [] }, "the rejected group is simply not offered");
  assert.deepEqual(approvedProblems(groupsOf(oneGroup)[0]), []);
});

test("canGoLive: an approved option whose quoted words are not in the stored section stops the menu", () => {
  const unsourced = canGoLive(groupsOf({ ...all("approved"), "opt-down": { status: "approved", quote: "$45,000,000 for each of fiscal years" } }));
  assert.equal(unsourced.ok, false);
  assert.deepEqual(unsourced.reasons, ["The yearly amount the program may receive: “Lower” is approved, but its quoted words are not found in the stored text of the section it cites."]);
  const noText = canGoLive(groupsOf(all("approved"), []));
  assert.equal(noText.ok, false, "no stored text at all: nothing can be checked, so nothing goes");
  assert.equal(noText.reasons.length, 6);
});

/* ───────────────────────────── The words a reader sees ───────────────────────────── */

test("directionWord: the word for each kind and direction", () => {
  for (const kind of ["amount", "percent", "count"]) { assert.equal(directionWord(kind, "up"), "Higher", kind); assert.equal(directionWord(kind, "down"), "Lower", kind); }
  assert.equal(directionWord("date", "up"), "Later"); assert.equal(directionWord("date", "down"), "Earlier");
  assert.equal(directionWord("duration", "up"), "Longer"); assert.equal(directionWord("duration", "down"), "Shorter");
  assert.equal(directionWord("coverage", "up"), "More people"); assert.equal(directionWord("coverage", "down"), "Fewer people");
  assert.equal(directionWord("something new", "up"), "Higher", "a kind this file has not met"); assert.equal(directionWord("something new", "down"), "Lower");
  for (const kind of ["amount", "date", "duration", "coverage", "difference"]) {
    assert.equal(directionWord(kind, "keep"), "Keep as written"); assert.equal(directionWord(kind, "remove"), "Remove");
    assert.equal(directionWord(kind, "adopt"), "Adopt this amendment"); assert.equal(directionWord(kind, "reject"), "Do not adopt it");
  }
  const versions = { thisLabel: "Reported in House", otherLabel: "Introduced in House" };
  assert.equal(directionWord("difference", "this_version", versions), "Reported in House");
  assert.equal(directionWord("difference", "other_version", versions), "Introduced in House");
  assert.equal(directionWord("difference", "this_version"), "This version"); assert.equal(directionWord("difference", "other_version", { otherLabel: " " }), "The other version");
  const [amount, counties] = groupsOf();
  assert.deepEqual(amount.options.map(o => optionWord(amount, o)), ["Higher", "Lower", "Keep as written", "Remove"]);
  assert.deepEqual(counties.options.map(o => optionWord(counties, o)), ["Reported in House", "Introduced in House"]);
  // Calm, plain words: no exclamation mark, and nothing about sending or about other people.
  const every = ["amount", "date", "duration", "coverage", "difference"].flatMap(k => DIRECTION_ORDER.map(d => directionWord(k, d)));
  for (const w of every) assert.doesNotMatch(w, /!|sent|send|neighbor|legislator/i, w);
});

test("links, labels and the small lines of the queue", () => {
  assert.equal(sectionAnchor("3"), "sec-3"); assert.equal(sectionAnchor("FULL"), "sec-full"); assert.equal(sectionAnchor("2A"), "sec-2a");
  assert.equal(sectionAnchor("101(b)"), "sec-101-b-"); assert.equal(sectionAnchor("Art. III, 4"), "sec-art-iii-4");
  assert.equal(sectionHref("federal", "119-hr-2102", "rh", "3"), "/bills/119-hr-2102/text?v=rh#sec-3");
  assert.equal(sectionHref("texas", "tx-90-hb-2", "Committee Report", "FULL"), "/texas/bills/tx-90-hb-2/text?v=Committee%20Report#sec-full");
  assert.equal(billHref("federal", "119-s-307"), "/bills/119-s-307"); assert.equal(billHref("texas", "tx-90-hb-2"), "/texas/bills/tx-90-hb-2");
  assert.equal(sectionTitle("3", "Authorization of appropriations"), "Section 3: Authorization of appropriations");
  assert.equal(sectionTitle("3", "SEC. 3. AUTHORIZATION OF APPROPRIATIONS."), "SEC. 3. AUTHORIZATION OF APPROPRIATIONS."); assert.equal(sectionTitle("3", "Section 3. Money"), "Section 3. Money");
  assert.equal(sectionTitle("4", ""), "Section 4"); assert.equal(sectionTitle("FULL", null), "Full text"); assert.equal(sectionTitle("2", "Secretary's duties"), "Section 2: Secretary's duties");

  assert.equal(windowWords(null), "not recorded"); assert.equal(windowWords("  "), "not recorded");
  assert.equal(windowWords("committee"), "In committee"); assert.equal(windowWords("committee:open"), "In committee; it could still be changed");
  assert.equal(windowWords("final closed"), "Final; the window was closed");
  assert.equal(windowWords("In committee: the House Committee on Energy and Commerce has it."), "In committee: the House Committee on Energy and Commerce has it.", "a sentence is shown as stored");
  assert.equal(windowWords("committee:unknown"), "committee:unknown");

  assert.deepEqual(readChecks({ passed: true, failures: [], reader: "passed" }), { passed: true, failures: [], reader: "passed" });
  assert.deepEqual(readChecks({ passed: false, failures: ["a", 3, ""] }), { passed: false, failures: ["a"] });
  for (const bad of [null, undefined, "passed", {}, { passed: "yes" }]) assert.equal(readChecks(bad).passed, false, "anything that is not a clear pass is not a pass");
  assert.equal(checkLine({ passed: true, failures: [] }), "Automatic checks: passed.");
  assert.equal(checkLine({ passed: true, failures: [], reader: "passed" }), "Automatic checks: passed. Average-reader test: passed.");
  assert.equal(checkLine({ passed: false, failures: ["Names a person.", "Too long"] }), "Automatic checks: did not pass. Names a person; Too long.");
  assert.equal(checkLine({ passed: false, failures: [] }), "Automatic checks: did not pass.");

  assert.deepEqual(optionCounts(options({ "opt-up": { status: "approved" }, "opt-down": { status: "rejected" }, "opt-keep": { status: "retired" } })), { draft: 3, approved: 1, rejected: 1, retired: 1 });
  assert.equal(STATUS_WORD.draft, "Waiting for you"); assert.equal(MENU_STATUS_WORD.live, "Approved"); assert.equal(MENU_STATUS_WORD.failed, "Drafting did not finish");
  assert.deepEqual(Object.keys(SOURCE_LABEL), ["amendment", "version", "dial"], "three sources and nothing else");
});

/* ───────────────────────────── The same functions the site runs, on a real database ───────────────────────────── */

const BY = "user-editor-1", HOUR = 3600e3;
await seedMenu(db, schema);
const optionRow = id => db.select().from(schema.changeOptions).where(eq(schema.changeOptions.id, id)).get();
const menuRow = id => db.select().from(schema.changeMenus).where(eq(schema.changeMenus.id, id)).get();

test("store: the queue lists the menu with its bill, its counts and its cost", async () => {
  const rows = await menusForReview(db);
  assert.equal(rows.length, 1);
  const [r] = rows;
  assert.equal(r.menu.id, MENU); assert.equal(r.menu.status, "review"); assert.equal(r.menu.costUsd, 0.17);
  assert.deepEqual(r.bill, { key: BILL, system: "federal", billType: "hr", number: 9100, identifier: null, title: "A bill to support clinics in rural counties.", href: `/bills/${BILL}` });
  assert.equal(r.versionLabel, "Reported in House");
  assert.deepEqual(r.counts, { draft: 6, approved: 0, rejected: 0, retired: 0 }); assert.equal(r.groups, 2);
  assert.equal(r.menu.windowAtDraft, "In committee: the House Committee on Energy and Commerce has it.");
});

test("store: one menu, each group beside the stored section it quotes", async () => {
  assert.equal(await menuDetail(db, "no-such-menu"), null);
  const d = await menuDetail(db, MENU);
  assert.equal(d.bill.title, "A bill to support clinics in rural counties."); assert.equal(d.versionLabel, "Reported in House");
  assert.deepEqual(d.menu.notes, ["No amendment to this bill is on the official record, so none is offered.", "The date in section 3 was left out: the check could not find it inside the quoted words."]);
  assert.deepEqual(d.groups.map(g => g.options.map(o => o.id)), [["opt-up", "opt-down", "opt-keep", "opt-remove"], ["opt-this", "opt-other"]]);
  const [amount, counties] = d.groups;
  assert.equal(amount.section.heading, "Authorization of appropriations"); assert.equal(amount.section.body, RH3.body, "the stored text, untouched");
  assert.match(amount.section.sourceUrl, /^https:\/\/www\.govinfo\.gov\/.*rh\.htm$/, "the official file of the version it cites");
  assert.equal(highlightQuote(amount.section.body, amount.quote).match, "$40,000,000 for each of fiscal years 2027 through\n2031");
  assert.equal(counties.section.body, RH4.body); assert.equal(counties.other.version, "ih");
  assert.deepEqual(d.groups.flatMap(groupProblems), []);
  assert.deepEqual(d.live, { ok: false, reasons: ["No option is approved yet."] });
  assert.deepEqual(d.groups[0].options[0].checks, { passed: true, failures: [], reader: "passed" });
});

test("store: approving and rejecting one option records who and when; a note stays with a rejection", async () => {
  assert.equal(await decideOption(db, { optionId: "opt-up", decision: "approved", by: BY, now: NOW + HOUR }), MENU);
  let row = await optionRow("opt-up");
  assert.deepEqual([row.status, row.decidedBy, row.decidedAt, row.editorNote], ["approved", BY, NOW + HOUR, null]);
  assert.equal(await decideOption(db, { optionId: "opt-down", decision: "rejected", note: "  Says 'cut', which is loaded.  ", by: BY, now: NOW + HOUR }), MENU);
  row = await optionRow("opt-down");
  assert.deepEqual([row.status, row.editorNote], ["rejected", "Says 'cut', which is loaded."]);
  assert.equal(row.wording, "Lower the yearly amount below $40 million.", "the wording is never rewritten here");
  assert.equal(await decideOption(db, { optionId: "no-such-option", decision: "approved", by: BY, now: NOW }), null);
  assert.deepEqual((await menusForReview(db))[0].counts, { draft: 4, approved: 1, rejected: 1, retired: 0 });
});

test("store: a menu with one direction approved cannot go live, and nothing is written", async () => {
  const refused = await makeLive(db, { menuId: MENU, by: BY, now: NOW + 2 * HOUR });
  assert.equal(refused.ok, false);
  assert.ok(refused.reasons.includes("The yearly amount the program may receive: “Higher” is approved but “Lower” is not. Both directions go together: approve both or reject both."));
  const menu = await menuRow(MENU);
  assert.deepEqual([menu.status, menu.decidedAt, menu.decidedBy], ["review", null, null]);
  assert.deepEqual(await makeLive(db, { menuId: "no-such-menu", by: BY, now: NOW }), { ok: false, reasons: ["There is no such menu."] });
});

test("store: a whole group is decided at once, a retired option is left alone, and the menu then goes live", async () => {
  await db.insert(schema.changeOptions).values({ ...OPTIONS[1], id: "opt-up-old", seq: 7, status: "retired", menuId: MENU, billKey: BILL, createdAt: NOW });
  assert.equal(await decideOption(db, { optionId: "opt-up-old", decision: "approved", by: BY, now: NOW }), null, "a retired option cannot be decided");
  assert.equal(await decideGroup(db, { menuId: MENU, groupKey: "dial:rh:3:1", decision: "approved", by: BY, now: NOW + 3 * HOUR }), 4);
  assert.equal((await optionRow("opt-up-old")).status, "retired");
  assert.equal((await optionRow("opt-down")).editorNote, null, "the earlier rejection's note goes when the option is approved");
  assert.equal(await decideGroup(db, { menuId: MENU, groupKey: "version:4:1", decision: "rejected", note: "Wait for the Senate text.", by: BY, now: NOW + 3 * HOUR }), 2);
  assert.equal(await decideGroup(db, { menuId: MENU, groupKey: "no-such-group", decision: "approved", by: BY, now: NOW }), 0);
  assert.equal(await decideGroup(db, { menuId: "no-such-menu", groupKey: "dial:rh:3:1", decision: "approved", by: BY, now: NOW }), 0);
  const d = await menuDetail(db, MENU);
  assert.deepEqual(d.counts, { draft: 0, approved: 4, rejected: 2, retired: 1 }); assert.deepEqual(d.live, { ok: true, reasons: [] });

  assert.deepEqual(await makeLive(db, { menuId: MENU, by: BY, now: NOW + 4 * HOUR }), { ok: true, reasons: [] });
  const menu = await menuRow(MENU);
  assert.deepEqual([menu.status, menu.decidedAt, menu.decidedBy], ["live", NOW + 4 * HOUR, BY]);
  assert.deepEqual(await makeLive(db, { menuId: MENU, by: BY, now: NOW + 5 * HOUR }), { ok: false, reasons: ["This menu is not waiting for review."] });
});

test("store: once a menu is approved its options cannot be changed, so one direction can never be left standing alone", async () => {
  assert.equal(await decideOption(db, { optionId: "opt-down", decision: "rejected", by: BY, now: NOW + 5 * HOUR }), null);
  assert.equal(await decideGroup(db, { menuId: MENU, groupKey: "version:4:1", decision: "approved", by: BY, now: NOW + 5 * HOUR }), 0);
  assert.equal((await optionRow("opt-down")).status, "approved"); assert.equal((await optionRow("opt-this")).status, "rejected");
});

test("store: closing sets a menu aside and deletes nothing; a second menu and a Texas bill sit in the right order", async () => {
  await db.insert(schema.txBills).values({ id: "tx-90-hb-2", session: "90", identifier: "HB 2", title: "Relating to school bus safety.", chamber: "lower", classification: ["bill"], subjects: [], stage: "filed",
    tloUrl: "https://capitol.texas.gov/", feed: "openstates", sourceUrl: "https://openstates.org/", retrievedAt: NOW });
  const menu = (id, billKey, system, status, createdAt, extra = {}) => ({ id, billKey, system, version: "Introduced", status, generator: "m1-2026-11-20", costUsd: 0.1, notes: [], createdAt, ...extra });
  await db.insert(schema.changeMenus).values([
    menu("menu-tx", "tx-90-hb-2", "texas", "review", NOW + HOUR), menu("menu-old", "119-hr-1", "federal", "review", NOW - HOUR),
    menu("menu-failed", "119-hr-2", "federal", "failed", NOW + 9 * HOUR, { notes: ["The model did not answer."] }), menu("menu-closed", "119-hr-3", "federal", "closed", NOW + 8 * HOUR)]);
  const rows = await menusForReview(db);
  assert.deepEqual(rows.map(r => r.menu.id), ["menu-tx", "menu-old", MENU, "menu-failed", "menu-closed"], "waiting first (newest first), then approved, then the rest");
  assert.deepEqual(rows[0].bill, { key: "tx-90-hb-2", system: "texas", billType: null, number: null, identifier: "HB 2", title: "Relating to school bus safety.", href: "/texas/bills/tx-90-hb-2" });
  assert.equal(rows[1].bill.title, null, "a bill that is not on file is shown by its key, not guessed"); assert.equal(rows[0].versionLabel, null);
  assert.deepEqual(rows[0].counts, { draft: 0, approved: 0, rejected: 0, retired: 0 });

  assert.equal(await closeMenu(db, { menuId: MENU, by: BY, now: NOW + 6 * HOUR }), true);
  const closed = await menuRow(MENU);
  assert.deepEqual([closed.status, closed.decidedAt], ["closed", NOW + 6 * HOUR]);
  assert.equal((await db.select().from(schema.changeOptions).where(eq(schema.changeOptions.menuId, MENU))).length, 7, "every option is still there");
  assert.equal(await closeMenu(db, { menuId: MENU, by: BY, now: NOW + 7 * HOUR }), false, "already closed");
  assert.equal(await closeMenu(db, { menuId: "menu-failed", by: BY, now: NOW }), false, "a draft that did not finish is not something to close");
  assert.equal(await closeMenu(db, { menuId: "menu-tx", by: BY, now: NOW + 7 * HOUR }), true, "a waiting menu can be closed");
  assert.equal(await closeMenu(db, { menuId: "no-such-menu", by: BY, now: NOW }), false);
  assert.deepEqual(await makeLive(db, { menuId: MENU, by: BY, now: NOW + 8 * HOUR }), { ok: false, reasons: ["This menu is not waiting for review."] });
});

/* ───────────────────────────── The pages and the actions, read as text ───────────────────────────── */

const actions = read("app/editor/changes/actions.ts"), queuePage = read("app/editor/changes/page.tsx"), menuPage = read("app/editor/changes/[id]/page.tsx"), parts = read("app/editor/changes/parts.tsx");
const store = read("lib/changes/queue-store.ts"), rules = read("lib/changes/queue-rules.ts");
const code = s => s.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");

test("actions: every action checks for an allowlisted editor before it reads the form or writes anything", () => {
  assert.match(actions, /^"use server";/);
  assert.match(actions, /import \{ editorialAuth \} from "@\/lib\/editor-auth";/);
  const fns = [...actions.matchAll(/^export async function (\w+)\(formData: FormData\) \{\n([\s\S]*?)^\}/gm)];
  assert.deepEqual(fns.map(m => m[1]), ["decideOption", "decideGroup", "makeLive", "closeMenu"]);
  assert.equal([...actions.matchAll(/^export /gm)].length, 4, "nothing else is exported, so there is no other way in");
  for (const [, name, body] of fns) {
    assert.ok(body.startsWith("  const auth = await editorialAuth();\n  if (!auth.user) return;\n"), `${name} begins with the access check, as the bill-summary review does`);
    const check = body.indexOf("if (!auth.user) return;");
    for (const later of ["formData.get", "getDb()", "queue.", "currentAppUserId", "revalidatePath", "refresh("]) {
      const at = body.indexOf(later);
      assert.ok(at === -1 || at > check, `${name}: ${later} comes after the access check`);
    }
    assert.match(body, /queue\.\w+\(getDb\(\), \{[^}]*by: \(await currentAppUserId\(true\)\) \?\? "editor", now: Date\.now\(\) \}\)/, `${name} records the editor the way the other review actions do`);
  }
  // The same two lines the existing review action uses.
  assert.ok(read("app/editor/analysis/actions.ts").includes("  const auth = await editorialAuth();\n  if (!auth.user) return;\n"));
  assert.doesNotMatch(code(actions), /wording/, "no action takes or writes wording: the editor does not rewrite it in this phase");
  assert.doesNotMatch(code(store), /wording:\s*i\.|set\(\{[^}]*wording/, "and the store never updates it");
});

test("pages: both say readers see nothing until approval, and that an approved menu is still not shown in this phase", () => {
  assert.equal(NOTHING_SHOWN, "Nothing here is shown to readers until you approve it.");
  assert.equal(NOT_YET_SHOWN, "In this phase an approved menu is still not shown to readers: choosing comes in the next phase.");
  assert.match(parts, /<p className="gate gate-closed" role="note"><b>\{NOTHING_SHOWN\}<\/b> \{NOT_YET_SHOWN\}<\/p>/);
  for (const [name, page] of [["the queue", queuePage], ["one menu", menuPage]]) {
    assert.ok(page.includes("<ReadersSeeNothing />"), `${name} carries the two sentences`);
    assert.ok(page.indexOf("<ReadersSeeNothing />") < page.indexOf("<h2"), `${name}: before anything else on the page`);
    assert.ok(page.indexOf("<h1>") > 0 && page.indexOf("<h1>") < page.indexOf("<ReadersSeeNothing />"));
  }
  assert.ok(queuePage.includes("Approved by you. Not shown to readers in this phase."));
  assert.ok(menuPage.includes("{NOT_YET_SHOWN}"), "said again beside the button that approves the menu");
});

test("pages: editor only, no static render, and the queue is linked where the other review screens are", () => {
  assert.match(queuePage, /await requireEditorUser\("\/editor\/changes"\);\n  const rows = await menusForReview\(getDb\(\)\)/, "sign-in before any read");
  assert.match(menuPage, /await requireEditorUser\(`\/editor\/changes\/\$\{encodeURIComponent\(id\)\}`\);\n  const detail = /, "sign-in before any read");
  for (const page of [queuePage, menuPage]) { assert.ok(page.includes('export const dynamic = "force-dynamic";')); assert.ok(page.includes("robots: { index: false, follow: false }")); }
  assert.match(read("app/editor/editor-client.tsx"), /<Link href="\/editor\/analysis">Bill summaries<\/Link> · <Link href="\/editor\/changes">Menus of changes<\/Link>/);
  // No reader page reads a menu in this phase.
  // (Two automation routes also touch the tables: the drafting run, behind the scheduled update's secret, and the review
  // route, which writes drafts to the function's log and answers with counts only. Neither is a page.)
  const tracked = execFileSync("git", ["ls-files", "app", "components"], { cwd: ROOT, encoding: "utf8" }).split("\n")
    .filter(f => /\.tsx?$/.test(f) && !f.startsWith("app/editor/changes/") && !/^app\/api\/automation\/(?:changes|change-packets)\/route\.ts$/.test(f));
  for (const f of tracked) assert.doesNotMatch(read(f), /queue-store|changeMenus|changeOptions/, `${f} does not read a menu`);
});

test("pages: each option is shown beside its source text, with its source, its section link and the official file", () => {
  assert.ok(menuPage.includes("<div className=\"eyebrow\">{SOURCE_LABEL[g.source]}</div>"), "labelled with which of the three sources it is");
  assert.ok(menuPage.includes("Source: {g.sourceLabel}"));
  assert.ok(menuPage.includes("<Link href={sectionHref(bill.system, bill.key, g.sectionVersion, g.sectionNum)}>This section on the site</Link>"));
  assert.ok(menuPage.includes("<a href={g.section.sourceUrl} rel=\"noreferrer\">Official file</a>"));
  assert.ok(menuPage.includes("{h ? <>{h.before}<mark id={markId}>{h.match}</mark>{h.after}</> : body}"), "the stored text, with only a mark added");
  assert.match(menuPage, /<figcaption>\{difference \? thisLabel : "The quoted words"\}<\/figcaption><blockquote>\{g\.quote\}<\/blockquote>/);
  assert.match(menuPage, /\{difference && <figure className="change-quote"><figcaption>\{otherLabel\}<\/figcaption><blockquote>\{g\.otherQuote\}<\/blockquote><\/figure>\}/, "both versions' words, each under its version's name");
  assert.ok(menuPage.indexOf("<SectionText body={g.section.body}") < menuPage.indexOf("<ul className=\"change-options\">"), "the text comes before the options it supports");
  assert.ok(menuPage.includes("groupProblems(g)") && menuPage.includes("<b>Check before you approve.</b>") && menuPage.includes("<b>This stops the menu from being approved.</b>"));
  assert.ok(menuPage.indexOf("<b>Check before you approve.</b>") < menuPage.indexOf("<SectionText body={g.section.body}"), "problems are at the top of the card");
  // Forms that work without scripts: plain forms posting to server actions, no client component.
  for (const f of [menuPage, queuePage, parts]) assert.doesNotMatch(f, /"use client"|onClick|useState|useFormStatus/);
  for (const action of ["decideOption", "decideGroup", "makeLive", "closeMenu"]) assert.ok(menuPage.includes(`<form action={${action}}`), action);
  assert.match(menuPage, /\{menu\.status === "review" && live\.ok && <>[\s\S]*?<form action=\{makeLive\}/, "the approve button is offered only when the rules allow it");
  // Headings in order: one h1, then h2, then h3 for a group and h4 inside it.
  for (const page of [queuePage, menuPage]) assert.equal(page.split("<h1>").length - 1, 1);
  assert.ok(menuPage.indexOf("<h2>") < menuPage.lastIndexOf("<h3>") || menuPage.indexOf("<h3>") > 0);
  assert.doesNotMatch(queuePage, /<h[3-6]/); assert.doesNotMatch(menuPage, /<h[5-6]/);
});

test("wording: a choice is recorded, nothing is sent, nobody is counted, and the tone is calm", () => {
  assert.ok(menuPage.includes("a reader&apos;s choice will be recorded."));
  for (const [name, text] of [["actions", actions], ["queue page", queuePage], ["menu page", menuPage], ["parts", parts], ["store", store], ["rules", rules]]) {
    const said = code(text);
    assert.doesNotMatch(said, /sent to|send to|deliver|your legislator/i, `${name} never says anything is sent`);
    assert.doesNotMatch(said, /neighbo|others chose|people chose|people picked|how many (people|residents)/i, `${name} shows and implies no counts of other people`);
    assert.doesNotMatch(said.replace(/\[\.!\?\]/g, "").replace(/!==|!=|!\w|!\(|!\[|!!/g, ""), /!/, `${name} has no exclamation mark`);
    assert.doesNotMatch(said, /\p{Extended_Pictographic}/u, `${name} has no emoji`);
    assert.doesNotMatch(said, /Constituent|On Record/, `${name} does not spell out the product name`);
  }
  for (const page of [queuePage, menuPage]) assert.ok(page.includes("brandTitle("), "the title takes the name from lib/brand.ts");
});

test("phone: the section text scrolls inside its card and can be reached from the keyboard", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.change-text \{[^}]*white-space: pre-wrap;[^}]*max-height: 38vh; overflow-y: auto;/, "line breaks kept as published; a long section scrolls in place");
  assert.match(css, /\.change-text mark \{ background: #ffe58a; color: #172224;/, "dark text on a light mark");
  assert.match(css, /\.change-queue \.review-actions button \{ min-height: 44px; \}/);
  assert.ok(menuPage.includes('<div className="change-text" tabIndex={0} role="region" aria-label={label}>'));
});

test("no migration and no schema change: the queue uses the three tables of migration 0038 as they are", () => {
  // Uncommitted work must not touch the schema or the migrations (the store above already ran on a database built from ./drizzle).
  const changed = execFileSync("git", ["diff", "--stat", "HEAD~0"], { cwd: ROOT, encoding: "utf8" });
  assert.doesNotMatch(changed, /db\/schema\.ts|drizzle\//, "db/schema.ts and drizzle/ are untouched");
  const untracked = execFileSync("git", ["status", "--porcelain", "--", "db", "drizzle"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(untracked.trim(), "", "no new file under db/ or drizzle/");
  for (const [name, text] of [["store", store], ["actions", actions]]) assert.doesNotMatch(text, /CREATE TABLE|ALTER TABLE|DROP TABLE|\.run\(sql/i, `${name} changes no table`);
  assert.doesNotMatch(code(store), /\.delete\(/, "and deletes no row");
});
