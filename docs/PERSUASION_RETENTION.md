# Persuasion and retention round

Owner instruction, 18 Nov 2026. Verbatim, as received.

> PERSUASION AND RETENTION ROUND — based on research into why people use, return to, and share civic tools. Applies across the site; does not replace the Constituent Voice or Contact prompts.
>
> 1. First screen: address entry leading to "Your five legislators" (names, photos, party, last three votes in plain English). No account needed to see it. Then one tap to follow all of them.
> 2. Defaults: new users follow their own legislators with vote alerts on. Issue follows are a second step (pick up to three of the 14 categories).
> 3. Weekly email, the core habit: one send per week, readable in two minutes. Order: how your legislators voted this week, one bill in your followed issues that moved, one thing coming next week, then "You're caught up." No more than five items.
> 4. Close the loop: whenever a bill a user voted on or contacted a legislator about has a floor vote, passes, fails or is signed, notify them with the result, how each of their legislators voted, and whether that matched the district's verified total.
> 5. "Your record" page: bills the user voted on, outcomes, and a plain count of how often each of their legislators voted the way the user did. Label it as the user's own comparison, never a grade or score of the legislator.
> 6. Finite design: every list ends. Add "You're caught up" states on the home screen and legislature dashboards. No infinite scroll.
> 7. Tone rules for all generated text: calm, specific, no outrage wording, no adjectives about legislators. Add this to the average-reader test.
> 8. No comment threads, replies or debate features anywhere. Confirm none exist.
> 9. Aggregate social proof only: show counts of verified voters by district once the 25-voter threshold is met. Never show any individual's vote or participation.
> 10. Share cards: one sourced fact per card (a vote, a bill change, or a district total), the user's stance if they choose to add it, and the source line. Shared links open the bill page without sign-in.
> 11. Issue entry pages: each of the 14 categories gets a public landing page ("What Congress did on health care this month") written for someone arriving from search or social with no context.
> 12. Measure: week-two return rate, weekly email open rate, share rate per bill view, and percent of voters who return after a loop-closing notification. Add these to the "What's next" page.
>
> Hard stops unchanged. Report what already exists before building.

## What already existed, what was built, and what is still open

The inventory was reported to the owner before building (18 Nov). What was built, the defaults chosen where a point met a
standing rule, what is not proven, and the owner's open decisions are in `docs/DECISIONS.md`, O-160 to O-164.

| Point | Where it lives |
|---|---|
| 1, 2, 6 (home) | `components/home/*`, `lib/flow/cards.ts`, `lib/flow/card-store.ts`, `lib/follow-defaults.ts`, `lib/photos.ts`, `app/api/photo/[id]/route.ts` |
| 3, 4 | `lib/loop/*` (weekly email, notices, vote alerts, the one-time marks), `components/loop/notices.tsx`, `app/notices`, `app/o/[mark]`, `app/n/[mark]` |
| 5, 9, 6 (dashboards) | `app/voice/page.tsx`, `lib/record/store.ts`, `lib/voice-rules.ts`, `lib/agreement.ts`, `lib/constituent/proof.ts`, `lib/dashboard-end.ts` |
| 7 | `lib/analysis/tone.ts` (written check, writer prompts, reader test) |
| 8 | `tests/week-two.test.mjs` (guard) |
| 10, 11 | `lib/card-content.ts`, `lib/entry/*`, `components/share/*`, `app/issues/[slug]/page.tsx`, `lib/public-access.ts` (`SHARED_PAGES_PUBLIC`, off) |
| 12 | `lib/week-two.ts`, `lib/loop/marks.ts`, `lib/entry/store.ts`, `lib/habit-lines.ts`, Editor → What's next |

Switches, all off in production: `SHARED_PAGES_PUBLIC` (shared bill pages, shared card pictures, issue pages without sign-in);
`READER_FROM_EMAIL` unset (no automatic email to readers).
