// Procedural votes (owner, 20 Nov 2026): "On every vote list, collapse resolutions that only set debate rules into one
// line: 'Procedural votes (N)', expandable. Give them a single standard explanation written once and approved by me …
// No per-bill AI call." The rule is lib/procedural.ts; the pages are checked by reading their source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDebateRule, PROCEDURAL_EXPLANATION, proceduralLabel, shortPosition, splitProcedural, takeWithProcedural } from "../lib/procedural.ts";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("one label and one explanation, in the owner's words", () => {
  assert.equal(proceduralLabel(4), "Procedural votes (4)");
  assert.equal(PROCEDURAL_EXPLANATION, "A vote on the rules for debating another bill, not on the bill itself.");
});

test("a debate rule is a House resolution whose title is a rule's title", () => {
  const rule = "Providing for consideration of the bill (H.R. 2102) to amend title 10, United States Code, and for other purposes";
  assert.equal(isDebateRule({ billId: "119-hres-1247", title: rule }), true);
  assert.equal(isDebateRule({ billType: "hres", title: "Providing for consideration of the bills H.R. 9576 and H.R. 10326" }), true);
  assert.equal(isDebateRule({ billId: "119-hres-9", title: "Providing for further consideration of the bill (H.R. 1)" }), true);
  assert.equal(isDebateRule({ billId: "119-hres-8", title: "Relating to consideration of the Senate amendment to the bill (H.R. 5334)" }), true);
  assert.equal(isDebateRule({ billId: "119-hres-7", title: "Waiving a requirement of clause 6(a) of rule XIII with respect to consideration of certain resolutions" }), true);
});

test("everything else stays a row of its own", () => {
  // A resolution that does something itself.
  assert.equal(isDebateRule({ billId: "119-hres-1655", title: "Impeaching Peter Brian Hegseth, Secretary of Defense, for high crimes and misdemeanors" }), false);
  assert.equal(isDebateRule({ billId: "119-hres-1490", title: "Providing for the condemnation and denouncement of socialism in all its forms" }), false);
  // A procedural step on a real bill is about that bill: it stays with the bill's own row.
  assert.equal(isDebateRule({ billId: "119-hr-498", title: "Do No Harm in Medicaid Act" }), false);
  assert.equal(isDebateRule({ billId: "119-hr-2102", title: "Providing for consideration of something" }), false, "the type must be a House resolution");
  assert.equal(isDebateRule({ billId: "119-sres-852", title: "Providing for consideration of a matter" }), false);
  assert.equal(isDebateRule({ billId: null, title: null }), false);
});

test("a list keeps its order; the rule votes are taken out into their own group", () => {
  const rows = ["a", "R1", "b", "R2", "c"], isRule = x => x.startsWith("R");
  assert.deepEqual(splitProcedural(rows, isRule), { main: ["a", "b", "c"], procedural: ["R1", "R2"] });
  assert.deepEqual(splitProcedural([], isRule), { main: [], procedural: [] });
});

test("“the ten latest” is ten votes a reader can open, plus the rule votes that fall among them", () => {
  const isRule = x => x.startsWith("R");
  assert.deepEqual(takeWithProcedural(["a", "R1", "b", "R2", "c", "R3", "d"], 3, isRule), { main: ["a", "b", "c"], procedural: ["R1", "R2"] }, "R3 comes after the third vote: not counted");
  assert.deepEqual(takeWithProcedural(["R1", "a"], 5, isRule), { main: ["a"], procedural: ["R1"] });
});

test("how a member voted, in a few words", () => {
  assert.equal(shortPosition("Yea"), "Voted Yes"); assert.equal(shortPosition("Nay"), "Voted No"); assert.equal(shortPosition("Present"), "Voted Present");
  assert.equal(shortPosition("Not Voting"), "Did not vote"); assert.equal(shortPosition("Paired"), "Recorded as “Paired”");
});

test("the collapsed line: closed by default, one explanation, no summary and no promise of one", () => {
  const g = read("components/bills/procedural-group.tsx");
  assert.match(g, /if \(!votes\.length\) return null;/, "no group, no line");
  assert.match(g, /<details>\s*<summary><span className="proc-label">\{proceduralLabel\(votes\.length\)\}<\/span><\/summary>/, "closed until tapped");
  assert.doesNotMatch(g, /<details open/);
  assert.match(g, /<p className="proc-explain">\{PROCEDURAL_EXPLANATION\}<\/p>/);
  assert.doesNotMatch(g, /EXPLANATION_COMING|WHAT_THIS_BILL_DOES|AnalysisBadge/);
  assert.match(read("components/bills/bill-row.css"), /\.proc-group summary\{[^}]*min-height:48px/, "a thumb-sized target");
  assert.doesNotMatch(read("lib/procedural.ts"), /^import /m, "pure: no model, no database");
});

test("every vote list collapses them", () => {
  const row = read("components/federal/vote-row.tsx");
  assert.match(row, /const \{ main, procedural \} = take \? takeWithProcedural\(votes, take, isRuleVote\) : splitProcedural\(votes, isRuleVote\);/);
  assert.match(row, /<ProceduralGroup votes=\{procedural\.map\(proceduralFromVote\)\} \/>/);
  const member = read("app/politicians/[id]/page.tsx");
  assert.match(member, /<VoteList votes=\{votes\} take=\{10\} memberId=\{p\.id\} \/>/, "latest votes");
  assert.match(member, /<VoteList votes=\{g\.votes\} \/>/, "votes by issue");
  assert.match(member, /<VoteList votes=\{unsorted\} \/>/);
  assert.match(member, /votes\.find\(v => !!v\.billId && !isRuleVote\(v\)\)/, "the latest vote on a bill is never a debate rule");
  assert.match(member, /<ProceduralGroup votes=\{rankSplit\.procedural\.map/, "votes against most of their own party");
  assert.match(read("app/following/page.tsx"), /<VoteList votes=\{votes\} take=\{5\} \/>/);
  assert.match(read("components/bills/member-vote-row.tsx"), /<ProceduralGroup votes=\{procedural\.map/);
  for (const p of ["components/home/personal.tsx", "components/home/since-panel.tsx", "app/recap/page.tsx"]) assert.match(read(p), /<MemberVoteRows /, p);
  assert.match(read("app/compare/page.tsx"), /<ProceduralGroup votes=\{shared\.procedural\.map/);
  // The cards never showed them: only a vote on the bill itself counts there (lib/flow/votes.ts).
  assert.match(read("lib/flow/votes.ts"), /providing for \(the \)\?consideration of/);
});

test("older bills wait: a first summary is written only for a bill voted on in the last 90 days", () => {
  const g = read("lib/analysis/generate.ts");
  assert.match(g, /freshWindowDays: num\(process\.env\.ANALYSIS_FRESH_WINDOW_DAYS, 90\)/);
  const report = read("lib/analysis/failure-report.ts");
  assert.doesNotMatch(report, /openai|insert\(|update\(|delete\(/i, "the failure report only reads");
  assert.match(read("app/api/automation/health/route.ts"), /summaryFailures: wants\("summaryFailures"\)/, "asked for by name only");
});
