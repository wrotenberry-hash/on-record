# Usability suite report

Run 2026-11-17T20:14:55.431Z · production build (next build + next start) · phone 390×844 · CPU slowed 4×.
Local server and local database copy: network time is not included in any number here. Written by `npm run e2e`; overwritten on every run.

**Tasks: 28 passed, 0 failed, 0 blocked, 0 need keys.** **Accessibility: 47 of 47 pages with 0 violations.** **Speed: 41 of 41 pages interactive under 2 s.**

## Tasks

Taps are taps on links and buttons from the home page; typing is not a tap. Seconds are scripted (no reading time).

| # | Task | Target | Taps | Seconds | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Find my legislators | ≤ 2 taps, ≤ 30 s | 2 | 0.9 | pass | 3 legislators shown after the ZIP, from the welcome screen (typing the ZIP is not a tap) |
| 2 | How my senator voted on the latest bill | ≤ 2 taps, ≤ 30 s | 0 | 0.2 | pass | on the home page, no taps |
| 3 | Understand what a bill does | ≤ 2 taps, ≤ 30 s | 1 | 0.9 | pass | plain-language summary shown (stand-in summary in the test copy) |
| 4 | Follow an issue | ≤ 3 taps, ≤ 30 s | 2 | 5.8 | pass | followed from the picker on the home page; kept after a reload |
| 5 | Compare two members | ≤ 3 taps, ≤ 30 s | 2 | 1.1 | pass | John Cornyn and Ted Cruz |
| 6 | Find a bill by keyword | ≤ 3 taps, ≤ 30 s | 2 | 1 | pass | typing the words is not a tap |
| 7 | Turn on alerts | ≤ 3 taps, ≤ 30 s | 3 + 1 swipe | 3.7 | pass | Account is at the far end of the menu (1 swipe) |
| 8 | Texas Legislature this week | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.6 | pass | Texas is off-screen in the menu (1 swipe) |
| 9 | What changed since my last visit | ≤ 3 taps, ≤ 30 s | 0 | 0.2 | pass | 1 changes listed, no taps |
| 10 | Bills that became law this Congress | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.6 | pass | Dashboard is off-screen in the menu (1 swipe) |
| 11 | Who controls the Texas Senate, who runs it | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.6 | pass | Texas is off-screen in the menu (1 swipe) |
| 12 | Committee that stalls the most bills | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.6 | pass | Dashboard is off-screen in the menu (1 swipe) |
| 13 | Say whether I support a bill | ≤ 3 taps, ≤ 30 s | 1 | 3.2 | pass | one tap on the home page; answer saved and kept |
| 14 | My district vs my legislator | ≤ 3 taps, ≤ 30 s | 1 | 0.8 | pass | district totals beside the member's vote (28 seeded test answers; real totals need the Turnstile and Twilio keys) |
| 15 | Verify and cast a first counted vote | ≤ 90 s | 7 | 12.6 | pass | local stand-ins for the text message, bot check and district lookup; by hand this needs the Turnstile and Twilio keys |
| 16 | Share a vote card to Stories | ≤ 3 taps, ≤ 30 s | 3 | 3.5 | pass | share sheet opened with on-record-vote-story.png (the phone's share sheet is a local stand-in) |
| 17 | Share a bill carousel | ≤ 3 taps, ≤ 30 s | 3 | 3.5 | pass | five slides handed to the share sheet (local stand-in) |
| 18 | Copy a link that previews correctly | ≤ 3 taps, ≤ 30 s | 3 | 4.8 | pass | short link opens the exact card; preview image 1200×630 (outside previews stay blank while the site is private) |
| contact | Contact my legislator about a bill | ≤ 2 taps, ≤ 30 s | 2 | 5.8 | pass | John Cornyn: phone link, Open the official contact form (opens in, editable message, copied |
| flow | The 60-second flow: ZIP only | ≤ 3 taps, ≤ 60 s | 2 | 3.2 | pass | 3 legislators in 2.6 s (1 tap), first answer saved at 3.2 s; typed at a person's speed |
| flow-split | The 60-second flow: a ZIP that crosses districts | ≤ 3 taps, ≤ 60 s | 3 | 3.7 | pass | 3 legislators after choosing the district; first answer at 3.7 s |
| flow-address | The 60-second flow: ZIP and street address, five legislators | ≤ 3 taps, ≤ 60 s | 2 | 5.4 | pass | 5 legislators (John Cornyn, Ted Cruz, Lloyd Doggett, Sarah Eckhardt, Gina Hinojosa); first answer at 5.4 s; the address lookup is a local stand-in for the Census service |
| flow-mistakes | The 60-second flow: a wrong ZIP or address is explained and the typing is kept |  | 0 | – | pass | no ZIP: “Enter your 5-digit ZIP code.”; wrong ZIP: “We could not find that ZIP code. Check the five digits.”; letters: “Enter your 5-digit ZIP code.”; address not found: “The Census Bureau could not place that street address. Check” |
| flow-issues | The 60-second flow: picking an issue brings its bills first |  | 0 | – | pass | after picking Health care the first line reads “House · week of Nov 16 · on your issues: Health care” |
| fb-2 | Feedback prompt: not asked on the second day | ≤ 30 s | 0 | 1.6 | pass | second day: not asked; the day was counted once |
| fb-3 | Feedback prompt: asked on the third day, answer stored | ≤ 1 taps, ≤ 30 s | 1 | 3.2 | pass | asked once on day 3, answer stored (audience “trial”, no invite or page kept), not asked again |
| fb-no | Feedback prompt: “Not now” ends it | ≤ 1 taps, ≤ 30 s | 1 | 3.2 | pass | dismissed, nothing stored, not asked again |
| wrong | Something wrong? Tell us (from any page) | ≤ 2 taps, ≤ 30 s | 2 | 1.1 | pass | report filed with the page it was about; also works with JavaScript off |

## Accessibility (axe-core, WCAG 2.1 A and AA)

axe-core 4.13.0 on every page a task landed on and on the list of reader pages (tests/e2e/pages.mjs). Zero violations are required.

| Page | Violations | What |
| --- | --- | --- |
| / | 0 |  |
| / (newcomer) | 0 |  |
| /about | 0 |  |
| /account | 0 |  |
| /account?t=Code sent to the number ending 1358. It works for 10 minutes. | 0 |  |
| /account?t=Matched to district TX-37. Your answers now count for TX-37 as well. | 0 |  |
| /account?t=Phone confirmed. You are verified as a real person. | 0 |  |
| /bills/[id] | 0 |  |
| /briefing | 0 |  |
| /coming | 0 |  |
| /compare | 0 |  |
| /compare?a&b | 0 |  |
| /corrections | 0 |  |
| /dashboard | 0 |  |
| /dashboard/texas | 0 |  |
| /following | 0 |  |
| /issues | 0 |  |
| /issues/[id] | 0 |  |
| /legislators | 0 |  |
| /login | 0 |  |
| /method | 0 |  |
| /moving | 0 |  |
| /no-such-page | 0 |  |
| /pledge | 0 |  |
| /politicians | 0 |  |
| /politicians/[id] | 0 |  |
| /privacy | 0 |  |
| /recap | 0 |  |
| /records | 0 |  |
| /report | 0 |  |
| /search | 0 |  |
| /search?q | 0 |  |
| /share/card | 0 |  |
| /share/card?t=bill | 0 |  |
| /share/card?t=carousel | 0 |  |
| /share/card?t=vote | 0 |  |
| /start | 0 |  |
| /start (newcomer) | 0 |  |
| /start?step=2 | 0 |  |
| /terms | 0 |  |
| /texas | 0 |  |
| /texas/bills/[id] | 0 |  |
| /texas/members/[id] | 0 |  |
| /transparency | 0 |  |
| /trial | 0 |  |
| /voice | 0 |  |
| /welcome | 0 |  |

## Speed

Budget: interactive in under 2 s with the CPU slowed 4×. “Interactive” is the later of domInteractive (Navigation Timing API) and the end of the last long task (50 ms or more) before the page went quiet for 1 second. Each page is loaded once to warm up and then 2 times; the slowest run is shown. JavaScript is what the page loaded, over the wire and unpacked (Resource Timing API).
Production build on a local server: real phones add network time on top.

| Page | First byte ms | domInteractive ms | Last long task ends ms | Interactive ms | JS files | JS over the wire kB | JS unpacked kB | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | 24 | 217 | 0 | 217 | 8 | 0 | 473 | pass |
| /about | 11 | 125 | 0 | 125 | 8 | 4 | 468 | pass |
| /account | 15 | 112 | 0 | 112 | 9 | 0 | 472 | pass |
| /briefing | 18 | 106 | 0 | 106 | 8 | 0 | 468 | pass |
| /coming | 18 | 106 | 0 | 106 | 8 | 0 | 468 | pass |
| /compare | 27 | 423 | 0 | 423 | 8 | 0 | 468 | pass |
| /corrections | 21 | 141 | 0 | 141 | 8 | 0 | 468 | pass |
| /dashboard | 12 | 141 | 0 | 141 | 8 | 0 | 468 | pass |
| /dashboard/texas | 21 | 192 | 0 | 192 | 8 | 0 | 468 | pass |
| /following | 13 | 95 | 0 | 95 | 8 | 5 | 469 | pass |
| /issues | 13 | 132 | 0 | 132 | 8 | 0 | 468 | pass |
| /legislators | 23 | 140 | 0 | 140 | 8 | 5 | 470 | pass |
| /login | 6 | 89 | 0 | 89 | 8 | 4 | 467 | pass |
| /method | 12 | 167 | 0 | 167 | 8 | 0 | 468 | pass |
| /moving | 22 | 133 | 0 | 133 | 8 | 5 | 469 | pass |
| /pledge | 9 | 102 | 0 | 102 | 8 | 0 | 468 | pass |
| /politicians | 57 | 264 | 0 | 264 | 8 | 0 | 468 | pass |
| /privacy | 16 | 161 | 0 | 161 | 8 | 0 | 468 | pass |
| /recap | 17 | 130 | 0 | 130 | 8 | 0 | 471 | pass |
| /records | 9 | 99 | 0 | 99 | 9 | 17 | 508 | pass |
| /report | 13 | 131 | 0 | 131 | 8 | 0 | 468 | pass |
| /search | 10 | 114 | 0 | 114 | 8 | 0 | 468 | pass |
| /share/card | 10 | 69 | 169 | 169 | 8 | 0 | 476 | pass |
| /start | 33 | 134 | 0 | 134 | 8 | 0 | 473 | pass |
| /terms | 14 | 114 | 0 | 114 | 8 | 0 | 468 | pass |
| /texas | 36 | 135 | 0 | 135 | 8 | 0 | 468 | pass |
| /transparency | 13 | 125 | 0 | 125 | 8 | 0 | 468 | pass |
| /trial | 6 | 97 | 0 | 97 | 8 | 0 | 467 | pass |
| /voice | 16 | 98 | 0 | 98 | 8 | 0 | 468 | pass |
| /welcome | 10 | 97 | 0 | 97 | 8 | 0 | 468 | pass |
| /politicians/[id] | 53 | 291 | 0 | 291 | 8 | 7 | 476 | pass |
| /bills/[id] | 47 | 121 | 199 | 199 | 8 | 8 | 478 | pass |
| /issues/[id] | 15 | 104 | 0 | 104 | 8 | 0 | 468 | pass |
| /compare?a&b | 31 | 268 | 0 | 268 | 8 | 0 | 468 | pass |
| /search?q | 22 | 100 | 0 | 100 | 8 | 0 | 468 | pass |
| /start?step=2 | 21 | 121 | 0 | 121 | 8 | 0 | 473 | pass |
| /share/card?t=vote | 15 | 146 | 0 | 146 | 8 | 0 | 476 | pass |
| /share/card?t=bill | 14 | 118 | 0 | 118 | 8 | 0 | 476 | pass |
| /texas/bills/[id] | 13 | 130 | 0 | 130 | 8 | 0 | 476 | pass |
| /texas/members/[id] | 13 | 99 | 0 | 99 | 8 | 0 | 476 | pass |
| /no-such-page | 3 | 94 | 0 | 94 | 8 | 0 | 467 | pass |

## How to rerun

```
npm run e2e                 # everything, on a server the runner starts
npm run e2e -- --only 4,13  # some tasks
npm run e2e -- --prod       # build first, for real speed numbers
```

Screenshots: /tmp/on-record-e2e
