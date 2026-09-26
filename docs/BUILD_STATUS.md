# On Record build status — 2026-09-26

## Hosting moved to Vercel (2026-09-26, code complete, not yet deployed)

- Next.js on Vercel's Node runtime; Turso database with the same migrations; Supabase magic-link sign-in; Vercel Cron at 13:00 and 19:00 UTC calling `/api/automation/tick` with `CRON_SECRET`. Twenty tests, typecheck and `next build` pass. Nothing is deployed until the Vercel project, Turso database and Supabase Auth project exist and their settings are entered; see `PUBLIC_ACCESS.md`.

## Changed later on 2026-09-25 (not yet deployed)

- Anonymous read access is now a server switch, `PUBLIC_READ_ENABLED`, off by default. `/api/records`, `/api/representations` and `/records` refuse anonymous readers until it is set, so the Site audience can be widened for the scheduler without publishing anything. `/editor` redirects anonymous visitors to Sign in with ChatGPT before rendering. Human-rejected representations no longer appear in the incoming inventory, and the inventory is withheld until 20 reviewed records are published. Published records show the passage around the quote instead of the whole capture. `GET /api/automation/health` reports reachability and whether the tick secret is bound. See `PUBLIC_ACCESS.md` for the audit, the ordered account steps and the state ladder.
- Locally, against a migrated local D1, the tick returned COMPLETE, then ALREADY_RUNNING_OR_COMPLETE in the same hour, then DAILY_LIMIT after a second slot. That is code behaviour, not production evidence.

## Implemented in the owner-private Site

- `/editor` scans original-source indexes on opening and seeds eight historical archive/transcript leads. Separate run rows expose adapter failures; an idempotent private queue holds original URLs and statuses. Current official sources span House and Senate party leaders, a Senate independent, White House statements and White House video leads. Original video pages are withheld from extraction until a checked transcript is available. Multi-speaker transcripts require attribution review.
- One queued current HTML/text lead is automatically captured per authenticated editor opening. One candidate receives separate supporting/contrary web searches and a provisional assessment in a private machine draft per opening. Editors can capture additional leads and retry failed analyses. The machine draft does not become canonical evidence or a verdict. A reviewer compares the original, approves the representation, locks materiality, then promotes and checks the draft in the checking instrument. More detail: [INTAKE_STRATEGY.md](INTAKE_STRATEGY.md).
- Machine capture does not count as human authentication. A reviewer opens the source, independently copies a passage containing the exact representation, checks attribution and context, approves or rejects the representation, inspects the research leads and explicitly approves a CHECKING record for publication.
- `/records` reads only explicitly published, reviewed CHECKING records. The public incoming inventory clearly labels machine-captured passages as unverified and never shows private numeric assessment proposals.
- D1 tables and additive migrations preserve captured originals, attestations and review sequence. Twelve targeted tests cover source URL filtering, research guards and methodology gates.

## Remaining integrations and launch gates

- Live source scans and extraction produced seven candidate representations. The prior automated research path collided with the evidence-search database gate; private machine drafts now allow early research while retaining the canonical gate. Verify one complete live draft and its later human promotion before claiming launch coverage. Review and check a representative real corpus.
- The bounded `/api/automation/tick` job, run ledger and Cloudflare cron adapter are implemented, but not operating unattended: Sites has no scheduler, no job secret has been provisioned, and owner-only ingress rejects external callers before the app. An authenticated editor opening still triggers a scan, one capture and one private research request. Complete the scheduler and machine-access steps in [UNATTENDED_INTAKE.md](UNATTENDED_INTAKE.md) before claiming 24/7 operation. Social feeds, audiovisual capture, transcripts and OCR require further adapters. If a browser shows Authentication required, sign in there; the queue is not empty merely because a request returned 401.
- Rated adjudication, correction/retraction UX, production roles/audit and founder coverage/evidence rules remain pending. Numerical verdicts and aggregates stay withheld.
