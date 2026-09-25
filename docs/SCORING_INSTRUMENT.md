# On Record checking instrument — VC005/VC006

This is the finalized component vocabulary supplied in the existing On Record work. The earlier six-anchor scale and 3/2/1 materiality weights in the first review build were incomplete. This document supersedes those portions of `METHODOLOGY.md`. The four components are recorded separately; the specification does **not** authorize deriving an overall verdict from a free-text explanation or mathematically blending the components into a single claim rating.

## Component entries

| Component | Allowed entry | Meaning or calculation |
| --- | --- | --- |
| Accuracy | `100`, `95`, `85`, `65`, `35`, `15`, `0`, `U` | Respectively **Supported**, **Minor imprecision**, **Qualified**, **Mixed**, **Mostly unsupported**, **Contradicted**, **False**, **Unresolved**. An editor selects an anchor with a rationale; `U` has no numeric rating. |
| Context Integrity | `100`, `85`, `60`, `30`, `0`, `N/A` | Respectively **Faithful**, **Minor omission**, **Material omission**, **Severe distortion**, **Context inversion**, **Not applicable**. Recorded independently with rationale. |
| Evidence Confidence | Authority, Sufficiency/Corroboration, Directness, Temporal/Methodological Fit | Each dimension is a finite number in `0–25`; their sum is `0–100`. Record supporting rationale and evidence references. This confidence is not a substitute for accuracy. |
| Materiality | `M0`, `M1`, `M2`, `M3` | Weights `0`, `.75`, `1`, `1.25`. Lock the tier and rationale **before** evidence evaluation. `M0` has no resolved accuracy rating. |

All selections require explicit human assessment, methodology version and assessment time. AI may propose component selections for human inspection. Deterministic code validates allowed values, calculates the evidence-confidence sum, checks that the rated accuracy equals the selected anchor and the instrument's materiality matches its earlier lock. It does not infer anchors from prose. `CHECKING` remains an unscored publication state in the existing system; `U` is the instrument's unresolved accuracy value. A resolved outcome must not carry `U`.

The same evidence and anchor standards apply across political identities. A normalized proposition can share evidence and reasoning between speakers when time and scope match; preserve each exact representation and its context. Source authentication, bilateral search, evidence applicability, materiality lock and human review remain required gates.

## Dependency-aware aggregate calculation

For each dependency cluster `j` with distinct claims `i`, let `Mᵢ` be the locked materiality weight and `Aᵢ` the accuracy anchor:

`CAⱼ = Σ(Mᵢ Aᵢ) / ΣMᵢ`; `CWⱼ = √(ΣMᵢ)`; `RAS = Σ(CWⱼ CAⱼ) / ΣCWⱼ`.

The internal helper rejects invalid anchors, empty/duplicate clusters and zero-weight clusters. This formula is **not permission to show a public person-level score**. The prior decisions conflict on an `80%` versus `90%` verification coverage threshold, and minimum sample, issue diversity, source diversity and temporal gates remain undecided. Public aggregate eligibility therefore returns false for every corpus, with no score.

## Implementation boundary

The additive `scoring_proposals` table and editorial API now persist all four VC005/VC006 components, including the `95` anchor, as internal proposals. The initial SQLite rated-adjudication constraint still uses older anchors and materiality names. Rated decisions cannot claim instrument compliance until that constraint and the sufficiency policy are reconciled. Numerical publication stays disabled. Do not convert old records to new tiers or anchors by assumption.
