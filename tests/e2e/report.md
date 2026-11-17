# Usability suite report

Run 2026-11-17T16:13:17.807Z · production build (next build + next start) · phone 390×844 · CPU slowed 4×.
Local server and local database copy: network time is not included in any number here. Written by `npm run e2e`; overwritten on every run.

**Tasks: 26 passed, 0 failed, 2 blocked, 0 need keys.** **Accessibility: 46 of 46 pages with 0 violations.** **Speed: 41 of 41 pages interactive under 2 s.**

## Tasks

Taps are taps on links and buttons from the home page; typing is not a tap. Seconds are scripted (no reading time).

| # | Task | Target | Taps | Seconds | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Find my legislators | ≤ 2 taps, ≤ 30 s | 2 | 0.8 | pass | 3 legislators shown after the ZIP, from the welcome screen (typing the ZIP is not a tap) |
| 2 | How my senator voted on the latest bill | ≤ 2 taps, ≤ 30 s | 0 | 0.2 | pass | on the home page, no taps |
| 3 | Understand what a bill does | ≤ 2 taps, ≤ 30 s | – | 0.6 | **blocked** | The bill page has no plain-language summary a reader may see. Readers get summaries only once the owner opens the gate (PUBLIC_MIN_PROMPT in lib/analysis/publish-gate.ts is null), so this cannot pass yet. |
| 4 | Follow an issue | ≤ 3 taps, ≤ 30 s | 2 | 5.8 | pass | followed from the picker on the home page; kept after a reload |
| 5 | Compare two members | ≤ 3 taps, ≤ 30 s | 2 | 0.9 | pass | John Cornyn and Ted Cruz |
| 6 | Find a bill by keyword | ≤ 3 taps, ≤ 30 s | 2 | 0.8 | pass | typing the words is not a tap |
| 7 | Turn on alerts | ≤ 3 taps, ≤ 30 s | 3 + 1 swipe | 3.6 | pass | Account is at the far end of the menu (1 swipe) |
| 8 | Texas Legislature this week | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.6 | pass | Texas is off-screen in the menu (1 swipe) |
| 9 | What changed since my last visit | ≤ 3 taps, ≤ 30 s | 0 | 0.2 | pass | 1 changes listed, no taps |
| 10 | Bills that became law this Congress | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.6 | pass | Dashboard is off-screen in the menu (1 swipe) |
| 11 | Who controls the Texas Senate, who runs it | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.5 | pass | Texas is off-screen in the menu (1 swipe) |
| 12 | Committee that stalls the most bills | ≤ 3 taps, ≤ 30 s | 1 + 1 swipe | 0.6 | pass | Dashboard is off-screen in the menu (1 swipe) |
| 13 | Say whether I support a bill | ≤ 3 taps, ≤ 30 s | 1 | 3.3 | pass | one tap on the home page; answer saved and kept |
| 14 | My district vs my legislator | ≤ 3 taps, ≤ 30 s | 1 | 0.6 | pass | district totals beside the member's vote (28 seeded test answers; real totals need the Turnstile and Twilio keys) |
| 15 | Verify and cast a first counted vote | ≤ 90 s | 7 | 12.6 | pass | local stand-ins for the text message, bot check and district lookup; by hand this needs the Turnstile and Twilio keys |
| 16 | Share a vote card to Stories | ≤ 3 taps, ≤ 30 s | 3 | 3.3 | pass | share sheet opened with on-record-vote-story.png (the phone's share sheet is a local stand-in) |
| 17 | Share a bill carousel | ≤ 3 taps, ≤ 30 s | – | 0.5 | **blocked** | The bill has no summary a reader may see, so there is no 5-slide explainer to share. Readers get summaries only once the owner opens the gate (PUBLIC_MIN_PROMPT is null). |
| 18 | Copy a link that previews correctly | ≤ 3 taps, ≤ 30 s | 3 | 4.4 | pass | short link opens the exact card; preview image 1200×630 (outside previews stay blank while the site is private) |
| contact | Contact my legislator about a bill | ≤ 2 taps, ≤ 30 s | 2 | 5.7 | pass | John Cornyn: phone link, Open the official contact form (opens in, editable message, copied |
| flow | The 60-second flow: ZIP only | ≤ 3 taps, ≤ 60 s | 2 | 3.2 | pass | 3 legislators in 2.6 s (1 tap), first answer saved at 3.2 s; typed at a person's speed |
| flow-split | The 60-second flow: a ZIP that crosses districts | ≤ 3 taps, ≤ 60 s | 3 | 3.5 | pass | 3 legislators after choosing the district; first answer at 3.5 s |
| flow-address | The 60-second flow: ZIP and street address, five legislators | ≤ 3 taps, ≤ 60 s | 2 | 5.3 | pass | 5 legislators (John Cornyn, Ted Cruz, Lloyd Doggett, Sarah Eckhardt, Gina Hinojosa); first answer at 5.3 s; the address lookup is a local stand-in for the Census service |
| flow-mistakes | The 60-second flow: a wrong ZIP or address is explained and the typing is kept |  | 0 | – | pass | no ZIP: “Enter your 5-digit ZIP code.”; wrong ZIP: “We could not find that ZIP code. Check the five digits.”; letters: “Enter your 5-digit ZIP code.”; address not found: “The Census Bureau could not place that street address. Check” |
| flow-issues | The 60-second flow: picking an issue brings its bills first |  | 0 | – | pass | after picking Health care the first line reads “House · week of Nov 16 · on your issues: Health care” |
| fb-2 | Feedback prompt: not asked on the second day | ≤ 30 s | 0 | 1.9 | pass | second day: not asked; the day was counted once |
| fb-3 | Feedback prompt: asked on the third day, answer stored | ≤ 1 taps, ≤ 30 s | 1 | 3.1 | pass | asked once on day 3, answer stored (audience “trial”, no invite or page kept), not asked again |
| fb-no | Feedback prompt: “Not now” ends it | ≤ 1 taps, ≤ 30 s | 1 | 3.2 | pass | dismissed, nothing stored, not asked again |
| wrong | Something wrong? Tell us (from any page) | ≤ 2 taps, ≤ 30 s | 2 | 1.2 | pass | report filed with the page it was about; also works with JavaScript off |

## Accessibility (axe-core, WCAG 2.1 A and AA)

axe-core 4.13.0 on every page a task landed on and on the list of reader pages (tests/e2e/pages.mjs). Zero violations are required.

| Page | Violations | What |
| --- | --- | --- |
| / | 0 |  |
| / (newcomer) | 0 |  |
| /about | 0 |  |
| /account | 0 |  |
| /account?t=Code sent to the number ending 8500. It works for 10 minutes. | 0 |  |
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
| / | 26 | 157 | 0 | 157 | 9 | 0 | 456 | pass |
| /about | 9 | 93 | 0 | 93 | 8 | 1 | 451 | pass |
| /account | 12 | 105 | 0 | 105 | 9 | 3 | 455 | pass |
| /briefing | 20 | 116 | 0 | 116 | 8 | 0 | 451 | pass |
| /coming | 21 | 126 | 0 | 126 | 8 | 0 | 451 | pass |
| /compare | 41 | 429 | 481 | 481 | 8 | 0 | 451 | pass |
| /corrections | 13 | 102 | 0 | 102 | 8 | 1 | 451 | pass |
| /dashboard | 14 | 150 | 0 | 150 | 8 | 0 | 451 | pass |
| /dashboard/texas | 17 | 163 | 0 | 163 | 8 | 0 | 451 | pass |
| /following | 12 | 103 | 0 | 103 | 8 | 2 | 452 | pass |
| /issues | 15 | 91 | 0 | 91 | 8 | 1 | 451 | pass |
| /legislators | 20 | 122 | 0 | 122 | 8 | 0 | 453 | pass |
| /login | 6 | 102 | 0 | 102 | 8 | 1 | 449 | pass |
| /method | 11 | 112 | 0 | 112 | 8 | 0 | 451 | pass |
| /moving | 23 | 126 | 0 | 126 | 8 | 1 | 452 | pass |
| /pledge | 11 | 139 | 0 | 139 | 8 | 1 | 451 | pass |
| /politicians | 36 | 288 | 0 | 288 | 8 | 1 | 451 | pass |
| /privacy | 12 | 154 | 0 | 154 | 8 | 1 | 451 | pass |
| /recap | 14 | 120 | 0 | 120 | 8 | 2 | 454 | pass |
| /records | 7 | 139 | 0 | 139 | 9 | 14 | 491 | pass |
| /report | 13 | 133 | 0 | 133 | 8 | 0 | 451 | pass |
| /search | 9 | 90 | 0 | 90 | 8 | 1 | 451 | pass |
| /share/card | 10 | 71 | 246 | 246 | 8 | 4 | 459 | pass |
| /start | 21 | 150 | 0 | 150 | 9 | 0 | 456 | pass |
| /terms | 10 | 115 | 0 | 115 | 8 | 1 | 451 | pass |
| /texas | 20 | 133 | 0 | 133 | 8 | 1 | 451 | pass |
| /transparency | 10 | 92 | 0 | 92 | 8 | 0 | 451 | pass |
| /trial | 12 | 151 | 0 | 151 | 8 | 1 | 449 | pass |
| /voice | 14 | 115 | 0 | 115 | 8 | 1 | 451 | pass |
| /welcome | 12 | 100 | 0 | 100 | 8 | 0 | 451 | pass |
| /politicians/[id] | 61 | 274 | 0 | 274 | 9 | 0 | 459 | pass |
| /bills/[id] | 42 | 157 | 0 | 157 | 9 | 1 | 461 | pass |
| /issues/[id] | 13 | 110 | 0 | 110 | 8 | 1 | 451 | pass |
| /compare?a&b | 32 | 400 | 0 | 400 | 8 | 0 | 451 | pass |
| /search?q | 51 | 146 | 0 | 146 | 8 | 0 | 451 | pass |
| /start?step=2 | 38 | 176 | 0 | 176 | 9 | 0 | 456 | pass |
| /share/card?t=vote | 26 | 136 | 0 | 136 | 8 | 0 | 459 | pass |
| /share/card?t=bill | 15 | 104 | 0 | 104 | 8 | 0 | 459 | pass |
| /texas/bills/[id] | 19 | 105 | 0 | 105 | 9 | 0 | 459 | pass |
| /texas/members/[id] | 14 | 119 | 0 | 119 | 9 | 1 | 459 | pass |
| /no-such-page | 5 | 100 | 0 | 100 | 9 | 0 | 456 | pass |

## How to rerun

```
npm run e2e                 # everything, on a server the runner starts
npm run e2e -- --only 4,13  # some tasks
npm run e2e -- --prod       # build first, for real speed numbers
```

Screenshots: /tmp/claude-0/-home-user-gravel/cfa1644a-f850-5783-9b0f-e12139451812/scratchpad/e2e/final
