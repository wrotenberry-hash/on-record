# Usability suite report

Run 2026-11-18T14:08:29.308Z · production build (next build + next start) · phone 390×844 · CPU slowed 4×.
Local server and local database copy: network time is not included in any number here. Written by `npm run e2e`; overwritten on every run.

**Tasks: 32 passed, 0 failed, 0 blocked, 0 need keys.** **Accessibility: 47 of 47 pages with 0 violations.** **Speed: 41 of 41 pages interactive under 2 s.**

## Tasks

Taps are taps on links and buttons from the home page; typing is not a tap. Seconds are scripted (no reading time).

| # | Task | Target | Taps | Seconds | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Find my legislators | ≤ 2 taps, ≤ 30 s | 2 | 0.7 | pass | 3 legislators shown after the ZIP, from the welcome screen (typing the ZIP is not a tap) |
| 2 | How my senator voted on the latest bill | ≤ 2 taps, ≤ 30 s | 0 | 0.2 | pass | on the home page, no taps |
| 3 | Understand what a bill does | ≤ 2 taps, ≤ 30 s | 1 | 1 | pass | plain-language summary shown (stand-in summary in the test copy) |
| 4 | Follow an issue | ≤ 3 taps, ≤ 30 s | 2 | 5.9 | pass | followed from the picker on the home page; kept after a reload |
| 5 | Compare two members | ≤ 3 taps, ≤ 30 s | 2 | 1 | pass | John Cornyn and Ted Cruz |
| 6 | Find a bill by keyword | ≤ 3 taps, ≤ 30 s | 2 | 1.2 | pass | typing the words is not a tap |
| 7 | Turn on alerts | ≤ 3 taps, ≤ 30 s | 3 + 1 swipe | 3.7 | pass | Account is at the far end of the menu (1 swipe) |
| 8 | Texas Legislature this week | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.5 | pass | Texas is off-screen in the menu (1 swipe) |
| 9 | What changed since my last visit | ≤ 3 taps, ≤ 30 s | 0 | 0.1 | pass | panel shown with its empty-state line |
| 10 | Bills that became law this Congress | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.7 | pass | Dashboard is off-screen in the menu (1 swipe) |
| 11 | Who controls the Texas Senate, who runs it | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.5 | pass | Texas is off-screen in the menu (1 swipe) |
| 12 | Committee that stalls the most bills | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.6 | pass | Dashboard is off-screen in the menu (1 swipe) |
| 13 | Say whether I support a bill | ≤ 3 taps, ≤ 30 s | 1 | 3.3 | pass | one tap on the home page; answer saved and kept |
| 14 | My district vs my legislator | ≤ 3 taps, ≤ 30 s | 1 | 0.6 | pass | district totals beside the member's vote (28 seeded test answers; real totals need the Turnstile and Twilio keys) |
| 15 | Verify and cast a first counted vote | ≤ 90 s | 7 | 12.6 | pass | local stand-ins for the text message, bot check and district lookup; by hand this needs the Turnstile and Twilio keys |
| 16 | Share a vote card to Stories | ≤ 3 taps, ≤ 30 s | 3 | 3.6 | pass | share sheet opened with constituent-vote-story.png (the phone's share sheet is a local stand-in) |
| 17 | Share a bill carousel | ≤ 3 taps, ≤ 30 s | 3 | 3.6 | pass | five slides handed to the share sheet (local stand-in) |
| 18 | Copy a link that previews correctly | ≤ 3 taps, ≤ 30 s | 3 | 5 | pass | short link opens the exact card; preview image 1200×630 (outside previews stay blank while the site is private) |
| contact | Contact my legislator about a bill | ≤ 2 taps, ≤ 30 s | 2 | 5.8 | pass | John Cornyn: phone link, Open the official contact form (opens in, editable message, copied |
| flow | The 60-second flow: ZIP only | ≤ 3 taps, ≤ 60 s | 2 | 3.4 | pass | 3 legislators in 2.7 s (1 tap), first answer saved at 3.4 s; typed at a person's speed |
| flow-split | The 60-second flow: a ZIP that crosses districts | ≤ 3 taps, ≤ 60 s | 3 | 3.9 | pass | 3 legislators after choosing the district; first answer at 3.9 s |
| flow-address | The 60-second flow: ZIP and street address, five legislators | ≤ 3 taps, ≤ 60 s | 2 | 5.3 | pass | 5 legislators (John Cornyn, Ted Cruz, Lloyd Doggett, Sarah Eckhardt, Gina Hinojosa); first answer at 5.3 s; the address lookup is a local stand-in for the Census service |
| flow-mistakes | The 60-second flow: a wrong ZIP or address is explained and the typing is kept |  | 0 | – | pass | no ZIP: “Enter your 5-digit ZIP code.”; wrong ZIP: “We could not find that ZIP code. Check the five digits.”; letters: “Enter your 5-digit ZIP code.”; address not found: “The Census Bureau could not place that street address. Check” |
| flow-issues | The 60-second flow: picking an issue brings its bills first |  | 0 | – | pass | after picking Health care the first line reads “House · week of Nov 16 · on your issues: Health care” |
| fb-2 | Feedback prompt: not asked on the second day | ≤ 30 s | 0 | 2.5 | pass | second day: not asked; the day was counted once |
| fb-3 | Feedback prompt: asked on the third day, answer stored | ≤ 1 taps, ≤ 30 s | 1 | 3.3 | pass | asked once on day 3, answer stored (audience “trial”, no invite or page kept), not asked again |
| fb-no | Feedback prompt: “Not now” ends it | ≤ 1 taps, ≤ 30 s | 1 | 3.1 | pass | dismissed, nothing stored, not asked again |
| wrong | Something wrong? Tell us (from any page) | ≤ 2 taps, ≤ 30 s | 2 | 1.3 | pass | report filed with the page it was about; also works with JavaScript off |
| tx-find | Texas: find my state senator and state representative from a street address | ≤ 1 taps, ≤ 30 s | 1 | 20.8 | pass | five cards: John Cornyn, Ted Cruz, Lloyd Doggett, Sarah Eckhardt, Gina Hinojosa; state senator's line: “Voted Yes to move a bill relating to a test bill with a record vote (test data) forward. It went on to a final vote, 1–1.OFFICIAL”; representative: “Voted Yes to move a bill relating to test subject 2 forward. It went on to a final vote, 3–1.OFFICIAL” |
| tx-senator-vote | Texas: see how my state senator voted on a bill with a record vote | ≤ 3 taps, ≤ 30 s | 3 | 21.6 | pass | SB 9001: “Record vote: 1 yes, 1 no (passed)”; Sarah Eckhardt listed under Yes |
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
| /account?t=Code sent to the number ending 2641. It works for 10 minutes. | 0 |  |
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
| / | 33 | 217 | 0 | 217 | 8 | 0 | 473 | pass |
| /about | 15 | 141 | 0 | 141 | 8 | 4 | 468 | pass |
| /account | 18 | 176 | 0 | 176 | 9 | 6 | 472 | pass |
| /briefing | 20 | 104 | 0 | 104 | 8 | 0 | 468 | pass |
| /coming | 38 | 153 | 0 | 153 | 8 | 0 | 468 | pass |
| /compare | 38 | 486 | 484 | 486 | 8 | 0 | 468 | pass |
| /corrections | 17 | 184 | 0 | 184 | 8 | 0 | 468 | pass |
| /dashboard | 20 | 160 | 0 | 160 | 8 | 0 | 468 | pass |
| /dashboard/texas | 27 | 153 | 0 | 153 | 8 | 0 | 468 | pass |
| /following | 29 | 134 | 0 | 134 | 8 | 5 | 469 | pass |
| /issues | 27 | 152 | 0 | 152 | 8 | 0 | 468 | pass |
| /legislators | 29 | 144 | 0 | 144 | 8 | 0 | 470 | pass |
| /login | 8 | 122 | 0 | 122 | 8 | 4 | 467 | pass |
| /method | 13 | 179 | 0 | 179 | 8 | 0 | 468 | pass |
| /moving | 22 | 177 | 0 | 177 | 8 | 5 | 469 | pass |
| /pledge | 21 | 107 | 0 | 107 | 8 | 0 | 468 | pass |
| /politicians | 53 | 326 | 0 | 326 | 8 | 0 | 468 | pass |
| /privacy | 22 | 174 | 0 | 174 | 8 | 0 | 468 | pass |
| /recap | 20 | 124 | 0 | 124 | 8 | 6 | 471 | pass |
| /records | 10 | 87 | 0 | 87 | 9 | 17 | 508 | pass |
| /report | 12 | 125 | 0 | 125 | 8 | 0 | 468 | pass |
| /search | 17 | 121 | 0 | 121 | 8 | 0 | 468 | pass |
| /share/card | 13 | 83 | 198 | 198 | 8 | 0 | 476 | pass |
| /start | 31 | 168 | 0 | 168 | 8 | 0 | 473 | pass |
| /terms | 13 | 168 | 0 | 168 | 8 | 0 | 468 | pass |
| /texas | 25 | 154 | 0 | 154 | 8 | 0 | 468 | pass |
| /transparency | 13 | 106 | 0 | 106 | 8 | 0 | 468 | pass |
| /trial | 11 | 134 | 0 | 134 | 8 | 0 | 467 | pass |
| /voice | 20 | 164 | 0 | 164 | 8 | 0 | 468 | pass |
| /welcome | 12 | 121 | 0 | 121 | 8 | 0 | 468 | pass |
| /politicians/[id] | 66 | 258 | 205 | 258 | 8 | 7 | 476 | pass |
| /bills/[id] | 49 | 252 | 0 | 252 | 8 | 8 | 478 | pass |
| /issues/[id] | 18 | 200 | 0 | 200 | 8 | 0 | 468 | pass |
| /compare?a&b | 25 | 377 | 0 | 377 | 8 | 0 | 468 | pass |
| /search?q | 22 | 122 | 0 | 122 | 8 | 0 | 468 | pass |
| /start?step=2 | 32 | 133 | 0 | 133 | 8 | 0 | 473 | pass |
| /share/card?t=vote | 17 | 105 | 0 | 105 | 8 | 0 | 476 | pass |
| /share/card?t=bill | 16 | 192 | 0 | 192 | 8 | 0 | 476 | pass |
| /texas/bills/[id] | 28 | 135 | 0 | 135 | 8 | 0 | 476 | pass |
| /texas/members/[id] | 26 | 145 | 0 | 145 | 8 | 0 | 476 | pass |
| /no-such-page | 6 | 123 | 0 | 123 | 8 | 0 | 467 | pass |

## How to rerun

```
npm run e2e                 # everything, on a server the runner starts
npm run e2e -- --only 4,13  # some tasks
npm run e2e -- --prod       # build first, for real speed numbers
```

Screenshots: /tmp/on-record-e2e
