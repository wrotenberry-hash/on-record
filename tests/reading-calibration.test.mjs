import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FACT_RULES, READ_INSTRUCTIONS, REPAIR_PREFACE, readingInput, withoutReviewedExplanations } from "../lib/analysis/facts.ts";
import { JARGON } from "../lib/analysis/standard.ts";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// The second trial (21 Nov 2026): 0 of 5 cores passed. docs/audits/2026-11-21/trial-2.md sorts why, by kind.

test("kind 3: the reading is not given the site's own reviewed explanations of terms", () => {
  // The four the reading reported on S.J.Res. 197, as the program had attached them.
  const said = "The rule sets the risk adjustment (moving money from insurers with healthier customers to insurers with sicker ones) user fee (a charge insurers pay to sell plans on the government site) for 2027.";
  assert.equal(withoutReviewedExplanations(said), "The rule sets the risk adjustment user fee for 2027.");
  for (const t of JARGON) assert.equal(withoutReviewedExplanations(`a term (${t.plain}) here`), "a term here", t.term);
  // A bracket the writer wrote itself is still read.
  assert.equal(withoutReviewedExplanations("the fee (which doubles in 2028)"), "the fee (which doubles in 2028)");
  const d = { headline: "x", headlineFacts: ["F1"], plainEnglish: "Insurers pay a user fee (a charge insurers pay to sell plans on the government site).", plainEnglishFacts: ["F1"], unknowns: ["It is not known how many enrollments change."] };
  const given = readingInput(d, [{ id: "F1", fact: "f", source: "RULE", passage: "p", qualifier: "", exactWords: [], speaker: "" }], ["plainEnglish", "unknowns"]);
  assert.match(given, /Insurers pay a user fee\./);
  assert.doesNotMatch(given, /a charge insurers pay/);
});

test("kind 1: a 'today' line may rest on the bill's own amending words, and the writer and the reader are told the same fixed lines", () => {
  for (const line of ["The law this bill amends has no such requirement today.", "The bill adds this as a new requirement."]) {
    assert.ok(FACT_RULES.includes(line), `the writer is given: ${line}`);
    assert.ok(READ_INSTRUCTIONS.includes(line), `the reader accepts: ${line}`);
  }
  assert.ok(FACT_RULES.includes("The earlier rule on this point is not known.") && READ_INSTRUCTIONS.includes("The earlier rule on this point is not known."));
  assert.match(FACT_RULES, /by striking '2026' and inserting '2031'" shows the law says 2026 today/);
  assert.match(READ_INSTRUCTIONS, /by striking '2026' and inserting '2031'" supports "The law says 2026 today"/);
  assert.match(FACT_RULES, /Never anything else about today that no passage shows\./);
});

test("kind 2: the reading judges meaning, with this trial's false alarms as its examples", () => {
  assert.match(READ_INSTRUCTIONS, /JUDGE MEANING, NOT WORDING\./);
  for (const ok of ["sent it to a health committee", "other payment platforms", "pays part of private insurers' losses", "College Station, Texas"]) assert.ok(READ_INSTRUCTIONS.includes(ok), ok);
  // The six kinds of fault are all still reported.
  for (const kind of ["unsupported:", "condition_dropped:", "word_swapped:", "wrong_credit:", "estimate_as_fact:", "about_sources:"]) assert.ok(READ_INSTRUCTIONS.includes(kind), kind);
  assert.match(READ_INSTRUCTIONS, /Leaving something out is a problem only when it is a condition, exception, limit or "approximately"/);
});

test("kind 4: a correction comes back in plain words and never lifts a limit", () => {
  assert.match(READ_INSTRUCTIONS, /no longer than the words it replaces, no section or code numbers/);
  assert.match(REPAIR_PREFACE, /a correction never lifts a limit/);
  assert.match(REPAIR_PREFACE, /80 words or fewer, a "how it works today" bullet at 40, each side of a "what would change" row at 38/);
  const checker = read("lib/analysis/checker.ts"), standard = read("lib/analysis/standard.ts");
  // The limits the preface quotes are the ones the checks apply.
  assert.match(checker + standard, /todayWords: 40/);
  assert.match(checker + standard, /rowWords: 38/);
});

test("the facts lists made for the second trial are kept for the next wording of the writer", () => {
  const g = read("lib/analysis/generate.ts");
  assert.match(g, /export const FACTS_VERSION = "b13-2026-11-21";/);
  assert.match(g, /kept\.v === FACTS_VERSION && kept\.text === textVersion/);
  assert.match(g, /JSON\.stringify\(\{ v: FACTS_VERSION, text: textVersion, facts: list, tries: n \}\)/);
  // Nothing is rewritten by this change: the writer's version and the five trial bills are as they were.
  assert.match(g, /export const PROMPT_VERSION = "b13-2026-11-21";/);
  assert.match(g, /export const EXPLANATIONS_GO = false;/);
});
