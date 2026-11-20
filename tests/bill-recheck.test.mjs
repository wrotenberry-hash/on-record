// A bill the site already holds must hear about its later actions (20 Nov 2026). Before this, a bill's latest action
// was read once; a chamber passing it with no recorded vote never reached the site, so its page and the briefing went
// on saying where it had been (H.R. 2478: passed by the Senate by unanimous consent on 18 November, still shown as
// "The Senate has it now" two days later).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("each update re-reads the latest action of held bills that are still alive, longest-unchecked first", () => {
  const s = read("lib/federal/ingest.ts");
  assert.match(s, /const FINAL_STAGES = \["law", "vetoed", "failed"\] as const;/);
  assert.match(s, /const RECHECK_PER_RUN = 120, RECHECK_AFTER_MS = 10 \* 3600_000;/);
  assert.match(s, /or\(isNull\(officialBillDepth\.stage\), notInArray\(officialBillDepth\.stage, \[\.\.\.FINAL_STAGES\]\)\)/, "a bill with no stage read yet is checked too");
  assert.match(s, /\.orderBy\(asc\(officialBills\.retrievedAt\)\)\.limit\(RECHECK_PER_RUN\)/);
  assert.match(s, /lt\(officialBills\.retrievedAt, Date\.now\(\) - RECHECK_AFTER_MS\)/, "a bill checked in the last ten hours is not asked about again");
});

test("a changed action is stored, which makes the stage step read the bill again; an unchanged one only notes the check", () => {
  const s = read("lib/federal/ingest.ts"), d = read("lib/federal/depth.ts");
  assert.match(s, /const changed = !!detail\.latestActionAt && \(detail\.latestActionAt !== b\.latestActionAt \|\| \(detail\.latestActionText \?\? ""\) !== \(b\.latestActionText \?\? ""\)\);/);
  assert.match(s, /set\(\{ retrievedAt: Date\.now\(\), \.\.\.\(changed \? \{ latestActionAt: detail\.latestActionAt, latestActionText: detail\.latestActionText \} : \{\}\) \}\)/);
  // The stage step picks up any bill whose stored action date differs from the one its stage was read for.
  assert.match(d, /coalesce\(\$\{officialBillDepth\.latestActionAt\}, ''\) <> coalesce\(\$\{officialBills\.latestActionAt\}, ''\)/);
  // The bills step runs before the stage step, so a change found in a run is acted on in the same run.
  assert.ok(s.indexOf('await step("bills"') > 0 && s.indexOf('await step("bills"') < s.indexOf('await step("depth"'));
});

test("it stops at the source's rate limit and at the run's deadline, and reports what it did", () => {
  const s = read("lib/federal/ingest.ts");
  assert.match(s, /if \(answers\.some\(a => a\.res\.status === 429\)\) break;/);
  assert.match(s, /for \(let i = 0; i < alive\.length; i \+= 6\) \{\n\s+if \(Date\.now\(\) > deadline - 5000\) break;/);
  assert.match(s, /return \{ ok: true, listed, completed, categorized, rechecked, moved \};/);
});
