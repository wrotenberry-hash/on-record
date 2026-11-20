/**
 * The words beside each side of a "what would change" row. They follow the bill's status (20 Nov 2026: a law signed in
 * July still read "If this passes", and a check marked the page vague for it). Pure, so node's test runner loads it.
 *
 * - a bill still before Congress: "Today" / "If this passes";
 * - a bill that acts on a rule that itself changed things: "Before the new rule" / "Now, under the new rule" / "If this passes";
 * - a bill that has become law: "Before this law" / "Now, under this law" (and, with three states, the oldest is "Earlier").
 */
export type RowLabels = { heading: string; before: string; today: string; ifPassed: string };
export function rowLabels(o: { enacted: boolean; threeStates: boolean }): RowLabels {
  if (o.enacted) return { heading: "What this law changed", before: "Earlier", today: "Before this law", ifPassed: "Now, under this law" };
  return o.threeStates ? { heading: "What the new rule changed, and what this bill would do", before: "Before the new rule", today: "Now, under the new rule", ifPassed: "If this passes" }
    : { heading: "What would change", before: "Before the new rule", today: "Today", ifPassed: "If this passes" };
}
