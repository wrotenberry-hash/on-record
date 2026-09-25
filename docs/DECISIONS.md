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
