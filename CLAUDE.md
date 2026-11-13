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
