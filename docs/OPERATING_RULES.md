# Operating rules

Standing rules from the owner (Wilson). Set 2026-11-13; replaced by the master
build plan of 2026-11-16 (`docs/MASTER_BUILD_PLAN.md`). Every session working on
On Record follows them. They sit above the older `/next` loop in
`.claude/commands/next.md`: where the two differ, this file wins.

## 1. Work autonomously

Work through every round of `docs/MASTER_BUILD_PLAN.md`, in order, without
asking. Take reasonable defaults and log each in `docs/DECISIONS.md` (the
"Operating decisions" table).

## 2. After each round

Tests, typecheck, lint, build, deploy, verify on the public health probe, update
`STATUS.md`. Then start the next round.

## 3. Hard stops (the only reasons to pause and ask)

- altering or dropping an existing table (new tables, and new nullable columns
  on new tables, are fine);
- touching any of the 41 review-gate triggers;
- making anything public beyond trial invites: `PUBLIC_READ_ENABLED` stays off;
  no new anonymous endpoint, public page, social post or embeddable widget that
  shows content to an unsigned-in reader;
- exceeding a spend cap;
- a bug that survived two fix attempts.

## 4. Never block on secrets or accounts

When a step needs a key or an account only the owner can create, build it behind
a flag, test it with local stand-ins, and add the exact steps (and where to paste
in Vercel) to the MANUAL batch. Do not ask for a new secret when a way that needs
none exists.

## 5. Verify deploys on the public health probe

`https://on-record-wrotenberry.vercel.app/api/automation/health`, read with the
Vercel web-fetch tool. Not the Vercel API.

## 6. Reporting: at most once a day

One push notification and one email digest per day at most, covering the rounds
completed, phone screenshots, exactly what to test on the phone, and a single
batched MANUAL list. Alerts the app sends itself (billing refusal, spend at 75%,
key expiry) are separate and unchanged.

## 7. Spend

- OpenAI monthly limit $40 (`OPENAI_MONTHLY_LIMIT_USD`), alert at 75%.
- Bill summaries capped at $25 a month (`ANALYSIS_SPEND_CAP_USD`), alert at 75%.
- Verification texts capped at $10 a month (`VERIFY_MONTHLY_CAP_USD`).
- If OpenAI refuses a call: pause AI work, keep non-AI work going, alert once.

## 8. Key

The current OpenAI key expires 23 Nov 2026 (`OPENAI_KEY_EXPIRES`). The app warns
3 days before if it has not been replaced.

## 9. Neutrality

No grades or ratings of politicians. Identical treatment across parties. Every
figure computed from official data, with method and source one tap away.
Official and Analysis badges always visible. Procedural votes are never shown
as votes for or against a bill.

## 10. Privacy

Political views are sensitive. Aggregates only to anyone but the user. No data
sales, and no sharing with campaigns, parties or PACs. First-party analytics
only.
