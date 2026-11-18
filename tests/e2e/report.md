# Usability suite report

Run 2026-11-18T14:38:19.064Z · production build (next build + next start) · phone 390×844 · CPU slowed 4×.
Local server and local database copy: network time is not included in any number here. Written by `npm run e2e`; overwritten on every run.

**Tasks: 32 passed, 0 failed, 0 blocked, 0 need keys.** **Accessibility: 48 of 48 pages with 0 violations.** **Speed: 41 of 41 pages interactive under 2 s.**

## Tasks

Taps are taps on links and buttons from the home page; typing is not a tap. Seconds are scripted (no reading time).

| # | Task | Target | Taps | Seconds | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Find my legislators | ≤ 2 taps, ≤ 30 s | 2 | 0.8 | pass | 3 legislators shown after the ZIP, from the welcome screen (typing the ZIP is not a tap) |
| 2 | How my senator voted on the latest bill | ≤ 2 taps, ≤ 30 s | 0 | 0.2 | pass | on the home page, no taps |
| 3 | Understand what a bill does | ≤ 2 taps, ≤ 30 s | 1 | 0.9 | pass | plain-language summary shown (stand-in summary in the test copy) |
| 4 | Follow an issue | ≤ 3 taps, ≤ 30 s | 2 | 5.8 | pass | followed from the picker on the home page; kept after a reload |
| 5 | Compare two members | ≤ 3 taps, ≤ 30 s | 2 | 1 | pass | John Cornyn and Ted Cruz |
| 6 | Find a bill by keyword | ≤ 3 taps, ≤ 30 s | 2 | 0.8 | pass | typing the words is not a tap |
| 7 | Turn on alerts | ≤ 3 taps, ≤ 30 s | 3 + 1 swipe | 3.5 | pass | Account is at the far end of the menu (1 swipe) |
| 8 | Texas Legislature this week | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.5 | pass | Texas is off-screen in the menu (1 swipe) |
| 9 | What changed since my last visit | ≤ 3 taps, ≤ 30 s | 0 | 0.2 | pass | panel shown with its empty-state line |
| 10 | Bills that became law this Congress | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.6 | pass | Dashboard is off-screen in the menu (1 swipe) |
| 11 | Who controls the Texas Senate, who runs it | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.5 | pass | Texas is off-screen in the menu (1 swipe) |
| 12 | Committee that stalls the most bills | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.6 | pass | Dashboard is off-screen in the menu (1 swipe) |
| 13 | Say whether I support a bill | ≤ 3 taps, ≤ 30 s | 1 | 3.1 | pass | one tap on the home page; answer saved and kept |
| 14 | My district vs my legislator | ≤ 3 taps, ≤ 30 s | 1 | 0.7 | pass | district totals beside the member's vote (28 seeded test answers; real totals need the Turnstile and Twilio keys) |
| 15 | Verify and cast a first counted vote | ≤ 90 s | 8 | 13.4 | pass | local stand-ins for the text message, bot check and district lookup; by hand this needs the Turnstile and Twilio keys |
| 16 | Share a vote card to Stories | ≤ 3 taps, ≤ 30 s | 3 | 3.5 | pass | share sheet opened with constituent-vote-story.png (the phone's share sheet is a local stand-in) |
| 17 | Share a bill carousel | ≤ 3 taps, ≤ 30 s | 3 | 3.5 | pass | five slides handed to the share sheet (local stand-in) |
| 18 | Copy a link that previews correctly | ≤ 3 taps, ≤ 30 s | 3 | 4.6 | pass | short link opens the exact card; preview image 1200×630 (outside previews stay blank while the site is private) |
| contact | Contact my legislator about a bill | ≤ 2 taps, ≤ 30 s | 2 | 5.8 | pass | John Cornyn: phone link, Open the official contact form (opens in, editable message, copied |
| flow | The 60-second flow: ZIP only | ≤ 3 taps, ≤ 60 s | 2 | 2.9 | pass | 3 legislators in 2.2 s (1 tap), first answer saved at 2.9 s; typed at a person's speed |
| flow-split | The 60-second flow: a ZIP that crosses districts | ≤ 3 taps, ≤ 60 s | 3 | 3.5 | pass | 3 legislators after choosing the district; first answer at 3.5 s |
| flow-address | The 60-second flow: ZIP and street address, five legislators | ≤ 3 taps, ≤ 60 s | 2 | 4.9 | pass | 5 legislators (John Cornyn, Ted Cruz, Lloyd Doggett, Sarah Eckhardt, Gina Hinojosa); first answer at 4.9 s; the address lookup is a local stand-in for the Census service |
| flow-mistakes | The 60-second flow: a wrong ZIP or address is explained and the typing is kept |  | 0 | – | pass | no ZIP: “Enter your 5-digit ZIP code.”; wrong ZIP: “We could not find that ZIP code. Check the five digits.”; letters: “Enter your 5-digit ZIP code.”; address not found: “The Census Bureau could not place that street address. Check” |
| flow-issues | The 60-second flow: picking an issue brings its bills first |  | 0 | – | pass | after picking Health care the first line reads “House · week of Nov 16 · on your issues: Health care” |
| fb-2 | Feedback prompt: not asked on the second day | ≤ 30 s | 0 | 1.7 | pass | second day: not asked; the day was counted once |
| fb-3 | Feedback prompt: asked on the third day, answer stored | ≤ 1 taps, ≤ 30 s | 1 | 3.1 | pass | asked once on day 3, answer stored (audience “trial”, no invite or page kept), not asked again |
| fb-no | Feedback prompt: “Not now” ends it | ≤ 1 taps, ≤ 30 s | 1 | 3.2 | pass | dismissed, nothing stored, not asked again |
| wrong | Something wrong? Tell us (from any page) | ≤ 2 taps, ≤ 30 s | 2 | 1.2 | pass | report filed with the page it was about; also works with JavaScript off |
| tx-find | Texas: find my state senator and state representative from a street address | ≤ 1 taps, ≤ 30 s | 1 | 20.8 | pass | five cards: John Cornyn, Ted Cruz, Lloyd Doggett, Sarah Eckhardt, Gina Hinojosa; state senator's line: “Voted Yes to move a bill relating to a test bill with a record vote (test data) forward. It went on to a final vote, 1–1.OFFICIAL”; representative: “Voted Yes to move a bill relating to test subject 2 forward. It went on to a final vote, 3–1.OFFICIAL” |
| tx-senator-vote | Texas: see how my state senator voted on a bill with a record vote | ≤ 3 taps, ≤ 30 s | 3 | 21.5 | pass | SB 9001: “Record vote: 1 yes, 1 no (passed)”; Sarah Eckhardt listed under Yes |
| tx-summary | Texas: a bill's summary reads in the same order as a federal bill, and only once Texas summaries are released | ≤ 30 s | 0 | 0.3 | pass | not released yet: the reader sees the official record only (Status, Contact your Texas legislators about this bill, Decisions so far, …) |
| tx-voice | Texas: a bill decided by voice vote shows the label and no member position | ≤ 30 s | 0 | 0.6 | pass | bill label: “Voice vote: members' individual votes were not recorded”; member page: “Voice vote: members' individual votes were not recorded” |

## Accessibility (axe-core, WCAG 2.1 A and AA)

axe-core 4.13.0 on every page a task landed on and on the list of reader pages (tests/e2e/pages.mjs). Zero violations are required.

| Page | Violations | What |
| --- | --- | --- |
| / | 0 |  |
| / (newcomer) | 0 |  |
| /about | 0 |  |
| /account | 0 |  |
| /account?t=Code sent to the number ending 7931. It works for 10 minutes. | 0 |  |
| /account?t=Matched to TX-37, TX-SD-14, TX-HD-49. Your answers now count there as well. You can change this address once every 90 days. | 0 |  |
| /account?t=Phone confirmed. You are verified as a real person. | 0 |  |
| /account?t=You can change your home address once every 90 days. Yours can change again on February 16, 2027. | 0 |  |
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
| / | 33 | 200 | 0 | 200 | 8 | 0 | 473 | pass |
| /about | 13 | 112 | 0 | 112 | 8 | 4 | 468 | pass |
| /account | 24 | 126 | 0 | 126 | 9 | 6 | 472 | pass |
| /briefing | 14 | 124 | 0 | 124 | 8 | 0 | 468 | pass |
| /coming | 26 | 141 | 0 | 141 | 8 | 0 | 468 | pass |
| /compare | 27 | 419 | 671 | 671 | 8 | 0 | 468 | pass |
| /corrections | 13 | 135 | 0 | 135 | 8 | 0 | 468 | pass |
| /dashboard | 15 | 113 | 0 | 113 | 8 | 0 | 468 | pass |
| /dashboard/texas | 27 | 215 | 0 | 215 | 8 | 0 | 468 | pass |
| /following | 14 | 118 | 0 | 118 | 8 | 0 | 469 | pass |
| /issues | 17 | 124 | 0 | 124 | 8 | 0 | 468 | pass |
| /legislators | 24 | 132 | 0 | 132 | 8 | 0 | 470 | pass |
| /login | 9 | 121 | 0 | 121 | 8 | 4 | 467 | pass |
| /method | 28 | 193 | 0 | 193 | 8 | 0 | 468 | pass |
| /moving | 30 | 153 | 0 | 153 | 8 | 5 | 469 | pass |
| /pledge | 15 | 147 | 0 | 147 | 8 | 0 | 468 | pass |
| /politicians | 40 | 285 | 0 | 285 | 8 | 0 | 468 | pass |
| /privacy | 21 | 173 | 0 | 173 | 8 | 0 | 468 | pass |
| /recap | 20 | 127 | 0 | 127 | 8 | 6 | 471 | pass |
| /records | 10 | 134 | 0 | 134 | 9 | 0 | 508 | pass |
| /report | 13 | 166 | 0 | 166 | 8 | 0 | 468 | pass |
| /search | 13 | 115 | 0 | 115 | 8 | 0 | 468 | pass |
| /share/card | 10 | 115 | 232 | 232 | 8 | 0 | 476 | pass |
| /start | 39 | 163 | 0 | 163 | 8 | 0 | 473 | pass |
| /terms | 14 | 167 | 0 | 167 | 8 | 0 | 468 | pass |
| /texas | 21 | 129 | 0 | 129 | 8 | 0 | 468 | pass |
| /transparency | 14 | 117 | 0 | 117 | 8 | 0 | 468 | pass |
| /trial | 8 | 153 | 0 | 153 | 8 | 0 | 467 | pass |
| /voice | 24 | 219 | 0 | 219 | 8 | 0 | 468 | pass |
| /welcome | 14 | 109 | 0 | 109 | 8 | 0 | 468 | pass |
| /politicians/[id] | 62 | 303 | 0 | 303 | 8 | 7 | 476 | pass |
| /bills/[id] | 54 | 260 | 178 | 260 | 8 | 8 | 478 | pass |
| /issues/[id] | 17 | 144 | 0 | 144 | 8 | 0 | 468 | pass |
| /compare?a&b | 40 | 366 | 0 | 366 | 8 | 0 | 468 | pass |
| /search?q | 40 | 178 | 0 | 178 | 8 | 0 | 468 | pass |
| /start?step=2 | 59 | 207 | 0 | 207 | 8 | 0 | 473 | pass |
| /share/card?t=vote | 21 | 196 | 0 | 196 | 8 | 0 | 476 | pass |
| /share/card?t=bill | 16 | 123 | 0 | 123 | 8 | 0 | 476 | pass |
| /texas/bills/[id] | 19 | 202 | 0 | 202 | 8 | 0 | 476 | pass |
| /texas/members/[id] | 20 | 146 | 0 | 146 | 8 | 0 | 476 | pass |
| /no-such-page | 4 | 94 | 0 | 94 | 8 | 0 | 467 | pass |

## How to rerun

```
npm run e2e                 # everything, on a server the runner starts
npm run e2e -- --only 4,13  # some tasks
npm run e2e -- --prod       # build first, for real speed numbers
```

Screenshots: /tmp/on-record-e2e
