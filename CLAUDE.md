# On Record

Private checking instrument for political statements, plus the "Talk is cheap"
legislation module. Next.js 16 on Vercel, Turso (SQLite) database, Drizzle,
pnpm. Tests are plain `node --test` files in `tests/`.

**Read `docs/OPERATING_RULES.md` first and follow it in every session.** It
sets when to decide alone and when to stop, how to verify deploys (the public
health probe, never the Vercel API), billing rules, and how to report.

Then read, in this order: `STATUS.md` (plain-language state), `docs/DECISIONS.md`
(what is decided), `docs/TALK_IS_CHEAP_PLAN.md` (the phased plan and its
checkpoints).

Verify before claiming anything is done: `pnpm test`, `pnpm typecheck`,
`pnpm lint`, `pnpm build`. Never alter an existing table, touch the 41
review-gate triggers, or make anything public without asking.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
