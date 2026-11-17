# Usability suite report

Run 2026-11-17T13:25:01.244Z · server at http://localhost:3106 · phone 390×844 · CPU slowed 4×.
Local server and local database copy: network time is not included in any number here. Written by `npm run e2e`; overwritten on every run.

**Tasks: 9 passed, 1 failed, 2 blocked, 0 need keys.**

## Tasks

Taps are taps on links and buttons from the home page; typing is not a tap. Seconds are scripted (no reading time).

| # | Task | Target | Taps | Seconds | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Find my legislators | ≤ 2 taps, ≤ 30 s | 2 | 2.8 | pass | 3 legislators shown after the ZIP, from the welcome screen (typing the ZIP is not a tap) |
| 2 | How my senator voted on the latest bill | ≤ 2 taps, ≤ 30 s | 0 | 0.4 | pass | on the home page, no taps |
| 3 | Understand what a bill does | ≤ 2 taps, ≤ 30 s | – | 1.4 | **blocked** | The bill page has no plain-language summary a reader may see. Readers get summaries only once the owner opens the gate (PUBLIC_MIN_PROMPT in lib/analysis/publish-gate.ts is null), so this cannot pass yet. |
| 4 | Follow an issue | ≤ 3 taps, ≤ 30 s | 2 | 8.2 | pass | followed from the picker on the home page; kept after a reload |
| 5 | Compare two members | ≤ 3 taps, ≤ 30 s | 2 | 2.4 | pass | John Cornyn and Ted Cruz |
| 13 | Say whether I support a bill | ≤ 3 taps, ≤ 30 s | 2 | 12.7 | pass | through the bill page (no scheduled bill on the home page could be answered there: their records are not loaded in the local copy); answer saved and kept |
| contact | Contact my legislator about a bill | ≤ 2 taps, ≤ 30 s | – | 3.4 | **blocked** | No official phone numbers or contact forms are loaded in this local database (legislator_contacts is empty; they arrive with the scheduled official-records update), so the phone and form links cannot be checked here. The message and the copy button were present. |
| flow | The 60-second flow: ZIP only | ≤ 3 taps, ≤ 60 s | 0 | – | **fail** | tests/e2e/flow.mjs --only zip did not finish (exit 1). } Node.js v22.22.0 |
| fb-2 | Feedback prompt: not asked on the second day | ≤ 30 s | 0 | 19.3 | pass | second day: not asked; the day was counted once |
| fb-3 | Feedback prompt: asked on the third day, answer stored | ≤ 1 taps, ≤ 30 s | 1 | 5.7 | pass | asked once on day 3, answer stored (audience “trial”, no invite or page kept), not asked again |
| fb-no | Feedback prompt: “Not now” ends it | ≤ 1 taps, ≤ 30 s | 1 | 5.5 | pass | dismissed, nothing stored, not asked again |
| wrong | Something wrong? Tell us (from any page) | ≤ 2 taps, ≤ 30 s | 2 | 8.5 | pass | report filed with the page it was about; also works with JavaScript off |

### Small tap targets

Tapped during a task and under 24 px in one direction (WCAG 2.2 asks for 24; the house rule for buttons is 44):

- Task 5: “Compare with the other senator” is 146×16 px

## How to rerun

```
npm run e2e                 # everything, on a server the runner starts
npm run e2e -- --only 4,13  # some tasks
npm run e2e -- --prod       # build first, for real speed numbers
```

Screenshots: /tmp/claude-0/-home-user-gravel/cfa1644a-f850-5783-9b0f-e12139451812/scratchpad/e2e/try
