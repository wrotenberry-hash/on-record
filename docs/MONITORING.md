# Exception-only monitoring

After every scheduled run (`/api/automation/tick`), the app evaluates four
conditions against the run ledger and sends an email through Resend only when
one holds. Healthy runs send nothing. A monitoring fault never changes a run's
result; it is reported in the run's JSON as `monitoring.error`.

| Alert kind | Fires when | Input |
| --- | --- | --- |
| `CONSECUTIVE_FAILURES` | the two most recent finished runs are both FAILED | `automation_runs` |
| `NO_CAPTURE_72H` | the newest run with `capture_status = CAPTURED` finished more than 72 h ago, or there has never been a capture and the first run is older than 72 h | `automation_runs` |
| `SPEND_75_PERCENT` | month-to-date OpenAI spend exceeds 75% of `OPENAI_MONTHLY_LIMIT_USD` (default 20) | OpenAI Costs API when `OPENAI_ADMIN_KEY` is set; otherwise an estimate: completed research drafts × $0.55 + captures × $0.06 this calendar month (UTC), tunable with `OPENAI_EST_COST_PER_DRAFT_USD` / `OPENAI_EST_COST_PER_CAPTURE_USD` |
| `KEY_EXPIRING` | today is within 21 days of `OPENAI_KEY_EXPIRES` (ISO date), including after expiry | environment |

Each kind is sent at most once per 24 hours. Sent alerts are recorded in
`alert_events` (the only schema addition; migration `0009_alert_events.sql`).
Review-gate triggers and every other table are untouched.

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
  configuration, the check values, which kinds would alert now, and which are
  suppressed by the 24-hour rule.

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
