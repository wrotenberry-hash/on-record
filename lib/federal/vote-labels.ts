/**
 * Plain-language explanations of the recurring roll-call questions, for readers
 * who do not know what "On Cloture on the Motion to Proceed" means. Fixed text,
 * written once from the congressional glossaries and reviewed by a person; it is
 * not model-written, so it carries no Analysis badge. Unknown wording falls back
 * to the official text alone (nothing is guessed). Pure; tested in
 * tests/federal.test.mjs.
 */
export const GLOSSARY_URL = "https://www.congress.gov/help/legislative-glossary";

const RULES: Array<[RegExp, string]> = [
  [/^On Motion to Suspend the Rules and (Concur|Agree) in the Senate Amendments?/i, "A fast-track vote, needing two-thirds of those voting, to accept the Senate's changes to the bill."],
  [/^On Motion to Suspend the Rules and (Pass|Agree)/i, "A fast-track vote to pass it with limited debate and no amendments. It needs two-thirds of those voting."],
  [/^On Motion to Concur in the Senate Amendments?/i, "A vote to accept the Senate's changes to the bill."],
  [/^On (Agreeing to )?the Conference Report/i, "The final vote on the compromise version worked out by House and Senate negotiators."],
  [/^On (Overriding the Veto|Passage, Objections of the President (to the Contrary )?Notwithstanding)/i, "A vote to override the President's veto. It needs two-thirds of those voting."],
  [/^On Cloture on the Motion to Proceed/i, "A vote to end debate on whether to take the bill up. It usually needs 60 senators."],
  [/^On the Cloture Motion/i, "A vote to end debate and move toward a final vote. It usually needs 60 senators; for nominations, a simple majority."],
  [/^On the Motion to Proceed/i, "A vote on whether the Senate takes the bill up for debate."],
  [/^On the Nomination/i, "A vote to confirm a person the President nominated."],
  [/^On (Agreeing to )?the Amendment/i, "A vote on a proposed change to the bill."],
  [/^On Ordering the Previous Question/i, "A procedural vote to end debate on a resolution, usually the rule that sets how a bill will be debated, and vote on it as written."],
  [/^On (the )?Motion to Table/i, "A vote to set the matter aside, which usually ends it."],
  [/^On Motion to Recommit/i, "A vote to send the bill back to committee, usually the minority party's last attempt to change it."],
  [/^On (the )?Motion to Refer/i, "A vote to send the matter to a committee."],
  [/^On (the )?Motion to Discharge/i, "A vote to take the matter away from a committee and bring it to the floor."],
  [/^On Approving the Journal/i, "A routine vote to approve the record of the previous day's proceedings."],
  [/^On Motion to Adjourn/i, "A vote to end the day's session."],
  [/^On Agreeing to the Resolution/i, "A vote to adopt the resolution."],
  [/^On (the )?(Joint|Concurrent) Resolution/i, "The vote to pass the resolution in this chamber."],
  [/^On Passage( of the Bill)?$/i, "The vote to pass the bill in this chamber."],
];

/** The plain explanation of a roll-call question, or null when the wording is not in the glossary. */
export function explainVote(question: string): string | null {
  const q = question.trim();
  for (const [re, text] of RULES) if (re.test(q)) return text;
  return null;
}

/** "passed", "failed" or null, from the official result wording. */
export function outcomeOf(result: string | null | undefined): "passed" | "failed" | null {
  if (!result) return null;
  if (/\b(fail|failed|rejected|not (agreed|invoked|sustained|confirmed))\b/i.test(result)) return "failed";
  if (/\b(pass|passed|agreed|confirmed|invoked|sustained|adopted)\b/i.test(result)) return "passed";
  return null;
}
