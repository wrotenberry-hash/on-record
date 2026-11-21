// Owner, 20 Nov 2026, after no rewrite passed the reading against its sources: "Add these three changes first.
// 1. Two tiers … 2. Repair mode … 3. Facts first …" and "Fix the two false alarms (titles of works; 'if this passes' on a
// law already signed)." The rules a program decides are in lib/analysis/tiers.ts, facts.ts and row-labels.ts (pure);
// the writer's loop and the pages are checked by reading their source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blankWithheld, CORE_PARTS, correctedInPlace, EXTENDED_PARTS, partsOfFailure, partsToCorrect, readSectionState, tierFailures, withheldParts } from "../lib/analysis/tiers.ts";
import { ABOUT_SOURCES, claimFailures, creditFloorSpeakers, EXTRACT_INSTRUCTIONS, FACT_RULES, factProblems, factsBlock, READ_INSTRUCTIONS, readingInput, REPAIR_PREFACE, verifiedFacts } from "../lib/analysis/facts.ts";
import { rowLabels } from "../lib/analysis/row-labels.ts";
import { bannedWordsIn } from "../lib/analysis/checker.ts";
import { HEADLINE_VERBS } from "../lib/analysis/standard.ts";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/* ───────────────────────────── 1. Two tiers ───────────────────────────── */

test("the core is the headline, the plain-English part, how it works today and what would change; everything else is extended", () => {
  assert.deepEqual([...CORE_PARTS], ["headline", "plainEnglish", "howItWorksToday", "changes"]);
  assert.deepEqual([...EXTENDED_PARTS], ["whatItDoes", "whoItAffects", "whatChangesForYou", "caseFor", "caseAgainst", "unknowns", "whyNow", "question"]);
});

test("each check's message is sorted by the part it names", () => {
  const t = tierFailures(["In plain English is 83 words; the limit is 80.", "What changes for you needs one concrete example of a real kind of person.", "Case against argument 1 quotes words that are not in REPORT.",
    "What we don't know point 2 is 31 words; the limit is 25.", "Why now gives no date or vote."]);
  assert.deepEqual(t.core, ["In plain English is 83 words; the limit is 80."]);
  assert.deepEqual(Object.keys(t.extended).sort(), ["caseAgainst", "unknowns", "whatChangesForYou", "whyNow"]);
  assert.deepEqual(tierFailures([]).core, []);
});

test("a fault that could be anywhere stops the core; one that names only a word is traced to the parts that hold the word", () => {
  assert.deepEqual(tierFailures(["Reading level is grade 13; the limit is 11."]).core.length, 1);
  assert.deepEqual(tierFailures(["Claim-by-claim reading did not run (time budget); held for review."]).core.length, 1, "nothing unread goes on show");
  const draft = { headline: "Requires a report.", plainEnglish: "This bill requires a report.", whoItAffects: [{ text: "Banks that fear a giveaway." }], unknowns: ["Whether the EPA will act."] };
  assert.deepEqual(partsOfFailure("Loaded words: giveaway. Even in a reason credited to a member, restate it in neutral words.", draft), ["whoItAffects"]);
  assert.deepEqual(tierFailures(["Loaded words: giveaway. Restate it."], draft).core, [], "a loaded word in an extended section withholds that section only");
  assert.deepEqual(partsOfFailure('Abbreviation never spelled out: "EPA". Write the full name first.', draft), ["unknowns"]);
  assert.equal(partsOfFailure("Loaded words: scheme. Restate it.", draft), null, "a word found in no part could be anywhere");
  assert.deepEqual(tierFailures(["Loaded words: requires. x"], draft).core.length, 1, "a word that is also in the core stops the core");
});

test("the average-reader test: a reader who misread the note is a core fault; an unsupported reason is the case's", () => {
  assert.deepEqual(partsOfFailure('Average-reader test: A reader got "What does this bill do?" wrong. They said: "…".'), ["headline", "plainEnglish"]);
  assert.deepEqual(partsOfFailure("Average-reader test: The case for argument 2 is not supported by the source it cites: …"), ["caseFor"]);
  assert.equal(partsOfFailure("Average-reader test could not run (timeout); held for review."), null);
});

test("the reasons for and against are one section: a fault on either side withholds both", () => {
  const t = tierFailures(["Case for argument 1 has no attribution.", "Who it affects point 1 cites no section."]);
  assert.deepEqual(withheldParts(t), ["whoItAffects", "caseFor", "caseAgainst"]);
  assert.deepEqual(withheldParts(tierFailures(["The case for averages 30 words an argument and the case against 12."])), ["caseFor", "caseAgainst"]);
});

test("a withheld section is stored empty, and nothing else changes", () => {
  const d = { headline: "H", whoItAffects: [{ text: "x" }], whatChangesForYou: "A nurse …", unknowns: ["u"], question: "Do you support …?" };
  const b = blankWithheld(d, ["whoItAffects", "whatChangesForYou", "question"]);
  assert.deepEqual(b, { headline: "H", whoItAffects: [], whatChangesForYou: "", unknowns: ["u"], question: "" });
  assert.deepEqual(d.whoItAffects, [{ text: "x" }], "the draft itself is not touched");
});

test("the stored list of withheld sections is read back only for the same wording of the summary", () => {
  const raw = JSON.stringify({ v: "b13-2026-11-21", withheld: ["unknowns", "nonsense"], reasons: { unknowns: ["why"] }, text: {}, at: 1 });
  assert.deepEqual(readSectionState(raw, "b13-2026-11-21"), { withheld: ["unknowns"], reasons: { unknowns: ["why"] } });
  assert.deepEqual(readSectionState(raw, "b14-2026-12-01").withheld, []);
  assert.deepEqual(readSectionState("not json", "b13-2026-11-21").withheld, []);
  assert.deepEqual(readSectionState(null, "b13-2026-11-21").withheld, []);
});

/* ───────────────────────────── 2. Repair mode ───────────────────────────── */

test("a correction replaces only the parts its problems named; the rest stays exactly as it was", () => {
  const prior = { headline: "Requires X.", headlineFacts: ["F1"], plainEnglish: "This bill requires X.", plainEnglishFacts: ["F1"], whyNow: "Old why.", whyNowFacts: ["F2"], unknowns: ["a"], confidence: "high" };
  const next = { headline: "Directs X.", headlineFacts: ["F1"], plainEnglish: "A rewritten paragraph nobody asked for.", plainEnglishFacts: ["F9"], whyNow: "New why.", whyNowFacts: ["F3"], unknowns: ["a"], confidence: "low" };
  const failures = ["The headline (claim reading) swaps a word that has an exact meaning in the source: “Requires”. Correct it to: Directs X.", "Why now is 3 sentences; use one or two."];
  assert.deepEqual(partsToCorrect(failures), ["headline", "whyNow"]);
  const r = correctedInPlace(prior, next, partsToCorrect(failures));
  assert.equal(r.draft.headline, "Directs X."); assert.equal(r.draft.whyNow, "New why."); assert.deepEqual(r.draft.whyNowFacts, ["F3"], "a part's fact ids travel with it");
  assert.equal(r.draft.plainEnglish, "This bill requires X.", "an unasked rewrite is thrown away");
  assert.equal(r.draft.confidence, "high");
  assert.deepEqual(r.changed, ["headline", "whyNow"], "only these are read again");
  assert.equal(partsToCorrect(["Reading level is grade 13."]), null, "a fault that could be anywhere lets any part change");
  assert.deepEqual(correctedInPlace(prior, next, null).draft, next);
});

test("the writer's loop: facts first, then a draft, then corrections in place; a whole new draft only when the core is wrong", () => {
  const g = read("lib/analysis/generate.ts");
  assert.match(g, /const mode = !prior \? "draft" as const : coreWrong \? "regenerate" as const : "repair" as const;/);
  assert.match(g, /correctedInPlace\(prior\.draft as unknown as Rec, result\.draft as unknown as Rec, targets\)/);
  assert.match(g, /const toRead = ALL\.filter\(p => readOf\.get\(p\)\?\.sig !== sig\(draft, p\)\);/, "only what changed is read again");
  assert.match(g, /if \(readerOf\?\.core !== core\) \{/, "the reader test runs again only when the core has changed");
  assert.match(g, /if \(facts\.length < MIN_FACTS\) \{[\s\S]{0,200}await setCursor\(db, triedKey\(c\.id\), PROMPT_VERSION\);[\s\S]{0,260}return null;/, "nothing is written from too short a list");
  assert.ok(g.indexOf("await extractFacts(") < g.indexOf("for (let attempt = 1; attempt <= 3; attempt++)"), "the facts are listed before anything is written");
  assert.match(g, /const writerInput = `\$\{input\}\\n\\n\$\{factsBlock\(facts\)\}`;/);
  assert.match(g, /Claim-by-claim reading did not run \(\$\{unread\}\); held for review\./);
  // On show when the core passes; the sections that did not pass are stored empty and listed in the key-value store.
  assert.match(g, /const route = routeSummary\(\{ checkPassed: coreOk,/);
  assert.match(g, /const d = blankWithheld\(final\.draft as unknown as Rec, withheld\) as unknown as SummaryDraft;/);
  assert.match(g, /await setCursor\(db, sectionsKey\(summaryId\), JSON\.stringify\(state\)\);/);
  assert.match(g, /export const EXPLANATIONS_GO = false;/, "the wider run still waits for the trial");
  assert.match(read("lib/analysis/reader-read.ts"), /READ_FROM_GENERATOR = 12/, "and nothing this writer writes is shown before it is read");
  assert.doesNotMatch(read("lib/analysis/tiers.ts"), /^import /m);
});

/* ───────────────────────────── 3. Facts first ───────────────────────────── */

const docs = [{ id: "CRS", text: "This bill directs the President to remove U.S. Armed Forces from hostilities against Iran. Forces needed to defend the United States are not covered provided the President complies with a specified provision." },
  { id: "FLOOR", text: "Mr. MEEKS. This Congress has not authorized a war with Iran, and the people know it. Mr. MAST. The President acted within the law to protect American lives." }];
const fact = (o) => ({ id: "F1", fact: "x", source: "CRS", passage: "", qualifier: "", exactWords: [], speaker: "", ...o });

test("a fact is kept only when its passage is in the source it names, word for word", () => {
  const r = verifiedFacts([
    fact({ id: "F1", passage: "directs the President to remove U.S. Armed Forces from hostilities" }),
    fact({ id: "F2", passage: "requires the President to remove U.S. Armed Forces from hostilities" }),
    fact({ id: "F3", passage: "remove U.S. Armed Forces" }),
    fact({ id: "F4", source: "NEWS", passage: "directs the President to remove U.S. Armed Forces from hostilities" }),
    fact({ id: "F5", source: "Sec. 1", passage: "Congress directs the President to remove United States Armed Forces" }),
    fact({ id: "F1", passage: "Forces needed to defend the United States are not covered" }),
  ], docs, "SECTION 1. Congress directs the President to remove United States Armed Forces from hostilities against the Islamic Republic of Iran.");
  assert.deepEqual(r.kept.map(f => f.id), ["F1", "F5"]);
  assert.deepEqual(r.dropped.map(d => d.id), ["F2", "F3", "F4", "F1"]);
  assert.match(r.dropped[0].why, /not in CRS word for word/);
});

test("a floor passage is credited by program to the member whose remarks hold it, or dropped", () => {
  const speakers = [{ name: "Meeks", text: "This Congress has not authorized a war with Iran, and the people know it." }, { name: "Mast", text: "The President acted within the law to protect American lives." }];
  const r = creditFloorSpeakers([
    fact({ id: "F1", source: "FLOOR", passage: "This Congress has not authorized a war with Iran", speaker: "Rep. Mast" }),
    fact({ id: "F2", source: "FLOOR", passage: "a passage nobody on the list said at all", speaker: "Rep. Meeks" }),
    fact({ id: "F3", source: "CRS", passage: "directs the President", speaker: "" }),
  ], speakers, n => `Rep. ${n} (floor statement)`);
  assert.equal(r.facts.find(f => f.id === "F1").speaker, "Rep. Meeks (floor statement)", "whatever the model said, the record decides");
  assert.deepEqual(r.dropped.map(d => d.id), ["F2"]);
  assert.equal(r.facts.length, 2);
});

const FACTS = [
  fact({ id: "F1", fact: "The resolution directs the President to remove forces.", passage: "Congress directs the President to remove United States Armed Forces from hostilities", exactWords: ["directs"] }),
  fact({ id: "F2", fact: "A report goes to committees every two years.", passage: "shall submit to the Committee on Financial Services a report every two years", exactWords: ["every two years"] }),
  fact({ id: "F3", fact: "The Administrator may set up a pilot.", passage: "The Administrator may establish a pilot program at airports", exactWords: ["may"] }),
];
const draftOf = (o) => ({ headline: "Directs the President to remove forces from hostilities against Iran.", headlineFacts: ["F1"], plainEnglish: "This resolution directs the President to remove forces.", plainEnglishFacts: ["F1"],
  howItWorksToday: [], changes: [], whatItDoes: [], whoItAffects: [], whatChangesForYou: "", whatChangesFacts: [], whyNow: "", whyNowFacts: [], caseFor: [], caseAgainst: [], unknowns: [], ...o });

test("words with exact meanings are carried over, never swapped", () => {
  assert.deepEqual(factProblems(draftOf({}), FACTS), []);
  const swapped = factProblems(draftOf({ headline: "Requires the President to pull troops from fighting Iran." }), FACTS);
  assert.equal(swapped.length, 1); assert.match(swapped[0], /^The headline says “Requires”, but the passage it rests on does not say “shall”, “must” or “requires”/);
  const yearly = factProblems(draftOf({ howItWorksToday: [{ text: "The agency sends Congress a yearly public report.", section: "Sec. 2", facts: ["F2"] }] }), FACTS);
  assert.equal(yearly.length, 2); assert.match(yearly[0], /^How it works today item 1 says “yearly”/); assert.match(yearly[1], /does not say it is public/);
  assert.deepEqual(factProblems(draftOf({ changes: [{ label: "Family lanes", before: "", today: "No family lanes are required.", ifPassed: "The agency may open family lanes at airports.", source: "Sec. 2", facts: ["F3"] }] }), FACTS)
    .filter(x => /“may”|“lets”/i.test(x)), [], "“may” for “may” is fine");
  assert.match(factProblems(draftOf({ whatItDoes: [{ text: "Lets airports test family lines.", section: "Sec. 2", facts: ["F1"] }] }), FACTS)[0], /^What it does item 1 says “Lets”/);
  assert.deepEqual(factProblems(draftOf({ whoItAffects: [{ text: "United States armed forces and holders of special use permits.", section: "Sec. 1", facts: ["F1"] }] }), FACTS), [], "“forces” and “permits” are things here, not verbs");
});

test("every item rests on a fact from the list, and nothing talks about “the sources”", () => {
  assert.match(factProblems(draftOf({ plainEnglishFacts: [] }), FACTS)[0], /^In plain English rests on no fact from the list/);
  assert.match(factProblems(draftOf({ headlineFacts: ["F1", "F77"] }), FACTS)[0], /^The headline names "F77", which is not on the facts list/);
  const about = factProblems(draftOf({ unknowns: ["The sources do not say how many airports would join.", "It is not known when the Senate will vote."],
    changes: [{ label: "Authorization", before: "", today: "No source here states that Congress has declared war.", ifPassed: "Congress directs removal.", source: "CRS", facts: ["F1"] }] }), FACTS);
  assert.equal(about.length, 2); assert.match(about[0], /^What would change item 1 talks about “the sources”/); assert.match(about[1], /^What we don't know point 1 talks about/);
  for (const s of ["The records do not state the cost.", "It does not add federal money in the text provided.", "No cost estimate is listed in the sources.", "The public sources do not provide a count."]) assert.match(s, ABOUT_SOURCES, s);
  for (const s of ["The bill does not say how much it costs.", "Gun dealers keep a purchase record for each sale.", "It is not known whether the Senate will vote."]) assert.doesNotMatch(s, ABOUT_SOURCES, s);
});

test("what the writer, the reader of the draft and the corrector are told", () => {
  const block = factsBlock([fact({ id: "F7", fact: "Forces may stay to defend.", source: "Sec. 1", passage: "necessary to defend the United States from imminent attack", qualifier: "provided that the President complies fully with section 5(b)", exactWords: ["provided that"], speaker: "" }),
    fact({ id: "F8", fact: "Congress has not authorized a war.", source: "FLOOR", passage: "This Congress has not authorized a war with Iran", speaker: "Rep. Meeks" })]);
  assert.match(block, /F7 \| source Sec\. 1 \| Forces may stay to defend\.\n {3}passage: “necessary to defend the United States from imminent attack”\n {3}keep with it: provided that the President complies fully with section 5\(b\)\n {3}exact words: provided that/);
  assert.match(block, /F8 \| source FLOOR \| said by Rep\. Meeks \|/);
  assert.match(FACT_RULES, /State only what is on the FACTS list\./);
  assert.match(FACT_RULES, /say that condition, exception or limit in the same sentence as the fact/);
  assert.match(FACT_RULES, /not "requires" for "directs", not "lets" for "shall", not "yearly" for "every other", not "public" for a report to committees/);
  assert.match(FACT_RULES, /never to a wider body \("the committee minority"\) and never as a plain fact/);
  assert.match(EXTRACT_INSTRUCTIONS, /passage: 8 to 60 words copied EXACTLY and in a row from that source/);
  assert.match(EXTRACT_INSTRUCTIONS, /the signer or signers of dissenting, minority or additional views, by name/);
  for (const kind of ["unsupported", "condition_dropped", "word_swapped", "wrong_credit", "estimate_as_fact", "about_sources"]) assert.match(READ_INSTRUCTIONS, new RegExp(`- ${kind}:`));
  assert.match(READ_INSTRUCTIONS, /A plain everyday paraphrase that keeps the meaning is NOT a problem\./);
  assert.match(REPAIR_PREFACE, /Correct ONLY the items the problems name, in place, from the passages on the FACTS list\./);
  const input = readingInput(draftOf({ unknowns: ["It is not known when."], caseFor: [{ argument: "Congress never approved it.", attribution: "Rep. Meeks", source: "FLOOR", quote: "q", facts: ["F8"] }] }), FACTS, ["headline", "caseFor", "unknowns"]);
  assert.match(input, /"part":"headline","index":-1/); assert.match(input, /"creditedTo":"Rep\. Meeks"/); assert.match(input, /"part":"unknowns","index":0/);
  assert.doesNotMatch(input, /"part":"plainEnglish"/, "only the parts asked for are read");
});

test("what a reading finds comes back as check messages that name their part", () => {
  const by = claimFailures([{ part: "plainEnglish", index: -1, kind: "condition_dropped", says: "from an imminent attack.", fix: "from an imminent attack, provided that the President complies fully with section 5(b)." },
    { part: "whatChangesForYou", index: -1, kind: "unsupported", says: "A deployment would end.", fix: "remove" }, { part: "whyNow", index: -1, kind: "wrong_credit", says: "Supporters said", fix: "Rep. Meeks said" }], ["plainEnglish", "whatChangesForYou"]);
  assert.match(by.get("plainEnglish")[0], /^In plain English \(claim reading\) leaves off a condition or limit the source attaches: “from an imminent attack\.”\. Correct it to: from an imminent attack, provided that/);
  assert.match(by.get("whatChangesForYou")[0], /Take it out: nothing on the facts list supports it\.$/);
  assert.equal(by.has("whyNow"), false, "a part that was not read gets no verdict");
  const t = tierFailures([...by.values()].flat());
  assert.equal(t.core.length, 1); assert.deepEqual(Object.keys(t.extended), ["whatChangesForYou"]);
});

/* ───────────────────────────── The two false alarms ───────────────────────────── */

test("false alarm 1: the title of a work is a name, not a judgement", () => {
  const sources = ["whose pamphlet, Common Sense, advocated for American independence from Great Britain.", "the National Historic Preservation Act applies"];
  assert.deepEqual(bannedWordsIn("Thomas Paine wrote Common Sense in 1776.", sources), []);
  assert.deepEqual(bannedWordsIn("A review under the National Historic Preservation Act is needed.", sources), []);
  assert.deepEqual(bannedWordsIn("Supporters call it a common sense fix.", sources), ["common sense"], "lower case is still a judgement");
  assert.deepEqual(bannedWordsIn("Thomas Paine wrote Common Sense in 1776.", ["a pamphlet about independence"]), ["common sense"], "and only when a source prints the title");
  assert.deepEqual(bannedWordsIn("Thomas Paine wrote Common Sense in 1776."), ["common sense"], "with no sources the list applies as before");
  assert.deepEqual(bannedWordsIn("A Historic vote happened.", sources), ["historic"]);
  assert.match(read("lib/analysis/checker.ts"), /bannedWordsIn\(all, sources \? \[\.\.\.sources\.docs\.filter\(x => !\/\^FLOOR\/i\.test\(x\.id\)\)\.map\(x => x\.text\), opts\.fullText \?\? ""\] : \[\]\)/, "the bill's own text counts as a source for this");
});

test("false alarm 2: a law already signed is not “if this passes”", () => {
  assert.deepEqual(rowLabels({ enacted: false, threeStates: false }), { heading: "What would change", before: "Before the new rule", today: "Today", ifPassed: "If this passes" });
  assert.equal(rowLabels({ enacted: false, threeStates: true }).today, "Now, under the new rule");
  const law = rowLabels({ enacted: true, threeStates: false });
  assert.equal(law.heading, "What this law changed"); assert.equal(law.today, "Before this law"); assert.equal(law.ifPassed, "Now, under this law");
  const page = read("app/bills/[id]/page.tsx"), test_ = read("lib/analysis/reader-test.ts"), g = read("lib/analysis/generate.ts");
  assert.match(page, /const isLaw = changeWindow\?\.settled === "law";/);
  assert.match(page, /rowLabels\(\{ enacted: isLaw, threeStates: !!r\.before\?\.trim\(\) \}\)/);
  assert.doesNotMatch(page, /<b>If this passes:<\/b>/);
  assert.match(test_, /export function readerPage\(d: SummaryDraft, opts: \{ enacted\?: boolean \} = \{\}\)/);
  assert.match(g, /runReaderTest\(key, limits\.model, summaryId, draft, sourcesText, Math\.min\(60_000, deadline - Date\.now\(\) - 10_000\), \{ enacted \}\)/);
  assert.match(g, /export const hasBecomeLaw = /); assert.match(g, /became \(\?:public\|private\) law/);
  assert.match(g, /A BILL THAT IS ALREADY LAW: when the input says the bill has become law, write about a law\./);
});

/* ───────────────────────────── On the page ───────────────────────────── */

test("a section that has not passed is simply absent: no heading, no placeholder", () => {
  const page = read("app/bills/[id]/page.tsx"), q = read("lib/analysis/queries.ts");
  assert.match(q, /return \{ \.\.\.out, withheld: sections\.withheld, withheldReasons: sections\.reasons \};/);
  assert.match(page, /const whoBlock = s && has\("whoItAffects"\) && <Fold id="who"/);
  assert.match(page, /const youBlock = s && has\("whatChangesForYou"\) && <Fold id="you"/);
  assert.match(page, /const caseBlock = s && has\("caseFor"\) && has\("caseAgainst"\) && <Fold id="reasons"/, "both sides or neither; never “no reasons found” for reasons that are only withheld");
  assert.match(page, /const unknownBlock = s && has\("unknowns"\) && <Fold id="unknowns"/);
  assert.match(page, /\{has\("whyNow"\) && st\.whyNow\?\.trim\(\) \? <Fold id="why-now" title="Why now"/);
  assert.doesNotMatch(page, /section (?:is )?coming|coming soon/i);
  assert.match(page, /\{access\.editor && off\.size > 0 && <div className="held-note" role="note"><b>Not shown to readers yet:<\/b>/, "only the editor is told what is missing");
  assert.match(read("lib/share-cards.ts"), /if \(!\(s\.whatItDoes as unknown\[\] \| null\)\?\.length \|\| !\(s\.whoItAffects as unknown\[\] \| null\)\?\.length\) return null;/);
  assert.match(read("lib/analysis/quality.ts"), /if \(off\.length\) failures = failures\.filter\(/, "the weekly re-check does not take a summary down for a section left out on purpose");
});

test("the headline's verb can be the text's own; dissenting views are not “the minority”", () => {
  for (const v of ["Directs", "Authorizes", "Approves"]) assert.ok(HEADLINE_VERBS[v], v);
  assert.match(read("lib/analysis/gather.ts"), /r\.minorityKind === "dissenting" \? `members of the \$\{committee\} who signed dissenting views \(\$\{citation\}\)`/);
  assert.match(read("app/api/automation/review-packets/route.ts"), /const named = \(url\.searchParams\.get\("bills"\) \?\? ""\)/, "a rewrite can be read against its sources before it goes on show");
});
