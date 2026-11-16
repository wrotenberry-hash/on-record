# Operating rules

Standing rules from the owner (Wilson). Set 2026-11-13; replaced by the master
build plan of 2026-11-16 (`docs/MASTER_BUILD_PLAN.md`); reporting and pacing
(rules 1, 2 and 6) changed again by the owner later on 2026-11-16. Every session working on
On Record follows them. They sit above the older `/next` loop in
`.claude/commands/next.md`: where the two differ, this file wins.

## 1. Wait for the go-ahead before each major step

(Owner, 16 Nov 2026, replacing "work autonomously through every round".) When the
owner checks in, recommend what to do next, ranked, then wait. Start the next
major step (a round, a regeneration, raising a cap, opening the trial, anything
that spends money or changes what readers see) only after the owner says go.
Small defaults inside an approved step are still taken and logged in
`docs/DECISIONS.md` (the "Operating decisions" table).

## 2. After each step

Tests, typecheck, lint, build, deploy, verify on the public health probe, update
`STATUS.md` and the written half of Editor → What's next
(`lib/whats-next-plan.ts`).

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

## 6. Reporting: no emails; push only when the owner is needed; a check-in on request

(Owner, 16 Nov 2026, replacing the daily digest.)

1. No scheduled or automatic emails and no daily digests, from Claude or from
   the app. The app's owner emails (alerts, the daily case and nudge, "summaries
   ready", "trial open") are off unless `OWNER_EMAILS_ENABLED=1`; what they would
   have said is recorded and shown on Editor → What's next. Reader emails (sign-in
   links and what a reader opted into) are not owner reports and keep working.
2. A push notification only when the owner is genuinely needed: a hard stop, a
   MANUAL item that blocks progress, or a decision that cannot be defaulted. One
   short line: what and why. In code terms, only the "blocker" flags of
   `lib/whats-next.ts` (`needsOwnerNow`) qualify, at most once per problem.
3. When the owner checks in ("status", "what's next", "continue"): first a fresh
   evaluation (live health probe, recent runs, errors, costs, progress against
   the master plan), then: where things stand (3–5 plain lines); what is
   recommended next and why, ranked; anything only the owner can do, with exact
   steps and time; then wait for the go-ahead.
4. Editor → What's next (`/editor/next`) is the same view, open any time. Its live
   numbers come from the probe on load; Claude rewrites the recommendations at
   every check-in and whenever the picture changes.

## 7. Spend

- OpenAI monthly limit $40 (`OPENAI_MONTHLY_LIMIT_USD`), alert at 75%.
- Bill summaries capped at $25 a month (`ANALYSIS_SPEND_CAP_USD`), alert at 75%.
- Verification texts capped at $10 a month (`VERIFY_MONTHLY_CAP_USD`).
- If OpenAI refuses a call: pause AI work, keep non-AI work going, one push.

## 8. Key

The current OpenAI key expires 23 Nov 2026 (`OPENAI_KEY_EXPIRES`). Claude's quiet
daily check sends one push 3 days before if it has not been replaced.

## 9. Neutrality

No grades or ratings of politicians. Identical treatment across parties. Every
figure computed from official data, with method and source one tap away.
Official and Analysis badges always visible. Procedural votes are never shown
as votes for or against a bill.

## 10. Privacy

Political views are sensitive. Aggregates only to anyone but the user. No data
sales, and no sharing with campaigns, parties or PACs. First-party analytics
only.
