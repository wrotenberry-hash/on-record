// The briefing readable without clicking through (owner, 20 Nov 2026, from trial feedback). Each item shows the
// plain-English headline, "Today:", "This bill:", where it stands and the reader's own legislators' votes; the words
// come from the approved summary and are never written for a briefing; at most five items, then "You're caught up.";
// each item passes the average-reader test on its own; and it is off until the owner has seen three real items.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { BRIEFING_INLINE_LIVE, MAX_ITEMS, CAUGHT_UP, SUMMARY_COMING, SHORT_NOT_READY, FULL_EXPLANATION, sentencesOf, inlineFromSummary, inlineProblems, pickItems, standsFallback, itemText, briefingInlineText } from "../lib/briefing-inline.ts";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// The approved summary of H.R. 2102, as stored (headline and first change row).
const HR2102 = {
  headline: "Lets about 58,000 combat-injured military retirees keep their full retirement pay.",
  howItWorksToday: [{ text: "A separate paragraph about today that is not used when a change row exists." }],
  changes: [
    { label: "Monthly pay for a combat-injured person medically retired with fewer than 20 years", before: "", today: "They give up about $2,275 a month of retirement pay and get about $825 back, on average.",
      ifPassed: "They keep their full retirement pay and their disability payment: about $1,450 more a month on average.", source: "FLOOR" },
    { label: "A second row", today: "Second today.", ifPassed: "Second change." },
  ],
};

test("it is off until the owner has seen three real items", () => {
  assert.equal(BRIEFING_INLINE_LIVE, false);
  const page = read("app/briefing/page.tsx");
  assert.match(page, /preview = !!access\.editor && sp\.preview === "1", inline = BRIEFING_INLINE_LIVE \|\| preview/, "readers get the new format only when it is live; the preview is the editor's");
  assert.ok(page.includes('preview ? "editor" : "reader").catch(() => null) : null;'), "a reader is never given the editor's view");
  assert.match(read("lib/briefing.ts"), /BRIEFING_INLINE_LIVE \? await briefingEmailInline\(b, id, s\.userId \?\? null\) : briefingText\(b, id\)/, "the email changes with the page, not before");
});

test("sentences: abbreviations, bill numbers and money do not end one", () => {
  assert.deepEqual(sentencesOf("The U.S. Army pays $2,275.50 a month. H.R. 2102 changes that. It starts in 2027."), ["The U.S. Army pays $2,275.50 a month.", "H.R. 2102 changes that.", "It starts in 2027."]);
  assert.deepEqual(sentencesOf("One sentence with no full stop"), ["One sentence with no full stop"]);
  assert.deepEqual(sentencesOf("He said “stop.” Then it ended."), ["He said “stop.”", "Then it ended."]);
});

test("the three lines are the approved summary's own words: the headline, the first row's today, the first row's change", () => {
  const t = inlineFromSummary(HR2102);
  assert.deepEqual(t, { headline: HR2102.headline, today: HR2102.changes[0].today, thisBill: HR2102.changes[0].ifPassed });
  assert.deepEqual(inlineProblems(t), []);
  // Every word shown is in the summary: nothing is written for the briefing.
  for (const line of [t.today, t.thisBill]) assert.ok([HR2102.changes[0].today, HR2102.changes[0].ifPassed].some(src => src.includes(line)));
});

test("today is one sentence and this bill is at most two, cut at sentence ends and never reworded", () => {
  const t = inlineFromSummary({ headline: "Raises the limit on small loans.", howItWorksToday: [],
    changes: [{ today: "Today, a lender may charge up to 36 percent a year. Some states set a lower limit. A third sentence.", ifPassed: "If this passes, the limit falls to 30 percent. It applies to new loans only. Old loans keep their terms. A fourth." }] });
  assert.equal(t.today, "A lender may charge up to 36 percent a year.");
  assert.equal(t.thisBill, "The limit falls to 30 percent. It applies to new loans only.");
  assert.equal(sentencesOf(t.today).length, 1);
  assert.equal(sentencesOf(t.thisBill).length, 2);
});

test("a summary in the older format gives no inline lines, and nothing is made up for it", () => {
  assert.equal(inlineFromSummary({ headline: "An older summary.", changes: [], howItWorksToday: [] }), null);
  assert.equal(inlineFromSummary({ headline: "Only today known.", changes: [], howItWorksToday: [{ text: "Things work this way." }] }), null);
  const items = read("lib/briefing-items.ts");
  assert.match(items, /if \(!s\) \{ out\.push\(plain\("no_summary", SUMMARY_COMING\)\); continue; \}/, "no approved summary: title, stage, and 'a summary is coming'");
  assert.equal(SUMMARY_COMING, "A plain-English summary of this bill is coming.");
  assert.doesNotMatch(items + read("lib/briefing-inline.ts"), /responseRequest|openai|max_output_tokens/i, "composing a briefing calls no model");
});

test("an item must stand on its own: no pointer to the rest of the page, no unexplained initials, right length", () => {
  const ok = inlineFromSummary(HR2102);
  assert.ok(inlineProblems({ ...ok, today: "As described above, they give up part of their pay." }).some(p => /another part of the page/.test(p)));
  assert.ok(inlineProblems({ ...ok, today: "They give up pay. And then some more of it." }).some(p => /must be one sentence/.test(p)));
  assert.ok(inlineProblems({ ...ok, thisBill: "One. Two. Three." }).some(p => /one or two sentences/.test(p)));
  assert.ok(inlineProblems({ ...ok, today: "Unchanged." }).some(p => /“Today” is 1 words/.test(p)));
  assert.ok(inlineProblems({ ...ok, thisBill: `They keep ${"very ".repeat(80)}much more.` }).some(p => /“This bill” is \d+ words/.test(p)));
  assert.ok(inlineProblems({ ...ok, today: "The CRDP rule takes away about $2,275 a month of their pay." }).some(p => /Initials the item does not explain: CRDP/.test(p)));
});

const pick = (n, o = {}) => ({ key: `k${n}`, system: "federal", billKey: `119-hr-${n}`, label: `H.R. ${n}`, title: `Bill ${n}`, href: `/bills/119-hr-${n}`, date: "2026-11-19", event: "passed", note: "House, 300–100.", ...o });

test("at most five items, each bill once, the ones a reader can finish here first", () => {
  assert.equal(MAX_ITEMS, 5);
  const c = [pick(1, { event: "coming" }), pick(2), pick(3), pick(4, { date: "2026-11-20" }), pick(5), pick(6), pick(7), pick(2, { key: "again", event: "coming" })];
  const got = pickItems(c, k => ["119-hr-1", "119-hr-7"].includes(k));
  assert.equal(got.length, 5);
  assert.deepEqual(got.map(g => g.billKey), ["119-hr-7", "119-hr-1", "119-hr-4", "119-hr-2", "119-hr-3"], "summarised first (decided before coming), then decided, newest first");
  assert.equal(new Set(got.map(g => g.billKey)).size, 5);
  assert.equal(pickItems(c, () => false, 3).length, 3);
  assert.deepEqual(pickItems([], () => true), []);
});

test("the text a reader gets: every line labelled, the link called Full explanation, and the closing line", () => {
  const t = inlineFromSummary(HR2102);
  const item = { key: "k", label: "H.R. 2102", href: "/bills/119-hr-2102", headline: t.headline, today: t.today, thisBill: t.thisBill, stands: "Passed the House on 18 November 2026. The Senate has it now.", legislators: ["Rep. A voted yes."], note: null };
  assert.equal(itemText(item, { link: "https://site.example/bills/119-hr-2102" }), [
    "H.R. 2102: Lets about 58,000 combat-injured military retirees keep their full retirement pay.",
    "Today: They give up about $2,275 a month of retirement pay and get about $825 back, on average.",
    "This bill: They keep their full retirement pay and their disability payment: about $1,450 more a month on average.",
    "Where it stands: Passed the House on 18 November 2026. The Senate has it now.",
    "Your legislators: Rep. A voted yes.",
    "Full explanation: https://site.example/bills/119-hr-2102"].join("\n"));
  const bare = { ...item, headline: "A bill with no summary", today: null, thisBill: null, legislators: [], note: SUMMARY_COMING, stands: standsFallback({ event: "passed", note: "House, 300–100.", date: "2026-11-19" }) };
  assert.equal(itemText(bare), "H.R. 2102: A bill with no summary\nA plain-English summary of this bill is coming.\nWhere it stands: Passed: House, 300–100.");
  const mail = briefingInlineText("Briefing", Array.from({ length: 8 }, () => item), "https://site.example", ["Footer."]);
  assert.equal(mail.split("Full explanation:").length - 1, 5, "an email carries at most five items");
  assert.ok(mail.indexOf(CAUGHT_UP) > mail.lastIndexOf("Full explanation:") && mail.indexOf("Footer.") > mail.indexOf(CAUGHT_UP));
  assert.equal(CAUGHT_UP, "You're caught up.");
  assert.match(briefingInlineText("Briefing", [], "https://site.example"), /Nothing was decided or scheduled in this period\.\n\nYou're caught up\.$/);
});

test("the page shows the same things, in the same order, and ends with the closing line", () => {
  const c = read("components/briefing/inline-items.tsx");
  assert.equal(FULL_EXPLANATION, "Full explanation");
  const order = ["{i.headline}", "<strong>Today:</strong>", "<strong>This bill:</strong>", "<strong>Where it stands:</strong>", "<strong>Your legislators:</strong>", "{FULL_EXPLANATION}", "{CAUGHT_UP}"].map(x => c.indexOf(x));
  assert.ok(order.every(n => n > 0), "every part is on the page");
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(c, /<Link href=\{i\.href\}>\{FULL_EXPLANATION\}<span className="visually-hidden">: \{i\.label\}<\/span><\/Link>/, "each link names its bill for a screen reader");
  assert.match(c, /\{editor \? <p className="meta brief-editor">/, "the status line is the editor's only");
});

test("a reader sees the two lines only after the item passed the written rules and the reader test", () => {
  const s = read("lib/briefing-items.ts");
  assert.match(s, /const state: ItemState = rules\.length \? "rule" : !test \? "untested" : test\.passed \? "inline" : "failed";/);
  assert.match(s, /const show = state === "inline" \|\| audience === "editor";/);
  assert.match(s, /today: show \? text\.today : null, thisBill: show \? text\.thisBill : null, note: show \? null : SHORT_NOT_READY/);
  assert.match(SHORT_NOT_READY, /not ready/);
  // Approved summaries only, through the same gate as every other reader page, read when the page is drawn.
  assert.match(s, /where\(and\(readerVisible\(\), inArray\(analysisBillSummaries\.billId, fedKeys\)\)\)/);
  assert.match(s, /approved\.has\(p\.billKey\) \? await summaryForBill\(p\.billKey, false\)/);
  // Where it stands is the record's own line, and legislators are the reader's own, for the chamber that voted.
  assert.match(s, /const stands = window \? window\.where : standsFallback\(p\);/);
  assert.match(s, /const voters = mine\.filter\(m => m\.chamber === p\.chamber\);/);
});

test("the reader test: the item alone, judged against the approved summary, kept per summary and per wording", async () => {
  const s = read("lib/briefing-test.ts");
  assert.match(s, /You see nothing else about the bill\./);
  assert.match(s, /export const readerItem = \(t: InlineText\) => `\$\{t\.headline\}\\nToday: \$\{t\.today\}\\nThis bill: \$\{t\.thisBill\}`;/);
  assert.match(s, /r\.v === INLINE_VERSION && r\.hash === inlineHash\(t\) \? r : null/, "a result counts only for exactly these words");
  assert.match(s, /if \(await inlineTestFor\(s\.summary\.id, text\)\) \{ out\.alreadyTested\+\+; continue; \}/, "each item is tested once");
  // No new spending: counted with the summaries' reader tests, and stopped by the summaries' own monthly cap.
  assert.match(s, /\{ purpose: "reader_test", refId \}/);
  assert.match(s, /cap = analysisLimits\(\)\.spendCapUsd/);
  assert.match(s, /if \(spent \+ WORST_CASE_USD > cap\) \{ out\.stoppedBy = "the summaries' monthly cap"; break; \}/);
  assert.match(s, /summarySpendSince\(monthStart\(now\)\)\.catch\(\(\) => cap\)/, "if the spend cannot be read, nothing is spent");
  // No new table: results sit in the existing key-value store.
  assert.ok(!readdirSync(new URL("../drizzle/", import.meta.url)).some(f => /brief.*inline|inline.*brief|brief_item/i.test(f)));
});

test("the verdict: both answers must be correct and no word left not understood", async (t) => {
  // lib/briefing-test.ts imports the database, so its pure verdict is checked through a copy of its text.
  const src = read("lib/briefing-test.ts"), from = src.indexOf("export function readerVerdict"), to = src.indexOf("const monthStart");
  assert.ok(from > 0 && to > from);
  const body = src.slice(from, to).replace("export function readerVerdict(reader: { howItWorksToday?: string; whatWouldChange?: string; wordsNotUnderstood?: string[] } | null,\n  judge: { howItWorksToday?: { verdict?: string; why?: string }; whatWouldChange?: { verdict?: string; why?: string } } | null): string[] {", "function readerVerdict(reader, judge) {")
    .replace("const out: string[] = [];", "const out = [];").replace(" as const)", ")");
  const readerVerdict = new Function(`${body}; return readerVerdict;`)();
  const good = { howItWorksToday: { verdict: "correct", why: "" }, whatWouldChange: { verdict: "correct", why: "" } };
  assert.deepEqual(readerVerdict({ howItWorksToday: "a", whatWouldChange: "b", wordsNotUnderstood: [] }, good), []);
  assert.equal(readerVerdict({ wordsNotUnderstood: [] }, { ...good, whatWouldChange: { verdict: "vague", why: "lost the amount" } }).length, 1);
  assert.match(readerVerdict({ wordsNotUnderstood: [] }, { ...good, howItWorksToday: { verdict: "wrong", why: "opposite" } })[0], /got how things work today wrong: opposite/);
  assert.match(readerVerdict({ wordsNotUnderstood: ["cloture"] }, good)[0], /did not understand: cloture/);
  assert.deepEqual(readerVerdict(null, good), ["The reader test gave no usable answer."]);
  await t.test("a missing verdict is not a pass", () => assert.equal(readerVerdict({ wordsNotUnderstood: [] }, {}).length, 2));
});

test("the tests run in a run of their own, started by the scheduled update, and the open address is paced", () => {
  const route = read("app/api/automation/briefing-tests/route.ts"), fire = read("lib/briefing-fire.ts"), tick = read("app/api/automation/tick/route.ts");
  assert.match(tick, /m\.fireBriefingTests\(origin\)/);
  assert.match(fire, /if \(!secret \|\| !origin \|\| process\.env\.ANALYSIS_PAUSED === "1"\) return false;/);
  assert.doesNotMatch(route, /fireLink|fireBriefingTests|fetch\(/, "the test run never starts another run");
  assert.match(route, /if \(now - last < EVERY_MS\) return Response\.json\(\{ service: "on-record", ran: false/);
  assert.match(route, /if \(!via\) return Response\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\);/);
  assert.doesNotMatch(read("lib/briefing.ts"), /runInlineTests/, "the evening briefing does not wait on model calls");
  // The preview writes real items to the log only, makes no model call, and is paced.
  const preview = read("app/api/automation/briefing-preview/route.ts");
  assert.doesNotMatch(preview, /responseRequest|runInlineTests/);
  assert.match(preview, /if \(now - last < EVERY_MS\) return Response\.json\(\{ service: "on-record", ran: false/);
  assert.match(preview, /out\[name\] = items\.map\(i => \(\{ item: i\.label, state: i\.state \}\)\);/, "it answers with bill numbers and states, never wording");
  assert.ok(existsSync(new URL("../components/dashboard/end.css", import.meta.url)));
});
