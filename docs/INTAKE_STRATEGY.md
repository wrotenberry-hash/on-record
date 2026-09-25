# On Record intake and reporting desk

Updated 2026-09-25. This document separates working code from expansion targets and prevents a source lead from being mistaken for an authenticated claim.

## Editorial purpose

Keep readers informed about important, recent factual representations; make historically consequential representations discoverable by issue and speaker. Original communications become exact representations, scoped propositions, bilateral research, provisional findings, human-reviewed records and corrections. AI drafts and search citations are never published as verified findings. The same eligibility and evidence standards apply regardless of affiliation. A count of party mentions is a coverage audit, not an accuracy score or a quota for artificial balance.

## Working intake path

1. Opening the private `/editor` scans seven original-source indexes once per UTC day and seeds eight historical original transcript or archive leads. It stores URL leads idempotently in `intake_candidates`. Each source has an independent `intake_runs` result with time and error. Failed adapters are visible; a new scan is possible the next day. Scanning itself does not create or authenticate representations.
2. One current lead is captured when the editor opens. Further leads can be selected in the source queue. Each request processes at most one lead. The URL claim is atomic to prevent duplicate work; it has `QUEUED`, `PROCESSING`, `CAPTURED`, `SKIPPED` or `FAILED` status. A failed lead is retained with its error. Multi-speaker transcripts require a human to separate and attribute turns before automated extraction.
3. For an accessible public HTML or text original, fetch with HTTPS and bounded size, preserve readable source text and SHA-256 digest, capture a suggested original publication date when available, and extract up to two verbatim factual representations with scoped propositions and a *suggested* materiality tier. Source content is untrusted. No evidence search or scoring is written at this stage.
   If the model selected a weak headline or routine announcement, an editor can run re-extraction against the preserved capture. It adds only distinct exact-text candidates and keeps the earlier ones visible for rejection; it does not silently replace a representation.
4. One captured candidate per authenticated editor opening receives separate machine searches for support and contradiction and a provisional assessment in a private draft. This is a lead-generation evaluation, outside canonical evidence and scoring tables. A reviewer independently opens the original, copies its matching passage, checks speaker, date and context, approves or rejects the exact representation, and locks materiality before promoting the draft into canonical evidence searches and a scoring proposal. A server fetch and hash do not satisfy human source authentication. Cited URLs are unverified leads, not authenticated evidence excerpts. The reviewer checks the sources and limitations, records a CHECKING adjudication and human review, and explicitly publishes. Numerical verdicts and person aggregates remain disabled.
5. Public incoming representations show an explicit unverified label. Only human-approved records enter the published record. Corrections must preserve capture and adjudication history.

## Current source inventory and coverage gaps

| Medium | Current source path | Status | Required next adapter or review |
| --- | --- | --- | --- |
| Official written statements | Speaker, Senate Republican leader, House and Senate Democratic leaders, Sanders, White House index pages | Daily on editor opening; link queue and HTML/text capture | Add more offices, governors, state legislators, municipal officials, candidates; monitor failed adapters and source turnover |
| Speeches and briefings | White House remarks and preserved official speech transcripts; selected Kennedy and Bush historical transcripts | HTML transcript where single speaker; human attribution gate | Expand official Congressional Record and campaign speech archives by issue and decade |
| Debates and interviews | Selected 1984 presidential debate, Obama/Biden mixed-speaker historical transcripts | Queued, withheld from automatic claim extraction | Segment speaker turns against original audio/video and record turn timestamps before extraction |
| Social posts | Original account permalink required | Manual capture exists | Authorized platform/API or lawful public export, post ID, edit/deletion archive, attachment and thread capture |
| TV, radio, podcasts, video ads | Original broadcaster/campaign feed and recording required | Manual transcript capture exists | Licensed or official captions/transcripts, timestamp to segment, independent playback verification |
| PDF/scanned document/image | Original signed PDF or image and page needed | Manual text capture only | PDF extraction/OCR with page coordinates; dual verification against original scan |

News reports provide leads, context and evidence; the speaker's original post, recording, speech or transcript is needed to attribute a representation. A press release quoting a third party must not attribute the quotation to the office publishing it.

## Story selection and historical backfill

- Daily: review the latest original communications, significant public policy claims, audience impact, verifiability, novelty, availability of primary evidence, and likely public confusion. Capture the event date and evidence cutoff separately. When later evidence changes the answer, create a new version/correction; do not silently update the old result.
- Weekly: inspect source failures, unpublished backlog, missing party/independent/office/region representation, issue coverage, medium breakdown, claims excluded as opinion or duplicate, source freshness and public records older than their evidence cutoff. Investigate systematic omissions, not parity for parity's sake.
- Historical: select moments with durable audience interest and accessible original records across administrations and eras, favoring disputed empirical claims where contemporary evidence can be reconstructed. Initial leads span 1962, 1984, 1987, 2003, 2010, 2014, 2017 and 2022 original communications; these are source leads, not assertions or completed checks. Research must use what was knowable at the time as well as subsequent evidence, clearly separating retrospective conclusions.
- Duplicate control: unique canonical source URL at queue and communication stages; exact proposition reuse in checking instrument. Cross-platform reposts and materially equivalent claims require an explicit editorial relationship because text similarity alone can erase changes in scope, geography or time. Preserve original URL, published time, capture time, medium, transcript provenance and a hash.

## Readiness measures

A credible public launch requires actual source and research validation, editorial QA and a representative reviewed corpus. Review 30 current and 20 historical leads across parties, independents, executive/legislative levels and at least three media formats; target 20 human-reviewed CHECKING records across several substantive issues and 10 historical records if original sources and contemporary evidence permit. These are evaluation targets, not fabricated or automatically published counts. Track source-fetch success, exact-quote match, attribution/date corrections, bilateral evidence coverage, median lead age, time to publication, human rejection rates, corrections and cost per researched claim. Audit coverage by exposure and issue relevance; document excluded sources.

## Operational boundary

Sites has no unattended background service. In this deployment scanning, one capture and one private bilateral machine draft begin when an authorized editor opens the workspace. A daily unattended scheduler needs a separately hosted authorized worker or supported task that safely calls a protected intake workflow with durable service credentials. Its contract should run `scan → queue → bounded capture → bounded private research`, lock work atomically, record attempts, rate limits and costs, alert on stale scans and never call editorial publish. The current editor-opening trigger is not 24/7 monitoring. A complete multimedia corpus also requires authorized platform feeds, original audio/video capture and transcription adapters. These are integration requirements, not completed features.
