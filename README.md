# On Record

A private review build of a checking instrument for political representations:
original communication → exact representation → normalized proposition →
bilateral evidence → human adjudication → explicit publication. Machine output
stays private; a person authenticates sources, approves representations, locks
materiality, inspects evidence and decides publication.

Read `docs/CLAUDE_HANDOFF.md` first, then `docs/DECISIONS.md`,
`docs/BUILD_CONTRACT.md`, `docs/METHODOLOGY.md` and
`docs/CHECKING_INSTRUMENT_CONTRACT.md` before changing any gate.

## Hosting (since 2026-09-26)

| Layer | Choice | Notes |
| --- | --- | --- |
| App | Next.js 16 (App Router) on Vercel | Node runtime; no edge functions |
| Database | Turso (hosted SQLite) via Drizzle | Same schema and migrations as the earlier D1 build |
| Editor sign-in | Supabase Auth magic link | Server-side only; allowlist in `EDITOR_EMAILS` |
| Scheduler | Vercel Cron | `vercel.json`: 13:00 and 19:00 UTC → `/api/automation/tick` |
| Models | OpenAI Responses API | `OPENAI_API_KEY` server-side only |

The earlier ChatGPT Sites deployment and its Cloudflare cron adapter are retired;
see `docs/PUBLIC_ACCESS.md` for why.

## Running locally

```bash
corepack pnpm install
cp .env.example .env.local   # optional; everything has a safe default
pnpm run db:migrate          # creates ./.data/on-record.db from ./drizzle
pnpm run dev                 # http://localhost:3000
```

Without Supabase settings, sign-in is disabled and every editor route answers
401. Without `OPENAI_API_KEY`, capture and research answer 503. Without
`CRON_SECRET` or `AUTOMATION_TICK_SECRET`, the tick answers 401. Without
`PUBLIC_READ_ENABLED=1`, the public routes answer 403 and `/records` shows a
private-review notice. All of that is by design: a fresh checkout exposes nothing.

```bash
pnpm test        # node --test tests/*.test.mjs
pnpm typecheck   # tsc --noEmit
pnpm lint
pnpm build       # runs migrations (when TURSO_DATABASE_URL is set), then next build
```

## Environment variables

See `.env.example`. Set production values in Vercel → Project → Settings →
Environment Variables. Never put a key in source, a chat message or a client bundle.

| Variable | Purpose |
| --- | --- |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Database. Unset locally means a file under `.data/`. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Editor sign-in only. Both server-side. |
| `EDITOR_EMAILS`, `EDITOR_USER_IDS` | Editor allowlist. Empty fails closed. |
| `OPENAI_API_KEY`, `OPENAI_EXTRACT_MODEL`, `OPENAI_RESEARCH_MODEL` | Extraction and research. |
| `CRON_SECRET` | Vercel Cron sends it as a bearer on the scheduled GET. |
| `AUTOMATION_TICK_SECRET` | Bearer for a manual `POST /api/automation/tick`. |
| `AUTOMATION_DAILY_LIMIT` | Job and research attempts per UTC day (default 2, max 5). |
| `PUBLIC_READ_ENABLED` | Anonymous reading of `/records` and its APIs. Off unless `1`. |
| `NEXT_PUBLIC_SITE_URL` | Absolute origin for magic-link redirects; optional on Vercel. |

## Database migrations

Schema lives in `db/schema.ts`; SQL migrations in `drizzle/` with Drizzle's
journal. `pnpm run db:generate` writes a new migration after a schema change;
`pnpm run db:migrate` applies pending ones. The Vercel build applies them
before `next build` whenever `TURSO_DATABASE_URL` is set. Never edit the
database by hand; the triggers in `drizzle/0000`–`0003` enforce the
methodology gates and must stay in the migration history.

## Routes

- `/editor`: the checking instrument. Sign-in required; allowlist enforced by every API.
- `/login`, `/auth/callback`, `/auth/signout`: magic-link sign-in.
- `/records`: published CHECKING records and, once 20 exist, the incoming inventory. Closed unless `PUBLIC_READ_ENABLED=1`.
- `/api/automation/tick`: the unattended job (GET from Vercel Cron, POST manually).
- `/api/automation/health`: reachability and which secrets are bound. No data.
