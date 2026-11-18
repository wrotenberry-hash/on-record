// Texas bill summaries to the federal standard (owner instruction, 17 Nov 2026, Texas build point 3).
// Eligibility, the federal checker and repair step applied to Texas drafts, the average-reader test, the full
// write-check-repair loop, hold-or-show routing, cost accounting, and the rule that a bill with no hearing, vote or
// follower is never written. No real model call is made anywhere here: the model is a stand-in that returns what
// each test hands it. The sources are the real 89R S.B. 4 documents saved in tests/fixtures/texas-sources.
import test from "node:test";
import assert from "node:assert/strict";
import { COMMITTEE_VOTE, eligibilityLine, FLOOR_DECISION, HEARING_ACTION, orderEligible, txEligibility } from "../lib/texas/analysis/eligibility.ts";
import { CREDIT, gatherTxSources } from "../lib/texas/analysis/gather.ts";
import { needsRewrite, runTxBatch, txCheckContext, txLabel, txModelInput, txReviewPacketLines, writeTxSummary } from "../lib/texas/analysis/generate.ts";
import { parseTxDraft, TX_INSTRUCTIONS, TX_PROMPT_VERSION, txSourcesBlock, txSummarySchema } from "../lib/texas/analysis/prompt.ts";
import { runTxReaderTest, TX_READER_INSTRUCTIONS, txReaderNote, txReaderPage } from "../lib/texas/analysis/reader.ts";
import { checkTxSummary, hide, repairTxDraft, spellOutBillNumbers, TX_CASE_UNREAD, TX_JARGON, TX_NO_CASE_AGAINST, TX_NO_CASE_FOR, txCaseNote, txEverydayFlag, txUnexplainedJargon, unhide } from "../lib/texas/analysis/standard.ts";
import { checkSummary } from "../lib/analysis/checker.ts";
import { unexplainedJargon } from "../lib/analysis/standard.ts";
import { DEFAULT_PRICES } from "../lib/model-cost.ts";
import { readFileSync } from "node:fs";
import { ACTIONS, fx, SB4, standInFetch } from "./texas-summaries-helpers.mjs";

const GOLD = JSON.parse(fx("gold-draft-89R-SB4.json")).summary;
const gold = (change = {}) => ({ ...structuredClone(GOLD), ...change });
// The sources as gathered when the House Research Organization published no analysis of the bill …
const NO_HRO = (await gatherTxSources(SB4, { fetch: standInFetch({ "hro.house.texas.gov": 404, "statutes.capitol.texas.gov/Docs/TX": 0 }).fetch })).gathered;
// … when its site refuses, as it did from the build machine …
const HRO_REFUSED = (await gatherTxSources(SB4, { fetch: standInFetch({ "hro.house.texas.gov": 0, "statutes.capitol.texas.gov/Docs/TX": 0 }).fetch })).gathered;
// … and with the hand-made sample of an HRO analysis, which prints what supporters and critics say.
const WITH_HRO = (await gatherTxSources(SB4, { fetch: standInFetch().fetch })).gathered;
const ctx = g => txCheckContext(SB4, g);
const AGAINST = { argument: "The bill would give nothing to renters and businesses, and it would commit the state to a large cost every year that could crowd out other spending.", attribution: CREDIT.hroAgainst, source: "HRO" };

// ───────────── 1. Eligibility ─────────────

const bill = (id, extra = {}) => ({ id, identifier: id.toUpperCase(), actions: [{ date: "2026-11-09", description: "Filed", chamber: "lower", classification: ["filing"] }], votes: [], hearings: [], followers: 0, ...extra });

test("a bill that was only filed and referred is not eligible", () => {
  const e = txEligibility(bill("hb1", { actions: [{ date: "2026-11-09", description: "Filed" }, { date: "2027-01-20", description: "Read first time" }, { date: "2027-01-20", description: "Referred to Public Education", classification: ["referral-committee"] }] }));
  assert.deepEqual(e, { eligible: false, reasons: [], activityDate: null, followers: 0 });
  assert.equal(eligibilityLine(e), "not eligible");
});

test("a committee hearing makes a bill eligible: on an agenda, or shown in its actions (real TLO wording)", () => {
  const onAgenda = txEligibility(bill("hb2", { hearings: [{ date: "2027-01-20T08:00:00-06:00", name: "House Public Education: public hearing" }] }));
  assert.equal(onAgenda.eligible, true);
  assert.deepEqual(onAgenda.reasons, [{ kind: "hearing", date: "2027-01-20", detail: "On a committee hearing agenda: House Public Education: public hearing" }]);
  for (const d of ["Scheduled for public hearing on . . .", "Considered in public hearing", "Testimony taken in committee", "Testimony taken/registration(s) recorded in committee"]) {
    assert.match(d, HEARING_ACTION);
    assert.equal(txEligibility(bill("hb3", { actions: [{ date: "2027-02-11", description: d }] })).reasons[0].kind, "hearing", d);
  }
  for (const d of ["Considered in formal meeting", "Referred to Ways & Means", "Committee report distributed", "Left pending in committee", "Filed"])
    assert.equal(txEligibility(bill("hb4", { actions: [{ date: "2027-02-11", description: d }] })).eligible, false, d);
});

test("a vote makes a bill eligible: a recorded vote, a floor decision in its actions, or a committee's vote", () => {
  assert.equal(txEligibility(bill("hb5", { votes: [{ date: "2026-11-14", motion: "Passed to engrossment" }] })).reasons[0].detail, "Recorded vote: Passed to engrossment");
  for (const d of ["Passed", "Passed as amended", "Passed to 3rd reading as amended", "Passed to engrossment as amended", "Failed to pass to 3rd reading", "Record vote", "Vote recorded in Journal",
    "Nonrecord vote recorded in Journal", "Senate concurs in House amendment(s)", "House adopts conference committee report", "Adopted"]) {
    assert.match(d, FLOOR_DECISION);
    assert.equal(txEligibility(bill("hb6", { actions: [{ date: "2027-03-01", description: d }] })).reasons[0].kind, "vote", d);
  }
  for (const d of ["Reported favorably w/o amendment(s)", "Reported favorably as substituted", "Vote taken in committee"]) assert.match(d, COMMITTEE_VOTE);
  // What is NOT a decision on the bill: a procedural step, or a report of the other chamber's action.
  for (const d of ["Read 2nd time", "Read 3rd time", "Rules suspended", "Three day rule suspended", "House passage as amended reported", "Senate concurs in House amendment(s)-reported".replace("Senate concurs", "Senate concurrence"), "Placed on intent calendar", "Amendment(s) offered", "Signed in the House"])
    assert.equal(txEligibility(bill("hb7", { actions: [{ date: "2027-03-01", description: d }] })).eligible, false, d);
  // The feed's own label for an action counts too.
  assert.equal(txEligibility(bill("hb8", { actions: [{ date: "2027-03-01", description: "Finally passed", classification: ["passage"] }] })).eligible, true);
});

test("the real action list of 89R S.B. 4 shows both a hearing and a vote, dated by the most recent", () => {
  const e = txEligibility({ id: "tx-89-sb4", identifier: "SB 4", actions: ACTIONS, votes: [], hearings: [], followers: 0 });
  assert.deepEqual(e.reasons.map(r => [r.kind, r.date]), [["hearing", "2025-05-05"], ["vote", "2025-05-29"]]);
  assert.equal(e.activityDate, "2025-05-29");
});

test("a follower makes a bill eligible, and the order is: latest hearing or vote first, then followed bills", () => {
  const followed = txEligibility(bill("hb9", { followers: 2 }));
  assert.deepEqual(followed.reasons, [{ kind: "followed", date: null, detail: "Followed by at least one reader" }], "the stored reason never says how many readers follow a bill");
  const list = [bill("only-filed"), bill("followed-3", { followers: 3 }), bill("vote-nov", { votes: [{ date: "2026-11-14" }] }), bill("followed-1", { followers: 1 }),
    bill("hearing-jan", { hearings: [{ date: "2027-01-20" }] }), bill("vote-dec-followed", { votes: [{ date: "2026-12-01" }], followers: 9 })];
  assert.deepEqual(orderEligible(list).map(r => r.bill.id), ["hearing-jan", "vote-dec-followed", "vote-nov", "followed-3", "followed-1"]);
  assert.ok(!orderEligible(list).some(r => r.bill.id === "only-filed"), "a bill with no hearing, vote or follower is not in the list at all");
});

// ───────────── 2. The federal standard on a Texas draft ─────────────

test("the hand-written summary of 89R S.B. 4 passes every federal rule against the real documents", () => {
  const r = checkTxSummary(gold(), ctx(NO_HRO));
  assert.deepEqual(r.failures, []);
  assert.equal(r.passed, true);
  assert.ok(r.metrics.readingGrade <= 9, `reading grade ${r.metrics.readingGrade}`);
  assert.deepEqual(repairTxDraft(gold(), { sourceIds: NO_HRO.docs.map(d => d.id), numberedSections: true }).notes, [], "nothing in it needs a mechanical repair");
  assert.equal(parseTxDraft(JSON.stringify(GOLD)).headline, GOLD.headline, "and it is in the shape the model must answer in");
});

test("the gold draft the owner reads (docs/TEXAS_GOLD_DRAFT.md) is the summary that was checked, and its quotes are in the saved documents", () => {
  const doc = readFileSync(new URL("../docs/TEXAS_GOLD_DRAFT.md", import.meta.url), "utf8").replace(/\s+/g, " ");
  const said = [GOLD.headline, GOLD.plainEnglish, GOLD.whyNow, GOLD.whatChangesForYou, GOLD.question, ...GOLD.changes.flatMap(r => [r.label, r.today, r.ifPassed]), ...GOLD.howItWorksToday.map(p => p.text),
    ...GOLD.whoItAffects.map(p => p.text), ...GOLD.caseFor.map(a => a.argument), ...GOLD.unknowns, txCaseNote("against", false, HRO_REFUSED.unread)];
  for (const t of said) assert.ok(doc.includes(t), `the draft shows: ${t.slice(0, 60)}`);
  const corpus = [NO_HRO.text.text, NO_HRO.text.certification, ...NO_HRO.docs.map(d => d.text), fx("fiscalnote-89R-SB00004F.htm"), fx("analysis-89R-SB00004F.htm")].join(" ").replace(/<[^>]+>/g, " ").replace(/[«»]/g, "").replace(/&#39;/g, "'").replace(/\s+/g, " ");
  for (const quote of ["of $140,000 [$100,000] of the appraised value", "applies only to an ad valorem tax year that begins on or after January 1, 2025.", "If that amendment is not approved by the voters, Article 1 of this Act has no effect.",
    "will provide an estimated savings of $363.44 to a homeowner's school tax at the statewide ISD average tax rate of $.9086", "would provide a $40,000 increase from the current amount", "would total $1,324.2 million in fiscal year 2026, $1,418.4 million in fiscal year 2027",
    "a negative impact of ($2,743,461,146) through the biennium ending August 31, 2027.", "by the following vote: Yeas 31, Nays 0.", "by the following vote: Yeas 143, Nays 0, one present not voting.", "are partially transferred to the state."]) {
    assert.ok(corpus.includes(quote), `in the saved documents: ${quote}`);
    assert.ok(doc.includes(quote), `quoted in the draft: ${quote}`);
  }
});

test("the federal checker alone cannot read a Texas draft: that is why the Texas ids and section numbers are translated", () => {
  const sections = NO_HRO.text.sections.map(s => ({ num: s.num, heading: s.heading, text: s.text }));
  const direct = checkSummary(gold(), sections, { subject: SB4.title, fullText: NO_HRO.text.text, sources: { title: SB4.title, docs: NO_HRO.docs.map(d => ({ id: d.id, text: d.text })), agencies: [], allowedFor: [CREDIT.intentSenate], allowedAgainst: [], needsBackground: false, structure: true } });
  assert.ok(direct.failures.some(f => /cites "Sec\. 1\.01", which is not a section/.test(f)));
  assert.ok(direct.failures.some(f => /cites "ANALYSIS", which is not one of the sources/.test(f)));
});

test("citations: a section this bill does not have, a section of a code, a federal id and a list all fail, in the model's own words", () => {
  const fails = change => checkTxSummary(gold(change), ctx(NO_HRO)).failures;
  const what = section => ({ whatItDoes: [{ ...GOLD.whatItDoes[0], section }, ...GOLD.whatItDoes.slice(1)] });
  assert.ok(fails(what("Sec. 9.99")).some(f => f.startsWith('What it does point 1 cites "Sec. 9.99", which is not a section of this text')));
  assert.ok(fails(what("Section 11.13, Tax Code")).some(f => f.includes('cites "Section 11.13, Tax Code"')), "a section of the Tax Code is not a section of the bill");
  assert.ok(fails(what("CRS")).some(f => f.includes('cites "CRS"')), "a federal source id copied from an example is refused");
  assert.ok(fails(what("HRO")).some(f => f.includes('cites "HRO"')), "a Texas source that was not provided is refused");
  assert.ok(fails(what("Sec. 3.02")).some(f => /What it does point 1 shares no key words with Sec\. 3\.02/.test(f)), "the wrong section is caught, and named as the model wrote it");
  assert.ok(fails({ changes: [{ ...GOLD.changes[0], source: "the Tax Code" }, ...GOLD.changes.slice(1)] }).some(f => f.startsWith('What would change row 1 cites "the Tax Code"')));
  assert.deepEqual(fails(what("Section 1.01(b)")), [], "a subsection of a real section is accepted");
});

test("jargon: the Texas list is enforced, and federal explanations that are wrong in Texas are never applied", () => {
  const fails = change => checkTxSummary(gold(change), ctx(NO_HRO)).failures;
  assert.ok(fails({ headline: "Raises the homestead exemption for school taxes from $100,000 to $140,000." }).some(f => f.startsWith('The headline uses "homestead exemption"')));
  assert.ok(fails({ whyNow: `${GOLD.whyNow.split(". ")[0]}. It passed on third reading on May 21, 2025.` }).some(f => f.startsWith('"third reading" is used without explaining it')));
  // "students enrolled", "offset the loss", "the bill's sponsor": the federal list would explain these as health-plan or Congress terms.
  const text = "Students enrolled in the district are counted. The state would offset the loss. The Senate sponsor agreed. Money is appropriated each fiscal year.";
  assert.deepEqual(unexplainedJargon(["", text]).map(t => t.term.toLowerCase()).sort(), ["appropriated", "enrolled", "fiscal year", "offset", "sponsor"], "what the federal list alone would flag");
  assert.deepEqual(unexplainedJargon(["", hide(text)]).map(t => t.term), [], "hidden from the federal list");
  assert.equal(unhide(hide(text)), text);
  assert.deepEqual(txUnexplainedJargon(["", text]).map(t => t.term), ["sponsor", "appropriated", "fiscal year"], "the Texas list flags the ones that are jargon here, with Texas explanations");
  assert.equal(TX_JARGON.find(t => t.term === "fiscal year").plain, "the state's budget year, which starts September 1");
  assert.ok(TX_JARGON.every(t => !/\d/.test(t.plain) || t.term === "fiscal year"), "an explanation carries no figure that would have to come from a source");
  for (const term of ["engrossed", "enrolled", "viva voce", "sine die", "Calendars Committee"]) assert.ok(TX_JARGON.some(t => t.term === term), `${term} (named in the build brief) is on the list`);
});

test("the mechanical repair fixes what a program fixes better than a second model call", () => {
  const sloppy = gold({
    plainEnglish: GOLD.plainEnglish.replace("This bill raises", "SB 4 raises"),
    howItWorksToday: [GOLD.howItWorksToday[0], { ...GOLD.howItWorksToday[1], section: "ANALYSIS; FISCAL" }, { ...GOLD.howItWorksToday[2], section: "fiscal" }, GOLD.howItWorksToday[3]],
    changes: [...GOLD.changes.slice(0, 3), { ...GOLD.changes[3], ifPassed: "The state would pay about $1,324.2 million in fiscal year 2026 and $1,418.4 million in 2027, the LBB estimates (FISCAL)." }],
    unknowns: [GOLD.unknowns[0], "How much the state would owe districts for lost debt payments. The FISCAL note says it cannot be determined."],
  });
  assert.equal(checkTxSummary(sloppy, ctx(NO_HRO)).passed, false);
  const r = repairTxDraft(sloppy, { sourceIds: NO_HRO.docs.map(d => d.id), numberedSections: true });
  assert.match(r.draft.plainEnglish, /Senate Bill 4 raises that amount/);
  assert.equal(r.draft.howItWorksToday[1].section, "ANALYSIS", "one citation, the first valid one");
  assert.equal(r.draft.howItWorksToday[2].section, "FISCAL");
  assert.equal(r.draft.changes[3].ifPassed, "The state would pay about $1,324.2 million in fiscal year (the state's budget year, which starts September 1) 2026 and $1,418.4 million in 2027, the Legislative Budget Board (LBB) estimates.");
  assert.equal(r.draft.unknowns[1], "How much the state would owe districts for lost debt payments. The fiscal note (the state budget office's estimate of what the bill would cost) says it cannot be determined.");
  assert.ok(r.notes.includes('"LBB" spelled out') && r.notes.includes('"fiscal year" explained') && r.notes.some(n => /citation "ANALYSIS; FISCAL" → "ANALYSIS"/.test(n)));
  assert.deepEqual(checkTxSummary(r.draft, ctx(NO_HRO)).failures, [], "after the repair it passes");
  assert.equal(spellOutBillNumbers("S.B. 4 and SJR 2, like CSHB 12"), "Senate Bill 4 and Senate Joint Resolution 2, like House Bill 12");
  assert.equal(repairTxDraft(gold({ whyNow: "STATUS shows the Governor signed it on June 16, 2025." }), { sourceIds: ["STATUS"], numberedSections: true }).draft.whyNow, "The bill's record in the Legislature shows the Governor signed it on June 16, 2025.", "never \"the bill's record in Congress\"");
});

// ───────────── 3. Arguments for and against ─────────────

test("with no official analysis that prints reasons against, the summary may not write one", () => {
  const invented = gold({ caseAgainst: [{ argument: "The tax break mostly helps people who already own homes and does nothing for renters or for school funding.", attribution: "critics of the bill", source: "STATUS" }] });
  const f = checkTxSummary(invented, ctx(NO_HRO)).failures;
  assert.ok(f.some(x => x === "Case against: no official source provided gives this side's reasons, so leave it empty; the page says so."), f.join(" | "));
  const experts = gold({ caseFor: [{ ...GOLD.caseFor[0], attribution: "experts" }] });
  assert.ok(checkTxSummary(experts, ctx(NO_HRO)).failures.some(x => /Case for argument 1 is attributed to "experts", who is not in the record/.test(x)));
  assert.match(TX_NO_CASE_AGAINST, /^No official record of arguments against this bill was found\.$/);
  // What the page prints under a side with no argument: none on record, or the document could not be read. Never an argument of the site's own.
  assert.equal(txCaseNote("against", false, []), TX_NO_CASE_AGAINST);
  assert.equal(txCaseNote("for", false, []), TX_NO_CASE_FOR);
  assert.equal(txCaseNote("against", false, HRO_REFUSED.unread), TX_CASE_UNREAD);
  assert.equal(txCaseNote("against", true, HRO_REFUSED.unread), null);
});

test("a reason must come from the part of the document it is credited to, and a side the record prints is not left out", () => {
  assert.deepEqual(checkTxSummary(gold({ caseAgainst: [AGAINST] }), ctx(WITH_HRO)).failures, [], "what critics say, credited to the House Research Organization analysis, passes");
  const leftOut = checkTxSummary(gold(), ctx(WITH_HRO)).failures;
  assert.deepEqual(leftOut, ["Case against is empty, but an official source prints reasons on this side (the House Research Organization analysis, under “Critics say”). Give 1 or 2 of them, credited as shown."]);
  // What supporters say, placed on the "against" side:
  const wrongSide = gold({ caseAgainst: [{ ...AGAINST, argument: "Rising home values have pushed homeowners' bills up, and the bill would bring those bills down at once for millions of families." }] });
  assert.ok(checkTxSummary(wrongSide, ctx(WITH_HRO)).failures.some(x => x.startsWith("Case against argument 1 is credited to \"the House Research Organization analysis, under “Critics say”\", but most of its words are not in that part of the document.")));
  const wrongDoc = gold({ caseAgainst: [{ ...AGAINST, source: "FISCAL" }] });
  assert.ok(checkTxSummary(wrongDoc, ctx(WITH_HRO)).failures.some(x => /Case against argument 1 is credited to .* but cites FISCAL; cite HRO/.test(x)));
});

// ───────────── 4. The average-reader test ─────────────

const READER = { whatItDoes: "It raises the amount of a home's value that is not taxed for schools from $100,000 to $140,000.", whoIsAffected: "People in Texas who own and live in their home would pay less school tax, and the state pays the schools back.",
  dailyLifeChange: "A homeowner would get a smaller school tax bill if voters agree to the change.", wordsNotUnderstood: [] };
const PAGE = { howItWorksToday: "Schools tax a home on its value after taking off $100,000 for a home the owner lives in.", whatChanges: "The amount taken off would go from $100,000 to $140,000 starting with 2025 taxes.",
  whoIsAffected: "Homeowners who live in their home, and school districts that would collect less." };
const ok = { verdict: "correct", why: "It matches the bill text." };
const JUDGE = { whatItDoes: ok, whoIsAffected: ok, dailyLifeChange: ok, page: { howItWorksToday: ok, whatChanges: ok, whoIsAffected: ok }, arguments: [{ side: "for", index: 0, supported: true, why: "The statement of intent gives the $363.44 estimate." }] };
const WRITER_USAGE = { input_tokens: 20_000, output_tokens: 1_500 }, READER_USAGE = { input_tokens: 3_000, output_tokens: 300 };
const WRITER_COST = 0.145, READER_TEST_COST = 0.0108; // gpt-5.5: 20,000 in + 1,500 out; gpt-5.4-mini: three calls of 3,000 in + 300 out

/** A stand-in for the model. It returns the drafts it is given, in order, and the given reader, page reader and judge answers. */
function standInModel({ drafts = [GOLD], reader = READER, page = PAGE, judge = JUDGE } = {}) {
  const calls = [];
  let n = 0;
  const pick = (x, call) => (typeof x === "function" ? x(call, calls.filter(c => c.schemaName === call.schemaName).length) : x);
  const client = async call => {
    calls.push(call);
    if (call.purpose === "tx_analysis") { const d = drafts[Math.min(n++, drafts.length - 1)]; if (d instanceof Error) throw d; return { text: typeof d === "string" ? d : JSON.stringify(d), usage: WRITER_USAGE }; }
    return { text: JSON.stringify(pick(call.schemaName === "tx_average_reader" ? reader : call.schemaName === "tx_page_reader" ? page : judge, call)), usage: READER_USAGE };
  };
  return { client, calls };
}
const LIMITS = { spendCapUsd: 25, maxSummaries: 5, model: "gpt-5.4-mini", writerModel: "gpt-5.5", reasoning: "low", prices: DEFAULT_PRICES, regenPerRun: 2 };
const CANDIDATE = { ...SB4, hearings: [], followers: 0, authors: ["Bettencourt", "Meyer"] };

test("the first reader sees only the headline and the plain-English part; the second sees the page through who it affects", async () => {
  assert.equal(txReaderNote(GOLD), `${GOLD.headline}\n\n${GOLD.plainEnglish}`);
  const page = txReaderPage(GOLD);
  assert.match(page, /What would change\n- The part of a home's value that school taxes do not count\n {2}Today: School districts do not tax the first \$100,000/);
  assert.ok(!page.includes(GOLD.caseFor[0].argument) && !page.includes(GOLD.unknowns[0]), "not the cases or the unknowns");
  assert.match(TX_READER_INSTRUCTIONS, /average Texas adult/);
  assert.ok(!/Congress/.test(TX_READER_INSTRUCTIONS), "the Texas reader is not told about Congress");
  const m = standInModel();
  const t = await runTxReaderTest(m.client, "gpt-5.4-mini", "s1", GOLD, "SOURCES", DEFAULT_PRICES);
  assert.equal(t.passed, true);
  assert.deepEqual(m.calls.map(c => [c.purpose, c.schemaName, c.model]), [["tx_reader_test", "tx_average_reader", "gpt-5.4-mini"], ["tx_reader_test", "tx_page_reader", "gpt-5.4-mini"], ["tx_reader_test", "tx_reader_check", "gpt-5.4-mini"]]);
  assert.equal(m.calls[0].input, `The note:\n\n${txReaderNote(GOLD)}`, "nothing but the note");
  assert.ok(m.calls[2].input.startsWith("OFFICIAL SOURCES:\nSOURCES"), "the judge compares with the sources");
  assert.equal(t.costUsd, READER_TEST_COST);
});

test("jargon the reader did not understand fails the summary; everyday Texas words do not", async () => {
  const run = reader => runTxReaderTest(standInModel({ reader }).client, "gpt-5.4-mini", "s1", GOLD, "SOURCES", DEFAULT_PRICES);
  const jargon = await run({ ...READER, wordsNotUnderstood: ["recapture", "M&O"] });
  assert.equal(jargon.passed, false);
  assert.match(jargon.reasons[0], /A reader did not understand: "recapture", "M&O"\. Replace each with everyday words/);
  assert.equal((await run({ ...READER, wordsNotUnderstood: ["Legislature", "school district", "homeowners", "Governor"] })).passed, true);
  assert.ok(txEverydayFlag("the Texas Legislature") && txEverydayFlag("school districts") && !txEverydayFlag("recapture") && !txEverydayFlag("Foundation School Program"));
  const wrong = await runTxReaderTest(standInModel({ judge: { ...JUDGE, whoIsAffected: { verdict: "wrong", why: "The bill applies to a home the owner lives in, not to renters." } } }).client, "gpt-5.4-mini", "s1", GOLD, "SOURCES", DEFAULT_PRICES);
  assert.equal(wrong.passed, false);
  assert.match(wrong.reasons[0], /A reader got "Who is affected and how\?" wrong/);
  const vague = await run({ ...READER, whatItDoes: "It doesn't say." });
  assert.match(vague.reasons[0], /could not answer "What does this bill do\?"/);
  const unsupported = await runTxReaderTest(standInModel({ judge: { ...JUDGE, arguments: [{ side: "for", index: 0, supported: false, why: "The analysis does not give that figure." }] } }).client, "gpt-5.4-mini", "s1", GOLD, "SOURCES", DEFAULT_PRICES);
  assert.match(unsupported.reasons[0], /The case for argument 1 is not supported by the source it cites/);
});

// ───────────── 5. The write-check-repair loop ─────────────

const write = (model, extra = {}) => { const log = []; return writeTxSummary({ client: model.client, limits: LIMITS, candidate: CANDIDATE, gathered: NO_HRO, summaryId: "sum-1", deadline: Date.now() + 600_000, spentSoFar: () => 0, log: l => log.push(l), ...extra }).then(w => ({ w, log })); };

test("what the model is told: the Texas instructions, the sources by id, who may be credited, and the marked bill text", () => {
  const input = txModelInput(CANDIDATE, NO_HRO);
  assert.match(input, /^Bill: SB 4, Texas Legislature, 89th Legislature, Regular Session\. Official caption: Relating to an increase/);
  assert.match(input, /Text version: Enrolled \(2025-05-30\), from Texas Legislature Online\./);
  assert.match(input, /\[ANALYSIS\] Bill analysis by the Senate Research Center, for the enrolled version, the one summarised\n/);
  assert.match(input, /\[FISCAL\] Legislative Budget Board fiscal note, 2025-05-21 \(Enrolled\)\n/);
  assert.match(input, /\[STATUS\] Actions and recorded votes on the bill/);
  assert.match(input, /Not available: The House Research Organization analysis was not found \(404\)\./);
  assert.match(input, /Credit lines for a reason FOR the bill .*"the author's statement of intent in the Senate Research Center bill analysis"\./);
  assert.match(input, /Credit lines for a reason AGAINST the bill \(same rule\): no official source in this input; leave caseAgainst empty\./);
  assert.match(input, /Section list: Sec\. 1\.01 Section 11\.13\(b\), Tax Code, is amended to read as follows \| Sec\. 1\.02 /);
  assert.match(input, /school district of «\$140,000» \[\$100,000\] of the appraised value/);
  assert.match(txSourcesBlock({ sources: [], notes: [], allowedFor: [], allowedAgainst: [CREDIT.hroAgainst], hasPrimer: true }), /An approved PRIMER on this subject is among the sources/);
  // Who follows a bill, or how many do, decides only whether it is written. It is never given to the model.
  const reader = /\bfollowers?\b|\breaders? follow|\bfollowed by\b/i;
  assert.ok(!reader.test(txModelInput({ ...CANDIDATE, followers: 7 }, NO_HRO)) && !reader.test(TX_INSTRUCTIONS));
  assert.match(TX_INSTRUCTIONS, /Texas Legislature, not in the U\.S\. Congress/);
  assert.match(TX_INSTRUCTIONS, /engrossed, enrolled, committee substitute, viva voce, sine die/);
  for (const federal of ["CRS", "Congressional Record", "FLOOR", "Federal Register"]) assert.ok(!TX_INSTRUCTIONS.includes(federal), `no federal source (${federal}) in the Texas instructions`);
  assert.deepEqual(txSummarySchema.required, Object.keys(GOLD), "the answer has exactly the federal fields");
  assert.match(TX_PROMPT_VERSION, /^tx\d+-\d{4}-\d{2}-\d{2}$/);
});

test("a draft that passes first time: one writing call, then the reader test, and the cost is the sum of the four calls", async () => {
  const m = standInModel();
  const { w, log } = await write(m);
  assert.equal(w.attempts.length, 1);
  assert.equal(w.final.check.passed, true);
  assert.equal(w.final.reader.passed, true);
  assert.deepEqual(m.calls.map(c => [c.purpose, c.model]), [["tx_analysis", "gpt-5.5"], ["tx_reader_test", "gpt-5.4-mini"], ["tx_reader_test", "gpt-5.4-mini"], ["tx_reader_test", "gpt-5.4-mini"]]);
  assert.ok(m.calls.every(c => c.refId === "sum-1"), "every call is entered in the ledger against the summary");
  assert.equal(m.calls[0].instructions, TX_INSTRUCTIONS);
  assert.equal(w.readerCostUsd, READER_TEST_COST);
  assert.equal(w.costUsd, Math.round((WRITER_COST + READER_TEST_COST) * 1e6) / 1e6);
  assert.deepEqual([w.inputTokens, w.outputTokens, w.model], [20_000, 1_500, "gpt-5.5"]);
  assert.match(log[0], /^TX_SUMMARY_ATTEMPT TX SB 4 \(89R\) \| attempt 1 \| written rules PASS \| gpt-5\.5, 0\.1450 USD, \d+ s \| repairs 0 \| \{"failures":\[\],"repairs":\[\]\}$/);
  assert.match(log[1], /^TX_READER_TEST TX SB 4 \(89R\) \| attempt 1 \| PASS \| \$0\.0108 \| \{"reasons":\[\],"reader":\{/);
  assert.equal(log.length, 2);
});

test("a failed draft goes back with its specific failures; the rewrite keeps what was right", async () => {
  const vague = gold({ changes: [GOLD.changes[0], { ...GOLD.changes[1], today: "Some rules apply to districts today.", ifPassed: "Some rules would change for districts." }, ...GOLD.changes.slice(2)] });
  // The second draft fixes the row but, as models do, also rewrites a part nobody complained about, badly.
  const second = gold({ whyNow: "Lawmakers acted on it recently." });
  const m = standInModel({ drafts: [vague, second] });
  const { w, log } = await write(m);
  assert.equal(w.attempts.length, 2);
  assert.ok(w.attempts[0].check.failures.some(f => /^What would change row 2 is vague/.test(f)));
  assert.equal(w.attempts[0].reader, undefined, "the reader test runs only on a draft that passes the written rules");
  const retry = m.calls.filter(c => c.purpose === "tx_analysis")[1].input;
  assert.match(retry, /Your previous draft failed these checks\. Fix every one, keep what was right, and stay neutral:\n- What would change row 2 is vague/);
  assert.match(retry, /Previous draft:\n\{"headline"/);
  assert.equal(w.final.draft.whyNow, GOLD.whyNow, "\"Why now\" was right, so it is kept from the draft before");
  assert.equal(w.final.draft.changes[1].today, GOLD.changes[1].today, "the row that failed is taken from the rewrite");
  assert.ok(w.final.repairs.some(r => r.startsWith("kept from the draft before:") && r.includes("whyNow")));
  assert.equal(w.final.check.passed, true);
  assert.match(log[0], /attempt 1 \| written rules FAIL/);
  assert.match(log[1], /attempt 2 \| written rules PASS/);
  assert.match(log[2], /^TX_READER_TEST TX SB 4 \(89R\) \| attempt 2 \| PASS/);
  assert.equal(w.costUsd, Math.round((2 * WRITER_COST + READER_TEST_COST) * 1e6) / 1e6);
});

test("three attempts at most; a summary that still fails is kept for the editor with its failures", async () => {
  const bad = gold({ headline: "Would increase the residence homestead exemption from ad valorem taxation by a school district." });
  const m = standInModel({ drafts: [bad] });
  const { w } = await write(m);
  assert.equal(w.attempts.length, 3);
  assert.equal(m.calls.filter(c => c.purpose === "tx_analysis").length, 3);
  assert.equal(m.calls.filter(c => c.purpose === "tx_reader_test").length, 0);
  assert.equal(w.final.check.passed, false);
  assert.ok(w.final.check.failures.some(f => f.startsWith("Headline must start with a clear verb")));
  assert.equal(w.costUsd, Math.round(3 * WRITER_COST * 1e6) / 1e6);
});

test("a draft that passes the written rules but not the reader is rewritten with what the reader got wrong", async () => {
  const reader = (call, nth) => (nth <= 1 ? { ...READER, dailyLifeChange: "It doesn't say." } : READER); // the first reader could not answer; after the rewrite, the reader can
  const m = standInModel({ reader });
  const { w, log } = await write(m);
  assert.equal(w.attempts.length, 2);
  assert.ok(w.attempts[0].check.failures.some(f => f.startsWith('Average-reader test: A reader given only the headline and plain-English part could not answer "What would change in daily life?"')));
  assert.match(m.calls.filter(c => c.purpose === "tx_analysis")[1].input, /- Average-reader test: A reader given only the headline/);
  assert.equal(w.final.check.passed, true);
  assert.match(log[1], /^TX_READER_TEST .* attempt 1 \| FAIL/);
  assert.equal(w.readerCostUsd, Math.round(2 * READER_TEST_COST * 1e6) / 1e6);
});

test("the caps: nothing is written when the monthly cap would be passed, or when no time is left", async () => {
  const m = standInModel();
  const capped = await writeTxSummary({ client: m.client, limits: LIMITS, candidate: CANDIDATE, gathered: NO_HRO, summaryId: "s", deadline: Date.now() + 600_000, spentSoFar: () => 24.99 });
  assert.deepEqual(capped, { stop: "spend cap $25 would be exceeded" });
  const late = await writeTxSummary({ client: m.client, limits: LIMITS, candidate: CANDIDATE, gathered: NO_HRO, summaryId: "s", deadline: Date.now() + 20_000, spentSoFar: () => 0 });
  assert.deepEqual(late, { stop: "time budget" });
  assert.equal(m.calls.length, 0, "no model call was made");
  // A model the key cannot use: fall back to the low-cost model once.
  const fallback = standInModel({ drafts: [new Error("Research service returned 404"), GOLD] });
  const { w, log } = await write(fallback);
  assert.equal(w.model, "gpt-5.4-mini");
  assert.match(log[0], /attempt 1 \| ERROR \| gpt-5\.5 \| Research service returned 404/);
  // An answer that is not in the agreed shape is an error, never a summary.
  await assert.rejects(() => write(standInModel({ drafts: ['{"headline":"x"}'] })));
});

// ───────────── 6. A run: only eligible bills, in order, within the limits; routing; storage ─────────────

function memoryStore(initial = []) {
  const rows = new Map(initial.map(r => [r.billId, r]));
  return { rows, saved: [], async countSummaries() { return rows.size; }, async existingFor(id) { return rows.get(id) ?? null; },
    async save(rec) { this.saved.push(rec); rows.set(rec.billId, { id: rec.id, billId: rec.billId, sequence: rec.sequence, promptVersion: rec.content.promptVersion, textVersion: rec.content.textVersion, status: rec.content.status, updatedAt: Date.now(), attemptsSoFar: rec.checks.at(-1).attempt }); } };
}
const cand = (id, extra = {}) => ({ ...CANDIDATE, id, identifier: id.toUpperCase().replace("-", " "), actions: [{ date: "2026-11-09", description: "Filed" }], votes: [], hearings: [], followers: 0, ...extra });
function batch(candidates, extra = {}) {
  const gathered = [], log = [], store = extra.store ?? memoryStore(), model = extra.model ?? standInModel();
  let k = 0;
  return runTxBatch({ candidates, gather: async c => { gathered.push(c.id); return extra.gather ? extra.gather(c) : { ok: true, gathered: NO_HRO }; }, client: model.client, store, limits: { ...LIMITS, ...(extra.limits ?? {}) },
    spentThisMonth: extra.spent ?? 0, budgetMs: 600_000, max: extra.max, log: l => log.push(l), newId: () => `id-${++k}` }).then(run => ({ run, gathered, log, store, model }));
}
const FOUR = [cand("hb-1"), cand("hb-2", { followers: 1 }), cand("hb-3", { votes: [{ date: "2026-11-14", motion: "Passed to engrossment", result: "pass" }] }), cand("hb-4", { hearings: [{ date: "2027-01-20", name: "House Public Education" }] })];

test("a bill with no hearing, no vote and no follower is never gathered, written or stored", async () => {
  const { run, gathered, store, model } = await batch(FOUR);
  assert.deepEqual(gathered, ["hb-4", "hb-3", "hb-2"], "the latest hearing or vote first, then the followed bill");
  assert.deepEqual(run.made.map(m => m.billId), ["hb-4", "hb-3", "hb-2"]);
  assert.ok(!store.rows.has("hb-1") && !gathered.includes("hb-1"));
  assert.equal(run.notEligible, 1);
  assert.equal(model.calls.length, 12, "four calls a summary, none for the bill that is not eligible");
  assert.deepEqual(run.made.map(m => m.eligibility), ["hearing 2027-01-20 (On a committee hearing agenda: House Public Education)", "vote 2026-11-14 (Recorded vote: Passed to engrossment)", "followed (Followed by at least one reader)"]);
  const none = await batch([cand("hb-1"), cand("hb-9")]);
  assert.deepEqual([none.run.made.length, none.gathered.length, none.model.calls.length, none.run.stoppedBy], [0, 0, 0, "no Texas bill has had a hearing or a vote, and none is followed"]);
});

test("what is stored for a summary that passes: shown to readers, with its structure, sources, checks and reader test", async () => {
  const { run, store, log } = await batch([FOUR[3]]);
  assert.equal(run.status, "COMPLETE");
  const rec = store.saved[0];
  assert.deepEqual([rec.route.status, rec.route.queue, rec.content.status, rec.content.checkPassed, rec.content.attempts], ["visible", null, "visible", 1, 1]);
  assert.deepEqual([rec.content.textVersion, rec.content.textVersionLabel, rec.content.textDate, rec.content.textUrl], ["F", "Enrolled", "2025-05-30", "https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00004F.htm"]);
  assert.equal(rec.content.promptVersion, TX_PROMPT_VERSION);
  assert.equal(rec.details.plainEnglish, GOLD.plainEnglish);
  assert.equal(rec.details.question, GOLD.question);
  assert.deepEqual(rec.details.sourceDocs.map(d => [d.id, d.kind, d.date]), [["ANALYSIS", "bill_analysis", "2025-08-25"], ["FISCAL", "fiscal_note", "2025-05-21"], ["STATUS", "status", "2025-06-16"]]);
  assert.match(rec.details.fiscal.headline, /a negative impact of \(\$2,743,461,146\)/);
  assert.ok(rec.details.notes.some(n => /House Research Organization analysis was not found/.test(n)), "what was not available is kept with the summary");
  assert.deepEqual(rec.details.unread, []);
  assert.equal(rec.structure.changes.length, 4);
  assert.equal(rec.structure.whyNow, GOLD.whyNow);
  assert.deepEqual(rec.content.caseAgainst, [], "no case against was written; the page prints the no-record line");
  assert.ok(rec.content.sources.every(s => s.label && s.url.startsWith("https://") && "date" in s));
  assert.deepEqual(rec.checks.map(c => [c.attempt, c.passed, c.model]), [[1, true, "gpt-5.5"]]);
  assert.deepEqual(rec.readerTests.map(t => [t.attempt, t.passed, t.costUsd]), [[1, true, READER_TEST_COST]]);
  assert.deepEqual(rec.eligibility.reasons.map(r => r.kind), ["hearing"]);
  assert.equal(run.made[0].costUsd, 0.1558);
  assert.equal(run.made[0].readerTest, "pass");
  // The review packet: the sources, then the summary beside the sections it cites.
  assert.ok(log.some(l => /^TX_REVIEW_PACKET TX HB 4 \(89R\) \| SOURCE FISCAL \| part 1\/\d+ \| Legislative Budget Board fiscal note/.test(l)));
  assert.ok(log.some(l => /^TX_REVIEW_PACKET TX HB 4 \(89R\) \| SUMMARY \| part 1\/\d+ \| \{"label":"TX HB 4 \(89R\)"/.test(l)));
  assert.ok(log.some(l => /^TX_REVIEW_PACKET TX HB 4 \(89R\) \| CITED Sec\. 1\.01 \| part 1\/1 \| \[\d+ chars\] SECTION 1\.01\. Section 11\.13\(b\), Tax Code/.test(l)));
  assert.equal(log.at(-1), "TX_REVIEW_PACKET done | 1 summaries");
  assert.ok(txReviewPacketLines(txLabel(CANDIDATE), rec, NO_HRO).every(l => l.length < 1700));
});

test("routing: a failed check or low confidence is held for the editor; the fifth summary is shown and sampled", async () => {
  const failed = await batch([FOUR[3]], { model: standInModel({ drafts: [gold({ headline: "Would increase the homestead exemption." })] }) });
  assert.deepEqual([failed.store.saved[0].route.status, failed.store.saved[0].route.queue, failed.run.made[0].status, failed.run.made[0].attempts], ["held", "check_failed", "held", 3]);
  const low = await batch([FOUR[3]], { model: standInModel({ drafts: [gold({ confidence: "low" })] }) });
  assert.deepEqual([low.store.saved[0].route.status, low.store.saved[0].route.queue], ["held", "low_confidence"]);
  const readerFails = await batch([FOUR[3]], { model: standInModel({ reader: { ...READER, wordsNotUnderstood: ["ad valorem"] } }) });
  assert.deepEqual([readerFails.store.saved[0].route.status, readerFails.run.made[0].readerTest, readerFails.run.made[0].attempts], ["held", "fail", 3]);
  const four = [0, 1, 2, 3].map(i => ({ id: `s${i}`, billId: `old-${i}`, sequence: i, promptVersion: TX_PROMPT_VERSION, textVersion: "I", status: "visible", updatedAt: Date.now(), attemptsSoFar: 1 }));
  const fifth = await batch([FOUR[3]], { store: memoryStore(four), limits: { maxSummaries: 6 } });
  assert.deepEqual([fifth.store.saved[0].sequence, fifth.store.saved[0].route.status, fifth.store.saved[0].route.queue], [4, "visible", "sample"]);
});

test("a summary is held when the analysis that prints the arguments exists but could not be read", async () => {
  const { run, store, log } = await batch([FOUR[3]], { gather: async () => ({ ok: true, gathered: HRO_REFUSED }) });
  const rec = store.saved[0];
  assert.deepEqual([rec.route.status, rec.route.queue, run.made[0].status, run.made[0].readerTest, run.made[0].attempts], ["held", "check_failed", "held", "pass", 1], "it passed every rule and the reader test, and is still held");
  assert.equal(rec.checks.at(-1).failures.at(-1), "Could not be read: the House Research Organization analysis, which prints what supporters and critics say. Held for review, because arguments it prints may be missing from this summary.");
  assert.deepEqual(rec.details.unread, HRO_REFUSED.unread);
  assert.ok(log.includes("TX_SUMMARY_HELD TX HB 4 (89R) | unread source | the House Research Organization analysis, which prints what supporters and critics say"));
});

test("the limits: the Texas summary limit, this run's limit, and the shared monthly cap", async () => {
  const limited = await batch(FOUR, { limits: { maxSummaries: 2 } });
  assert.deepEqual(limited.run.made.map(m => m.billId), ["hb-4", "hb-3"]);
  assert.equal(limited.run.stoppedBy, "Texas summary limit reached (2 of 2)");
  assert.deepEqual(limited.gathered, ["hb-4", "hb-3"], "no request is made for a bill that cannot be written");
  const one = await batch(FOUR, { max: 1 });
  assert.deepEqual([one.run.made.length, one.run.stoppedBy], [1, "this run's limit"]);
  const full = await batch(FOUR, { store: memoryStore([0, 1, 2, 3, 4].map(i => ({ id: `s${i}`, billId: `old-${i}`, sequence: i, promptVersion: TX_PROMPT_VERSION, textVersion: "I", status: "visible", updatedAt: 0, attemptsSoFar: 1 }))) });
  assert.deepEqual([full.run.made.length, full.gathered.length, full.run.stoppedBy], [0, 0, "Texas summary limit reached (5 of 5)"]);
  const spent = await batch(FOUR, { spent: 25 });
  assert.deepEqual([spent.run.status, spent.run.made.length, spent.model.calls.length, spent.run.stoppedBy], ["SKIPPED", 0, 0, "spend cap reached ($25.00 of $25)"]);
  // Federal and Texas spending count together, and the cap is checked against the worst case of the next call before it is made.
  const near = await batch(FOUR, { spent: 24.9 });
  assert.deepEqual([near.run.made.length, near.run.stoppedBy], [0, "spend cap $25 would be exceeded"]);
  const running = await batch(FOUR, { spent: 24.5 });
  assert.equal(running.run.made.length, 2, "each summary's cost is added to the month's spend before the next one starts");
  assert.equal(running.run.stoppedBy, "spend cap $25 would be exceeded");
});

test("an official site that refuses stops the run cleanly; a bill with no published text is skipped", async () => {
  const refused = await batch(FOUR, { gather: async c => (c.id === "hb-3" ? { ok: false, reason: "refused", detail: "The list of versions on Texas Legislature Online could not be read: capitol.texas.gov refused the request (429). It was not tried again.", requests: 1 } : { ok: true, gathered: NO_HRO }) });
  assert.deepEqual(refused.gathered, ["hb-4", "hb-3"], "nothing is requested after the refusal");
  assert.deepEqual(refused.run.made.map(m => m.billId), ["hb-4"]);
  assert.match(refused.run.stoppedBy, /^stopped: .*capitol\.texas\.gov refused the request \(429\)/);
  assert.equal(refused.run.status, "COMPLETE");
  const noText = await batch(FOUR, { gather: async c => (c.id === "hb-4" ? { ok: false, reason: "no_text", detail: "No published text was found for this bill.", requests: 1 } : { ok: true, gathered: NO_HRO }) });
  assert.deepEqual([noText.run.skippedNoText, noText.run.made.map(m => m.billId)], [["hb-4"], ["hb-3", "hb-2"]]);
  const broke = await batch(FOUR, { model: standInModel({ drafts: [new Error("Research API billing or usage limit (insufficient_quota).")] }) });
  assert.deepEqual([broke.run.status, broke.run.made.length, broke.model.calls.length], ["FAILED", 0, 1], "a billing refusal ends the run; it is not retried on the next bill");
  assert.match(broke.run.error, /billing or usage limit/);
});

test("a summary is written again only for a newer generator or a text published since; never one the editor rejected", async () => {
  const ex = { id: "s1", sequence: 0, promptVersion: TX_PROMPT_VERSION, textVersion: "I", status: "visible", updatedAt: Date.parse("2027-02-01T00:00:00Z"), attemptsSoFar: 2 };
  const v = (code, date) => ({ note: code, date, url: `https://capitol.texas.gov/tlodocs/90R/billtext/html/HB00004${code}.htm` });
  assert.equal(needsRewrite(ex, { versions: [v("I", "2027-01-15")] }), false);
  assert.equal(needsRewrite(ex, { versions: [v("I", "2027-01-15"), v("E", "2027-03-02")] }), true, "the engrossed text came out after the summary was written");
  assert.equal(needsRewrite(ex, { versions: [v("I", "2027-01-15"), v("H", "2027-01-28")] }), false, "a feed that lags the official site cannot cause a rewrite on every run");
  assert.equal(needsRewrite({ ...ex, promptVersion: "tx0-2026-01-01" }, { versions: [] }), true);
  assert.equal(needsRewrite({ ...ex, promptVersion: "tx0-2026-01-01", status: "rejected" }, { versions: [] }), false);
  const store = memoryStore([{ ...ex, billId: "hb-4", promptVersion: "tx0-2026-01-01" }, { ...ex, id: "s2", billId: "hb-3", sequence: 1 }]);
  const { run, gathered } = await batch(FOUR, { store });
  assert.deepEqual(gathered, ["hb-4", "hb-2"], "the current summary of hb-3 is left alone");
  assert.deepEqual(run.made.map(m => [m.billId, m.regenerated]), [["hb-4", true], ["hb-2", false]]);
  const rewrite = store.saved[0];
  assert.deepEqual([rewrite.id, rewrite.sequence, rewrite.rewriteOf.id, rewrite.checks[0].attempt], ["s1", 0, "s1", 3], "the same row is rewritten and its attempts go on counting");
});
