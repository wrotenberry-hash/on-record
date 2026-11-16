# Regression tests for bugs fixed (Round F)

Every bug fixed gets a test that would have caught it. Unit tests run with `npm test`
(no database); bugs that live in a database query are covered by a scripted check
against a local build, named here.

| Date | Bug | Covered by |
| --- | --- | --- |
| 16 Nov | "Since you last visited" showed the visit before last on the first page of a visit | `tests/dashboard.test.mjs` — since your last visit (regression) |
| 16 Nov | Link-preview cards (1200×630) overlapped when a card had two blocks | `tests/dashboard.test.mjs` — cards: link previews show one block |
| 16 Nov | Share captions repeated the bill number ("S. 5271. S. 5271: …") | `tests/dashboard.test.mjs` — captions do not repeat the title |
| 16 Nov | A failed passage vote could be mistaken for a "quiet kill" | `tests/dashboard.test.mjs` — quiet kill |
| 16 Nov | Usage totals cut at the top 80 rows, hiding small counts such as shares | Scripted: `rG` run shows shares on Editor → Retention and sharing (query now filters by event name) |
| 16 Nov | A route-wide loading page made missing pages answer 200 instead of 404 | Scripted: `emptyE` run checks 404 on unknown bill, member, card and Texas bill |
| 16 Nov | Office-email preview read the clock during render (lint error) | `npm run lint` (react-hooks/purity) |
| 16 Nov | Seat counts included the DC and territorial delegates | Query excludes DC, PR, GU, VI, AS, MP; scripted dashboard run (Round I) |
| 16 Nov | A cleared integrity flag could quarantine the same answers again | `tests/verify.test.mjs` anomaly rules; scripted Round J run |
| 16 Nov | Independent party colour failed the chart-colour check | Palette validator run (Round I) |
