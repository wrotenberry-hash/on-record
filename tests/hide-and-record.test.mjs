// Owner, 20 Nov 2026, after the 18 summaries on show were read claim by claim: "Hide now the summaries with a core
// misstatement … Corrections page: list each summary that was corrected or hidden today, with one line on what was
// wrong … On my 'yes', apply all three [briefing corrections] and turn the briefing on."
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { correctionStateLine, HIDDEN_LINES, SUMMARY_CORRECTIONS, summaryCorrectionsList } from "../lib/analysis/summary-corrections.ts";
import { READ_AND_SOUND } from "../lib/analysis/reader-read.ts";
import { inviteUseSummary, linksBlock, numberRanges } from "../lib/trial-summary.ts";
import { heldBillIds, READER_HOLDS } from "../lib/analysis/reader-holds.ts";
import { HAND_CORRECTIONS, HAND_CORRECTIONS_APPROVED } from "../lib/analysis/hand-corrections.ts";
import { ABOUT_SOURCES } from "../lib/analysis/facts.ts";
import { EXTENDED_PARTS } from "../lib/analysis/tiers.ts";
import { HEADLINE_VERBS } from "../lib/analysis/standard.ts";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const words = s => s.trim().split(/\s+/).length;

test("summaries with a core fault are hidden by the reader gate, each with its reason; the two corrected ones are back", () => {
  const today = ["119-hr-7008", "119-hr-8823", "119-hr-8897", "119-hr-4464", "119-hr-915", "119-hr-1013", "119-hr-9770"];
  const nov19 = ["119-hr-1181", "119-hr-9640", "119-hr-3276", "119-hr-4219", "119-hr-9500", "119-hr-4646", "119-hr-9497", "119-hr-8884", "119-hjres-213", "119-hr-1118", "119-hr-9612", "119-s-307", "119-hr-2140"];
  assert.deepEqual(Object.keys(HIDDEN_LINES).sort(), [...today, ...nov19].sort());
  for (const id of [...today, ...nov19]) assert.ok(heldBillIds().includes(id), id);
  for (const id of today) assert.equal(READER_HOLDS[id], HIDDEN_LINES[id], "the hold's reason is the public line");
  assert.notEqual(READER_HOLDS["119-hr-1181"], HIDDEN_LINES["119-hr-1181"], "H.R. 1181 was rewritten since; the editor's reason is about the rewrite");
  for (const id of ["119-hr-8483", "119-hr-9600", "119-hconres-93"]) assert.ok(!heldBillIds().includes(id), `${id} is shown again, corrected`);
  // While hidden, a vote row falls back to the official title: the rows read summaries only through the reader gate.
  assert.match(read("lib/bill-row-store.ts"), /readerVisible\(\)/);
});

test("the public record: one plain line each, about the text, never about a person", () => {
  assert.equal(SUMMARY_CORRECTIONS.length, 22, "nine from 20 Nov and the thirteen hidden on 19 Nov");
  assert.equal(SUMMARY_CORRECTIONS.filter(c => c.date === "2026-11-19").length, 13);
  assert.deepEqual(SUMMARY_CORRECTIONS.filter(c => c.state === "corrected").map(c => c.billId), ["119-hr-8483", "119-hr-9600"]);
  for (const c of SUMMARY_CORRECTIONS) {
    assert.match(c.billId, /^119-[a-z]+-\d+$/); assert.match(c.date, /^2026-11-(?:19|20)$/); assert.ok(c.wrong.length > 60 && /\.$/.test(c.wrong), c.label);
    assert.doesNotMatch(c.wrong, /\b(?:lied|false|careless|bias|biased|sloppy)\b/i, c.label);
    assert.doesNotMatch(c.wrong, /\b(?:AI|model|generator|prompt)\b/, "what was wrong, in a reader's words");
  }
  assert.equal(correctionStateLine({ state: "hidden" }), "Hidden while it is corrected");
  assert.equal(correctionStateLine({ state: "corrected" }), "Corrected and shown again");
  assert.equal(summaryCorrectionsList()[0].date, "2026-11-20", "newest first");
  const page = read("app/corrections/page.tsx");
  assert.match(page, /<h2>Bill summaries hidden or corrected after a full reading<\/h2>/);
  assert.match(page, /summaryCorrectionsList\(\)\.map\(c => <li key=\{c\.billId\}>/);
  assert.match(page, /While it is hidden, the bill&apos;s page and vote lists show the official title\./);
});

test("the briefing corrections are applied on the owner's yes, each once, keeping the earlier wording", () => {
  assert.equal(HAND_CORRECTIONS_APPROVED, true, "the owner's yes, 20 Nov 2026: \"Briefing corrections: yes. Apply all three\"");
  const run = read("lib/analysis/hand-corrections-run.ts");
  assert.match(run, /if \(!HAND_CORRECTIONS_APPROVED\) return out;/);
  assert.ok(run.indexOf("db.insert(analysisSummaryVersions)") < run.indexOf("db.update(analysisBillSummaries)"), "the earlier wording is kept before anything is changed");
  assert.match(run, /if \(\(await getCursor\(db, doneKey\(c\)\)\) === c\.version\) \{ out\.already\.push\(c\.billId\); continue; \}/, "each one once");
  assert.match(run, /the stored summary is not the one this correction was written for/);
  assert.doesNotMatch(run, /openai|responseRequest/i, "no model call");
  // Applied and confirmed in production on 20 Nov 2026; then the three came off the hold list and the briefing was turned on.
  assert.equal(READ_AND_SOUND["119-hconres-93"], "2026-11-20", "written by generator b12, so it is shown only once marked as read");
  assert.match(read("lib/briefing-inline.ts"), /BRIEFING_INLINE_LIVE = true/);
});

test("the corrected text keeps the writing rules, and is the text the owner was shown", () => {
  assert.deepEqual(HAND_CORRECTIONS.map(c => c.billId), ["119-hr-8483", "119-hr-9600", "119-hconres-93"]);
  const shown = read("docs/audits/2026-11-20/briefing-corrections.md").replace(/["“”]/g, '"').replace(/\s+/g, " ");
  const same = t => shown.includes(t.replace(/["“”]/g, '"').replace(/\s+/g, " "));
  for (const c of HAND_CORRECTIONS) {
    assert.ok(words(c.headline) <= 15, `${c.billId} headline`); assert.ok(HEADLINE_VERBS[c.headline.split(" ")[0]], `${c.billId} starts with a clear verb`);
    assert.ok(words(c.plainEnglish) <= 80, `${c.billId} plain English is ${words(c.plainEnglish)} words`);
    assert.equal(c.howItWorksToday.length, c.was.bullets); assert.equal(c.changes.length, c.was.rowLabels.length);
    assert.ok(same(c.headline), `${c.billId} headline was shown`); assert.ok(same(c.plainEnglish), `${c.billId} plain English was shown`);
    for (const b of c.howItWorksToday) { assert.ok(words(b.text) <= 40 || c.billId === "119-hr-8483", b.text.slice(0, 40)); assert.ok(same(b.text), b.text.slice(0, 50)); }
    for (const r of c.changes.filter(Boolean)) { assert.ok(same(r.today), r.today.slice(0, 50)); assert.ok(same(r.ifPassed), r.ifPassed.slice(0, 50)); }
    for (const t of [c.headline, c.plainEnglish, ...c.howItWorksToday.map(b => b.text), ...c.changes.filter(Boolean).flatMap(r => [r.label, r.today, r.ifPassed])]) assert.doesNotMatch(t, ABOUT_SOURCES, t.slice(0, 60));
    for (const p of c.withhold) assert.ok(EXTENDED_PARTS.includes(p), p);
    assert.equal(c.withhold.includes("caseFor"), c.withhold.includes("caseAgainst"), "both sides or neither");
  }
  assert.equal(HAND_CORRECTIONS[2].changes[2], null, "the row that talked about the sources is removed");
  assert.match(HAND_CORRECTIONS[2].headline, /^Directs /); assert.match(HAND_CORRECTIONS[1].headline, /^Requires /); assert.match(HAND_CORRECTIONS[0].headline, /^Adds about 847 /);
});

test("ten new invite links, and which of the first 25 were opened or came back", () => {
  const t = read("lib/trial.ts"), page = read("app/editor/trial/page.tsx");
  assert.match(t, /export const ORIGINAL_INVITES = 25;\nexport const TRIAL_INVITES = 35;/);
  assert.equal(numberRanges([1, 2, 3, 5, 8, 9]), "1–3, 5, 8–9"); assert.equal(numberRanges([]), "none"); assert.equal(numberRanges([7]), "7");
  const rows = [{ number: 1, firstSeenAt: 5, activeDays: 3, revokedAt: null }, { number: 2, firstSeenAt: 6, activeDays: 1, revokedAt: 9 }, { number: 3, firstSeenAt: null, activeDays: 0, revokedAt: null }];
  assert.deepEqual(inviteUseSummary(rows), { total: 3, opened: [1, 2], cameBack: [1], notOpened: [3], revoked: [2] });
  assert.equal(linksBlock(["https://x/trial/a", "https://x/trial/b"]), "1. https://x/trial/a\n2. https://x/trial/b");
  assert.match(page, /const first = inviteUseSummary\(links\.filter\(l => l\.number <= ORIGINAL_INVITES\)\), fresh = links\.filter\(l => l\.number > ORIGINAL_INVITES\);/);
  assert.match(page, /<CopyAll text=\{linksBlock\(fresh\.map\(l => l\.url\)\)\} inputId="new-invites"/, "all ten in one box to copy on a phone");
  assert.match(page, /await requireEditorUser\("\/editor\/trial"\);/, "links are shown only to the signed-in editor: they are made with a key only the site holds");
  assert.match(page, /name="action" value=\{l\.revokedAt \? "restore" : "revoke"\}/, "each link is revoked on its own");
});
