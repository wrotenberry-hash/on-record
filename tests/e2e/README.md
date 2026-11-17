# The usability suite

A script acts as a first-time trial reader on a phone and does the tasks in
`docs/USABILITY_TASKS.md`, counting taps and seconds. The same run checks every
reader page for accessibility (WCAG 2.1 A and AA) and for speed.

## Run it

```
npm run e2e                      # everything: tasks, accessibility, speed
npm run e2e -- --only 4,13,flow  # only these task ids
npm run e2e -- --prod            # build first (next build + next start): the real speed numbers
npm run e2e -- --base http://localhost:3000   # use a server that is already running
npm run e2e -- --no-axe --no-speed            # tasks only
npm run e2e -- --shots /some/folder --verbose # where screenshots go; show the server's output
node tests/e2e/seed.mjs --cleanup             # remove leftover test readers by hand
```

The runner starts the app itself on a free port with `PUBLIC_READ_ENABLED=false`
(stop any `next dev` already running in this folder first: Next allows one per
folder). It exits 0 only when no task failed, no page has an accessibility
violation and no page is over the speed budget.

- **Report:** `tests/e2e/report.md` (the table) and `tests/e2e/report.json`
  (every step), both overwritten on each run.
- **Screenshots:** one full-page picture per task, in the system temp folder
  under `on-record-e2e/` unless `--shots` or `E2E_SHOTS` says otherwise.
- **Database:** the local file `.data/on-record.db` only. The runner refuses to
  start if `ON_RECORD_DATABASE_URL` or `TURSO_DATABASE_URL` points anywhere
  else. It adds test readers (invites labelled `e2e`) and removes them, and
  everything they saved, when it ends.
- **Sign-in:** each task gets a brand-new invite. The runner reads
  `EDITOR_ACCESS_KEY` from `.env.local` inside its own process to sign the
  invite cookie the way `lib/trial-token.ts` does; the key is never printed.
- **Outside services:** none are called. Email, the bot check, text messages
  and the Census geocoder are answered by small local stand-ins
  (`lib/standins.mjs`), which is how task 15 (verify and cast a counted vote)
  runs without keys. With `--base` the stand-ins are not wired into the server,
  so tasks that need them are reported as "needs keys" instead of being faked.

## What is measured

- **Phone:** 390×844, touch, a real iPhone user agent (the app does not count
  events from clients that call themselves headless), CPU slowed 4× through the
  Chrome DevTools Protocol.
- **Taps:** taps on links and buttons from the home page. Typing (a ZIP, search
  words) is not a tap. A target that is off-screen in the sideways menu adds a
  "swipe" to the note.
- **Seconds:** from the home page appearing to the goal being on screen,
  scripted, so with no reading time. Every task has a 30-second budget; task 15
  has the plan's 90 seconds.
- **Pass:** the goal was reached within the tap and time targets and no page on
  the way scrolled sideways. **Blocked:** the task cannot pass until something
  outside the code changes (the note says what). **Needs keys:** it needs a
  service the stand-ins were not available for.
- **Accessibility:** axe-core, tags `wcag2a wcag2aa wcag21a wcag21aa`, on every
  page a task lands on (in the state the reader sees it) and on the page list
  in `pages.mjs`. Zero violations required. axe-core is not a direct
  dependency; it comes with `eslint-config-next` and is read from
  `node_modules/.pnpm/axe-core@*/` (or `/opt/node-tools`).
- **Speed:** for each page in `pages.mjs`, "interactive" is the later of
  `domInteractive` (Navigation Timing API) and the end of the last long task
  (50 ms or more) before the page stays quiet for one second. Budget: under 2
  seconds with the CPU slowed 4×. Also reported: JavaScript loaded, over the
  wire and unpacked (Resource Timing API). The server is local, so network time
  is not included; a development server (`next dev`) serves unminified scripts,
  so use `--prod` for numbers that mean something.

## Adding a task (the contract)

A task file is an ES module in this folder that exports one task as `default`,
or several as `tasks` (an array). The runner loads `tasks.mjs`, then the files
named in `registry.mjs` when they exist (`flow.mjs`, `contact.mjs`), then any
file ending in `.task.mjs`. So: create `tests/e2e/flow.mjs`, or name your file
`something.task.mjs`, or add one line to `registry.mjs`.

```js
export default {
  id: "flow",                          // unique; shown in the table; used by --only
  name: "The 60-second flow",
  target: { taps: 4, seconds: 60 },    // either may be null (not checked)
  reader: "new",                       // who the runner signs in, see below
  needs: ["standins"],                 // optional: local stand-ins for outside services
  async run(t) {                       // throw (or t.fail) to fail; return a short note
    await t.start();                   // open the home page and start the clock ("/" unless you pass a path)
    await t.tap('main a:has-text("Find your legislators")');
    await t.type("#zip", "78701");     // typing is not a tap
    await t.see("ul.leg-list a", "the reader's legislators");
    return "five legislators shown";
  },
};
```

`reader` is one of:

| Value | Who |
| --- | --- |
| `"new"` | just opened an invite link; nothing saved |
| `"onboarded"` | also gave ZIP 78701 (TX-37) and three issues through `/start` (override with `zip`, `issues` on the task) |
| `"returning"` | onboarded, last visit three days ago |
| `"account"` | onboarded and signed in by email through the stand-in inbox (add `needs: ["standins"]`) |

Add `invite: { activeDays, lastActiveDay }` to the task to start from an invite
that has already been used on some days.

`t` (see `lib/session.mjs`):

| Call | What it does |
| --- | --- |
| `t.start(path?)` | opens the page and starts the clock |
| `t.tap(selectorOrLocator, name?)` | one counted tap; waits for the next page; checks it for sideways scrolling and accessibility |
| `t.type(selector, text)`, `t.choose(selector, value)` | fill a field, pick from a list: not taps |
| `t.see(selector, what?)` | fails the task unless this is visible within 8 seconds |
| `t.has(selector)`, `t.text(selector)` | look without failing |
| `t.fail(message)` | stop with a failure |
| `t.blocked(message)` | stop as "blocked" (not a product failure; say exactly what must change) |
| `t.page`, `t.context`, `t.base` | the Playwright page and context, and the server address |
| `t.tools` | `{ standins, sample, invite }`: the stand-in inbox and codes, real ids from the local database, this reader's invite |
| `t.shot(name?)` | an extra screenshot (one is always taken at the end) |

Selectors are Playwright selectors. Keep a task to what a reader would do: start
at the home page, tap what is on screen, and check what the reader would see.

## Files

| File | What |
| --- | --- |
| `run.mjs` | the runner |
| `tasks.mjs` | the 18 tasks from `docs/USABILITY_TASKS.md` |
| `quality.task.mjs` | the feedback prompt and the "Something wrong?" link |
| `registry.mjs` | other task files to load when present |
| `pages.mjs` | which pages get the accessibility and speed checks |
| `seed.mjs` | test readers and answers in the local database, and their removal |
| `lib/` | phone browser, server start, stand-ins, tap counting, checks, report |
