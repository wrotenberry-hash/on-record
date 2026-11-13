# Exception-only monitoring

After every scheduled run (`/api/automation/tick`), the app evaluates six
conditions against the run and call ledgers and sends an email through Resend only when
one holds. Healthy runs send nothing. A monitoring fault never changes a run's
result; it is reported in the run's JSON as `monitoring.alerts.error` (and the daily email as `monitoring.rhythm`).

| Alert kind | Fires when | Input |
| --- | --- | --- |
| `CONSECUTIVE_FAILURES` | the two most recent finished runs are both FAILED | `automation_runs` |
| `NO_CAPTURE_72H` | the newest run with `capture_status = CAPTURED` finished more than 72 h ago, or there has never been a capture and the first run is older than 72 h | `automation_runs` |
| `SPEND_75_PERCENT` | month-to-date OpenAI spend exceeds 75% of `OPENAI_MONTHLY_LIMIT_USD` (default 40, the owner's OpenAI monthly usage limit) | the `model_calls` ledger: every OpenAI call the app makes, priced from token usage (`lib/model-cost.ts`), summed over the calendar month (UTC); the OpenAI Costs API instead when `OPENAI_ADMIN_KEY` is set |
| `KEY_EXPIRING` | today is within 21 days of `OPENAI_KEY_EXPIRES` (ISO date), including after expiry | environment |
| `INGEST_FAILING` | the two most recent federal ingestion runs both FAILED outright | `ingest_runs` |
| `BILLING_REFUSED` | OpenAI refused a call for billing (`insufficient_quota`, `credit_balance_exhausted`, a spend-limit code) in the last 24 h, and no call has succeeded since | `model_calls` (error `billing:<code>`), or the newest failed run's error |

There is no estimated-balance alert. Since 2026-11-13 OpenAI auto recharge is
on ($10 when the balance falls under $3) with a $40 monthly usage limit, so a
refusal means auto recharge or the limit failed, and the refusal alert says so.
The health probe reports month-to-date spend (`openaiSpend`: total, by purpose,
call count, the limit and the 75% line) from the same ledger.

A problem is reported the first time it is seen, then repeated every 72 hours
while it continues (changed from 24 hours on 2026-10-27: a week-long budget
outage had produced three emails a day, all unread). Every alert a run raises
goes in one email. Sent alerts are recorded in `alert_events` (the only schema
addition; migration `0009_alert_events.sql`). Review-gate triggers and every
other table are untouched.

## Daily rhythm (since 2026-10-27)

The unit of daily work is one case reviewed. A rejection counts; published
records are the output, counted toward the launch target of 20. Both emails
ride the existing scheduled runs, so no new cron entry is needed, and they are
sent whether or not the run itself succeeded (a case from the backlog is
reviewable on a day intake broke).

| Kind | Sent by | When |
| --- | --- | --- |
| `DAILY_CASE` | the 13:00 UTC run (or the 19:00 run if no case was ready in the morning) | an open case exists and no case email went out in the last 20 h |
| `DAILY_NUDGE` | the 19:00 UTC run | a case email went out today and no human gate (source check, materiality, review, publication) has been recorded since it; at most one a day |

The case is chosen by `pickDailyCase`: open cases (not rejected, not M0, not
published), with cases the reviewer marked "Not now" (`representations.deferred_at`,
migration 0010) last; among the rest, complete machine research first, then
the oldest capture, so the backlog clears before fresh material. The email carries the speaker, the exact
quote, the progress count and a link `/editor?case=<id>` that opens the editor
on that case. No case ready means no email. Missed days are visible in
`GET /api/automation/health` → `throughput` and are reported in the Monday
status, not nagged about.

Each email also carries a **"Not today?"** link: `/skip?t=<token>`, a
single-purpose HMAC token (`signAction` in lib/session-token.ts, purpose
`defer`, 48-hour expiry, keyed separately from sessions). Opening the link
shows a confirmation page and changes nothing; the button POSTs and sets
`representations.deferred_at`, so tomorrow's email picks a different case.
The link is omitted when `EDITOR_ACCESS_KEY` is not set.

`GET /api/editor/alerts` includes `rhythm: { phase, wouldSend, reason, caseId }`
so the decision can be inspected without sending.

## Phase B checkpoint email (`SUMMARIES_READY`)

Once the first 5 bill summaries exist (`lib/analysis/report-format.ts`,
`CHECKPOINT_SUMMARIES`), the run that completed them sends one email with every
summary in full, each section badged [Analysis], the rule checker's verdict,
warnings, reading grade, cost, and the page link. Sent once, recorded in
`alert_events`. The editor's "Write summaries now" button sends it too if it is
the one that reaches 5. It exists so the owner can read the summaries on the
phone and a session can review the text from the inbox without any new secret.

## Delivery

Resend, `POST https://api.resend.com/emails`, with `RESEND_API_KEY`. Recipient
`ALERT_TO_EMAIL` (default wrotenberry@gmail.com); sender `ALERT_FROM_EMAIL`
(default `On Record <onboarding@resend.dev>`, which Resend allows only to the
address that owns the Resend account; a verified domain lifts that limit).
The email is plain text: the alert, the live values of all four checks, and
links to the editor and the health probe.

## Test alert

- Editor: the "Send test alert" button under "Scheduled intake". It sends a
  `TEST` email and shows the live check values in the notice.
- Machine: `POST /api/automation/alerts/test` with the `CRON_SECRET` or
  `AUTOMATION_TICK_SECRET` bearer.
- Read-only state: `GET /api/editor/alerts` (editor session) returns the
  configuration, the check values, which kinds would alert now, which are
  suppressed by the repeat window, and the daily-rhythm decision.

## Verification

1. `pnpm test`: `tests/monitoring.test.mjs` covers every rule, the boundary
   values, and the dedupe window; `tests/analysis.test.mjs` covers the
   checkpoint email.
2. After deploy, `GET /api/automation/health` shows `monitoring.resendConfigured`
   and `monitoring.keyExpires`.
3. Tap "Send test alert" in the editor: an email arrives with subject
   `[On Record] test alert`; the health probe's `monitoring.lastAlert` shows
   kind `TEST`.
4. A scheduled run's JSON (visible in Vercel runtime logs only on failure) and
   the editor's alert state confirm evaluation ran; healthy state yields
   `wouldAlert: []`.
