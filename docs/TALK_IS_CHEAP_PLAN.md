# Talk is cheap: legislation and issues module

Plan of 2026-11-13, updated the same day with the owner's decisions (headline is Analysis; statement intake once a day; reader sign-in by email magic link) and Phase B as built. Brand line: "Talk is cheap. The record isn't."
Everything here ships behind `PUBLIC_READ_ENABLED` (off). While it is off,
the new pages are visible only to a signed-in editor, as a private preview.

## Ground rules

1. **Three content types, separate in schema and UI.**
   - `official_*` tables: ingested from government sources, stored with source
     URL and retrieval time, auto-published (behind the switch), no review gate.
   - `analysis_*` tables (Phase B): AI-written, labelled "Analysis", reviewed by
     sampling (1 in 5 to start; low-confidence items always queued).
   - `opinion_*` tables (Phase C): user and friend votes. Never joined into an
     official or analysis view; never presented as a poll of constituents.
   Every summary section carries a visible **Official** or **Analysis** badge.
2. **No grades or ratings of politicians.** Pages show activity: votes,
   sponsorships, statements. The only score is the user's own agreement score,
   computed from the user's own votes and private unless shared.
3. **Nothing existing is altered.** Every table below is new. The 41 review-gate
   triggers are untouched. No existing table gains or loses a column.

## Data sources (checked 2026-11-13 from the build machine)

| Source | Used for | Checked |
| --- | --- | --- |
| unitedstates/congress-legislators `legislators-current.json` (CC0) | Members, party, state, district, bioguide ↔ Senate LIS id crosswalk | 200, 539 members, all 100 senators carry a LIS id |
| House Clerk `clerk.house.gov/evs/{year}/roll{NNN}.xml` | House roll calls, member by member (bioguide ids) | 200; latest 2026 roll is 323 (12 Nov). A missing roll also answers 200 with an error body, so the parser checks for a `<rollcall-vote>` root |
| Senate LIS `roll_call_lists/vote_menu_{congress}_{session}.xml` and `roll_call_votes/vote{c}{s}/vote_{c}_{s}_{NNNNN}.xml` | Senate roll calls, member by member (LIS ids) | 200; 262 votes in the 119th Congress, 2nd session |
| Congress.gov API v3 (`CONGRESS_GOV_API_KEY`) | Bill detail, policy area, legislative subjects, latest action, official summaries, CBO links; recent-bills list for category pages | Demo key answers 429. Needs the owner's free key (MANUAL) |
| Census Geocoder (Phase C) | Address → congressional district for "find my representatives"; no key | Not yet checked |
| Open States v3, LegiScan fallback (Phase E) | Texas legislature | Not yet checked |

Google Civic's representatives lookup was retired in 2025, so Phase C uses the
Census Geocoder (address in, district out; the address is not stored).

## Schema

All tables are **new**. Columns that later phases need are added as new nullable
columns or new tables, never by changing an existing one.

### Phase A (migration 0011)

| Table | Purpose |
| --- | --- |
| `issue_categories` | The 14 fixed categories (slug, name, order). |
| `category_mappings` | Editable mapping: Congress.gov policy area or legislative subject (exact or contains) → category, with a note. Seeded from `lib/federal/categories.ts`; seeding only inserts missing rows, so edits persist. |
| `official_politicians` | One row per current member (bioguide id), with LIS id, party, state, district, chamber, term dates, official site, source URL, retrieval time. |
| `official_bills` | One row per bill (`119-hr-2102`), title, policy area, latest action, sponsor, Congress.gov page, `detail_status` (`stub` from a vote, `complete` from Congress.gov), source URL, retrieval time. |
| `official_bill_subjects` | Legislative subjects per bill. |
| `bill_categories` | Bill → category, with `method` (`mapping`, `editor`, later `ai`), the mapping row that produced it, and confidence. |
| `official_roll_calls` | One row per roll call (`house-2026-323`, `senate-119-2-262`): chamber, date, question, title, result, document label, bill link, tallies, source URL, retrieval time. |
| `official_member_votes` | Roll call × member → position (Yea, Nay, Present, Not Voting) plus the raw word the chamber used (House writes Aye/No). |
| `app_users` | Viewer identities. Phase A has one kind, `editor`, keyed by a hash of the editor email so a follow can be stored; Phase C adds `public`. |
| `user_follows` | User → politician. |
| `ingest_runs`, `ingest_cursors` | Ledger of each ingestion job and where each chamber's cursor stands. |

### Phase B (migration 0012, built 2026-11-13)

| Table | Holds |
| --- | --- |
| `analysis_bill_summaries` | One row per bill text version: headline, what it does (≤3, each with a section cite), who it affects, what changes for you, case for ×2 and against ×2 with attribution, what we don't know, confidence and reason, checker result, attempts, status (visible, held, rejected), model, prompt version, tokens, cost, sources. |
| `analysis_checks` | Every checker run: attempt, pass or fail, each failure and warning, word count, reading grade, for/against word counts. |
| `analysis_review_queue` | Summaries waiting for the editor: the 1-in-5 sample, every low-confidence one, every one that failed the checker twice. Decision, note, reviewer. |
| `official_cost_estimates` | CBO cost estimates listed for a bill (date, title, link), from govinfo BILLSTATUS. |
| `model_calls` | Every OpenAI call from any job: purpose, model, tokens, web searches, priced cost, billing refusals. Feeds per-summary cost and the low-balance alert. |

### Later phases (planned, not built)

- **C** `app_users` gains nullable `email_hash`, `display_name`, `district`;
  `user_issue_prefs` (top 3), `opinion_user_votes` (user × bill → Support or
  Oppose), `friend_invites`, `friendships`, `share_cards` (opt-in per card).
- **D** `people_politicians` (crosswalk from captured speakers to members),
  `said_did_rules` (documented, party-blind rules), `said_did_links` (statement
  × vote or promise, `match` or `contradiction`, rule id or editor, evidence).
- **E** state rows in the same official tables with a `jurisdiction` column on
  new state-only tables; Open States ids; Texas first.

## Ingestion jobs and schedule

No new cron entries (standing decision: the Vercel plan's cron cap). Federal
ingestion runs at the start of the two existing scheduled runs (13:00 and
19:00 UTC, about 8am and 2pm Eastern), uses no OpenAI, and runs even when the
OpenAI budget is exhausted. Each run has a 120-second budget and resumes from
its cursors next time.

Owner decision 2026-11-13: statement intake (capture and research, the
model-bearing part) runs once a day, at the 13:00 run (`STATEMENT_INTAKE_HOURS_UTC`,
default `13`). The 19:00 run does the federal update, bill summaries,
monitoring and the afternoon nudge, and writes no intake ledger row.

Bill summaries (Phase B) run in the 19:00 run with the time left after the
federal update, and from the editor's "Write summaries now" button. Each run
stops at the summary cap (`ANALYSIS_MAX_SUMMARIES`, default 5 during the test)
or the spend cap (`ANALYSIS_SPEND_CAP_USD`, default $3, all summary calls ever),
checked against the worst case before every model call.

1. Members: once a day.
2. Senate: read the session's vote list, fetch votes newer than the cursor
   (first run backfills the latest 40), up to 40 per run.
3. House: fetch roll numbers above the cursor until the first missing one
   (first run finds the latest and backfills 40), up to 40 per run.
4. Bills: every roll call tied to a bill creates a stub from the vote's title.
   With `CONGRESS_GOV_API_KEY` set, stubs are completed (policy area, subjects,
   latest action) and the recent-bills list is read, up to 40 bills per run.
5. Categorise every complete bill by the mapping table.

An editor button ("Update now") runs the same job on demand. A failed run is
recorded in `ingest_runs` and two failures in a row raise one exception email.

## Routes

| Route | Phase | Who can see it while the switch is off |
| --- | --- | --- |
| `/politicians`, `/politicians/[id]` | A | Signed-in editor |
| `/issues`, `/issues/[slug]` | A | Signed-in editor |
| `/bills/[id]` | A (official facts), B (summary) | Signed-in editor |
| `/following` | A | Signed-in editor |
| `POST /api/ingest/federal` | A | Scheduler secret only |
| `POST /api/editor/federal-ingest` | A | Editor session |
| `/editor/analysis`, `POST /api/editor/analysis/generate` | B | Editor session |
| `/join`, `/me`, `/friends`, `/share/[card]` | C | Nobody until the switch is on |

## Reader sign-in (Phase C; approved 2026-11-13)

Approved: email magic link, sent through the Resend account already in use, with a signed
HttpOnly session cookie built on the same HMAC pattern as the editor session
but a separate secret. No passwords, no third-party login SDK, no new vendor.
Stored: a hash of the email for lookup, the email itself only for sending the
link, an optional display name for friends, and the congressional district.
No address, no birthday, no party. Political views (user votes) are sensitive
data: never sold, never shown to anyone but the user unless the user shares a
card or a friend can see them (friends only by default). A privacy notice
ships with sign-up.

Constraint: Resend sends to anyone only from a verified domain, and the free
tier allows 100 emails a day. Launch needs the domain (MANUAL, a pre-launch task that does not block
building) and possibly the $20 Resend plan.

## Cost estimate

- **Phase A and E ingestion:** no model calls. Free sources. Turso and Vercel
  stay inside the current plans: roughly 1,000 roll calls a year × 535 members
  ≈ 535,000 vote rows a year.
- **Phase B summaries (as built):** one gpt-5.4-mini call reads the CRS
  summary, the CBO listing, the section list and up to 40,000 characters of
  bill text (about 10,000 tokens), writes up to 4,000 tokens, and regenerates at
  most once. No web search and no second model pass: the neutrality check is the
  rule checker plus the editor's sampling. Worst case about $0.03 a call, so
  about $0.06 a summary. Real cost per summary is stored from token usage
  (lib/model-cost.ts; prices from third-party listings of OpenAI's list prices
  because openai.com could not be read from the build machine; `OPENAI_PRICES_JSON`
  overrides them).
- **Monthly:** explaining only bills that get a roll-call vote is roughly 30 to
  60 bills a month: at about $0.01 to $0.06 each, **under $4 a month**. Owner
  decision 2026-11-13: intake cut to once a day (about $18 a month at the
  measured $0.61 per captured and researched statement).

## Risks

- **Bill detail needs the owner's Congress.gov key.** Without it, bills exist
  only as titles taken from votes, and category pages stay empty.
- **senate.gov or the House Clerk may block data-centre traffic.** Both answered
  from the build machine; a block would show as failed runs and an alert.
- **Function time.** The scheduled run has 300 seconds; ingestion is capped at
  120 so capture and research keep their share.
- **Neutrality (B).** The checker blocks loaded words, missing cites and
  for/against imbalance before a person sees anything; sampling catches the rest.
- **Sensitive data (C).** User votes reveal political views. Minimal fields,
  friends-only default, opt-in per share, a deletion path.
- **Said vs. Did (D).** A wrong pairing is a public accusation. Only people and
  documented party-blind rules create links; never free-form AI.
- **Headline label (decided 2026-11-13).** The headline is Analysis: a "Would
  [do X] for [whom]" sentence is written, not ingested. The bill's official
  title is shown above it as the Official line.

## Summary template (Phase B, as built)

| Section | Badge | Source |
| --- | --- | --- |
| Official line: the bill's title | Official | Congress.gov |
| Headline: "Would …", ≤20 words | Analysis | Model |
| Status: latest action, sponsor, introduced | Official | Congress.gov |
| What it does: ≤3 points, each citing a section | Analysis | Model, cites checked against the text |
| Who it affects: 1–3 points with cites | Analysis | Model |
| Cost: CBO estimates with links, or "none published" | Official | govinfo BILLSTATUS |
| What changes for you: ≤45 words | Analysis | Model |
| The case for and against: exactly 2 each, attributed, within 25% in length | Analysis | Model |
| What we don't know: 1–3 points | Analysis | Model |
| How your politicians voted, then all recorded votes | Official | House Clerk, senate.gov |
| Sources | — | Links to every record used, model and checker result |

The rule checker (lib/analysis/checker.ts, tested in tests/analysis.test.mjs)
fails a draft for: a headline not starting "Would" or over 20 words; a missing
cite or a cite to a section the text does not contain; more than 3 points; not
exactly 2 arguments a side; an empty or vague attribution ("critics"); for and
against more than 25% (at least 8 words) apart; loaded words (list in the
file); first-person opinion or grades; more than 360 words; reading grade
above 12 (warning above 9; target about 8); high confidence on a bill read
only in part. A failed draft is regenerated once with the failures as
feedback; a second failure is held for the editor.

Routing: failed twice → held and queued; low confidence → held and queued;
otherwise visible, and every 5th summary generated is also queued for an
audit. Held summaries are shown only to the signed-in editor, labelled "Held
for review". All of it stays behind `PUBLIC_READ_ENABLED`.

## Phases and checkpoints

| Phase | Builds | Checkpoint on the phone |
| --- | --- | --- |
| A | Schema, ingestion, politician pages, issue pages, follows | Follow one senator and see their last 10 votes; browse Health care and see recent bills |
| B | Summary template, rule checker, badges, sampling queue, cost tracking | 5 real bills with complete summaries |
| C | Accounts, top-3 issues, user votes, friends, agreement score, share cards | Share one card to Instagram Stories |
| D | Said vs. Did links and cards | One match and one contradiction, both rule-documented |
| E | Texas via Open States, LegiScan fallback | A Texas legislator page with real votes |
