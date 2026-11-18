# Usability suite report

Run 2026-11-18T15:16:52.175Z · development server (next dev) · phone 390×844 · CPU slowed 4×.
Local server and local database copy: network time is not included in any number here. Written by `npm run e2e`; overwritten on every run.

**Tasks: 3 passed, 0 failed, 0 blocked, 0 need keys.**

## Tasks

Taps are taps on links and buttons from the home page; typing is not a tap. Seconds are scripted (no reading time).

| # | Task | Target | Taps | Seconds | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | How my senator voted on the latest bill | ≤ 2 taps, ≤ 30 s | 0 | 0.3 | pass | on the home page, no taps |
| 5 | Compare two members | ≤ 3 taps, ≤ 30 s | 2 | 2 | pass | John Cornyn and Ted Cruz |
| voice-earlier | A returning reader is asked once whether to count the answers they gave before | ≤ 1 taps, ≤ 30 s | 1 | 3.9 | pass | asked once on the home page; “keep them private” leaves the answer uncounted, still shown to the reader, and the question does not come back |

## How to rerun

```
npm run e2e                 # everything, on a server the runner starts
npm run e2e -- --only 4,13  # some tasks
npm run e2e -- --prod       # build first, for real speed numbers
```

Screenshots: /tmp/on-record-e2e
