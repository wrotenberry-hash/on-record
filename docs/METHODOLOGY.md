# On Record methodology — implementation baseline

This document describes the rules supported by the existing product decisions and the v0.5 illustrative prototype. It governs the private review build. It is not a finding that the prototype's quoted statements, dates, source links, statistics, or ratings have been verified. Any real publication requires source authentication and editorial review against the actual evidence.

## What the record contains

1. A **Person** or authenticated public account makes a **SourceCommunication**, such as a social post, speech, interview, advertisement, or official statement. Capture the original content, source identifier or canonical URL, author/account identifier, original publication and capture times, media and transcript references where relevant. Preserve subsequent edits and deletion observations as separate revisions, with no inferred motive.
2. Extract the exact **Representation** occurrences from that communication. Distinguish authored statements, quotations, and reposts. Retain their original context and links to the captured revision. Extraction should be complete under the applicable coverage rule; the editor can mark a statement as not fact-checkable with a reason.
3. A fact-checkable representation may be linked to a normalized **Proposition**. Share a proposition across people and channels only when its time, location, quantifier, subject, and scope are materially equivalent. Related assertions with different temporal or causal content remain distinguishable. Multiple occurrences of one proposition remain separately attributable and visible.
4. Determine fact-checkability and **materiality before evaluating evidence**, then lock the materiality decision and its reasoning in the review history. The established tiers are M0/M1/M2/M3, with weights 0/.75/1/1.25; see `SCORING_INSTRUMENT.md`. Changes to a locked decision require an explicit, logged editorial revision.
5. Collect reusable **EvidenceObjects** for the proposition. Store source and citation metadata, what each item says, dates of applicability, jurisdiction where relevant, retrieval/capture details, and any replacement or supersession relationship. Document searches for both supporting and contrary evidence. Record the applicability and limits of each item to the specific proposition; do not assume that evidence about a related issue answers a more precise claim.
6. An **Adjudication** records the proposition and relevant context, both evidence searches, evidence considered, reasoning, methodology version, and an unresolved status or allowed rating. Preserve revisions and review actions. A **Record** is the public presentation of this linked chain, rather than an independent factual determination.

## Ratings, uncertainty, and review gates

Accuracy anchors are **100, 95, 85, 65, 35, 15, and 0**, plus unresolved **U** in the instrument. Context Integrity, Evidence Confidence, and Materiality are separate components defined in `SCORING_INSTRUMENT.md`. **CHECKING** is the existing record state for unresolved work and carries no numerical accuracy. Do not turn a lack of evidence into a definitive rating. Historical superlatives require an identified measure and comparable series; causal claims need evidence for attribution, not merely a time correlation. When necessary standards or evidence are missing, retain CHECKING and record what needs to be resolved.

Before a resolved rating may be published, an editor must be able to inspect authenticated source material, exact representation and normalized proposition, locked materiality, searches for favorable and contrary evidence, cited evidence with temporal applicability, adjudicative reasoning, methodology version, and the review decision. Publication and correction events must preserve prior versions rather than overwrite them. The private build may show clearly labeled demonstration records; they are not verified journalism or a live feed.

## Neutrality and coverage

- Apply the same source-capture, extraction, materiality, evidence-retrieval, rating, and publication rules to all people and parties. Party affiliation and popularity are descriptive metadata, not adjudication inputs. Where practical, review the factual proposition without speaker identity.
- Equivalent propositions should reuse the applicable factual evidence and determination, while maintaining each speaker's exact wording and context. A difference in wording, time, scope, or newly available evidence can justify a different outcome, but the reason must be visible.
- A shared evidence environment may support different political arguments; do not force matching ratings or daily outcome balance. Coverage should follow comparable systematic rules, with source mix and gaps made transparent. Reader demand or virality should not silently replace the coverage rule.
- Keep **repetition** separate from distinct-proposition accuracy. Repeated posts, speeches, or ads are observable occurrences, not additional independent adjudications. Reader requests are excluded from aggregates unless independently eligible under the coverage rules.
- Withhold any person-level truthfulness percentage or overall grade until founder-approved sample and coverage gates exist and have actually been satisfied. The v0.5 record pages correctly show an em dash and “Withheld.” No numerical threshold has been adopted.

## Public presentation

Feed, Social Record, Same Issue, All Claims, person Records, search, and Transparency should read from the same underlying source, representation, proposition, evidence, and adjudication objects. A CHECKING record may expose what is being examined without implying a verdict. Show the underlying source, proposition wording, evidence, reasoning, status, dates, and corrections so readers can trace a conclusion. “What's spreading” counts occurrences separately from factual ratings.

## Open policy requiring founder decision

- Operational examples and adjudication guidance for the seven finalized accuracy anchors and separate context component, including technically accurate but materially misleading statements.
- Fact-checkability criteria, review authority and changes to locked materiality; the finalized tiers and weights alone do not settle all review procedures.
- Coverage universe, monitored people and communication classes, collection frequency, completeness measurement, and treatment of missed or deleted source material.
- Source hierarchy, evidence sufficiency, freshness, citation and preservation standards, treatment of conflicting evidence, and escalation for legal or causal claims.
- Human review roles, high-risk escalation, publication criteria for unresolved records, correction and appeal process, and public version visibility.
- Numeric aggregate eligibility gates: the conflicting 80% versus 90% coverage thresholds, minimum sample, source, issue and temporal requirements, exclusions, treatment of repeated and shared claims, and what happens when a gate later fails. The dependency-cluster formula is documented, but public display remains disabled.
- How reader requests, trends, and engagement influence prioritization while preserving comparable systematic coverage.

Until those decisions are recorded, implementation should expose unresolved status and enforce the already settled constraints without inventing editorial policy.
