import { sql } from "drizzle-orm";
import { type AnySQLiteColumn, check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Application-assigned string IDs; all timestamps are Unix milliseconds.
export const people = sqliteTable("people", {
  id: text("id").primaryKey(), displayName: text("display_name").notNull(), slug: text("slug").notNull(),
  description: text("description"), createdAt: integer("created_at").notNull(),
}, t => [uniqueIndex("people_slug_uq").on(t.slug)]);

export const sourceCommunications = sqliteTable("source_communications", {
  id: text("id").primaryKey(), speakerId: text("speaker_id").references(() => people.id).notNull(),
  sourceType: text("source_type").notNull(), platform: text("platform"), canonicalUrl: text("canonical_url"),
  externalId: text("external_id"), publishedAt: integer("published_at"), createdAt: integer("created_at").notNull(),
}, t => [index("communications_speaker_published_idx").on(t.speakerId, t.publishedAt), index("communications_url_idx").on(t.canonicalUrl)]);

// One bounded discovery attempt per political lane per UTC day. Failed attempts
// also count, so transient upstream errors never cause an unbounded API loop.
export const intakeRuns = sqliteTable("intake_runs", {
  id: text("id").primaryKey(), day: text("day").notNull(),
  lane: text("lane").notNull(),
  status: text("status", { enum: ["RUNNING", "COMPLETE", "SKIPPED", "FAILED"] }).notNull(),
  sourceUrl: text("source_url"), caseCount: integer("case_count").notNull().default(0),
  error: text("error"), startedAt: integer("started_at").notNull(), completedAt: integer("completed_at"),
}, t => [uniqueIndex("intake_day_lane_uq").on(t.day, t.lane)]);

// One invocation per UTC hour and a bounded daily model budget. This ledger is
// distinct from individual source adapter attempts and candidate state.
export const automationRuns = sqliteTable("automation_runs", {
  id: text("id").primaryKey(), slot: text("slot").notNull(), day: text("day").notNull(),
  status: text("status", { enum: ["RUNNING", "COMPLETE", "FAILED"] }).notNull(),
  startedAt: integer("started_at").notNull(), finishedAt: integer("finished_at"),
  candidateId: text("candidate_id"), representationId: text("representation_id"),
  captureStatus: text("capture_status"), researchStatus: text("research_status"),
  error: text("error"),
}, t => [uniqueIndex("automation_slot_uq").on(t.slot), index("automation_day_idx").on(t.day)]);

// Discovery leads remain private until the original communication has been captured
// and a human has checked attribution and context. A URL is never itself a quote.
export const intakeCandidates = sqliteTable("intake_candidates", {
  id: text("id").primaryKey(), sourceId: text("source_id").notNull(),
  canonicalUrl: text("canonical_url").notNull(), lane: text("lane").notNull(),
  medium: text("medium").notNull(), era: text("era").notNull(),
  status: text("status", { enum: ["QUEUED", "PROCESSING", "CAPTURED", "SKIPPED", "FAILED"] }).notNull().default("QUEUED"),
  discoveredAt: integer("discovered_at").notNull(), attemptedAt: integer("attempted_at"),
  completedAt: integer("completed_at"), caseCount: integer("case_count").notNull().default(0),
  error: text("error"),
}, t => [uniqueIndex("candidate_url_uq").on(t.canonicalUrl), index("candidate_status_idx").on(t.status, t.discoveredAt)]);

// A logical communication may have several separately preserved captures.
export const sourceCaptures = sqliteTable("source_captures", {
  id: text("id").primaryKey(), communicationId: text("communication_id").references(() => sourceCommunications.id).notNull(),
  revision: integer("revision").notNull(), capturedAt: integer("captured_at").notNull(), captureUrl: text("capture_url"),
  contentType: text("content_type").notNull(), originalContent: text("original_content").notNull(),
  transcript: text("transcript"), contentHash: text("content_hash").notNull(),
  retrievalMetadata: text("retrieval_metadata", { mode: "json" }).$type<Record<string, unknown>>(),
}, t => [uniqueIndex("captures_communication_revision_uq").on(t.communicationId, t.revision), check("captures_revision_positive", sql`${t.revision} > 0`)]);

// A reviewer attests to the particular preserved capture and digest they checked.
// Corrections are new attestations; the history is never overwritten.
export const sourceAuthentications = sqliteTable("source_authentications", {
  id: text("id").primaryKey(),
  captureId: text("capture_id").references(() => sourceCaptures.id).notNull(),
  reviewedUrl: text("reviewed_url").notNull(),
  reviewedContentHash: text("reviewed_content_hash").notNull(),
  reviewerId: text("reviewer_id").notNull(),
  method: text("method").notNull(),
  notes: text("notes").notNull(),
  verifiedAt: integer("verified_at").notNull(),
}, t => [index("source_authentications_capture_verified_idx").on(t.captureId, t.verifiedAt),
  check("source_authentications_nonempty", sql`trim(${t.reviewedUrl}) <> '' AND trim(${t.reviewedContentHash}) <> '' AND trim(${t.reviewerId}) <> '' AND trim(${t.method}) <> '' AND trim(${t.notes}) <> ''`)]);

export const propositions = sqliteTable("propositions", {
  id: text("id").primaryKey(), canonicalText: text("canonical_text").notNull(),
  scope: text("scope"), jurisdiction: text("jurisdiction"), validFrom: integer("valid_from"), validTo: integer("valid_to"),
  quantifier: text("quantifier"), issue: text("issue"), createdAt: integer("created_at").notNull(),
}, t => [index("propositions_issue_idx").on(t.issue), check("proposition_valid_interval", sql`${t.validFrom} IS NULL OR ${t.validTo} IS NULL OR ${t.validFrom} <= ${t.validTo}`)]);

export const representations = sqliteTable("representations", {
  id: text("id").primaryKey(), captureId: text("capture_id").references(() => sourceCaptures.id).notNull(),
  propositionId: text("proposition_id").references(() => propositions.id), exactText: text("exact_text").notNull(),
  startOffset: integer("start_offset"), endOffset: integer("end_offset"), context: text("context"),
  extractedAt: integer("extracted_at").notNull(), status: text("status", { enum: ["CANDIDATE", "APPROVED", "REJECTED"] }).notNull().default("CANDIDATE"),
}, t => [index("representations_capture_idx").on(t.captureId), index("representations_proposition_idx").on(t.propositionId),
  check("representation_status_allowed", sql`${t.status} IN ('CANDIDATE', 'APPROVED', 'REJECTED')`),
  check("representation_offset_order", sql`${t.startOffset} IS NULL OR ${t.endOffset} IS NULL OR (${t.startOffset} >= 0 AND ${t.startOffset} <= ${t.endOffset})`)]);

// Machine research is a private lead. It is never canonical evidence, a human
// authentication, an adjudication, or a public finding. A reviewer may promote
// it only after the source, representation and materiality gates are complete.
export const machineResearchDrafts = sqliteTable("machine_research_drafts", {
  representationId: text("representation_id").primaryKey().references(() => representations.id),
  status: text("status", { enum: ["PROCESSING", "COMPLETE", "FAILED"] }).notNull(),
  supportStrategy: text("support_strategy"), supportingSummary: text("supporting_summary"),
  contraryStrategy: text("contrary_strategy"), contrarySummary: text("contrary_summary"),
  citations: text("citations", { mode: "json" }).$type<Array<{ url: string; title: string; side: "SUPPORTS" | "CONTRADICTS" }>>(),
  assessment: text("assessment", { mode: "json" }).$type<{ accuracyAnchor: "100" | "95" | "85" | "65" | "35" | "15" | "0" | "U";
    contextIntegrity: "100" | "85" | "60" | "30" | "0" | "N/A";
    authority: number; sufficiency: number; directness: number; temporalFit: number; explanation: string }>(),
  error: text("error"), attemptedAt: integer("attempted_at").notNull(), completedAt: integer("completed_at"),
}, t => [index("machine_research_status_idx").on(t.status, t.attemptedAt)]);

// Atomic daily reservation for model-intensive private bilateral research.
export const researchDailyBudgets = sqliteTable("research_daily_budgets", {
  day: text("day").primaryKey(), attempts: integer("attempts").notNull().default(0),
});

export const propositionRelations = sqliteTable("proposition_relations", {
  propositionId: text("proposition_id").references(() => propositions.id).notNull(),
  relatedPropositionId: text("related_proposition_id").references(() => propositions.id).notNull(),
  relation: text("relation", { enum: ["EQUIVALENT", "RELATED", "SUPERSEDES", "CONTRADICTS"] }).notNull(),
  rationale: text("rationale").notNull(), createdAt: integer("created_at").notNull(),
}, t => [primaryKey({ columns: [t.propositionId, t.relatedPropositionId, t.relation] }), check("proposition_relation_not_self", sql`${t.propositionId} <> ${t.relatedPropositionId}`),
  check("proposition_relation_allowed", sql`${t.relation} IN ('EQUIVALENT', 'RELATED', 'SUPERSEDES', 'CONTRADICTS')`)]);

export const methodologyVersions = sqliteTable("methodology_versions", {
  id: text("id").primaryKey(), label: text("label").notNull(), description: text("description").notNull(),
  effectiveAt: integer("effective_at").notNull(), documentHash: text("document_hash"),
}, t => [uniqueIndex("methodology_label_uq").on(t.label)]);

export const materialityDecisions = sqliteTable("materiality_decisions", {
  id: text("id").primaryKey(), representationId: text("representation_id").references(() => representations.id).notNull(),
  methodologyVersionId: text("methodology_version_id").references(() => methodologyVersions.id).notNull(),
  tier: text("tier", { enum: ["CRITICAL", "MAJOR", "SUPPORTING", "NOT_MATERIAL"] }).notNull(),
  rationale: text("rationale").notNull(), lockedAt: integer("locked_at").notNull(), decidedBy: text("decided_by").notNull(),
}, t => [uniqueIndex("materiality_representation_uq").on(t.representationId),
  check("materiality_tier_allowed", sql`${t.tier} IN ('CRITICAL', 'MAJOR', 'SUPPORTING', 'NOT_MATERIAL')`)]);

export const evidenceObjects = sqliteTable("evidence_objects", {
  id: text("id").primaryKey(), title: text("title").notNull(), sourceUrl: text("source_url"),
  sourceName: text("source_name").notNull(), sourceType: text("source_type").notNull(),
  publishedAt: integer("published_at"), capturedAt: integer("captured_at").notNull(),
  effectiveFrom: integer("effective_from"), effectiveTo: integer("effective_to"), jurisdiction: text("jurisdiction"),
  excerpt: text("excerpt").notNull(), contentHash: text("content_hash"),
  supersedesId: text("supersedes_id").references((): AnySQLiteColumn => evidenceObjects.id), createdAt: integer("created_at").notNull(),
}, t => [index("evidence_source_url_idx").on(t.sourceUrl), check("evidence_effective_interval", sql`${t.effectiveFrom} IS NULL OR ${t.effectiveTo} IS NULL OR ${t.effectiveFrom} <= ${t.effectiveTo}`)]);

export const propositionEvidence = sqliteTable("proposition_evidence", {
  id: text("id").primaryKey(), propositionId: text("proposition_id").references(() => propositions.id).notNull(),
  evidenceId: text("evidence_id").references(() => evidenceObjects.id).notNull(),
  stance: text("stance", { enum: ["SUPPORTS", "CONTRADICTS", "CONTEXT"] }).notNull(),
  applicability: text("applicability").notNull(), createdAt: integer("created_at").notNull(),
}, t => [uniqueIndex("proposition_evidence_unique").on(t.propositionId, t.evidenceId, t.stance), index("proposition_evidence_evidence_idx").on(t.evidenceId),
  check("evidence_stance_allowed", sql`${t.stance} IN ('SUPPORTS', 'CONTRADICTS', 'CONTEXT')`)]);

// Each direction of an evidence search is recorded even if nothing was found.
export const evidenceSearches = sqliteTable("evidence_searches", {
  id: text("id").primaryKey(),
  representationId: text("representation_id").references(() => representations.id).notNull(),
  propositionId: text("proposition_id").references(() => propositions.id).notNull(),
  materialityDecisionId: text("materiality_decision_id").references(() => materialityDecisions.id).notNull(),
  side: text("side", { enum: ["SUPPORTS", "CONTRADICTS"] }).notNull(),
  strategy: text("strategy").notNull(),
  resultsSummary: text("results_summary").notNull(),
  searchedAt: integer("searched_at").notNull(),
  reviewerId: text("reviewer_id").notNull(),
}, t => [index("evidence_searches_representation_side_idx").on(t.representationId, t.side, t.searchedAt),
  check("evidence_searches_side_allowed", sql`${t.side} IN ('SUPPORTS','CONTRADICTS')`),
  check("evidence_searches_nonempty", sql`trim(${t.strategy}) <> '' AND trim(${t.resultsSummary}) <> '' AND trim(${t.reviewerId}) <> ''`)]);

export const adjudications = sqliteTable("adjudications", {
  id: text("id").primaryKey(), representationId: text("representation_id").references(() => representations.id).notNull(),
  propositionId: text("proposition_id").references(() => propositions.id).notNull(),
  materialityDecisionId: text("materiality_decision_id").references(() => materialityDecisions.id).notNull(),
  methodologyVersionId: text("methodology_version_id").references(() => methodologyVersions.id).notNull(),
  revision: integer("revision").notNull(), state: text("state", { enum: ["CHECKING", "RATED"] }).notNull(),
  score: integer("score"), explanation: text("explanation").notNull(),
  supportingSearch: text("supporting_search").notNull(), contrarySearch: text("contrary_search").notNull(),
  evidenceSearchStartedAt: integer("evidence_search_started_at").notNull(), evidenceCutoffAt: integer("evidence_cutoff_at").notNull(),
  createdAt: integer("created_at").notNull(), authoredBy: text("authored_by").notNull(),
}, t => [uniqueIndex("adjudications_representation_revision_uq").on(t.representationId, t.revision), index("adjudications_proposition_idx").on(t.propositionId),
  check("adjudication_state_score", sql`(${t.state} = 'CHECKING' AND ${t.score} IS NULL) OR (${t.state} = 'RATED' AND ${t.score} IN (100, 85, 65, 35, 15, 0))`),
  check("adjudication_evidence_interval", sql`${t.evidenceSearchStartedAt} <= ${t.evidenceCutoffAt} AND ${t.evidenceCutoffAt} <= ${t.createdAt}`),
  check("adjudication_revision_positive", sql`${t.revision} > 0`)]);

// Candidate assessments for the approved multidimensional instrument. They do
// not confer publication eligibility; published adjudications remain CHECKING.
export const scoringProposals = sqliteTable("scoring_proposals", {
  id: text("id").primaryKey(),
  representationId: text("representation_id").references(() => representations.id).notNull(),
  propositionId: text("proposition_id").references(() => propositions.id).notNull(),
  methodologyVersionId: text("methodology_version_id").references(() => methodologyVersions.id).notNull(),
  revision: integer("revision").notNull(),
  accuracyAnchor: text("accuracy_anchor", { enum: ["100", "95", "85", "65", "35", "15", "0", "U"] }).notNull(),
  contextIntegrity: text("context_integrity", { enum: ["100", "85", "60", "30", "0", "N/A"] }).notNull(),
  authority: integer("authority").notNull(),
  sufficiency: integer("sufficiency").notNull(),
  directness: integer("directness").notNull(),
  temporalFit: integer("temporal_fit").notNull(),
  explanation: text("explanation").notNull(),
  createdAt: integer("created_at").notNull(),
  authoredBy: text("authored_by").notNull(),
}, t => [uniqueIndex("scoring_proposals_representation_revision_uq").on(t.representationId, t.revision),
  check("scoring_proposals_revision_positive", sql`${t.revision} > 0`),
  check("scoring_proposals_accuracy_anchor_allowed", sql`${t.accuracyAnchor} IN ('100','95','85','65','35','15','0','U')`),
  check("scoring_proposals_context_integrity_allowed", sql`${t.contextIntegrity} IN ('100','85','60','30','0','N/A')`),
  check("scoring_proposals_confidence_range", sql`${t.authority} BETWEEN 0 AND 25 AND ${t.sufficiency} BETWEEN 0 AND 25 AND ${t.directness} BETWEEN 0 AND 25 AND ${t.temporalFit} BETWEEN 0 AND 25`),
  check("scoring_proposals_explanation_nonempty", sql`trim(${t.explanation}) <> '' AND trim(${t.authoredBy}) <> ''`)]);

export const adjudicationEvidence = sqliteTable("adjudication_evidence", {
  adjudicationId: text("adjudication_id").references(() => adjudications.id).notNull(),
  propositionEvidenceId: text("proposition_evidence_id").references(() => propositionEvidence.id).notNull(),
  consideration: text("consideration").notNull(),
}, t => [primaryKey({ columns: [t.adjudicationId, t.propositionEvidenceId] })]);

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(), adjudicationId: text("adjudication_id").references(() => adjudications.id).notNull(),
  reviewerId: text("reviewer_id").notNull(), decision: text("decision", { enum: ["APPROVED", "REJECTED", "CHANGES_REQUESTED"] }).notNull(),
  notes: text("notes").notNull(), createdAt: integer("created_at").notNull(),
}, t => [index("reviews_adjudication_idx").on(t.adjudicationId, t.createdAt),
  check("review_decision_allowed", sql`${t.decision} IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED')`)]);

export const publications = sqliteTable("publications", {
  id: text("id").primaryKey(), adjudicationId: text("adjudication_id").references(() => adjudications.id).notNull(),
  approvedReviewId: text("approved_review_id").references(() => reviews.id).notNull(),
  publishedAt: integer("published_at").notNull(), publishedBy: text("published_by").notNull(),
  retractionOfId: text("retraction_of_id").references((): AnySQLiteColumn => publications.id), note: text("note"),
}, t => [index("publications_adjudication_idx").on(t.adjudicationId, t.publishedAt)]);

export const corrections = sqliteTable("corrections", {
  id: text("id").primaryKey(), publicationId: text("publication_id").references(() => publications.id).notNull(),
  replacementPublicationId: text("replacement_publication_id").references(() => publications.id),
  reason: text("reason").notNull(), correctedAt: integer("corrected_at").notNull(), correctedBy: text("corrected_by").notNull(),
}, t => [index("corrections_publication_idx").on(t.publicationId)]);
