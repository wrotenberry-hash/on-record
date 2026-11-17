# Test-ready build (owner, 2026-11-17)

The bar for opening the trial. Follows `docs/OPERATING_RULES.md` and `docs/MASTER_BUILD_PLAN.md`.
Progress and the readiness checklist: Editor → What's next (`lib/readiness.ts`, shown on `/editor/next`).

## The owner's instruction, as given

GOAL: a first-time user should, within 60 seconds, see what their legislators are actually doing, weigh in, and feel they now have real visibility and a voice.

1. BRAND: make the product name a single config value (default "On Record"; I may switch to "Constituent" with "On Record" as the name of the voting-record section). Every page, card, email and meta tag reads from it. Keep the tagline "Talk is cheap. The record isn't."

2. THE 60-SECOND "AHA":
   - Landing → enter ZIP/address → instantly see your 5 legislators (2 U.S. senators, U.S. rep, state senator, state rep) with each one's most recent meaningful vote explained in one plain line.
   - Then: "Here's what's coming up that affects you" (next scheduled votes on the user's issues) with Support/Oppose in one tap.
   - Then: "See how your district compares" (shows the threshold message until n ≥ 25).
   - No account needed until they follow, vote for counting, or turn on alerts.

3. INFLUENCE TOOLS:
   - One-tap "Contact your legislator" on every bill and vote: official phone number, official contact form link, and a short pre-filled, neutral message citing the bill and the user's stated position (user edits before sending; we never send on their behalf).
   - Hearings and town halls calendar for the user's legislators where official sources list them.
   - "Your voice" page: the user's positions, how their legislators voted on those bills, and their district's aggregate view.

4. CONTENT COVERAGE BEFORE TRIAL OPENS:
   - Every federal bill with a roll-call vote in the last 90 days has a summary that passes the full standard (how it works today → what changes, average-reader test). Raise the summary cap only after I approve the gold examples.
   - Topic and process primers for the 10 most common subjects.
   - Texas: all current legislators, committees and the 2027 session calendar loaded; bill coverage live by 12 Jan 2027.

5. TRUST:
   - Methodology page (sources, how summaries are written and checked, how numbers are computed), nonpartisan pledge, corrections log, About page (leave founder text placeholder for me).
   - Privacy policy and terms drafts in plain English for my legal review; flag them as MANUAL.

6. QUALITY BAR:
   - Run the full Playwright usability suite (all tasks from the master plan + the 60-second flow + contact-your-legislator) at phone width; fix every failure.
   - Error monitoring with alerts only for real breakage; uptime check; pages interactive < 2s; WCAG AA.
   - Feedback: one-question prompt after the third visit, plus a "something wrong?" link on every page feeding the corrections queue.
   - Trial analytics (aggregate): onboarding completion, time to first weigh-in, weekly return, follows, shares, contact-taps.

7. TRIAL PACKAGE: when everything above passes, prepare (don't send) the trial: 25 invite links, a short welcome screen explaining what to try, and a booking link for 15-minute feedback calls. Then notify me once that the trial is ready to open, with a readiness checklist showing pass/fail for each item above.

## How this is read

- The gold examples were approved on 17 Nov ("Approve"), so the summary cap may rise once summaries pass the full standard on the live site. It rises only as far as the spend caps allow (`docs/OPERATING_RULES.md` §7); going past a cap is a hard stop and the owner's decision.
- "No account needed" applies inside the trial gate: a trial reader arrives by invite link. `PUBLIC_READ_ENABLED` stays off.
- "We never send on their behalf": contact tools open the reader's own phone, mail app or the official form. Nothing is sent from the site.
- Legal texts are drafts for the owner's legal review (MANUAL). They are marked as drafts on the page.
