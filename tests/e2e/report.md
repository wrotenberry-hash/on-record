# Usability suite report

Run 2026-11-18T15:09:05.355Z · development server (next dev) · phone 390×844 · CPU slowed 4×.
Local server and local database copy: network time is not included in any number here. Written by `npm run e2e`; overwritten on every run.

**Tasks: 2 passed, 1 failed, 0 blocked, 0 need keys.**

## Tasks

Taps are taps on links and buttons from the home page; typing is not a tap. Seconds are scripted (no reading time).

| # | Task | Target | Taps | Seconds | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| voice-vote | Vote Unsure on a bill, see the promise, and see the totals for my nation, state and district | ≤ 2 taps, ≤ 30 s | 2 | 3.8 | pass | the promise; Unsure saved; totals for the nation, Texas and TX-37, each saying there are not enough voters yet; “Not a scientific poll.” |
| voice-texas | Vote on a Texas bill: the same box, with totals for Texas and my state districts | ≤ 1 taps, ≤ 30 s | 2 | 5.1 | **fail** | 2 taps, target 1; Support saved on a Texas bill; totals for Texas, state senate district 14 and state house district 49; no national total |
| voice-outside | A reader outside Texas opens a Texas bill: who can weigh in, the totals, and no vote buttons | ≤ 1 taps, ≤ 30 s | 1 | 2.1 | pass | an Oklahoma reader sees “People who live in Texas can weigh in on this bill”, no vote buttons, the totals and the rest of the bill |

## How to rerun

```
npm run e2e                 # everything, on a server the runner starts
npm run e2e -- --only 4,13  # some tasks
npm run e2e -- --prod       # build first, for real speed numbers
```

Screenshots: /tmp/on-record-e2e
