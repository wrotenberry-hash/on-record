# Usability tasks

**Current results: `tests/e2e/report.md` (18 Nov 2026, production build, 390 px, CPU slowed 4×): 32 of 32 tasks pass, including four Texas tasks (find my state senator and representative from an address; see how my state senator voted; a voice vote shows its label and no member position; a Texas bill's summary is hidden until Texas summaries are released and reads in the federal order once they are); 47 of 47 pages with no accessibility problems; every page usable in under 2 s. The summary tasks and the Texas tasks use labelled stand-in rows in the test copy. Rerun with `npm run e2e -- --prod`. The tables below are the history from 16 Nov.**

Tasks a first-time reader should finish on a phone, with a target time. Each is
checked by a scripted run at iPhone size (Playwright, local stand-ins for the
outside services) and then by Wilson by hand on his own phone once the services
are live.

## Round E

| Task | Target | Scripted check (16 Nov) | By hand |
| --- | --- | --- | --- |
| Verify and cast your first counted vote | ≤ 90 s on a phone | 6 s scripted, from the signed-in Account page through phone, code, district and Support, with no sideways scrolling. Steps: type the mobile number, tick consent, tap "Text me a code", type the 6-digit code (iOS and Android offer it from the text), tap Confirm, (optional) street, city, state, ZIP with autofill, tap "Match my district", open a bill, tap Support. Estimated by hand: about 40 s for a real-person vote, 60–80 s with the district step. | Not yet: needs the Turnstile and Twilio keys (MANUAL). |

### All Round E tasks: scripted first-time reader, 390 px wide, CPU slowed 4× (16 Nov)

Taps = taps on links and buttons from the home page (typing a ZIP or search words is not counted as a tap).
"Swipe" = the target was off-screen in the sideways menu. Target: ≤ 3 taps, ≤ 2 for the core tasks (1–3).

| # | Task | Before | After | Notes |
| --- | --- | --- | --- | --- |
| 1 | Find my legislators | Failed: names on step 2 were not links | **2 taps** + ZIP | Home leads with "Find your legislators" for newcomers |
| 2 | How my senator voted on the latest bill | 2 taps + swipe, landed on a nomination vote | **0 taps** | Home shows each legislator's latest vote on a bill; member pages lead with it too |
| 3 | Understand what a bill does | No bill links on home | **1 tap** | From "Moving on your issues" |
| 4 | Follow an issue | Not possible outside onboarding | **0–2 taps** | "Follow this issue" on every issue page; limit of 3 explained |
| 5 | Compare two members | 4 taps | **2 taps** | "Compare with {other senator}" one-tap link |
| 6 | Find a bill by keyword | 2 taps + swipe | **2 taps** + words | Search moved to the second menu item |
| 7 | Turn on alerts | 3 taps + swipe | 3 taps + swipe | Account is the 10th menu item |
| 8 | Texas Legislature this week | 1 tap | 1 tap + swipe | |
| 9 | What changed since my last visit | Failed: first page of a visit showed nothing | **0 taps** | Bug fixed (see O-95), regression test added |
| 10 | Bills that became law this Congress | 1 tap + swipe | 1 tap + swipe | |
| 11 | Who controls the Texas Senate, who runs it | Failed: a small link at the dashboard foot | **1 tap** | Texas page now has "Who controls it and who runs it" |
| 12 | Committee that stalls the most bills | 1 tap + swipe | 1 tap + swipe | |
| 13 | Say whether I support a bill | No bill links on home | **2 taps** | |
| 14 | My district vs my legislator | No member links on home | **1 tap** | Checked with 28 seeded test answers (needs 25); real totals need the Turnstile/Twilio keys |
| 15 | Verify and cast a first counted vote | 6 s scripted (above) | unchanged | Needs the keys to try by hand |
| 16 | Share a vote card to Stories | No member links on home | **3 taps** | Story is the default size |
| 17 | Share a bill carousel | n/a (new in Round G) | **3 taps** | Needs a visible summary for the bill |
| 18 | Copy a link that previews correctly | n/a (new in Round G) | **3 taps** | Short link → exact card; preview image 1200×630 |

Also checked: no page took longer than 0.32 s to become interactive with the CPU slowed 4× (local server, so network time is not included; real phones on mobile data will add it). WCAG 2.1 AA (axe): 0 violations on 23 pages after fixing 3. No sideways scrolling on any page. Missing pages return a real 404 with three ways back in; errors show "Try again"; every list has an empty-state line; taps show a progress bar while the next page loads.

Notes
- "Counted" means accepted into the counted set. A new account's answers enter
  the totals 24 hours after the account was created; the bill page says from when.
- The email sign-in step comes before this task (it is the Round 3 account task).
