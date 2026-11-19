# Usability suite report

Run 2026-11-19T22:03:30.800Z · development server (next dev) · phone 390×844 · CPU slowed 4×.
Local server and local database copy: network time is not included in any number here. Written by `npm run e2e`; overwritten on every run.

**Tasks: 2 passed, 0 failed, 0 blocked, 0 need keys.**

## Tasks

Taps are taps on links and buttons from the home page; typing is not a tap. Seconds are scripted (no reading time).

| # | Task | Target | Taps | Seconds | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | Vote alerts are on from the start, and I can turn them off | ≤ 3 taps, ≤ 30 s | 3 + 1 swipe | 5.8 | pass | Account is at the far end of the menu (1 swipe) |
| 15 | Verify and cast a first counted vote | ≤ 90 s | 8 | 16.7 | pass | local stand-ins for the text message, bot check and district lookup; by hand this needs the Turnstile and Twilio keys |

### Small tap targets

Tapped during a task and under 24 px in one direction (WCAG 2.2 asks for 24; the house rule for buttons is 44):

- Task 7: “When a legislator I follow votes on a bill” is 358×23 px

## How to rerun

```
npm run e2e                 # everything, on a server the runner starts
npm run e2e -- --only 4,13  # some tasks
npm run e2e -- --prod       # build first, for real speed numbers
```

Screenshots: /tmp/on-record-e2e
