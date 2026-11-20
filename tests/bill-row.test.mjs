// Vote rows (owner, 20 Nov 2026, from three trial readers): what the bill is first, one sentence on what it does, how
// the legislator voted, the bill number small, and a labelled link; the whole row opens the bill; no link on the site
// is a bare bill number. The rules are in lib/bill-row.ts; the pages are checked by reading their source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { billRowText, EXPLANATION_COMING, isBareBillNumber, numberFromBillId, officialMain, summaryPlanned, TITLE_NOT_ON_FILE, typeFromBillId, WHAT_THIS_BILL_DOES, whatItDoesSentence } from "../lib/bill-row.ts";
import { fedCardVote, txCardVote } from "../lib/flow/cards.ts";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the owner's words are fixed", () => {
  assert.equal(WHAT_THIS_BILL_DOES, "What this bill does");
  assert.equal(EXPLANATION_COMING, "Plain-English explanation coming");
});

test("the one sentence is the approved summary's own: the first sentence that says “this bill”", () => {
  // Wording on show to trial readers (H.R. 3978), copied from production on 19 Nov 2026.
  const plainEnglish = "Spent nuclear fuel is radioactive waste left after nuclear power plants make electricity. Today a future plant that recycles that waste into usable fuel would face a longer two-step federal license path; this bill lets plants that do not isolate plutonium use a shorter one-step path. The House passed it 397–2 on November 9, 2026, and the Senate put it on its calendar the next day.";
  const s = whatItDoesSentence({ plainEnglish, whatItDoes: [{ text: "Changes the Atomic Energy Act so certain spent-fuel recycling equipment is not treated as a production facility." }] });
  assert.equal(s, "Today a future plant that recycles that waste into usable fuel would face a longer two-step federal license path; this bill lets plants that do not isolate plutonium use a shorter one-step path.");
  assert.ok(plainEnglish.includes(s), "never cut and never reworded: the sentence is in the summary word for word");
  assert.equal(whatItDoesSentence({ plainEnglish: "Today a fund must pay within 7 days. This bill lets a fund pause payment for up to 15 business days. The House passed it 414–2." }), "This bill lets a fund pause payment for up to 15 business days.");
  // A law already signed: "This new law …".
  assert.equal(whatItDoesSentence({ plainEnglish: "This new law lets farmers get more money before doing the work. Congress acted after major fires." }), "This new law lets farmers get more money before doing the work.");
  // "the House passed the bill" is where it stands, not what it does: only "this bill" counts.
  assert.equal(whatItDoesSentence({ plainEnglish: "Workers already must stay out of loan decisions. The House passed the bill 415–0.", whatItDoes: [{ text: "Requires a written form." }] }), "Requires a written form.");
});

test("when no sentence says “this bill”, the first line of the summary's “What it does” list is used, whole", () => {
  const s = whatItDoesSentence({ plainEnglish: "Congress’s budget office usually estimates effects over 10 years. Leaders could ask for 20. The House passed it 401–0.",
    whatItDoes: [{ text: "Lets certain committee leaders request longer savings estimates for preventive health care legislation." }, { text: "Second." }] });
  assert.equal(s, "Lets certain committee leaders request longer savings estimates for preventive health care legislation.");
  assert.equal(whatItDoesSentence({ plainEnglish: null, whatItDoes: [{ text: "Requires a written form" }] }), "Requires a written form.");
  assert.equal(whatItDoesSentence({ plainEnglish: "", whatItDoes: [] }), null);
});

test("with an approved summary the main line is its headline, never the bill number", () => {
  const r = billRowText({ number: "H.R. 9500", title: "Tax Relief for Fraud Victims Act", billType: "hr",
    summary: { headline: "Lets fraud victims deduct stolen money on federal taxes.", plainEnglish: "Today it is hard. This bill would let fraud victims deduct stolen money.", whatItDoes: [] } });
  assert.deepEqual(r, { main: "Lets fraud victims deduct stolen money on federal taxes.", does: "This bill would let fraud victims deduct stolen money.", coming: false, label: "Analysis", number: "H.R. 9500" });
});

test("with no approved summary: the official title and “Plain-English explanation coming”", () => {
  const r = billRowText({ number: "H.R. 1013", title: "Retirement Fairness for Charities and Educational Institutions Act", billType: "hr" });
  assert.deepEqual(r, { main: "Retirement Fairness for Charities and Educational Institutions Act", does: null, coming: true, label: "Official", number: "H.R. 1013" });
  assert.equal(billRowText({ number: "HB 2", title: "Relating to public education." }).coming, true, "a Texas bill");
  assert.equal(billRowText({ number: "H.R. 1", title: "x", summary: { headline: "  " } }).label, "Official", "an empty headline is no summary");
});

test("a resolution no summary is written for does not promise one", () => {
  for (const t of ["hres", "sres", "hconres", "sconres"]) assert.equal(summaryPlanned(t), false);
  for (const t of ["hr", "s", "hjres", "sjres", null, undefined]) assert.equal(summaryPlanned(t), true);
  const r = billRowText({ number: "H.Res. 1247", title: "Providing for consideration of the bill (H.R. 2102) to amend title 10, United States Code.", billType: "hres" });
  assert.equal(r.coming, false); assert.equal(r.does, null); assert.equal(r.label, "Official");
});

test("a title that is not a title says so; a long one is cut at a word", () => {
  assert.equal(officialMain("H.R. 5334, as amended"), TITLE_NOT_ON_FILE);
  assert.equal(officialMain("Motion to Invoke Cloture: Motion to Proceed to H.R. 2347"), TITLE_NOT_ON_FILE);
  assert.equal(officialMain(null), TITLE_NOT_ON_FILE);
  assert.equal(officialMain("GUARD Act, as amended"), "GUARD Act");
  const long = officialMain(`To amend ${"the Internal Revenue Code of 1986 and for other purposes ".repeat(6)}`);
  assert.ok(long.length <= 141 && long.endsWith("…"));
});

test("bill ids give the number and the type", () => {
  assert.equal(numberFromBillId("119-hr-2102"), "H.R. 2102");
  assert.equal(numberFromBillId("119-sjres-197"), "S.J.Res. 197");
  assert.equal(numberFromBillId("ocd-bill/abc"), null);
  assert.equal(typeFromBillId("119-hres-1247"), "hres");
  assert.equal(typeFromBillId(null), null);
});

test("what counts as a bare bill number", () => {
  for (const t of ["H.R. 1234", "S. 629", "H.J.Res. 213", "S.J.Res. 197", "H.Con.Res. 89", "H.Res. 1247", "HB 2", "SB 14", "SJR 81", " H.R.  2102 ", "HR 1"]) assert.equal(isBareBillNumber(t), true, t);
  for (const t of ["What this bill does", "H.R. 1234: the bill and every vote on it", "GUARD Act", "", null, "S. 629 Emergency Conservation Program Improvement Act", "District 37"]) assert.equal(isBareBillNumber(t), false, String(t));
});

const fed = { rollCallId: "h1", votedAt: Date.UTC(2026, 10, 12), question: "On Passage", title: "Major Richard Star Act", result: "Passed", yea: 392, nay: 18, chamber: "house",
  billId: "119-hr-2102", billTitle: "Major Richard Star Act", billType: "hr", number: 2102, position: "Yea", kind: "pass" };

test("a card vote carries the row and a vote line that does not repeat the bill's name", () => {
  const plain = fedCardVote(fed);
  assert.equal(plain.row.main, "Major Richard Star Act"); assert.equal(plain.row.coming, true); assert.equal(plain.row.number, "H.R. 2102");
  assert.equal(plain.vote, "Voted Yes to pass this bill. It passed 392–18.");
  assert.equal(plain.line, "Voted Yes to pass the Major Richard Star Act. It passed 392–18.", "the self-contained sentence is kept for places with no headline above");
  const withSummary = fedCardVote({ ...fed, position: "Nay" }, { summary: { headline: "Lets combat-injured military retirees keep their full retirement pay.", plainEnglish: "Today checks are cut. This bill ends that cut." } });
  assert.equal(withSummary.row.main, "Lets combat-injured military retirees keep their full retirement pay.");
  assert.equal(withSummary.row.does, "This bill ends that cut."); assert.equal(withSummary.row.label, "Analysis");
  assert.equal(withSummary.vote, "Voted No on passing this bill. It passed 392–18.");
  assert.equal(fedCardVote({ ...fed, billType: "s" }).vote, "Voted Yes to pass this bill. It passed 392–18.");
  assert.equal(fedCardVote({ ...fed, billType: "hjres" }).vote, "Voted Yes to pass this measure. It passed 392–18.", "a resolution is a measure, as in the full sentence");
  const tx = txCardVote({ motion: "Third reading", date: "2025-05-20", result: "pass", counts: { yes: 100, no: 40 }, tallyOk: 1, option: "yes", billId: "ocd-bill/1", identifier: "HB 2", title: "Relating to public education.", kind: "pass" });
  assert.equal(tx.row.main, "Relating to public education"); assert.equal(tx.row.coming, true); assert.equal(tx.row.number, "HB 2");
  assert.equal(tx.vote, "Voted Yes to pass this bill. It passed 100–40.");
});

test("the row puts the parts in the owner's order and ends with the labelled link over the whole row", () => {
  const row = read("components/bills/bill-row.tsx");
  const at = s => { const i = row.indexOf(s); assert.ok(i > 0, `missing ${s}`); return i; };
  const order = [at('className="br-main"'), at("br-does"), at('className="br-vote"'), at('className="br-meta"'), at('className="br-more"')];
  assert.deepEqual([...order].sort((a, b) => a - b), order, "headline, one sentence, the vote, the bill number, the link");
  assert.match(row, /\{row\.main\}/); assert.match(row, /\{row\.number\}/);
  assert.match(row, /<Link className="br-more" href=\{href\}>\{WHAT_THIS_BILL_DOES\}/);
  const css = read("components/bills/bill-row.css");
  assert.match(css, /\.bill-row\{position:relative/);
  assert.match(css, /\.br-more::after\{content:"";position:absolute;inset:0\}/, "the link covers the whole row");
  assert.match(css, /\.br-more\{[^}]*min-height:44px/, "a thumb-sized target");
  assert.match(css, /\.bill-row a:not\(\.br-more\)[^{]*\{position:relative;z-index:1\}/, "other links in the row still work");
});

test("every place votes are listed uses the row", () => {
  assert.match(read("components/home/legislator-cards.tsx"), /<BillRow key=\{`\$\{v\.billHref\}-\$\{i\}`\} row=\{v\.row\} href=\{v\.billHref\} vote=\{v\.vote\}/, "home, Your legislators");
  assert.match(read("components/federal/vote-row.tsx"), /return <BillRow row=\{row\} href=\{`\/bills\/\$\{v\.billId\}`\}/, "a member of Congress's page, Following");
  assert.match(read("components/texas/decisions.tsx"), /return <BillRow row=\{billRowText\(\{ number: bill\.identifier, title: bill\.title \}\)\} href=\{`\/texas\/bills\/\$\{bill\.id\}`\}/, "a Texas legislator's page");
  for (const p of ["components/home/personal.tsx", "components/home/since-panel.tsx", "app/recap/page.tsx"]) assert.match(read(p), /<MemberVoteRow /, p);
  assert.match(read("components/bills/member-vote-row.tsx"), /return <BillRow row=\{row\} href=\{`\/bills\/\$\{v\.billId\}`\}/);
  assert.match(read("app/compare/page.tsx"), /<BillRow key=\{d\.rollCallId\} row=\{row\}/);
  assert.match(read("app/politicians/[id]/page.tsx"), /<BillRow key=\{r\.rollId\} row=\{row\}/, "votes against most of their own party");
  assert.match(read("lib/federal/queries.ts"), /row: r\.billId \? texts\.get\(r\.billId\) \?\? null : null/);
});

test("only approved words reach a row: the store reads through the reader gate and calls no model", () => {
  const store = read("lib/bill-row-store.ts");
  assert.match(store, /readerVisible\(\)/);
  assert.match(store, /x\.promptVersion === r\.promptVersion/, "details written for an earlier wording are left out");
  assert.doesNotMatch(store, /openai|fetch\(|insert\(|update\(/i);
  assert.doesNotMatch(read("lib/bill-row.ts"), /from "@\//, "pure: relative imports only");
});

// No link's words are only a bill number. The pages are read as source: a link whose only child is a bill-label value.
function tsxFiles(dir, out = []) {
  for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) tsxFiles(p, out); else if (p.endsWith(".tsx")) out.push(p); }
  return out;
}
test("no link on the site is a bare bill number", () => {
  const root = new URL("../", import.meta.url).pathname, bad = [];
  const BARE_CHILD = />\s*\{(?:[A-Za-z0-9_.!?]*(?:[bB]illLabel|identifier|documentLabel)|billLabel\([^)]*\)|numberFromBillId\([^)]*\)|[a-z]\.label)\}\s*<\/(?:Link|a)>/;
  for (const dir of ["app", "components"]) for (const f of tsxFiles(join(root, dir))) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (!BARE_CHILD.test(line)) return;
      // Links whose label is not a bill: navigation, sources, share-page links, follow settings.
      if (/public-shell|follow-status|window-block|bill-text\.tsx|share\/card\/page|texas\/summary\.tsx/.test(f) || /sources\.map|p\.sources/.test(line)) return;
      bad.push(`${f.replace(root, "")}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
  assert.doesNotMatch(read("components/home/legislator-cards.tsx"), /\{v\.billLabel\}<\/Link>/);
  assert.doesNotMatch(read("components/home/coming-up.tsx"), /\{b\.billLabel\}<\/Link>/);
  assert.match(read("components/home/coming-up.tsx"), /\{WHAT_THIS_BILL_DOES\}/);
  assert.match(read("components/home/district-compare.tsx"), /\{WHAT_THIS_BILL_DOES\}/);
});

test("the coverage count is a read-only probe section", () => {
  const cov = read("lib/analysis/vote-list-coverage.ts");
  assert.match(cov, /RECENT_VOTE_MS/); assert.match(cov, /90 \* 86_400_000/);
  assert.doesNotMatch(cov, /openai|insert\(|update\(|delete\(/i);
  assert.match(read("app/api/automation/health/route.ts"), /voteRows: await import\("@\/lib\/analysis\/vote-list-coverage"\)/);
});
