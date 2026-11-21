// Owner, 21 Nov 2026 (two trial readers: too much text on a bill page): "Show the core open (headline, plain-English
// part, how it works today, what would change, where it stands, and the reader's question). Collapse every other
// section to a single tappable heading with a short hint of what is inside, for example 'Reasons for and against (4)'.
// Remember each reader's open or closed choices."
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countHint, OPEN_SECTIONS, wordsHint } from "../lib/fold-hint.ts";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the hint beside a closed heading: a count for a list, the first words for a paragraph", () => {
  assert.equal(countHint(4), "(4)");
  assert.equal(wordsHint("The House voted on the bill on November 17, 2026, and passed it."), "The House voted on the bill on November…");
  assert.equal(wordsHint("Short text."), "Short text.");
  assert.equal(wordsHint("   "), null); assert.equal(wordsHint(null), null);
  assert.equal(OPEN_SECTIONS.length, 6);
});

test("the core stays open and in order; the reader's question comes right after where the bill stands", () => {
  const page = read("app/bills/[id]/page.tsx");
  const at = x => { const i = page.indexOf(x); assert.ok(i > 0, x); return i; };
  // Owner, 21 Nov 2026: "headline, plain-English part, how it works today, what would change, where it stands, the reader's question. 'Today' always comes before 'what would change'."
  const order = [at('<h1 className="bill-headline">'), at("<h2>In plain English"), at("<h2>How it works today"), at("rowLabels({ enacted: isLaw, threeStates: st.changes.some"), at("<h2>Where it stands <OfficialBadge /></h2>"), at("<VoteBox billKey={bill.id}"), at('<Fold id="steps"'), at('<Fold id="cost"')];
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  for (const open of ["<h2>In plain English", "<h2>How it works today", "<h2>Where it stands <OfficialBadge /></h2>"]) assert.doesNotMatch(page, new RegExp(`<Fold[^>]*>\\s*<div className="fed-section">${open.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`), `${open} is never inside a fold`);
});

test("every other section is one tappable heading with a hint", () => {
  const page = read("app/bills/[id]/page.tsx");
  for (const id of ["steps", "why-now", "who", "cost", "you", "reasons", "unknowns", "versions", "amendments", "contact", "votes", "share", "sources"]) assert.match(page, new RegExp(`<Fold id="${id}" title=`), id);
  assert.match(page, /<Fold id="reasons" title="Reasons for and against" count=\{s\.caseFor\.length \+ s\.caseAgainst\.length\}/, "“Reasons for and against (4)”");
  assert.match(page, /<Fold id="who" title="Who it affects" count=\{s\.whoItAffects\.length\}/);
  assert.match(read("components/bills/fold.tsx"), /\{title\}\{count != null \? ` \(\$\{count\}\)` : ""\}/, "the count sits beside the title");
  assert.match(page, /<Fold id="votes" [^>]*hint=\{votes\.length \? `\$\{votes\.length\} recorded vote/);
  // A section left off because it did not pass (two tiers) gets no heading at all, folded or not.
  assert.match(page, /const whoBlock = s && has\("whoItAffects"\) && <Fold/);
});

test("closed until tapped, remembered on the reader's own device, and a link to something inside opens it", () => {
  const f = read("components/bills/fold.tsx"), css = read("app/globals.css");
  assert.match(f, /^"use client";/);
  assert.match(f, /<details ref=\{ref\} className="fold" data-fold=\{id\}/); assert.doesNotMatch(f, /<details[^>]* open/, "closed by default");
  assert.match(f, /window\.localStorage\.setItem\(key\(id\), e\.currentTarget\.open \? "1" : "0"\)/, "the choice is kept by section, on the device");
  assert.match(f, /if \(window\.localStorage\.getItem\(key\(id\)\) === "1"\) el\.open = true;/);
  assert.match(f, /el\.querySelector\(`\[id="\$\{CSS\.escape\(h\)\}"\]`\)\) \{ el\.open = true;/, "a link to a vote or the contact panel opens its section");
  assert.doesNotMatch(f, /fetch\(|cookie/i, "nothing about the choice is sent to the site");
  assert.match(f, /<summary><span className="fold-head"><h2 className="fold-title">/, "the heading is still a heading");
  assert.match(css, /\.fold>summary\{[^}]*min-height:52px/, "a thumb-sized target");
  assert.match(css, /\.fold-body>\.fed-section>h2:first-child\{display:none\}/, "the heading is not shown twice");
});

test("a trial reader stays signed in for 90 days after the latest visit", () => {
  assert.match(read("lib/trial.ts"), /export const TRIAL_COOKIE_MAX_AGE_S = 90 \* 24 \* 3600;/);
  const a = read("app/visit/actions.ts");
  assert.match(a, /if \(access\.invite\) \{\s*const jar = await cookies\(\), token = jar\.get\(TRIAL_COOKIE\)\?\.value;\s*if \(token\) jar\.set\(TRIAL_COOKIE, token, \{[^}]*maxAge: TRIAL_COOKIE_MAX_AGE_S \}\);/, "renewed on a visit, and only for a reader the gate let in");
  assert.match(read("app/welcome/page.tsx"), /signed in for 90 days after your latest visit/);
  // "You're caught up" rests on the time of the previous visit, kept by reader on the site and in a 400-day cookie: it survives closing the browser.
  assert.match(read("lib/visits.ts"), /maxAge: 400 \* 24 \* 3600/);
});

test("the residents' totals fold on the bill page; why now sits with the other folded sections", () => {
  const page = read("app/bills/[id]/page.tsx"), box = read("components/voice/vote-box.tsx");
  assert.match(page, /<VoteBox billKey=\{bill\.id\}[^\n]* foldTotals \/>\}/);
  assert.match(box, /foldTotals \? <Fold id="residents" title="What residents say"/);
  assert.ok(page.indexOf('<Fold id="why-now"') > page.indexOf("<VoteBox billKey={bill.id}"), "why now is below the reader's question");
});

test("where it stands is one line; the step-by-step list folds with the rest of the status", () => {
  const page = read("app/bills/[id]/page.tsx");
  assert.match(page, /<h2>Where it stands <OfficialBadge \/><\/h2>\s*\{changeWindow \? <p className="stands-line">\{standsLine\(changeWindow\)\}<\/p>/);
  const fold = page.slice(page.indexOf('<Fold id="steps"'), page.indexOf("</Fold>", page.indexOf('<Fold id="steps"')));
  for (const inside of ["<WindowBlock w={changeWindow} />", "<Timeline steps={timeline.steps}", "Sponsor:", "Introduced {shortDate(bill.introducedAt)}"]) assert.ok(fold.includes(inside), inside);
  assert.match(page, /<Fold id="steps" title="Every step so far" count=\{timeline \? timeline\.steps\.length : null\}/);
  // The Texas bill page keeps the same order of the two sections.
  const tx = read("components/texas/summary.tsx");
  assert.ok(tx.indexOf("<h2>How it works today") < tx.indexOf("<h2>What would change"), "today before what would change, there too");
});
