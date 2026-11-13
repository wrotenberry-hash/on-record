# Decision log

This log separates established product constraints from choices the implementation may make and policy reserved for founder review. The source for the established constraints is `BUILD_CONTRACT.md`, the visible On Record product discussion, and the illustrative `reference/legacy-v0.5.html`; the prototype is not an independently verified corpus.

| ID | Decision or status | Basis and consequence |
| --- | --- | --- |
| M-01 | **Established:** One shared source → representation → proposition → evidence → adjudication model; public Records are views. | Prevents feeds and person pages from creating inconsistent factual stores. |
| M-02 | **Established:** Captures, revisions, decisions, and corrections preserve provenance and history. | Edits and deletions remain observations without inferred motive. |
| M-03 | **Established:** Materiality is locked before evidence evaluation. Finalized VC005/VC006 tiers M0/M1/M2/M3 carry weights 0/.75/1/1.25. | A locked decision can be revised only through a visible review event; there is no enabled public aggregate. |
| M-04 | **Established:** Both supporting and contrary evidence searches are documented before a resolved rating publishes. | Evidence is proposition-centered, reusable, and temporally applicable. |
| M-05 | **Established (VC005/VC006):** Accuracy anchors are 100/95/85/65/35/15/0 plus U unresolved; Context Integrity is separately 100/85/60/30/0/N/A; Evidence Confidence sums four 0–25 dimensions. CHECKING is an unscored record state. | See `SCORING_INSTRUMENT.md`. AI suggestions require human selection; no automatic narrative-to-anchor mapping. |
| M-06 | **Established:** Party identity and popularity do not determine factual findings. Identical propositions use the same evidence standard regardless of speaker. | Coverage process can be comparable without imposing equal outcomes. |
| M-07 | **Established:** Dependency-cluster RAS formula exists, but person-level public scores are withheld pending approved coverage/sample gates. Repetition is separate; reader requests are excluded unless independently eligible. | An 80% versus 90% coverage threshold conflict and other unknown gates prevent public display. |
| M-08 | **Established:** Prototype examples are demonstration data. | Do not present their source links, quotes, dates, metrics, or ratings as verified/current reporting. |

## Founder decisions pending

1. Approve operational examples and review protocol for the finalized accuracy and context anchors, including when contextual distortion changes a finding.
2. Approve fact-checkability, materiality, coverage, and publication standards, including a locked-materiality revision procedure.
3. Specify evidence sufficiency and human review/escalation standards, especially for causation, historical comparisons, and disputed sources.
4. Define aggregate eligibility, weighting, exclusions, visibility and retraction rules before enabling any person score.
5. Define correction, challenge, and appeal procedures and the public display of prior versions.

Technical implementation decisions may be made locally if they preserve M-01 through M-08 and are recorded with rationale, affected interfaces, and tests. A technical choice that changes substantive methodology must be escalated as a founder decision.

## Operating decisions

Defaults a session took under `docs/OPERATING_RULES.md` rule 1, and owner decisions on the Talk is cheap module. Newest last.

| ID | Date | Decision | Basis |
| --- | --- | --- | --- |
| O-01 | 2026-11-13 | **Owner:** Phase B as built is approved: headline is Analysis, official title is the Official line; a sampled summary stays visible until checked; after the owner has read the first 5 summaries the caps rise to 40 summaries / $5; cost stays estimated from listed prices, no OpenAI admin key. | STATUS.md "Decisions Made" of the same day. |
| O-02 | 2026-11-13 | **Owner:** statement intake once a day (13:00 UTC); reader sign-in by email magic link through Resend; On Record runs in its own cloud environment. | Same. |
| O-03 | 2026-11-13 | **Owner:** OpenAI auto recharge on ($10 under $3), $40 monthly usage limit. The estimated-balance alert and `OPENAI_CREDIT_USD` / `OPENAI_CREDIT_SET_AT` are removed; the billing-refusal alert stays; the health probe reports month-to-date spend. | Operating rules, rule 4. |
| O-04 | 2026-11-13 | **Default:** the code default for `OPENAI_MONTHLY_LIMIT_USD` is 40, matching the OpenAI limit. The Vercel setting, if still 20, overrides it and only makes the alert earlier; changing it is a MANUAL item, not urgent. | No new secret; the alert errs early, not late. |
| O-05 | 2026-11-13 | **Default:** month-to-date spend is priced from the `model_calls` ledger (every OpenAI call since Phase B) instead of the old per-draft/per-capture estimate. | The ledger prices every call from token usage; the estimate guessed from counts. |
| O-06 | 2026-11-13 | **Default:** a billing refusal counts only while no call has succeeded since it (and within 24 h). Replaces "ignore refusals from before the credit was added", which needed the removed credit setting. | Auto recharge resolves refusals without a settings change. |
| O-07 | 2026-11-13 | **Default:** the 19:00 run gives bill summaries all the time left in its 300 s minus 40 s, not at most 170 s. | The batch already stops 45 s before its deadline and caps each model call to the time left; more time means the 5 test summaries land in one run. |
| O-08 | 2026-11-13 | **Default:** when the first 5 summaries exist, one email carries them in full with the checker's verdict (`SUMMARIES_READY`, sent once). | Rule 3: lets the owner read them on the phone and a session review them from the inbox with no new secret or endpoint. Nothing becomes public. |
