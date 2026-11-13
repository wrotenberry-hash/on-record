# Operating rules

Standing rules from the owner (Wilson), set 2026-11-13. Every session working on
On Record follows them. They sit above the older `/next` loop in
`.claude/commands/next.md`: where the two differ, this file wins.

## 1. Defaults, not questions

When a decision has a reasonable default, take it, record it in
`docs/DECISIONS.md` (the "Operating decisions" table), and keep going.

Stop and ask only for:

- altering or dropping an existing table (new tables and new nullable columns on
  new tables are fine);
- touching any of the 41 review-gate triggers;
- making anything public (the public switch, a new anonymous endpoint, a new
  public page, or any summary, statement or name reaching an unsigned-in reader);
- spending above the caps (`ANALYSIS_MAX_SUMMARIES`, `ANALYSIS_SPEND_CAP_USD`,
  the OpenAI monthly limit);
- a bug that survived two fix attempts.

## 2. Keep going

When a phase checkpoint in `docs/TALK_IS_CHEAP_PLAN.md` passes the session's own
verification (build, tests, typecheck, and the production health probe where it
applies), start the next phase without waiting for the owner.

## 3. No new secrets or environments

Do not ask for a new secret, token or environment without first proposing a way
that needs none. Verify deploys by reading the public health probe,
`https://on-record-wrotenberry.vercel.app/api/automation/health`, not the
Vercel API. The owner is not adding a Vercel token to this environment.

## 4. Billing

OpenAI auto recharge is on ($10 when the balance falls below $3) with a $40
monthly usage limit. There is no estimated-balance alert and no
`OPENAI_CREDIT_USD` / `OPENAI_CREDIT_SET_AT` setting. What remains:

- the `BILLING_REFUSED` alert (OpenAI refused a call for billing), at once;
- the `SPEND_75_PERCENT` alert against `OPENAI_MONTHLY_LIMIT_USD` (default 40);
- a month-to-date spend total on the health probe (`openaiSpend`), priced from
  On Record's own ledger of every model call.

## 5. Reporting

One push notification per completed phase, and the same report by email.
Plain language. Say what to test on the phone. Batch the MANUAL items (things
only the owner can do: Vercel settings, OpenAI billing, a domain). Never more
than one MANUAL batch a week unless something is broken.

## 6. Where things stood on 2026-11-13

Phase B decisions are approved (see `docs/DECISIONS.md`). Next in order: let the
19:00 UTC run write the 5 real summaries; review them against the template rules
in `docs/TALK_IS_CHEAP_PLAN.md`; fix anything the rule checker missed; raise the
caps to 40 summaries / $5; then proceed to Phase C.

## How a session applies these

- Read this file, then `STATUS.md`, `docs/DECISIONS.md` and
  `docs/TALK_IS_CHEAP_PLAN.md`, before changing anything.
- Verify with `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build`
  (the build runs the migrations against a local SQLite file).
- Commit one plain-English commit per completed action and push to the
  session's branch. Production deploys from `main`; if the session cannot push
  there, say so once in the report and list the merge as a MANUAL item.
- Keep `STATUS.md` current: Done, In Progress, Blocked, Decisions Made,
  Waiting on Wilson.
