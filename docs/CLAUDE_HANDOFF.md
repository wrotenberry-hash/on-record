# On Record: Claude Code handoff (2026-09-25)

## Start here

This repository is the **On Record** ChatGPT Site, project `appgprj_6ab673e4156081918ea0f1f7ea095334`, deployed at `https://on-record-review.n46csd5yyk.chatgpt.site`. It is an owner-private Site with a D1 `DB` binding declared in `.openai/hosting.json`. The current checkout's last deployed code commit was `205e741c5bbede183bd9cdba8564c85592c201c0` (2026-09-25 21:36 UTC). There is no configured Git remote in this checkout. Do not assume Claude Code can access the Site, its D1 database, or its secrets just because it has these files. Obtain a supported deployment path before making production claims.

The user's objective is **fully unattended intake and private evaluation of political representations across a broad political and media spectrum**, with current reporting and selected historical material, feeding a checking instrument. The user wants enough real, authenticated, reviewed material to evaluate whether the site can launch. Keep provisional machine outputs private as assessments; no automatic final verdict, numerical public rating, or person aggregate under current methodology. The human reviewer authenticates originals, checks exact representations and attribution, locks materiality, inspects bilateral evidence, and decides publication. See `docs/BUILD_CONTRACT.md`, `docs/DECISIONS.md`, `docs/METHODOLOGY.md`, and `docs/CHECKING_INSTRUMENT_CONTRACT.md` before changing these gates.

## What is actually implemented

- `lib/source-discovery.ts` defines seven official current index adapters and eight selected historical leads. The private queue deduplicates URLs and records adapter errors. HTML/text current sources can be captured and extracted; video needs a verified transcript; multi-speaker originals need attribution work. This is **not** comprehensive social, audio, video, OCR, or historical intake.
- `/editor` triggers a once-per-UTC-day scan when an authenticated editor opens it, captures at most one current lead, and initiates one private draft research attempt. Thus browser-open automation works, but it is not unattended.
- `app/api/automation/tick/route.ts` implements a bearer-secret machine job: scan, capture one eligible lead, and run one bilateral private research draft. `automation_runs` enforces a unique UTC-hour slot and at most two attempts per UTC day by default (configurable maximum five). `research_daily_budgets` also limits model draft attempts across editor and scheduler. Failures count to prevent runaway retries.
- `ops/scheduled-intake/worker.js` is a Cloudflare scheduled adapter that POSTs to the Site's `/api/automation/tick`; `wrangler.toml` specifies `0 13,19 * * *` UTC. It logs non-2xx errors. The editor can inspect run status via `app/api/editor/automation-status/route.ts`.
- `OPENAI_API_KEY` is a server-side Site secret already used by extraction and research. Models default to `gpt-5.4-mini` extraction and `gpt-5.5` research; see `lib/automated-research.ts` and `docs/AUTOMATED_RESEARCH_SETUP.md`. The user loaded $30 prepaid API credit. Billing is separate from ChatGPT. Do not copy or ask for the key in chat or code. Check the current OpenAI project spend limit and actual usage before increasing volume.
- Private machine drafts record separate supporting/contrary live search leads and a provisional assessment. Human source authentication, representation approval, materiality lock, evidence inspection, review, and explicit publication remain necessary. Publication of rated verdicts and person aggregates is disabled. Some machine-captured unverified passages appear in the public incoming inventory without a verdict; examine this exposure before changing Site audience.
- Existing D1 migrations through `drizzle/0008_quiet_selene.sql` have been deployed to the Site. `tests/automation.test.mjs` and other targeted tests cover bounded behavior; last deployment passed 12 tests, TypeScript and build. Re-run after changes.

## Production truth and blocker

The Site code and migration are deployed, but **unattended operation is not live**. The owner-private Site's edge returns HTTP 401 for an outside machine request **before the app route receives it**. A platform bypass value exposed in tooling did not work as an ordinary Authorization bearer; never copy it into a prompt or treat it as a supported service credential. `AUTOMATION_TICK_SECRET` has not been provisioned in the Site, and no successful scheduled tick has been observed. No production `automation_runs` entry demonstrates a complete unattended pass. Early screenshots showed three failed research items due to OpenAI `credit_balance_exhausted`/429; the user subsequently added $30, but no complete draft after that has been established here.

The user created a Cloudflare account and deployed a Worker named `on-record-scheduled-intake` via the Hello World template. Their latest screenshot shows the Worker Production overview with **0 invocations, 0 errors**. It is still Hello World. The code from `ops/scheduled-intake/worker.js` has not been installed there, the `ON_RECORD_URL` and `ON_RECORD_TICK_SECRET` secrets have not been set, and no Cron Trigger has been enabled. Avoid setting the schedule until the ingress path is working. A Cloudflare Worker alone cannot bypass the owner-private Site's edge.

## Priority engineering sequence

1. **Inspect the deployment and access options.** Determine a supported machine-to-machine route through Sites owner-private access. If none exists, prepare a reviewable migration or audience-change design. One option is to make the public-facing Site reachable anonymously while keeping `/editor`, all write APIs, machine drafts, and the tick endpoint protected by application auth/secrets. Before changing audience, ensure no unreviewed candidate inventory or private data leaks through public routes. Another option is to host the application and its D1-backed state under Cloudflare with its scheduler. That requires a deliberate database and auth migration, not just moving the cron adapter. Do not quietly make the Site public or migrate production data.
2. **Prove the complete private pilot once.** Verify current OpenAI credit, project hard spend limit and model availability without disclosing keys. On a real short official source, verify capture digest and exact quote, supporting and contrary actual web searches/citations, private draft, human gate progression, and usage. Diagnose any 429 independently of Site access. Note that a draft citation is only a lead pending source inspection.
3. **Connect the scheduler only after ingress works.** Create a fresh high-entropy tick secret in secure secret stores: Site `AUTOMATION_TICK_SECRET`, Cloudflare Worker `ON_RECORD_TICK_SECRET`. Set Worker `ON_RECORD_URL` to the reachable HTTPS app origin. Install the adapter code; create two UTC Cron Triggers corresponding to `wrangler.toml`; do one manual authorized invocation and inspect response and `automation_runs`, then verify a real scheduled run. Exercise repeat slot and daily cap. Do not put secrets in console screenshots, prompts, repository, or client-side code.
4. **Expand source coverage in measured phases.** Add source-specific adapters with provenance, timestamp, speaker, canonical original and licensing/terms checks for party/candidate channels, public officials, legislative releases, interviews, debates, social originals, video/audio transcripts and historical archives. Track source gaps and failure rates by party/role/medium/era rather than claiming equal volumes or auto-inferred balance. Deduplicate canonical URLs and propositions; isolate multi-speaker attribution. Preserve original context and correction history.
5. **Evaluate launch readiness.** Build a real reviewed sample with source diversity and issues. Measure extraction precision, quote fidelity, attribution, duplicate rate, evidence quality, contrary-search completeness, editorial time per case, cost per accepted case, latency, and freshness. Define and get founder approval on coverage, sufficiency, rating and correction rules before enabling ratings or aggregate scores. Keep public claims grounded in reviewed records.

## Repo map and local workflow

- `docs/UNATTENDED_INTAKE.md`: exact operational contract and ingress blocker.
- `docs/INTAKE_STRATEGY.md`, `docs/BUILD_STATUS.md`: staged source coverage and present state.
- `docs/CHECKING_INSTRUMENT_CONTRACT.md`, `docs/EDITORIAL_API.md`, `docs/SCORING_INSTRUMENT.md`: gates and methodology.
- `app/api/editor/discover/route.ts`, `app/api/editor/intake/route.ts`: discovery/capture.
- `app/api/editor/cases/[id]/draft-research/route.ts`, `lib/automated-research.ts`, `lib/research-budget.ts`: model research and daily budget.
- `app/api/automation/tick/route.ts`, `app/api/editor/automation-status/route.ts`: unattended entry and audit.
- `db/schema.ts`, `drizzle/`: persistence/migrations. `ops/scheduled-intake/`: Cloudflare adapter.

Node >=22.13.0; `package.json` uses pnpm, vinext/Next, Cloudflare Workers and D1. Follow the Sites project deployment workflow if available; do not confuse a local `npm run build` or `wrangler dev` with a production Site deploy. In this checkout, `git remote -v` returned no remote, so create a private Git remote under the user's control or use the archive provided with this handoff as the initial source. Protect all secrets and production data. Run targeted tests (`node --test tests/*.test.mjs`), TypeScript (`npx tsc --noEmit`), and `npm run build` after modifications. Verify live endpoint and ledger after deployment.

## Integration directions for Claude Code

Open the attached repository archive as a directory. Read this file, `docs/UNATTENDED_INTAKE.md`, `docs/DECISIONS.md`, `docs/BUILD_CONTRACT.md`, and the relevant route/source files first. Audit the private-ingress blocker and propose a concrete supported deployment path with privacy impact, migration steps, rollback, and cost. Implement code changes and tests in the repo, then connect to the user's Cloudflare Worker and Site only through authorized account tooling or the user's local authenticated CLI. Ask the user for the minimum required account action only after the code and configuration are prepared. Never ask them to paste an OpenAI key, Cloudflare token, or tick secret into Claude chat. Report evidence of a real scheduled invocation before saying unattended is live.

## Update 2026-09-25, later: ingress decision prepared

The public read surface is now closed by default behind `PUBLIC_READ_ENABLED`, `/editor` has a sign-in wall, rejected quotes leave the inventory, and a reachability probe plus a throwaway ingress-probe Worker exist. `docs/PUBLIC_ACCESS.md` holds the route comparison, the exposure audit, the ordered account steps and the state ladder. Nothing in that update has been deployed; the Site is still owner-private and no secret has been provisioned.

## Update 2026-09-26: moved to Vercel

Hosting moved from the ChatGPT Site to Vercel (Next.js, Node runtime), with
Turso for the unchanged SQLite schema, Supabase Auth magic link for editor
sign-in behind the same allowlist, and Vercel Cron for the unattended job.
The Cloudflare adapter, the ingress probe and every Sites-specific file are
gone. `README.md` describes the new stack and local workflow;
`docs/PUBLIC_ACCESS.md` records the decision and the ordered account steps.
The Site at `on-record-review.n46csd5yyk.chatgpt.site` is superseded and can
be deleted once the Vercel deployment has completed one scheduled run.

## Deployment record (2026-09-26)

- Repository: `wrotenberry-hash/on-record`, production branch `main`.
- Vercel project `on-record` (team `wrotenberry`), production URL
  `https://on-record-wrotenberry.vercel.app`. First production deploy from
  commit 2e608ce built in 33 s. Vercel Authentication is kept on preview
  deployments only; production relies on the app's own locks, which were
  verified live: `/api/automation/health` 200, `/api/representations` 403,
  `/api/editor/cases` 401.
- Environment set so far: `CRON_SECRET` (sensitive, production and preview)
  and `AUTOMATION_DAILY_LIMIT=2`. Still to set: Turso, Supabase, the editor
  allowlist and `OPENAI_API_KEY`. A redeploy after those binds them.
- The branch `claude/on-record-handoff-l9o89x` in `wrotenberry-hash/gravel`
  was the temporary home before this repository existed and is now a stale
  mirror; do not develop there.

## Update 2026-09-26, later: sign-in and first scheduled run

The founder chose the free access-key sign-in over a paid Supabase project, with their own email as the reviewer identity. `lib/auth.ts` and `lib/session-token.ts` implement it; Supabase is gone from the dependencies. The first Vercel Cron run (13:00 UTC) completed with a capture and a research draft; see `BUILD_STATUS.md`.

