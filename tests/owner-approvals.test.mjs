// A summary the owner told Claude to approve for him (owner, 20 Nov 2026: "Approve number 3", H.R. 9576).
// Claude holds no editor key, so the decision is written down with the owner's words and applied by the scheduled
// update. It may do only what the editor's Approve button does, only for a listed bill, and only to undo the
// weekly re-check's mistaken takedown.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OWNER_APPROVED, ownerApprovedIds } from "../lib/analysis/owner-approvals.ts";
import { READER_HOLDS } from "../lib/analysis/reader-holds.ts";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("only what the owner approved is listed, with his words, and nothing hidden after a reading is on the list", () => {
  assert.deepEqual(ownerApprovedIds(), ["119-hr-9576"]);
  assert.match(OWNER_APPROVED["119-hr-9576"], /^Owner, 20 Nov 2026: “Approve number 3”/);
  for (const id of ownerApprovedIds()) assert.equal(READER_HOLDS[id], undefined, `${id} is not a summary hidden after a reading`);
});

test("applying it does what the Approve button does, and only to undo the re-check's mistaken takedown", () => {
  const s = read("lib/analysis/owner-approvals-store.ts");
  assert.match(s, /for \(const billId of ownerApprovedIds\(\)\)/, "listed bills only");
  assert.match(s, /if \(s\.status === "visible"\) \{[^}]*"already on show"/, "once applied, it does nothing");
  assert.match(s, /if \(s\.status !== "held"\)/, "a rejected summary is never brought back");
  assert.match(s, /if \(READER_HOLDS\[billId\]\)/);
  assert.match(s, /last\.action !== "held" \|\| !judgedByWrongRules\(last\.at, last\.promptVersion\)/, "only a hold made by the wrong rules is undone");
  // The same two writes as app/editor/analysis/actions.ts, and no others.
  assert.match(s, /db\.update\(analysisReviewQueue\)\.set\(\{ status: "approved", note, reviewerKey: "owner-instruction", decidedAt: now \}\)/);
  assert.match(s, /db\.update\(analysisBillSummaries\)\.set\(\{ status: "visible", reviewedAt: now \}\)\.where\(and\(eq\(analysisBillSummaries\.id, s\.id\), eq\(analysisBillSummaries\.status, "held"\)\)\)/);
  assert.equal((s.match(/db\.update\(/g) ?? []).length, 2); assert.doesNotMatch(s, /\.delete\(|\.insert\(/);
  const button = read("app/editor/analysis/actions.ts");
  assert.match(button, /set\(\{ status: decision === "approved" \? "visible" : "rejected", reviewedAt: now \}\)/);
  // It runs with the scheduled update, and a failure there never breaks the run.
  assert.match(read("app/api/automation/tick/route.ts"), /import\("@\/lib\/analysis\/owner-approvals-store"\)\.then\(m => m\.applyOwnerApprovals\(\)\)\.catch\(\(\) => null\)/);
});
