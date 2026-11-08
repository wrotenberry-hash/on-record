# STATUS

Updated 2026-11-08 (round 17 of /next). Plain-language state of the On Record build. Technical detail lives in docs/BUILD_STATUS.md.

## Goal

A private checking instrument for political representations: a source's exact quote, a normalized proposition, bilateral evidence, human review, then a published CHECKING record with no score. Enough real, reviewed material to judge whether the site can launch. (confirm)

## Launch Target

20 human-reviewed CHECKING records across several issues, plus 10 historical records if sources permit, with the three public pages (who runs this, how a claim is checked, corrections) live. Then the public switch goes on. (confirm)

## Done

- Hosting on Vercel with a Turso database, access-key sign-in, Vercel Cron twice a day (26 Sep).
- Unattended intake: discovery, capture, machine research, lane rotation, three capture attempts per run (27 Sep).
- Exception-only email alerts via Resend, one email per run, repeated every 72 h while a problem continues (27 Sep, 27 Oct).
- Four-card review flow: check the source, judge it, tick the evidence, finish (27 Sep).
- Daily review rhythm: morning "today's case" email with a one-tap link, one afternoon nudge, progress count toward 20 (27 Oct; verified live 2 Nov).
- Health probe reports throughput counts and rhythm state; weekly Monday report reads them (27 Oct).
- Scheduler skips hosts that block the crawler twice in two weeks; a payment refusal no longer burns a lead (27 Oct, 2 Nov).
- Public page: browse by speaker; leak-check script passes (27 Oct).
- 1 CHECKING record published in production. 89 cases open in the editor.
- Editor case list keeps deferred cases out of the live list, in a collapsed "Not now · n" group at the bottom that opens when one is selected. Verified end to end locally (8 Nov).
- Probe reports time per case: median minutes from the source check to publication, sample count, and the share under 10 minutes. Verified locally with one published case (8 Nov).
- The morning email opens with a streak line ("Reviewed on 3 of the last 7 days. Keep it going.") only when there is one; silent otherwise. Text covered by tests; the count query runs on a local tick (8 Nov).
- Probe reports the habit over 7 days: days with a review, case emails and nudges sent, cases deferred, deferred open now. Monday report reads it and flags when deferrals outnumber reviews (8 Nov).
- Status dashboard republished with rounds 1–12 and the production check (8 Nov). Same link: https://claude.ai/artifact/BkdBcsZEgDYiW4q93cbMTm
- The morning email carries a one-tap "Not today?" link: a signed 48-hour token opens a confirmation page, the button defers the case, no sign-in needed. Verified end to end locally from a real tick email (8 Nov).
- "Not now" on any open case defers it to the back of the morning-email order without judging it; "Bring it back" undoes. Verified end to end locally (8 Nov).
- Published list can be narrowed by issue as well as by speaker; chips appear once more than one issue is published (8 Nov).
- The corrections page lists real corrections and retractions from the database, newest first, with the reason and a link to the replacement record; reviewer identity stays private. Verified locally with a seeded correction (8 Nov).
- The morning email link survives sign-in: an expired session is sent to sign in and lands back on the linked case. Verified end to end locally (8 Nov).
- Record pages carry Open Graph and Twitter preview data (speaker and quote as title, proposition and open question as description, canonical link); site-wide defaults in the layout (8 Nov).
- Health probe reports capture success by source lane over 30 days (captured, failed, skipped, queued, success rate); the Monday report reads it (6 Nov).
- Public records show evidence-search notes without the machine timestamp; legacy dist folder removed, lint clean with zero warnings from it (6 Nov).
- Each published record has its own address, /records/<id>, with a permanent-link line; the list links to it. Verified: 200 with the switch on, 404 for an unknown id, private notice with the switch off; leak check passes (6 Nov).
- Public landing page at the site root when the switch is on; with it off the root still opens the private editor (6 Nov).
- Health probe reports quote fidelity (representations found verbatim in their capture) for the readiness report (6 Nov).
- Every scheduled run puts leads the budget outage marked failed back in the queue; verified on a local run (6 Nov).
- Three public pages drafted behind the public switch: /method (how a claim is checked), /about (who runs this), /corrections. Verified: render with the switch on, show the private notice with it off (5 Nov).

## Verified in production (8 Nov)

- All 12 deployments since 5 Nov are READY; the live site runs commit 6bc4f2a (Not now). Migration 0010 applied: the probe's case selection reads the new column and answers.
- Public pages, landing and record permalinks show the private notice (switch off). Probe reports quote fidelity 90 of 90, lanes over 30 days (Executive 5 captured / 1 failed, Democratic 5 / 3, Independent 1 / 0, Republican 0 tried, 8 queued), 89 cases open, 1 published.
- Daily emails sending (case 7 Nov 13:00 UTC, nudge 7 Nov 19:00 UTC). Zero reviews in the last 7 days. Only runtime error is the expected OpenAI credit refusal; no leads lost to it since the fix.

## In Progress

- Building the review habit: zero cases reviewed in the week to 2 Nov. The daily email is the trigger; the first real review is the test.

## Blocked

- Intake stopped since 19 Oct. The OpenAI monthly limit reset on 1 Nov, but the account's prepaid credit balance is $0, so every call is refused. Needs credit added (Wilson).
- Source widening and quote-match measures (phase 4) need working intake.

## Decisions Made

- Dedicated repo; main deploys to production. The editor is private and the public switch is off, so a deploy is not something outsiders see.
- Public inventory withheld until 20 reviewed records. Rejected representations never public. Records show passages, not whole captures.
- No ratings or aggregate scores until the founder approves coverage, sufficiency and correction rules.
- The daily unit of work is one case reviewed, not published; a rejection counts.
- Daily emails ride the two existing scheduled runs; no new cron entries.
- Alerts repeat every 72 h, not daily. Dark mode deferred until the switch is on.
- OpenAI limit stays $20 until Wilson raises it.

## Waiting on Wilson

- Add OpenAI credit ($40) and set the on-record-vercel project limit to 40: OpenAI → Settings → Billing, then Limits. Reply "40".
- Review one case: open the morning email's link and go through the four cards.
- Fill the bracketed placeholders on /about and /corrections: your name and base, funding sentence, contact address, and whether to promise a response time. Reply with the text; I will drop it in.
- Later: register a domain.
