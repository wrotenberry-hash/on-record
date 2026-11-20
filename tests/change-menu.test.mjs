// Suggest changes, the menu engine (owner, 20 Nov 2026; docs/SUGGEST_CHANGES.md).
// "We never invent policy. Every option cites the exact section of bill text it changes." "Zero unsourced options is the bar."
// Code finds each number, date, limit and difference and cuts its quote out of the bill; the model only words it; these
// checks decide what an editor may ever see. Every bill text here is the real file from the Government Publishing Office.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findDials, squash, DIRECTION_WORDS } from "../lib/changes/dials.ts";
import { figuresIn, figuresNotIn, groupFailures, quoteFound, wordingFailures } from "../lib/changes/checks.ts";
import { findDifferences, passages, likeness } from "../lib/changes/diff.ts";
import { assembleMenu, menuInput, parseMenuAnswer, MENU_INSTRUCTIONS, MENU_SCHEMA } from "../lib/changes/draft.ts";
import { choiceId, parseReaderAnswer, readerFailures, readerInput, CHOICE_READER_INSTRUCTIONS } from "../lib/changes/reader.ts";
import { parseBillTextHtml } from "../lib/analysis/billtext.ts";
import { toneProblems } from "../lib/analysis/tone.ts";

const fx = n => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const sectionsOf = n => parseBillTextHtml(fx(n)).sections.map(s => ({ num: s.num, heading: s.heading, body: s.text ?? "" }));
const S5289 = sectionsOf("bill-119s5289is.htm"), HR10458 = sectionsOf("bill-119hr10458ih.htm"), HR10956 = sectionsOf("bill-119hr10956ih.htm");
const IH = sectionsOf("bill-119hr2102ih.htm"), EH = sectionsOf("bill-119hr2102eh.htm");
const bodyIn = secs => num => secs.find(s => s.num === num)?.body ?? null;

test("dials: every candidate's quote is in its section word for word, and its figure is in the quote", () => {
  for (const secs of [S5289, HR10458, HR10956, IH, EH]) for (const d of findDials(secs)) {
    assert.ok(quoteFound(d.quote, bodyIn(secs)(d.sectionNum)), `${d.id} ${d.quote.slice(0, 60)}`);
    assert.ok(d.quote.includes(d.value), `${d.value} inside its quote`);
    assert.ok(d.quote.length <= 600);
  }
});

test("dials: the three fines in S. 5289, each from its own clause", () => {
  const d = findDials(S5289);
  assert.deepEqual(d.map(x => [x.kind, x.value]), [["amount", "$2,500"], ["amount", "$5,000"], ["amount", "$10,000"]]);
  assert.match(d[0].quote, /in the case of a first offense, a civil fine of \$2,500;$/);
  assert.match(d[2].quote, /a civil fine of \$10,000 per occurrence\.$/);
  assert.deepEqual(d.map(x => x.id), ["d1", "d2", "d3"]);
});

test("dials: deadlines, a share and a measured quantity are found; names, citations and a map's date are not", () => {
  const land = findDials(HR10458);
  assert.ok(land.some(x => x.kind === "count" && x.value === "approximately 18,628 acres"));
  assert.ok(land.some(x => x.kind === "duration" && x.value === "2 years" && /^Not later than 2 years after the date of enactment/.test(x.quote)), "the run of headings is left off the quote");
  assert.ok(land.some(x => x.kind === "duration" && x.value === "180 days"));
  assert.ok(!land.some(x => x.value === "July 23, 2026"), "the date printed on a map is not something the bill sets");
  assert.ok(!land.some(x => /Grand Ronde'' means the Confederated Tribes/.test(x.quote)), "a definition that only gives a name is not a choice");
  const loans = findDials(HR10956);
  assert.ok(loans.some(x => x.kind === "percent" && x.value === "50 percent"));
  // Section numbers, titles of the Code and public laws are citations.
  for (const d of [...land, ...loans, ...findDials(EH)]) assert.doesNotMatch(d.value, /^(?:1413a|5304|5305|10|38|811)$/);
  assert.ok(!findDials(EH).some(x => /^Passed the House/.test(x.quote)), "the clerk's note at the end of a passed bill is not the bill");
  assert.ok(!findDials(EH).some(x => /Inclusion of Chapter 61/.test(x.quote)), "a figure in a subsection's heading is taken from the text below it instead");
  assert.ok(findDials(EH).some(x => x.value === "20 years" && /with fewer than 20 years of creditable service/.test(x.quote)));
});

test("dials: section 1 and housekeeping are skipped, and the list is capped", () => {
  assert.deepEqual(findDials([{ num: "1", heading: "SHORT TITLE", body: "This Act may be cited as the Example Act of 2026 and provides $5,000,000." }]), []);
  const many = Array.from({ length: 30 }, (_, i) => ({ num: String(i + 2), heading: "GRANTS", body: `The Secretary may award not more than $${i + 1},000,000 to each eligible State in each year.` }));
  assert.equal(findDials(many).length, 10); assert.equal(findDials(many, { max: 4 }).length, 4);
  const one = [{ num: "2", heading: "FUNDS", body: "There is authorized $1,000 for the first program; $2,000 for the second program; $3,000 for the third program; $4,000 for the fourth program; and $5,000 for the fifth program in each year." }];
  assert.equal(findDials(one).length, 3, "at most three from one section");
  assert.equal(findDials([{ num: "2", heading: "CHANGE", body: "Section 797(a) of the Energy Policy Act of 2005 (42 U.S.C. 16137(a)) is amended by striking ``2024'' and inserting ``2029''." }])[0].value, "2029");
});

test("figures: a figure written out matches the same figure in digits, and a new figure is caught", () => {
  assert.deepEqual(figuresIn("$100 million a year"), [100000000]); assert.deepEqual(figuresIn("$100,000,000"), [100000000]);
  assert.deepEqual(figuresNotIn("Raise the yearly amount above $100 million.", "authorized to be appropriated $100,000,000 for each fiscal year"), []);
  assert.deepEqual(figuresNotIn("Raise the fine to $7,500.", "a civil fine of $2,500;"), [7500]);
  assert.deepEqual(figuresNotIn("Give the Secretary more than two years.", "Not later than 2 years after the date of enactment"), []);
  assert.deepEqual(figuresNotIn("Move the deadline past January 12, 2027.", "not later than January 12, 2027"), []);
  assert.deepEqual(figuresNotIn("Lower the share below 50 percent.", "an amount equal to 50 percent of the amount"), []);
  assert.deepEqual(figuresNotIn("Lower the share to 25 percent.", "an amount equal to 50 percent of the amount"), [25]);
});

const FINE = { kind: "amount", about: "the fine for a first offense", quote: "in the case of a first offense, a civil fine of $2,500;", value: "$2,500", options: [
  { direction: "up", wording: "Raise the fine for a first offense above $2,500." }, { direction: "down", wording: "Lower the fine for a first offense below $2,500." },
  { direction: "keep", wording: "Keep the fine for a first offense at $2,500 as written." }, { direction: "remove", wording: "Remove the fine for a first offense from the bill." }] };
const FINE_BODY = bodyIn(S5289)("2");
const withOption = (direction, wording) => ({ ...FINE, options: FINE.options.map(o => o.direction === direction ? { direction, wording } : o) });

test("checks: a sound group passes, and every sentence in it is calm", () => {
  assert.deepEqual(groupFailures(FINE, FINE_BODY), []);
  for (const o of FINE.options) assert.deepEqual(toneProblems(o.wording), []);
});

test("checks: a quote that is not in the section, word for word, fails", () => {
  assert.match(groupFailures({ ...FINE, quote: "in the case of a first offense, a civil fine of $2,600;" }, FINE_BODY).join(" | "), /not in the section cited, word for word/);
  assert.match(groupFailures({ ...FINE, quote: "a civil fine of $2,500 for the first offense" }, FINE_BODY).join(" | "), /not in the section cited/);
  assert.match(groupFailures(FINE, bodyIn(HR10458)("3")).join(" | "), /not in the section cited/, "the right words in the wrong bill fail too");
  assert.equal(quoteFound("a  civil\n fine of $2,500;", FINE_BODY), true, "line breaks and spacing do not matter");
  assert.equal(quoteFound("$2,500", FINE_BODY), false, "a few characters are not a quote");
  assert.match(groupFailures({ ...FINE, value: "$9,999" }, FINE_BODY).join(" | "), /The figure \(\$9,999\) is not inside the quoted words/);
});

test("checks: a choice may not state a figure the bill does not, take a side, give a reason, or run to two sentences", () => {
  const f = (d, w) => groupFailures(withOption(d, w), FINE_BODY).join(" | ");
  assert.match(f("up", "Raise the fine for a first offense to $5,000 per sign."), /uses|states 5000|which the quoted text does not/);
  assert.match(f("up", "Raise the fine for a first offense to $7,500."), /states 7500, which the quoted text does not/);
  assert.match(f("down", "Lower the excessive fine for a first offense."), /takes a side \(“excessive”\)/);
  assert.match(f("down", "Lower the fine for a first offense to help small shops."), /gives a reason \(“to help”\)/);
  assert.match(f("up", "Raise the fine. It is too low."), /one sentence/);
  assert.match(f("up", "Lower the fine for a first offense."), /points the other way \(“Lower”\)/);
  assert.match(f("down", "Raise the fine for a first offense."), /points the other way \(“Raise”\)/);
  assert.match(f("keep", "The fine for a first offense stays."), /does not say so in plain words \(keep or leave\)/);
  assert.match(f("remove", "No fine for a first offense."), /remove or take out|say what would change/);
  assert.match(f("up", "Raise this outrageous fine!"), /exclamation|Outrage/);
  assert.match(f("up", `Raise ${"the fine for a first offense ".repeat(6)}above $2,500.`), /words; the limit is 26/);
});

test("checks: both directions always travel together, and a dial always offers keep and remove", () => {
  const without = d => ({ ...FINE, options: FINE.options.filter(o => o.direction !== d) });
  assert.match(groupFailures(without("down"), FINE_BODY).join(" | "), /needs exactly one "down" choice/);
  assert.match(groupFailures(without("up"), FINE_BODY).join(" | "), /needs exactly one "up" choice/);
  assert.match(groupFailures(without("keep"), FINE_BODY).join(" | "), /needs exactly one "keep" choice/);
  assert.match(groupFailures(without("remove"), FINE_BODY).join(" | "), /needs exactly one "remove" choice/);
  assert.match(groupFailures({ ...FINE, options: [...FINE.options, { direction: "adopt", wording: "Adopt the amendment as filed." }] }, FINE_BODY).join(" | "), /a choice of a kind it should not have/);
  assert.match(groupFailures({ ...FINE, about: "" }, FINE_BODY).join(" | "), /Nothing says what the quoted thing is/);
  assert.match(groupFailures({ ...FINE, about: "the $900 fine" }, FINE_BODY).join(" | "), /description states 900/);
});

test("differences: introduced and passed versions of H.R. 2102, each side quoted from its own version", () => {
  const d = findDifferences(IH, EH);
  assert.ok(d.length >= 1 && d.length <= 6);
  for (const x of d) {
    if (x.quote) assert.ok(quoteFound(x.quote, bodyIn(EH)(x.sectionNum)), `newer: ${x.quote.slice(0, 60)}`);
    if (x.otherQuote) assert.ok(quoteFound(x.otherQuote, bodyIn(IH)(x.otherSectionNum)), `older: ${x.otherQuote.slice(0, 60)}`);
    assert.ok(x.quote || x.otherQuote);
  }
  assert.deepEqual(findDifferences(EH, EH), [], "the same text has no differences");
  assert.ok(likeness("is not subject to reduction under sections 5304 and 5305", "shall not be subject to reduction under sections 5304 and 5305") > 0.7);
  assert.ok(passages("(a) First thing. (b) Second thing; (c) third.").length >= 2);
});

test("drafting: answers become groups only when they pass; a skipped or missing item is recorded, never guessed", () => {
  const dials = findDials(S5289), ok = { id: "d1", skip: false, skipReason: "", about: FINE.about, up: FINE.options[0].wording, down: FINE.options[1].wording, keep: FINE.options[2].wording, remove: FINE.options[3].wording, thisVersion: "", otherVersion: "" };
  const bad = { ...ok, id: "d2", up: "Raise the fine for a second offense to $20,000." };
  const res = assembleMenu([ok, bad, { ...ok, id: "d9" }], dials, [], bodyIn(S5289), () => null);
  assert.deepEqual(res.passed.map(g => g.id), ["d1"]);
  assert.equal(res.passed[0].quote, dials[0].quote, "the quote is the one code cut out, never one the model wrote");
  assert.equal(res.passed[0].source, "dial"); assert.equal(res.passed[0].sectionNum, "2");
  assert.deepEqual(res.failed.map(f => f.id), ["d2"]); assert.match(res.failed[0].failures.join(" "), /states 20000/);
  assert.deepEqual(res.missing, ["d3"]);
  const skipped = assembleMenu([{ ...ok, skip: true, skipReason: "names a map" }], dials.slice(0, 1), [], bodyIn(S5289), () => null);
  assert.deepEqual(skipped.skipped, [{ id: "d1", reason: "names a map" }]); assert.deepEqual(skipped.passed, []);
  assert.deepEqual(assembleMenu([ok], dials.slice(0, 1), [], () => null, () => null).failed[0].failures, ["The section cited is not stored."]);
  assert.deepEqual(parseMenuAnswer("not json"), []); assert.deepEqual(parseMenuAnswer('{"items":"x"}'), []);
  assert.equal(parseMenuAnswer(JSON.stringify({ items: [ok] })).length, 1);
});

test("drafting: the model is shown the quote and asked for a direction only", () => {
  const input = menuInput({ label: "S. 5289", title: "A bill" }, findDials(S5289), [], null, { d1: ["The \"up\" choice states 7500, which the quoted text does not."] });
  assert.match(input, /ITEM d1: an amount of money \(write up, down, keep, remove; "up" means a higher amount, "down" means a lower amount\)/);
  assert.match(input, /Quoted from the bill: .*a civil fine of \$2,500;/);
  assert.match(input, /YOUR LAST ANSWER FOR THIS ITEM FAILED THESE CHECKS; fix each one: The "up" choice states 7500/);
  for (const rule of ["You never propose policy", "Never state a new figure", "State the change and nothing else", "Take no side", "set skip to true"]) assert.ok(MENU_INSTRUCTIONS.includes(rule), rule);
  assert.deepEqual(toneProblems(MENU_INSTRUCTIONS.replace(/"[^"]*"/g, "")), []);
  assert.equal(MENU_SCHEMA.properties.items.items.additionalProperties, false);
  assert.equal(DIRECTION_WORDS.date.up, "a later date"); assert.equal(DIRECTION_WORDS.coverage.down, "fewer people or things covered");
});

test("reader test: a choice read the wrong way, not understood, or not answered fails its whole group", () => {
  const g = { ...FINE, id: "d1", source: "dial", sourceRef: "amount", sectionNum: "2", heading: "FINES" };
  assert.match(readerInput([g]), /^d1\.up: Raise the fine for a first offense above \$2,500\.\nd1\.down: /);
  assert.doesNotMatch(readerInput([g]), /Quoted from the bill|a civil fine of \$2,500;|d1\.up: .*more/, "the reader sees the sentences only, with no hint of the answer");
  const right = [["up", "more"], ["down", "less"], ["keep", "same"], ["remove", "gone"]].map(([d, way]) => ({ id: choiceId("d1", d), way, restated: "clear enough" }));
  assert.deepEqual(readerFailures([g], right).get("d1"), []);
  const wrong = right.map(a => a.id === "d1.up" ? { ...a, way: "less", restated: "the fine goes down" } : a);
  assert.match(readerFailures([g], wrong).get("d1").join(" "), /read the "up" choice as "less"/);
  assert.match(readerFailures([g], right.map(a => a.id === "d1.keep" ? { ...a, restated: "I don't understand." } : a)).get("d1").join(" "), /did not understand the "keep" choice/);
  assert.match(readerFailures([g], right.slice(1)).get("d1").join(" "), /gave no answer for the "up" choice/);
  assert.deepEqual(parseReaderAnswer("{}"), []); assert.equal(parseReaderAnswer(JSON.stringify({ answers: right })).length, 4);
  assert.ok(CHOICE_READER_INSTRUCTIONS.includes("You see nothing else about the bill"));
  assert.equal(squash("a \n b c"), "a b c");
  assert.deepEqual(wordingFailures({ direction: "keep", wording: "Keep the fine for a first offense at $2,500 as written." }, FINE.quote), []);
});
