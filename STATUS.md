# STATUS

Updated 2026-11-05. Plain-language state of the On Record build. Technical detail lives in docs/BUILD_STATUS.md.

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
- Optional: requeue the 22 leads the outage marked failed (production data). Reply "requeue".
- Review one case: open the morning email's link and go through the four cards.
- Later: register a domain; write the substance of the three public pages.
