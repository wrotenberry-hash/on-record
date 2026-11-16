import test from "node:test";
import assert from "node:assert/strict";
import { gerund, questionFromHeadline, stanceQuestion, FALLBACK_QUESTION } from "../lib/federal/stance-question.ts";

// Owner, 16 Nov 2026: ask with the plain headline, never the official title.
test("a 'Would …' headline becomes the question", () => {
  assert.equal(questionFromHeadline("Would block the 2027 ACA marketplace rule."), "Do you support blocking the 2027 ACA marketplace rule?");
  assert.equal(questionFromHeadline("Would require photo ID for in-person federal voting"), "Do you support requiring photo ID for in-person federal voting?");
  assert.equal(questionFromHeadline("Would let certain military retirees receive disability compensation and retired pay together."),
    "Do you support letting certain military retirees receive disability compensation and retired pay together?");
  assert.equal(questionFromHeadline("Would restrict stock trades by Members of Congress and require photo ID for federal voting."),
    "Do you support restricting stock trades by Members of Congress and requiring photo ID for federal voting?");
  assert.equal(questionFromHeadline("Would also stop the rule."), "Do you support stopping the rule?");
});

test("gerunds follow the spelling rules", () => {
  assert.deepEqual(["block", "require", "stop", "bar", "let", "tie", "free", "allow", "permit", "make"].map(gerund),
    ["blocking", "requiring", "stopping", "barring", "letting", "tying", "freeing", "allowing", "permitting", "making"]);
});

test("the summary's own question wins; anything else falls back to a neutral question, never the official title", () => {
  assert.deepEqual(stanceQuestion({ question: "Do you support blocking the 2027 ACA marketplace rule?", headline: "Would block something else." }),
    { question: "Do you support blocking the 2027 ACA marketplace rule?", plain: true });
  assert.deepEqual(stanceQuestion({ headline: "Would block the rule." }), { question: "Do you support blocking the rule?", plain: true });
  for (const headline of [null, "", "A joint resolution providing for congressional disapproval under chapter 8 of title 5", "Would"]) {
    assert.deepEqual(stanceQuestion({ headline }), { question: FALLBACK_QUESTION, plain: false });
  }
  assert.deepEqual(stanceQuestion({ question: "Support it?", headline: null }), { question: FALLBACK_QUESTION, plain: false }, "a malformed question is ignored");
});
