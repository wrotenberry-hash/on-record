# Exception-only monitoring

After every scheduled run (`/api/automation/tick`), the app evaluates four
conditions against the run ledger and sends an email through Resend only when
one holds. Healthy runs send nothing. A monitoring fault never changes a run's
result; it is reported in the run's JSON as `monitoring.alerts.error` (and the daily email as `monitoring.rhythm`).

| Alert kind | Fires when | Input |
| --- | --- | --- |
| `CONSECUTIVE_FAILURES` | the two most recent finished runs are both FAILED | `automation_runs` |
| `NO_CAPTURE_72H` | the newest run with `capture_status = CAPTURED` finished more than 72 h ago, or there has never been a capture and the first run is older than 72 h | `automation_runs` |
| `SPEND_75_PERCENT` | month-to-date OpenAI spend exceeds 75% of `OPENAI_MONTHLY_LIMIT_USD` (default 20) | OpenAI Costs API when `OPENAI_ADMIN_KEY` is set; otherwise an estimate: completed research drafts × $0.55 + captures × $0.06 this calendar month (UTC), tunable with `OPENAI_EST_COST_PER_DRAFT_USD` / `OPENAI_EST_COST_PER_CAPTURE_USD` |
| `KEY_EXPIRING` | today is within 21 days of `OPENAI_KEY_EXPIRES` (ISO date), including after expiry | environment |

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
published) with complete machine research first, oldest capture first, so the
backlog clears before fresh material. The email carries the speaker, the exact
quote, the progress count and a link `/editor?case=<id>` that opens the editor
on that case. No case ready means no email. Missed days are visible in
`GET /api/automation/health` → `throughput` and are reported in the Monday
status, not nagged about.

`GET /api/editor/alerts` includes `rhythm: { phase, wouldSend, reason, caseId }`
so the decision can be inspected without sending.

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
   values, and the dedupe window.
2. After deploy, `GET /api/automation/health` shows `monitoring.resendConfigured`
   and `monitoring.keyExpires`.
3. Tap "Send test alert" in the editor: an email arrives with subject
   `[On Record] test alert`; the health probe's `monitoring.lastAlert` shows
   kind `TEST`.
4. A scheduled run's JSON (visible in Vercel runtime logs only on failure) and
   the editor's alert state confirm evaluation ran; healthy state yields
   `wouldAlert: []`.
