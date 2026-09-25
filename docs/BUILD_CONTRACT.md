# On Record implementation contract

The newest saved artifact is `../reference/legacy-v0.5.html`. It is an illustrative prototype, not a verified live corpus. No source repository or standalone full PRD was attached to this task. Earlier product decisions and the prototype govern where consistent; ambiguities in policy stay unresolved.

## Shared ontology

`Person` publishes a `SourceCommunication`. Each captured revision is immutable. A communication contains exact `Representation` occurrences. A representation may normalize to a `Proposition`, which may be shared across speakers and communication formats if time, place, quantifier, and scope remain equivalent. `EvidenceObject` is reusable and links to a proposition with a supporting or contrary applicability assessment. `Adjudication` records evidence considered, a methodology version, an explicit unresolved `CHECKING` state or one allowed score, review, and publication history. A `Record` is a view of these objects, not a second truth store.

## Invariants

- Allowed rating anchors: 100, 85, 65, 35, 15, 0. `CHECKING` has no numerical score.
- Materiality is assigned and locked before evidence evaluation. Critical/Major/Supporting weights are 3/2/1 for eventual aggregation; threshold policy is unresolved.
- Supporting and contrary evidence searches must both be documented before a resolved rating can publish.
- Factual evaluation depends on proposition, temporal context, and evidence, not speaker party or popularity.
- Original captured content, revisions, adjudications, and correction history are append only; published records link to their provenance.
- Aggregate truthfulness scores are disabled until founder approved coverage gates exist. Repetition is a separate metric; reader requests are excluded from aggregates unless independently eligible.
- Samples from the legacy HTML remain clearly marked demonstration records and must not be represented as current, verified reporting.

## Bounded implementation

The initial private review build should make the shared record navigable and functional, preserve method safeguards in a typed domain model and persistence schema, and supply a reviewable editorial workflow. It must not claim autonomous factual verification, complete coverage, or finalized scoring thresholds.
