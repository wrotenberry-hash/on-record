# On Record master build plan (owner, 2026-11-16)

Supersedes every earlier build prompt from 16 Nov; work already done is merged
into it. Operating rules: `docs/OPERATING_RULES.md`. Progress: `STATUS.md`.
Defaults taken: `docs/DECISIONS.md`.

Order: Round 1 → A → B → C → H → I → D → J → G → E → F, with the trial alongside.

## Round 1 — Prove bill summaries
Confirm the new OpenAI key works. Generate 5 real summaries across ≥3 categories, review them strictly against bill text and template rules (accuracy, real section citations, neutral wording, for/against balance and attribution, reading level), fix generator/checker patterns, regenerate. Then summarize bills behind the most recent roll calls first, within the cap. Report real cost per summary.

## Round A — Data depth (federal)
Bill lifecycle with dates and sources (introduced → committee → floor → other chamber → conference → president → law/veto). Plain-English "what changed" between text versions. Amendments with one-line descriptions and outcomes. Upcoming House/Senate floor schedule matched to bills. Sponsors/cosponsors with party counts; committee assignments. ZIP/address → all of a user's legislators (official geocoder). Daily integrity check: every roll-call tally matches the official total; mismatches alert, never display silently.

## Round B — Bill experience
Mobile-first bill page: official title, Analysis headline, status timeline graphic, what it does, who it affects, cost, case for/against, unknowns, chamber votes with party-split bar, user's legislators highlighted, follow button, sources. Plain-English search with typo tolerance (topics, member names, bill numbers). "Moving this week" feed filterable by the 14 issues. Glossary tooltips for jargon at ~8th-grade level. Follow a bill → alert on status change.

## Round C — Vote experience
Every vote: what Yes meant / what No meant, passage vs procedural label, result, party split, date, source. Member page: recent votes with bill one-liners, votes by issue, sponsorships, missed-vote rate, how often they voted with their own party's majority (Official, method shown). Compare two members on shared votes by issue. "Your legislators" page.

## Round H — Know what's happening + Texas (fully live before the Texas Legislature convenes 12 Jan 2027)
Texas Legislature: bills, status, summaries in the same template, roll calls, members, committees (Open States primary, LegiScan fallback, Texas Legislature Online as source of record; same integrity checks and badges). "Your legislators": 2 U.S. senators, U.S. representative, state senator, state representative. "Since you last visited" panel (works without an account; syncs when signed in). Auto-generated briefing: daily in session / weekly out of session, 2-minute read for Congress and Texas (passed, failed, procedurally blocked, coming next), email option and shareable card. "What's coming" calendar of floor votes and hearings with remind-me alerts. Home "Right now" strip: in/out of session, on the floor today, session counts.

## Round I — Legislature dashboards (Congress and Texas)
Bill funnel per chamber and combined (filed → committee action → passed one chamber → passed both → signed/vetoed/law without signature) with counts, % and a one-line takeaway. History: current vs previous 3 Congresses and 3 Texas regular sessions plus specials (funnel, roll-call counts, % procedural, % party-line). Control: seat charts, chamber leaders (incl. Texas Speaker and Lieutenant Governor as Senate presiding officer, with a one-line role note), President/Governor and veto counts; auto-update on leadership changes. Key players (Official, no grades): leaders, committee chairs/ranking members, most bills advanced, most votes against own party's majority, most missed votes. Where bills stall: committees by referred vs reported, chair named. By issue: filed vs advanced vs enacted across the 14 categories. Accessible, colorblind-safe charts; "data as of" timestamps; backfill history once and reconcile against official session statistics.

## Round D — Reasons to come back
Onboarding under 60 seconds: ZIP → legislators → pick 3 issues → done (account optional until following/voting). Personalized home: "This week from your legislators," "Moving on your issues," since-last-visit panel. Weekly recap email with a shareable recap card. Optional instant alerts (followed legislator votes on a followed issue; followed bill moves). Installable web app with web push. Track aggregate retention: weekly returning readers, onboarding completion, follows per reader, alert opt-in, share creation — on health probe and editor dashboard.

## Round J — Constituent voice + real-person verification
Support / Oppose / Unsure on every bill, optional private 280-char reason, neutral wording ("Do you support [official title]?"), changeable with history. Tiers: 0 Visitor (private, never counted); 1 Real person (verified email + Cloudflare Turnstile at signup and first vote + Twilio Verify SMS code, one phone per account, VoIP numbers rejected) counts nationally; 2 District-matched (Tier 1 + address geocoded to a residential location in the district) counts toward district sentiment; 3 Verified constituent (mailed code) — design only, document options and cost. Positions count only after account is ≥24h old and Tier 1+. Rate limits, disposable-email blocklist, anomaly detection (surges, shared IP/device patterns, identical reasons) → quarantine from totals with editor review page. District sentiment shown only when n ≥ 25, broken out by tier, always labeled "Not a scientific poll," shown beside the legislator's actual vote. Public legislator page with district sentiment on upcoming and recent bills; design (don't send) a weekly sentiment email for legislative offices. Hash phones after verification, encrypt addresses, store district IDs for counting; users can delete positions and accounts. Monthly aggregate transparency note on blocked/quarantined activity. "Coming up — weigh in now" and "your legislator vs your district" hooks in alerts and briefings.

## Round G — Social sharing
Cards (Stories 1080x1920, feed 1080x1350, carousel 1080x1350, link preview 1200x630): vote card; Said vs. Did (verbatim statement + rule-matched vote, rules identical across parties, matches shown as well as contradictions); quiet kill (bill stopped procedurally); breaking ranks; weekly "your legislators" recap; 5-slide bill explainer carousel; "my district vs my legislator" (aggregates only); funnel/control/key-player dashboard cards; 15–30s captioned vertical video (text animation only, no synthetic voices or likenesses of real people). Every card: badges, date, source link/QR, "Talk is cheap." footer; built only from record data and approved summaries; no user-written text on the image (captions outside). One-tap native share, download, copy caption with source link. Per-item link previews for X, Facebook, Threads, Bluesky, LinkedIn, iMessage. Shared links land on the exact item with "See your own legislators" into onboarding. First-party aggregate share tracking (shares, share→visit, visit→signup). On Record's own accounts: daily auto-drafted post queue with one-tap approve; Official-only cards may auto-post once connected; Bluesky and Threads connectors first, queue-only for X/Instagram/TikTok until accounts are connected. Embeddable vote and bill card widgets for newsletters/blogs. Follow current platform civic-content policies; no paid promotion, fake engagement or automated replies; per-user rate limits; "report a problem" on every card feeding a corrections log.

## Round E — Ease of use (self-tested across everything)
Playwright scripts acting as a first-time phone user (390px) for these tasks, recording taps and time and screenshots: find my legislators; see how my senator voted on the latest bill; understand what a bill does; follow an issue; compare two members; find a bill by keyword; turn on alerts; find what's happening in the Texas Legislature this week; see what changed since my last visit; how many bills became law this Congress; who controls the Texas Senate and who runs it; which committee stalls the most bills; say whether I support a bill; see my district vs my legislator; verify and cast a first counted vote (≤90s); share a vote card to Stories; share a bill carousel; copy a link that previews correctly. Target ≤3 taps (≤2 for the core ones). Critique screenshots like a strict product designer, fix every friction point, rerun until passing. Pages interactive under 2s on a mid-range phone; WCAG AA; empty/loading/error states everywhere.

## Round F — Accuracy hardening
Re-review a random 20% of summaries against bill text and fix generator patterns behind errors. Automated parity check across parties (summary length, tone words, for/against balance) with drift alerts. Corrections log (public once launched). Regression tests for every bug fixed.

## Trial (alongside)
Invite-only trial opens automatically once OpenAI works; keep the 25 revocable links on Editor → Trial invites; in-app one-question feedback after a reader's third visit.

## MANUAL batch (listed once in the first digest)
No-expiry OpenAI key; Cloudflare Turnstile keys; Twilio Verify service; Bluesky/Threads (later X, Instagram, TikTok) accounts for On Record; PUBLIC_CONTACT_EMAIL; founder text for About page. For each: exact steps and where to paste in Vercel.

## Final report (last digest)
What's live, usability task results before/after, retention and sharing metrics, real costs, failures, and at most 3 decisions with recommended defaults.
