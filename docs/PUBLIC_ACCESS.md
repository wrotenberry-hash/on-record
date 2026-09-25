# Public access, ingress and the scheduler path (2026-09-25)

This document records why the Site audience has to change for unattended intake
to run, what an anonymous visitor can and cannot read once it does, and the
exact order of account steps. It is the reference for the founder decision in
`CLAUDE_HANDOFF.md` step 1. Nothing here has been applied to the production
Site; see "State ladder" at the end for what is coded, deployed, run and verified.

## Why the audience has to change

`POST /api/automation/tick` is protected by `AUTOMATION_TICK_SECRET` inside the
app. The owner-private Site never lets an outside request reach the app: the
platform edge answers 401 first. A Cloudflare Worker, or any other scheduler,
therefore cannot call the job however it authenticates. The platform's exposed
bypass value is not a documented service credential and did not work as a
bearer; it must not be copied into a secret store, a prompt or this repository.

Three routes were considered.

| Route | What changes | Privacy impact | Effort | Verdict |
| --- | --- | --- | --- | --- |
| A. Widen the Site audience to anonymous, keep every protection in the app | One dashboard setting, plus the `PUBLIC_READ_ENABLED` switch below | Anonymous visitors reach the app; every data route is closed unless the switch is set; editor pages redirect to sign-in; the tick needs the secret | Small | **Recommended** |
| B. Move hosting to Cloudflare Workers + D1 with its own cron | New Worker, new D1, D1 export/import of production tables, ChatGPT sign-in replaced or re-implemented, new domain | No dependence on Site audience; a full data and auth migration with rollback planning | Large | Fallback if the platform does not strip identity headers (see verification) |
| C. Keep the Site private and drive intake from the owner's browser | Nothing | None | None | Already the status quo; not unattended |

Route A depends on one platform property that this repository cannot prove from
code: on a public Site the edge must strip visitor-supplied
`oai-authenticated-user-*` headers, so that `lib/editor-auth.ts` only ever sees
identities the platform injected. The starter README states that anonymous
visitors carry neither header, and the vendored dev plugin strips them locally,
but the production edge has to be tested once, before any secret is provisioned
and before the scheduler is connected. `ops/ingress-probe` exists for that test.

## What anonymous visitors can read

Audit of every route with no `editorialAuth()` call, as of this commit.

| Route | Before this commit | After this commit |
| --- | --- | --- |
| `GET /api/representations` | Every machine-captured `discovered:*` representation, including ones a reviewer had **rejected**: AI-attributed speaker name, verbatim quote, AI-written proposition, AI-assigned issue, party lane label, source URL and dates. No assessments, citations, materiality or drafts. | Closed (403) unless `PUBLIC_READ_ENABLED` is truthy. When open, rejected representations are excluded. |
| `GET /api/records` | Only published, reviewed CHECKING records, but each carries the **full captured source text** (up to 90,000 characters), human search summaries and evidence excerpts. | Closed (403) unless `PUBLIC_READ_ENABLED` is truthy. Payload unchanged when open. |
| `/records` | The published list plus the incoming inventory. | A "not yet public" notice unless the switch is set. |
| `/editor` | The workspace shell rendered for anyone; data calls then failed with 401. | Anonymous visitors are redirected to Sign in with ChatGPT before any markup is served. |
| `/` | Redirects to `/editor`. | Unchanged: an anonymous visitor lands on sign-in. |
| `GET /api/automation/health` | Did not exist. | Reports reachability and whether the tick secret is provisioned. Holds no data. |
| `POST /api/automation/tick` | Secret-gated; 401 when the secret is unset. | Unchanged. |
| `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback` | Platform-owned. | Unchanged. |

Points the founder should weigh before ever setting `PUBLIC_READ_ENABLED`:

1. The incoming inventory publishes AI attribution and AI paraphrase before a
   human has checked either. A misattributed quote under a party label is the
   likeliest harm. Rejected items now disappear, but unreviewed ones still show.
2. `/api/records` republishes whole captured statements. Official government
   text is generally free to reuse; other sources may not be. Consider trimming
   `originalContent` to the passage around the quote before public launch.
3. Both routes are unauthenticated JSON. Anything they return can be scraped.

## Switch: `PUBLIC_READ_ENABLED`

A Site environment variable, read on the server only. Accepted true values:
`1`, `true`, `yes`, `on` (case-insensitive). Anything else, or unset, keeps the
public read surface closed. It is independent of the platform audience setting:
a public Site with the switch unset shows nothing but the notice page, the
health probe and the sign-in wall. Setting it is a publication decision.

## Order of operations

Each step names who acts. Nothing after step 2 should happen if step 3 fails.

1. **Deploy this commit to the Site** (Sites deploy workflow). It is safe on the
   private Site: with the audience unchanged nothing is reachable from outside,
   and with the switch unset nothing new is exposed to the owner either.
2. **Change the Site audience** so anyone on the internet can reach it (Sites
   dashboard). Do not set any secret yet.
3. **Run the ingress probe** (Cloudflare dashboard): create a temporary Worker
   from `ops/ingress-probe/worker.js`, set the plain variable `ON_RECORD_URL`
   to the Site origin, open the Worker URL, read the verdict, delete the Worker.
   A FAIL on the forged-header check means: return the Site to private at once
   and fall back to route B. A FAIL on the reachability check means the edge
   still blocks machine callers and route A is not available on this plan.
4. **Provision the tick secret** (two dashboards, same value, never in chat):
   Site secret `AUTOMATION_TICK_SECRET`; Worker secret `ON_RECORD_TICK_SECRET`.
   Redeploy the Site so the secret binds. `/api/automation/health` then reports
   `tickSecretConfigured: true`.
5. **Install the scheduler** (Cloudflare dashboard): replace the Hello World
   code of `on-record-scheduled-intake` with `ops/scheduled-intake/worker.js`,
   set the plain variable `ON_RECORD_URL`, and add a temporary Cron Trigger
   every ten minutes. The app's unique hour slot makes the extra firings return
   `ALREADY_RUNNING_OR_COMPLETE`, which is itself the repeat-slot test.
6. **Verify one run** in the Worker's logs and in the editor's "Scheduled
   intake" panel (`automation_runs`). Then replace the temporary trigger with
   the two production triggers, `0 13 * * *` and `0 19 * * *` UTC.
7. **Verify a real scheduled run** the next day, plus a `DAILY_LIMIT` response
   on a third call. Only then is unattended intake live.

Rollback at any point: set the Site audience back to private. The app needs no
change; the switch and the secret can stay.

## State ladder

| Item | Coded | Deployed to Site | Ran manually | Verified on schedule |
| --- | --- | --- | --- | --- |
| Tick job, ledger, hour slot, daily cap | yes | yes (per handoff) | locally only, against local D1 (COMPLETE, ALREADY_RUNNING_OR_COMPLETE, DAILY_LIMIT all observed) | no |
| `PUBLIC_READ_ENABLED` switch, rejected-quote filter, editor sign-in wall, health probe | yes | no | locally only | not applicable |
| Cron adapter Worker | yes | Hello World only on Cloudflare | no | no |
| Ingress probe Worker | yes | no | no | not applicable |
| Tick secret | not applicable | not provisioned | not applicable | not applicable |
| One complete private draft after credit top-up | not applicable | not applicable | not established | not applicable |
