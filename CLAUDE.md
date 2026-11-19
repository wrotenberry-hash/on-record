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

## Standing rule: keep working, and when to stop (owner, 19 Nov 2026)

Verbatim from the owner. Follow it in every session. Where it differs from `docs/OPERATING_RULES.md`, this wins.

- Keep working through the current phase without checking in. Run tests, fix what breaks, and continue.
- Only stop for: money, production data writes or migrations, anything an outside person sees, turning a flag on in production, or a bug that survives two fixes.
- Save every other question for the phase end: at most 3, one sentence each, with your recommendation and the default you'll use if I don't answer. Then proceed on the defaults.
- End each phase with one short report: what's done, what needs me (numbered hand steps), and what's next. Post that same report as a comment on the phase PR so it can be read without me pasting it.
- If an action needs an approval I can't see on my phone, skip it, note it in the report, and keep going on everything else.

How it is applied (Claude's reading, not the owner's words; change it if he says otherwise):

- It replaces rule 1 of `docs/OPERATING_RULES.md` ("wait for the go-ahead before each major step") and the check-in
  format of 16 Nov for work inside a phase. The hard stops in rule 3 there still hold.
- The stop list is wider than the old one in two places: any migration now stops (new tables used to be allowed), and
  so does any write to production data and any production flag or setting.
- A phase is worked on its own branch with one pull request against `main`; the end-of-phase report is posted as a
  comment on that pull request. `main` deploys to production, so a phase that contains a stop item is not merged
  until the owner has said yes to that item.
- No emails to the owner, and a push notification only at a stop or at the end of a phase.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
