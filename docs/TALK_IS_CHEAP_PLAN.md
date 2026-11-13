# Talk is cheap: legislation and issues module

Plan of 2026-11-13. Brand line: "Talk is cheap. The record isn't."
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

### Later phases (planned, not built)

- **B** `analysis_bill_summaries` (one row per bill version: headline, what it
  does ×3 with section cites, who it affects, what changes for you, case for ×2
  and against ×2 with attribution, what we don't know, model, cost, checker
  result, confidence), `analysis_checks` (every checker run and failure reason),
  `analysis_review_queue` (sampled and low-confidence items, decision, reviewer),
  `official_cost_estimates` (CBO).
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
| `/join`, `/me`, `/friends`, `/share/[card]` | C | Nobody until the switch is on |

## Auth proposal (Phase C)

Email magic link, sent through the Resend account already in use, with a signed
HttpOnly session cookie built on the same HMAC pattern as the editor session
but a separate secret. No passwords, no third-party login SDK, no new vendor.
Stored: a hash of the email for lookup, the email itself only for sending the
link, an optional display name for friends, and the congressional district.
No address, no birthday, no party. Political views (user votes) are sensitive
data: never sold, never shown to anyone but the user unless the user shares a
card or a friend can see them (friends only by default). A privacy notice
ships with sign-up.

Constraint: Resend sends to anyone only from a verified domain, and the free
tier allows 100 emails a day. Launch needs the domain (MANUAL) and possibly the
$20 Resend plan.

## Cost estimate

- **Phase A and E ingestion:** no model calls. Free sources. Turso and Vercel
  stay inside the current plans: roughly 1,000 roll calls a year × 535 members
  ≈ 535,000 vote rows a year.
- **Phase B summaries (estimate, to be measured):** each summary reads the
  official summary plus the bill's section headings and cited sections (capped
  near 30,000 input tokens), writes about 1,500 tokens, runs the rule checker
  (no model) and the neutrality pass (one smaller model call), and regenerates
  at most once. The only measured reference point is a research draft with web
  search at about $0.55. Without web search a summary should cost less; the
  working estimate is **$0.05 to $0.30 each**, and Phase B records the real cost
  of every summary.
- **Monthly:** explaining only bills that get a roll-call vote is roughly 30 to
  60 bills a month: **about $2 to $18**. That does not fit beside the existing
  statement intake (about $37 a month) under the current $20 cap; Phase B needs
  the cap raised or intake reduced (owner decision).

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
- **Headline label.** The brief marks the headline Official, but a "Would [do X]
  for [whom]" sentence is written, not ingested. Owner decision.

## Phases and checkpoints

| Phase | Builds | Checkpoint on the phone |
| --- | --- | --- |
| A | Schema, ingestion, politician pages, issue pages, follows | Follow one senator and see their last 10 votes; browse Health care and see recent bills |
| B | Summary template, rule checker, badges, sampling queue, cost tracking | 5 real bills with complete summaries |
| C | Accounts, top-3 issues, user votes, friends, agreement score, share cards | Share one card to Instagram Stories |
| D | Said vs. Did links and cards | One match and one contradiction, both rule-documented |
| E | Texas via Open States, LegiScan fallback | A Texas legislator page with real votes |
