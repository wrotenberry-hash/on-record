# Usability suite report

Run 2026-11-18T15:27:20.107Z · production build (next build + next start) · phone 390×844 · CPU slowed 4×.
Local server and local database copy: network time is not included in any number here. Written by `npm run e2e`; overwritten on every run.

**Tasks: 36 passed, 0 failed, 0 blocked, 0 need keys.** **Accessibility: 48 of 48 pages with 0 violations.** **Speed: 41 of 41 pages interactive under 2 s.**

## Tasks

Taps are taps on links and buttons from the home page; typing is not a tap. Seconds are scripted (no reading time).

| # | Task | Target | Taps | Seconds | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Find my legislators | ≤ 2 taps, ≤ 30 s | 2 | 1.2 | pass | 3 legislators shown after the ZIP, from the welcome screen (typing the ZIP is not a tap) |
| 2 | How my senator voted on the latest bill | ≤ 2 taps, ≤ 30 s | 0 | 0.2 | pass | on the home page, no taps |
| 3 | Understand what a bill does | ≤ 2 taps, ≤ 30 s | 1 | 1.2 | pass | plain-language summary shown (stand-in summary in the test copy) |
| 4 | Follow an issue | ≤ 3 taps, ≤ 30 s | 2 | 6.2 | pass | followed from the picker on the home page; kept after a reload |
| 5 | Compare two members | ≤ 3 taps, ≤ 30 s | 2 | 1.2 | pass | John Cornyn and Ted Cruz |
| 6 | Find a bill by keyword | ≤ 3 taps, ≤ 30 s | 2 | 1.4 | pass | typing the words is not a tap |
| 7 | Turn on alerts | ≤ 3 taps, ≤ 30 s | 3 + 1 swipe | 3.8 | pass | Account is at the far end of the menu (1 swipe) |
| 8 | Texas Legislature this week | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.7 | pass | Texas is off-screen in the menu (1 swipe) |
| 9 | What changed since my last visit | ≤ 3 taps, ≤ 30 s | 0 | 0.2 | pass | panel shown with its empty-state line |
| 10 | Bills that became law this Congress | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 1 | pass | Dashboard is off-screen in the menu (1 swipe) |
| 11 | Who controls the Texas Senate, who runs it | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.7 | pass | Texas is off-screen in the menu (1 swipe) |
| 12 | Committee that stalls the most bills | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.8 | pass | Dashboard is off-screen in the menu (1 swipe) |
| 13 | Say whether I support a bill | ≤ 3 taps, ≤ 30 s | 1 | 3.5 | pass | one tap on the home page; answer saved and kept |
| 14 | My district vs my legislator | ≤ 3 taps, ≤ 30 s | 1 | 0.6 | pass | the state's totals beside the senator's vote, Support / Oppose / Unsure with the number of voters (28 seeded test answers; real totals need the Turnstile and Twilio keys) |
| 15 | Verify and cast a first counted vote | ≤ 90 s | 8 | 14.4 | pass | local stand-ins for the text message, bot check and district lookup; by hand this needs the Turnstile and Twilio keys |
| 16 | Share a vote card to Stories | ≤ 3 taps, ≤ 30 s | 3 | 3.5 | pass | share sheet opened with constituent-vote-story.png (the phone's share sheet is a local stand-in) |
| 17 | Share a bill carousel | ≤ 3 taps, ≤ 30 s | 3 | 3.5 | pass | five slides handed to the share sheet (local stand-in) |
| 18 | Copy a link that previews correctly | ≤ 3 taps, ≤ 30 s | 3 | 6 | pass | short link opens the exact card; preview image 1200×630 (outside previews stay blank while the site is private) |
| contact | Contact my legislator about a bill | ≤ 2 taps, ≤ 30 s | 2 | 5.8 | pass | John Cornyn: phone link, Open the official contact form (opens in, editable message, copied |
| flow | The 60-second flow: ZIP only | ≤ 3 taps, ≤ 60 s | 2 | 3.3 | pass | 3 legislators in 2.7 s (1 tap), first answer saved at 3.3 s; typed at a person's speed |
| flow-split | The 60-second flow: a ZIP that crosses districts | ≤ 3 taps, ≤ 60 s | 3 | 3.7 | pass | 3 legislators after choosing the district; first answer at 3.7 s |
| flow-address | The 60-second flow: ZIP and street address, five legislators | ≤ 3 taps, ≤ 60 s | 2 | 5 | pass | 5 legislators (John Cornyn, Ted Cruz, Lloyd Doggett, Sarah Eckhardt, Gina Hinojosa); first answer at 5 s; the address lookup is a local stand-in for the Census service |
| flow-mistakes | The 60-second flow: a wrong ZIP or address is explained and the typing is kept |  | 0 | – | pass | no ZIP: “Enter your 5-digit ZIP code.”; wrong ZIP: “We could not find that ZIP code. Check the five digits.”; letters: “Enter your 5-digit ZIP code.”; address not found: “The Census Bureau could not place that street address. Check” |
| flow-issues | The 60-second flow: picking an issue brings its bills first |  | 0 | – | pass | after picking Health care the first line reads “House · week of Nov 16 · on your issues: Health care” |
| fb-2 | Feedback prompt: not asked on the second day | ≤ 30 s | 0 | 1.9 | pass | second day: not asked; the day was counted once |
| fb-3 | Feedback prompt: asked on the third day, answer stored | ≤ 1 taps, ≤ 30 s | 1 | 3.2 | pass | asked once on day 3, answer stored (audience “trial”, no invite or page kept), not asked again |
| fb-no | Feedback prompt: “Not now” ends it | ≤ 1 taps, ≤ 30 s | 1 | 3.2 | pass | dismissed, nothing stored, not asked again |
| wrong | Something wrong? Tell us (from any page) | ≤ 2 taps, ≤ 30 s | 2 | 1.3 | pass | report filed with the page it was about; also works with JavaScript off |
| tx-find | Texas: find my state senator and state representative from a street address | ≤ 1 taps, ≤ 30 s | 1 | 20.9 | pass | five cards: John Cornyn, Ted Cruz, Lloyd Doggett, Sarah Eckhardt, Gina Hinojosa; state senator's line: “Voted Yes to move a bill relating to a test bill with a record vote (test data) forward. It went on to a final vote, 1–1.OFFICIAL”; representative: “Voted Yes to move a bill relating to test subject 2 forward. It went on to a final vote, 3–1.OFFICIAL” |
| tx-senator-vote | Texas: see how my state senator voted on a bill with a record vote | ≤ 3 taps, ≤ 30 s | 3 | 22.4 | pass | SB 9001: “Record vote: 1 yes, 1 no (passed)”; Sarah Eckhardt listed under Yes |
| tx-summary | Texas: a bill's summary reads in the same order as a federal bill, and only once Texas summaries are released | ≤ 30 s | 0 | 0.3 | pass | not released yet: the reader sees the official record only (Status, Do you support SB 9001? YOUR VIEW, What residents say YOUR VIEW, …) |
| tx-voice | Texas: a bill decided by voice vote shows the label and no member position | ≤ 30 s | 0 | 0.6 | pass | bill label: “Voice vote: members' individual votes were not recorded”; member page: “Voice vote: members' individual votes were not recorded” |
| voice-earlier | A returning reader is asked once whether to count the answers they gave before | ≤ 1 taps, ≤ 30 s | 1 | 3.3 | pass | asked once on the home page; “keep them private” leaves the answer uncounted, still shown to the reader, and the question does not come back |
| voice-vote | Vote Unsure on a bill, see the promise, and see the totals for my nation, state and district | ≤ 2 taps, ≤ 30 s | 2 | 3.5 | pass | the promise; Unsure saved; each legislator's vote with their district's total beside it; totals for the nation, Texas and TX-37, each saying there are not enough voters yet; “Not a scientific poll.” |
| voice-texas | Vote on a Texas bill: the same box, with totals for Texas and my state districts | ≤ 2 taps, ≤ 30 s | 2 | 4.9 | pass | Support saved on a Texas bill; totals for Texas, state senate district 14 and state house district 49; no national total |
| voice-outside | A reader outside Texas opens a Texas bill: who can weigh in, the totals, and no vote buttons | ≤ 1 taps, ≤ 30 s | 1 | 1.4 | pass | an Oklahoma reader sees “People who live in Texas can weigh in on this bill”, no vote buttons, the totals and the rest of the bill |

## Accessibility (axe-core, WCAG 2.1 A and AA)

axe-core 4.13.0 on every page a task landed on and on the list of reader pages (tests/e2e/pages.mjs). Zero violations are required.

| Page | Violations | What |
| --- | --- | --- |
| / | 0 |  |
| / (newcomer) | 0 |  |
| /about | 0 |  |
| /account | 0 |  |
| /account?t=Code sent to the number ending 1780. It works for 10 minutes. | 0 |  |
| /account?t=Matched to TX-37, TX-SD-14, TX-HD-49. Your answers now count there as well. You can change this address once every 90 days. | 0 |  |
| /account?t=Phone confirmed. Next, match your home address so your answers can count where you live. | 0 |  |
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
| / | 46 | 311 | 261 | 311 | 8 | 0 | 473 | pass |
| /about | 13 | 148 | 0 | 148 | 8 | 0 | 468 | pass |
| /account | 19 | 148 | 0 | 148 | 9 | 6 | 472 | pass |
| /briefing | 19 | 140 | 0 | 140 | 8 | 0 | 468 | pass |
| /coming | 26 | 141 | 0 | 141 | 8 | 0 | 468 | pass |
| /compare | 45 | 389 | 387 | 389 | 8 | 0 | 468 | pass |
| /corrections | 38 | 122 | 0 | 122 | 8 | 0 | 468 | pass |
| /dashboard | 108 | 204 | 0 | 204 | 8 | 0 | 468 | pass |
| /dashboard/texas | 25 | 211 | 0 | 211 | 8 | 0 | 468 | pass |
| /following | 19 | 134 | 0 | 134 | 8 | 5 | 469 | pass |
| /issues | 21 | 133 | 0 | 133 | 8 | 0 | 468 | pass |
| /legislators | 34 | 185 | 0 | 185 | 8 | 0 | 470 | pass |
| /login | 9 | 186 | 0 | 186 | 8 | 4 | 467 | pass |
| /method | 51 | 190 | 0 | 190 | 8 | 0 | 468 | pass |
| /moving | 25 | 189 | 0 | 189 | 8 | 5 | 469 | pass |
| /pledge | 27 | 158 | 0 | 158 | 8 | 0 | 468 | pass |
| /politicians | 74 | 283 | 0 | 283 | 8 | 0 | 468 | pass |
| /privacy | 41 | 241 | 0 | 241 | 8 | 0 | 468 | pass |
| /recap | 21 | 104 | 0 | 104 | 8 | 6 | 471 | pass |
| /records | 8 | 109 | 0 | 109 | 9 | 17 | 508 | pass |
| /report | 18 | 130 | 0 | 130 | 8 | 0 | 468 | pass |
| /search | 27 | 135 | 0 | 135 | 8 | 0 | 468 | pass |
| /share/card | 15 | 133 | 275 | 275 | 8 | 0 | 476 | pass |
| /start | 74 | 263 | 0 | 263 | 8 | 0 | 473 | pass |
| /terms | 26 | 201 | 0 | 201 | 8 | 0 | 468 | pass |
| /texas | 27 | 123 | 0 | 123 | 8 | 0 | 468 | pass |
| /transparency | 27 | 145 | 0 | 145 | 8 | 0 | 468 | pass |
| /trial | 6 | 96 | 0 | 96 | 8 | 0 | 467 | pass |
| /voice | 28 | 121 | 0 | 121 | 8 | 0 | 468 | pass |
| /welcome | 12 | 100 | 0 | 100 | 8 | 0 | 468 | pass |
| /politicians/[id] | 43 | 210 | 0 | 210 | 8 | 7 | 476 | pass |
| /bills/[id] | 41 | 196 | 157 | 196 | 8 | 0 | 478 | pass |
| /issues/[id] | 25 | 159 | 0 | 159 | 8 | 0 | 468 | pass |
| /compare?a&b | 49 | 416 | 0 | 416 | 8 | 0 | 468 | pass |
| /search?q | 58 | 249 | 0 | 249 | 8 | 0 | 468 | pass |
| /start?step=2 | 68 | 223 | 0 | 223 | 8 | 0 | 473 | pass |
| /share/card?t=vote | 56 | 167 | 0 | 167 | 8 | 0 | 476 | pass |
| /share/card?t=bill | 24 | 195 | 0 | 195 | 8 | 0 | 476 | pass |
| /texas/bills/[id] | 27 | 155 | 0 | 155 | 8 | 0 | 477 | pass |
| /texas/members/[id] | 30 | 232 | 0 | 232 | 8 | 0 | 476 | pass |
| /no-such-page | 7 | 96 | 0 | 96 | 8 | 0 | 467 | pass |

## How to rerun

```
npm run e2e                 # everything, on a server the runner starts
npm run e2e -- --only 4,13  # some tasks
npm run e2e -- --prod       # build first, for real speed numbers
```

Screenshots: /tmp/on-record-e2e
