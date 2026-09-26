# Public access, ingress and the scheduler path (2026-09-25, revised 2026-09-26)

This document records why the Site audience has to change for unattended intake
to run, what an anonymous visitor can and cannot read once it does, and the
exact order of account steps. It is the reference for the founder decision in
`CLAUDE_HANDOFF.md` step 1. Nothing here has been applied to the production
Site; see "State ladder" at the end for what is coded, deployed, run and verified.

## Decision of 2026-09-26: host on Vercel

The owner-private ChatGPT Site never let an outside request reach the app, so
no scheduler could call the job. Three routes were compared on 2026-09-25 (widen
the Site audience; move hosting; stay browser-driven). On 2026-09-26 the founder
chose to move hosting to Vercel, where the scheduler is built in:

| Concern | ChatGPT Site (before) | Vercel (now) |
| --- | --- | --- |
| Scheduler | none; needed a Cloudflare Worker that could not get past the edge | Vercel Cron in `vercel.json`, authenticated with `CRON_SECRET` |
| Ingress | platform edge 401 before the app | requests reach the app; every lock is in the app |
| Editor identity | ChatGPT identity headers injected by the platform | Access key exchanged at `/login` for a signed HttpOnly cookie; reviewer identity from `EDITOR_EMAILS` |
| Database | Cloudflare D1, no documented export | Turso, same SQLite schema and migrations |
| Deploys | through a Codex session | on every push to the production branch |

The Cloudflare adapter and the ingress-probe Worker were removed with this
change; the platform-header assumption they existed to test no longer applies.
The seven candidates captured on the Site were not migrated; discovery refills
the queue on the first scheduled run.

## What anonymous visitors can read

Audit of every route with no `editorialAuth()` call, as of this commit.

| Route | Before this commit | After this commit |
| --- | --- | --- |
| `GET /api/representations` | Every machine-captured `discovered:*` representation, including ones a reviewer had **rejected**: AI-attributed speaker name, verbatim quote, AI-written proposition, AI-assigned issue, party lane label, source URL and dates. No assessments, citations, materiality or drafts. | Closed (403) unless `PUBLIC_READ_ENABLED` is truthy **and** at least 20 reviewed CHECKING records are published (`PUBLIC_INVENTORY_MIN_PUBLISHED`). When open, rejected representations are excluded. |
| `GET /api/records` | Only published, reviewed CHECKING records, but each carries the **full captured source text** (up to 90,000 characters), human search summaries and evidence excerpts. | Closed (403) unless `PUBLIC_READ_ENABLED` is truthy. When open, `source.passage` carries only the text around the exact quote (600 characters each side, cut on word boundaries); the full capture stays in the private editorial record. |
| `/records` | The published list plus the incoming inventory. | A "not yet public" notice unless the switch is set. The inventory section renders nothing while it is withheld. |
| `/editor` | The workspace shell rendered for anyone; data calls then failed with 401. | Anonymous visitors are redirected to Sign in with ChatGPT before any markup is served. |
| `/` | Redirects to `/editor`. | Unchanged: an anonymous visitor lands on sign-in. |
| `GET /api/automation/health` | Did not exist. | Reports reachability and whether the tick secret is provisioned. Holds no data. |
| `POST /api/automation/tick` | Secret-gated; 401 when the secret is unset. | Unchanged. |
| `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback` | Platform-owned. | Unchanged. |

Founder decisions recorded on 2026-09-25, now enforced in code:

1. The incoming inventory publishes AI attribution and AI paraphrase before a
   human has checked either. It stays withheld until 20 reviewed records are
   published, whatever the switch says. Rejected items never appear.
2. `/api/records` no longer republishes whole captured statements; it shows the
   passage around the quote with a link to the original.
3. Both routes are unauthenticated JSON. Anything they return can be scraped.

## Switch: `PUBLIC_READ_ENABLED`

A Site environment variable, read on the server only. Accepted true values:
`1`, `true`, `yes`, `on` (case-insensitive). Anything else, or unset, keeps the
public read surface closed. It is independent of the platform audience setting:
a public Site with the switch unset shows nothing but the notice page, the
health probe and the sign-in wall. Setting it is a publication decision.

## Order of operations on Vercel

1. **Create the database** (Turso) and put its stable URL and token in Vercel as
   `ON_RECORD_DATABASE_URL` and `ON_RECORD_DATABASE_TOKEN`. The Marketplace
   integration's own `TURSO_*` pair names a different database per deployment
   (verified on 2026-09-26 by comparing two deploys), so it must not be relied on.
   Names in `.env.example`.
2. **Set `EDITOR_ACCESS_KEY`** (long random value) and `EDITOR_EMAILS` (the reviewer's email). Empty fails closed.
3. **Set `OPENAI_API_KEY`** (project-scoped key with an expiry) and, in the
   OpenAI dashboard, enforce a hard monthly spend limit on that project.
4. **Set `CRON_SECRET`** to a fresh random value. Vercel Cron sends it on every
   scheduled call. `AUTOMATION_TICK_SECRET` is optional and only for manual POSTs.
5. **Deploy.** The build applies migrations, then `GET /api/automation/health`
   should report `cronSecretConfigured: true` and `database: "turso"`.
6. **Sign in** at `/login` with the access key, open `/editor`, confirm the source queue fills.
7. **Verify a scheduled run** the next day in the editor's "Scheduled intake"
   panel (`automation_runs`), then a `DAILY_LIMIT` response on a third call.
   Only then is unattended intake live.

Leave `PUBLIC_READ_ENABLED` unset until the founder decides to publish.
Rollback: pause the crons by removing them from `vercel.json`, or set the
project's deployment protection; the data stays in Turso.

## State ladder

| Item | Coded | Deployed to Site | Ran manually | Verified on schedule |
| --- | --- | --- | --- | --- |
| Tick job, ledger, hour slot, daily cap | yes | yes (Vercel) | locally: COMPLETE, ALREADY_RUNNING_OR_COMPLETE, DAILY_LIMIT all observed | **yes**: Vercel Cron GET at 13:00:38 UTC on 2026-09-26 returned 200; ledger row slot `2026-09-26T13`, COMPLETE, capture CAPTURED, research COMPLETE, 109 s |
| `PUBLIC_READ_ENABLED` switch, rejected-quote filter, 20-record inventory gate, passage trimming, editor sign-in wall, health probe | yes | no | locally only | not applicable |
| Vercel Cron entries (13:00, 19:00 UTC) | yes | yes | not applicable | first firing verified 2026-09-26 13:00 UTC |
| Access-key sign-in (founder chose free over Supabase, 2026-09-26) | yes | pending | local only | not applicable |
| Turso database (stable `on-record`, hand-set) | migrations unchanged | yes, migrated at build | yes | same hostname across three deploys |
| CRON_SECRET, OPENAI_API_KEY | not applicable | provisioned | not applicable | used by the 13:00 run |
| One complete private draft after credit top-up | not applicable | not applicable | produced by the 13:00 scheduled run (research COMPLETE); human inspection pending | not applicable |
