import { sql } from "drizzle-orm";
import { type AnySQLiteColumn, check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  // "Not now": a reviewer defers a case without judging it. Deferred cases go to the back of the daily-email order. Nullable, additive (2026-11-08).
  deferredAt: integer("deferred_at"),
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

// Exception-only monitoring: one row per alert email actually sent. Used to
// fire each alert kind at most once per 24 hours. Never read by the public site.
export const alertEvents = sqliteTable("alert_events", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), sentAt: integer("sent_at").notNull(),
  detail: text("detail").notNull(), recipient: text("recipient").notNull(),
}, t => [index("alert_events_kind_sent_idx").on(t.kind, t.sentAt)]);

/* ===========================================================================
 * Legislation and issues module (docs/TALK_IS_CHEAP_PLAN.md), Phase A.
 * Three content types stay separate by table prefix: official_* (ingested
 * government records, auto-published behind the public switch), analysis_*
 * (Phase B) and opinion_* (Phase C). Every table here is new; no existing
 * table or review-gate trigger is altered.
 * ========================================================================= */

export const issueCategories = sqliteTable("issue_categories", {
  slug: text("slug").primaryKey(), name: text("name").notNull(), sortOrder: integer("sort_order").notNull(),
});

// Editable: Congress.gov policy area or legislative subject → category. Seeding inserts only missing rows.
export const categoryMappings = sqliteTable("category_mappings", {
  id: text("id").primaryKey(),
  sourceKind: text("source_kind", { enum: ["policy_area", "subject"] }).notNull(),
  matchKind: text("match_kind", { enum: ["exact", "contains"] }).notNull(),
  sourceValue: text("source_value").notNull(),
  categorySlug: text("category_slug").references(() => issueCategories.slug).notNull(),
  note: text("note"), active: integer("active").notNull().default(1), createdAt: integer("created_at").notNull(),
}, t => [uniqueIndex("category_mappings_uq").on(t.sourceKind, t.matchKind, t.sourceValue, t.categorySlug),
  check("category_mappings_kind", sql`${t.sourceKind} IN ('policy_area', 'subject') AND ${t.matchKind} IN ('exact', 'contains')`)]);

export const officialPoliticians = sqliteTable("official_politicians", {
  id: text("id").primaryKey(), // bioguide id
  lisId: text("lis_id"), govtrackId: integer("govtrack_id"),
  fullName: text("full_name").notNull(), firstName: text("first_name").notNull(), lastName: text("last_name").notNull(),
  party: text("party").notNull(), state: text("state").notNull(), district: integer("district"),
  chamber: text("chamber", { enum: ["house", "senate"] }).notNull(),
  termStart: text("term_start"), termEnd: text("term_end"), officialUrl: text("official_url"),
  isCurrent: integer("is_current").notNull().default(1),
  sourceUrl: text("source_url").notNull(), retrievedAt: integer("retrieved_at").notNull(),
}, t => [uniqueIndex("official_politicians_lis_uq").on(t.lisId), index("official_politicians_state_idx").on(t.state, t.chamber),
  check("official_politicians_chamber", sql`${t.chamber} IN ('house', 'senate')`)]);

export const officialBills = sqliteTable("official_bills", {
  id: text("id").primaryKey(), // e.g. 119-hr-2102
  congress: integer("congress").notNull(), billType: text("bill_type").notNull(), number: integer("number").notNull(),
  title: text("title").notNull(), policyArea: text("policy_area"), introducedAt: text("introduced_at"),
  latestActionText: text("latest_action_text"), latestActionAt: text("latest_action_at"), sponsorId: text("sponsor_id"),
  congressUrl: text("congress_url").notNull(),
  detailStatus: text("detail_status", { enum: ["stub", "complete"] }).notNull().default("stub"),
  sourceUrl: text("source_url").notNull(), retrievedAt: integer("retrieved_at").notNull(),
}, t => [index("official_bills_action_idx").on(t.latestActionAt), index("official_bills_detail_idx").on(t.detailStatus),
  check("official_bills_detail", sql`${t.detailStatus} IN ('stub', 'complete')`)]);

export const officialBillSubjects = sqliteTable("official_bill_subjects", {
  billId: text("bill_id").references(() => officialBills.id).notNull(), subject: text("subject").notNull(),
}, t => [primaryKey({ columns: [t.billId, t.subject] })]);

export const billCategories = sqliteTable("bill_categories", {
  billId: text("bill_id").references(() => officialBills.id).notNull(),
  categorySlug: text("category_slug").references(() => issueCategories.slug).notNull(),
  method: text("method", { enum: ["mapping", "editor", "ai"] }).notNull(),
  mappingId: text("mapping_id"), confidence: real("confidence"), createdAt: integer("created_at").notNull(),
}, t => [primaryKey({ columns: [t.billId, t.categorySlug] }), index("bill_categories_slug_idx").on(t.categorySlug),
  check("bill_categories_method", sql`${t.method} IN ('mapping', 'editor', 'ai')`)]);

export const officialRollCalls = sqliteTable("official_roll_calls", {
  id: text("id").primaryKey(), // house-2026-323 | senate-119-2-262
  chamber: text("chamber", { enum: ["house", "senate"] }).notNull(),
  congress: integer("congress").notNull(), session: integer("session").notNull(), rollNumber: integer("roll_number").notNull(),
  votedAt: integer("voted_at").notNull(), question: text("question").notNull(), title: text("title"), result: text("result"),
  documentLabel: text("document_label"), billId: text("bill_id"),
  yea: integer("yea").notNull().default(0), nay: integer("nay").notNull().default(0),
  present: integer("present").notNull().default(0), notVoting: integer("not_voting").notNull().default(0),
  sourceUrl: text("source_url").notNull(), retrievedAt: integer("retrieved_at").notNull(),
}, t => [index("official_roll_calls_voted_idx").on(t.votedAt), index("official_roll_calls_bill_idx").on(t.billId),
  check("official_roll_calls_chamber", sql`${t.chamber} IN ('house', 'senate')`)]);

export const officialMemberVotes = sqliteTable("official_member_votes", {
  rollCallId: text("roll_call_id").references(() => officialRollCalls.id).notNull(),
  politicianId: text("politician_id").notNull(), // bioguide id; members who left keep their id
  position: text("position", { enum: ["Yea", "Nay", "Present", "Not Voting"] }).notNull(),
  rawPosition: text("raw_position").notNull(),
}, t => [primaryKey({ columns: [t.rollCallId, t.politicianId] }), index("official_member_votes_politician_idx").on(t.politicianId),
  check("official_member_votes_position", sql`${t.position} IN ('Yea', 'Nay', 'Present', 'Not Voting')`)]);

// Viewer identities. Phase A: the editor only (keyed by a hash of the editor email). Phase C adds public users.
export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(), kind: text("kind", { enum: ["editor", "public"] }).notNull(),
  externalKey: text("external_key").notNull(), createdAt: integer("created_at").notNull(),
}, t => [uniqueIndex("app_users_external_uq").on(t.externalKey), check("app_users_kind", sql`${t.kind} IN ('editor', 'public')`)]);

export const userFollows = sqliteTable("user_follows", {
  userId: text("user_id").references(() => appUsers.id).notNull(), politicianId: text("politician_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, t => [primaryKey({ columns: [t.userId, t.politicianId] })]);

export const ingestRuns = sqliteTable("ingest_runs", {
  id: text("id").primaryKey(), job: text("job").notNull(),
  status: text("status", { enum: ["RUNNING", "COMPLETE", "PARTIAL", "FAILED"] }).notNull(),
  startedAt: integer("started_at").notNull(), finishedAt: integer("finished_at"),
  detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(), error: text("error"),
}, t => [index("ingest_runs_job_idx").on(t.job, t.startedAt),
  check("ingest_runs_status", sql`${t.status} IN ('RUNNING', 'COMPLETE', 'PARTIAL', 'FAILED')`)]);

export const ingestCursors = sqliteTable("ingest_cursors", {
  key: text("key").primaryKey(), value: text("value").notNull(), updatedAt: integer("updated_at").notNull(),
});

/* ===========================================================================
 * Phase B: AI-written bill summaries (docs/TALK_IS_CHEAP_PLAN.md). New tables
 * only. analysis_* rows are labelled Analysis wherever they appear and are
 * checked by lib/analysis/checker.ts before anyone sees them.
 * ========================================================================= */

// Every OpenAI call, from any job: tokens, priced cost, and billing refusals. The
// low-balance alert and per-summary cost read this ledger.
export const modelCalls = sqliteTable("model_calls", {
  id: text("id").primaryKey(), purpose: text("purpose").notNull(), model: text("model").notNull(), refId: text("ref_id"),
  inputTokens: integer("input_tokens").notNull().default(0), cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0), webSearchCalls: integer("web_search_calls").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0), responseId: text("response_id"), error: text("error"), createdAt: integer("created_at").notNull(),
}, t => [index("model_calls_created_idx").on(t.createdAt), index("model_calls_ref_idx").on(t.refId)]);

export const officialCostEstimates = sqliteTable("official_cost_estimates", {
  billId: text("bill_id").references(() => officialBills.id).notNull(), url: text("url").notNull(),
  pubDate: text("pub_date").notNull(), title: text("title").notNull(), description: text("description").notNull(),
  sourceUrl: text("source_url").notNull(), retrievedAt: integer("retrieved_at").notNull(),
}, t => [primaryKey({ columns: [t.billId, t.url] })]);

export const analysisBillSummaries = sqliteTable("analysis_bill_summaries", {
  id: text("id").primaryKey(), billId: text("bill_id").references(() => officialBills.id).notNull(),
  sequence: integer("sequence").notNull(), // 0-based order of generation, for 1-in-5 sampling
  textVersion: text("text_version").notNull(), textVersionLabel: text("text_version_label").notNull(), textDate: text("text_date"),
  textUrl: text("text_url").notNull(), textChars: integer("text_chars").notNull(), truncated: integer("truncated").notNull().default(0),
  headline: text("headline").notNull(),
  whatItDoes: text("what_it_does", { mode: "json" }).$type<Array<{ text: string; section: string }>>().notNull(),
  whoItAffects: text("who_it_affects", { mode: "json" }).$type<Array<{ text: string; section: string }>>().notNull(),
  whatChangesForYou: text("what_changes_for_you").notNull(),
  caseFor: text("case_for", { mode: "json" }).$type<Array<{ argument: string; attribution: string }>>().notNull(),
  caseAgainst: text("case_against", { mode: "json" }).$type<Array<{ argument: string; attribution: string }>>().notNull(),
  unknowns: text("unknowns", { mode: "json" }).$type<string[]>().notNull(),
  confidence: text("confidence", { enum: ["high", "medium", "low"] }).notNull(), confidenceReason: text("confidence_reason").notNull(),
  checkPassed: integer("check_passed").notNull(), attempts: integer("attempts").notNull(),
  status: text("status", { enum: ["visible", "held", "rejected"] }).notNull(),
  model: text("model").notNull(), promptVersion: text("prompt_version").notNull(),
  inputTokens: integer("input_tokens").notNull(), outputTokens: integer("output_tokens").notNull(), costUsd: real("cost_usd").notNull(),
  sources: text("sources", { mode: "json" }).$type<Array<{ label: string; url: string }>>().notNull(),
  createdAt: integer("created_at").notNull(), reviewedAt: integer("reviewed_at"),
}, t => [uniqueIndex("analysis_summaries_bill_version_uq").on(t.billId, t.textVersion), index("analysis_summaries_status_idx").on(t.status),
  check("analysis_summaries_status", sql`${t.status} IN ('visible', 'held', 'rejected')`),
  check("analysis_summaries_confidence", sql`${t.confidence} IN ('high', 'medium', 'low')`)]);

export const analysisChecks = sqliteTable("analysis_checks", {
  id: text("id").primaryKey(), summaryId: text("summary_id").references(() => analysisBillSummaries.id).notNull(),
  attempt: integer("attempt").notNull(), passed: integer("passed").notNull(),
  failures: text("failures", { mode: "json" }).$type<string[]>().notNull(), warnings: text("warnings", { mode: "json" }).$type<string[]>().notNull(),
  metrics: text("metrics", { mode: "json" }).$type<Record<string, number>>().notNull(), createdAt: integer("created_at").notNull(),
}, t => [index("analysis_checks_summary_idx").on(t.summaryId)]);

export const analysisReviewQueue = sqliteTable("analysis_review_queue", {
  id: text("id").primaryKey(), summaryId: text("summary_id").references(() => analysisBillSummaries.id).notNull(),
  reason: text("reason", { enum: ["sample", "low_confidence", "check_failed"] }).notNull(),
  status: text("status", { enum: ["open", "approved", "rejected"] }).notNull().default("open"),
  note: text("note"), reviewerKey: text("reviewer_key"), createdAt: integer("created_at").notNull(), decidedAt: integer("decided_at"),
}, t => [uniqueIndex("analysis_queue_summary_uq").on(t.summaryId), index("analysis_queue_status_idx").on(t.status),
  check("analysis_queue_reason", sql`${t.reason} IN ('sample', 'low_confidence', 'check_failed')`),
  check("analysis_queue_status", sql`${t.status} IN ('open', 'approved', 'rejected')`)]);

/* ===========================================================================
 * Audit follow-ups (owner decisions 2026-11-15). New tables only.
 * ========================================================================= */

// First-party, aggregate-only usage counts: one row per day, event and dimension
// (audience and page template, e.g. "trial:/politicians/[id]"). No reader id, no
// IP, no user agent, and never which bill, issue or member a reader viewed.
export const eventCounts = sqliteTable("event_counts", {
  day: text("day").notNull(), name: text("name").notNull(), dim: text("dim").notNull().default(""),
  n: integer("n").notNull().default(0),
}, t => [primaryKey({ columns: [t.day, t.name, t.dim] })]);

// Invite-only trial. The link token is an HMAC of the id (never stored). Per invite
// only when it was first and last used and on how many days: no record of what
// the invitee looked at. Revoking ends access on the next request.
export const betaInvites = sqliteTable("beta_invites", {
  id: text("id").primaryKey(), number: integer("number").notNull(), label: text("label"),
  createdAt: integer("created_at").notNull(), firstSeenAt: integer("first_seen_at"), lastSeenAt: integer("last_seen_at"),
  lastActiveDay: text("last_active_day"), activeDays: integer("active_days").notNull().default(0), revokedAt: integer("revoked_at"),
}, t => [uniqueIndex("beta_invites_number_uq").on(t.number)]);

// Earlier versions of a bill summary, kept when the generator is improved and the
// summary is written again (Round 1 review, 2026-11-16). The live row is updated in
// place; this keeps what it said before, its checker result and its cost.
export const analysisSummaryVersions = sqliteTable("analysis_summary_versions", {
  id: text("id").primaryKey(), summaryId: text("summary_id").references(() => analysisBillSummaries.id).notNull(),
  promptVersion: text("prompt_version").notNull(), content: text("content", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  checkPassed: integer("check_passed").notNull(), costUsd: real("cost_usd").notNull(), replacedAt: integer("replaced_at").notNull(),
}, t => [index("analysis_summary_versions_summary_idx").on(t.summaryId)]);

/* Round 2 (2026-11-16): sponsorships and AI issue suggestions. New tables only. */

// Cosponsors as listed in govinfo's BILLSTATUS record. A withdrawn cosponsor keeps its row, with the withdrawal date.
export const officialBillCosponsors = sqliteTable("official_bill_cosponsors", {
  billId: text("bill_id").references(() => officialBills.id).notNull(), politicianId: text("politician_id").notNull(),
  sponsorshipDate: text("sponsorship_date"), original: integer("original").notNull().default(0), withdrawnDate: text("withdrawn_date"),
  sourceUrl: text("source_url").notNull(), retrievedAt: integer("retrieved_at").notNull(),
}, t => [primaryKey({ columns: [t.billId, t.politicianId] }), index("official_bill_cosponsors_politician_idx").on(t.politicianId)]);

// When each bill's sponsorship was last read, so the job refreshes the oldest first.
export const officialSponsorshipFetches = sqliteTable("official_sponsorship_fetches", {
  billId: text("bill_id").primaryKey(), fetchedAt: integer("fetched_at").notNull(), cosponsors: integer("cosponsors").notNull(), ok: integer("ok").notNull(),
});

// AI suggestions of an issue for a bill that has no official policy area. High confidence is applied
// (bill_categories method "ai", with its confidence); low confidence waits for the editor.
export const categorySuggestions = sqliteTable("category_suggestions", {
  billId: text("bill_id").primaryKey(), categorySlug: text("category_slug"), confidence: real("confidence").notNull(),
  rationale: text("rationale").notNull(), model: text("model").notNull(), costUsd: real("cost_usd").notNull().default(0),
  status: text("status", { enum: ["applied", "queued", "approved", "rejected", "no_fit"] }).notNull(),
  createdAt: integer("created_at").notNull(), decidedAt: integer("decided_at"),
}, t => [index("category_suggestions_status_idx").on(t.status),
  check("category_suggestions_status", sql`${t.status} IN ('applied', 'queued', 'approved', 'rejected', 'no_fit')`)]);

/* Round 3 (2026-11-16): reader accounts, the reader's own views, weekly email. New tables only. */

// A reader who signed in by email. The email is kept only to send the sign-in link and
// the weekly email; lookups use its hash. Tied to the app user (and the trial invite) whose
// follows and views it carries, so a reader keeps them on any device.
export const readerAccounts = sqliteTable("reader_accounts", {
  id: text("id").primaryKey(), appUserId: text("app_user_id").references(() => appUsers.id).notNull(), inviteId: text("invite_id"),
  emailHash: text("email_hash").notNull(), email: text("email").notNull(), createdAt: integer("created_at").notNull(), verifiedAt: integer("verified_at"),
  digestOptIn: integer("digest_opt_in").notNull().default(1), lastDigestAt: integer("last_digest_at"),
}, t => [uniqueIndex("reader_accounts_email_uq").on(t.emailHash), uniqueIndex("reader_accounts_user_uq").on(t.appUserId)]);

// Single-use sign-in links; the emailed token is a signed nonce, valid 30 minutes.
export const magicLinks = sqliteTable("magic_links", {
  nonce: text("nonce").primaryKey(), email: text("email").notNull(), emailHash: text("email_hash").notNull(),
  appUserId: text("app_user_id"), inviteId: text("invite_id"), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(), usedAt: integer("used_at"),
});

// OPINION content: a reader's own Support or Oppose on a bill. Never joined into an official or
// analysis view and never shown to anyone else. Since Round J (owner, 2026-11-16) a verified reader's
// answer is also copied to counted_positions and added, without a name, to tier totals.
export const opinionUserVotes = sqliteTable("opinion_user_votes", {
  userId: text("user_id").references(() => appUsers.id).notNull(), billId: text("bill_id").references(() => officialBills.id).notNull(),
  stance: text("stance", { enum: ["support", "oppose"] }).notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [primaryKey({ columns: [t.userId, t.billId] }), check("opinion_user_votes_stance", sql`${t.stance} IN ('support', 'oppose')`)]);

// One row per weekly email attempt.
export const digestSends = sqliteTable("digest_sends", {
  id: text("id").primaryKey(), accountId: text("account_id").references(() => readerAccounts.id).notNull(), week: text("week").notNull(),
  sentAt: integer("sent_at").notNull(), items: integer("items").notNull(), ok: integer("ok").notNull(), error: text("error"),
}, t => [uniqueIndex("digest_sends_week_uq").on(t.accountId, t.week)]);

/* Round 4 (2026-11-16): case archive and trial feedback. New tables only. */

// A waiting case set aside because it is older than 14 days (owner decision). Nothing is deleted:
// the case and its history stay as they were; restoring clears archivedAt-in-effect by setting
// restoredAt, and a restored case is never archived again automatically.
export const caseArchive = sqliteTable("case_archive", {
  representationId: text("representation_id").primaryKey(), archivedAt: integer("archived_at").notNull(),
  reason: text("reason").notNull(), restoredAt: integer("restored_at"),
});

// One-question feedback from trial readers after their third visit. Anonymous: no invite or reader id.
export const readerFeedback = sqliteTable("reader_feedback", {
  id: text("id").primaryKey(), answer: text("answer").notNull(), audience: text("audience").notNull(), createdAt: integer("created_at").notNull(),
});

// ── Round J: real-person verification (migration 0018). New tables only; nothing above is altered. ──
// One row per reader account. Tier: 0 visitor, 1 real person, 2 district-matched. The phone is never
// stored: only a keyed hash of it, so one number cannot verify a second account. The address is stored
// encrypted (for the Tier 3 postcard design); counting uses the district id alone.
export const verificationProfiles = sqliteTable("verification_profiles", {
  accountId: text("account_id").primaryKey().references(() => readerAccounts.id), tier: integer("tier").notNull().default(0),
  signupChallengeAt: integer("signup_challenge_at"), firstVoteChallengeAt: integer("first_vote_challenge_at"),
  phoneHash: text("phone_hash"), phoneLineType: text("phone_line_type"), phoneVerifiedAt: integer("phone_verified_at"),
  pendingPhoneHash: text("pending_phone_hash"), pendingPhoneAt: integer("pending_phone_at"),
  districtId: text("district_id"), stateCode: text("state_code"), addressCipher: text("address_cipher"), addressMatchedAt: integer("address_matched_at"),
  signupIpRange: text("signup_ip_range"), signupDevice: text("signup_device"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [uniqueIndex("verification_phone_uq").on(t.phoneHash), index("verification_ip_idx").on(t.signupIpRange), index("verification_device_idx").on(t.signupDevice),
  index("verification_district_idx").on(t.districtId), check("verification_tier", sql`${t.tier} IN (0, 1, 2)`)]);

// The Turnstile pass behind a sign-in link, copied onto the profile when the link is used.
export const linkChallenges = sqliteTable("link_challenges", {
  nonce: text("nonce").primaryKey(), passedAt: integer("passed_at").notNull(), ipRange: text("ip_range"), device: text("device"),
});

// A position that may count: written only for a signed-in account that has passed the first-vote
// challenge. Mirrors opinion_user_votes (the reader's private answer) and carries the tier at the time.
export const countedPositions = sqliteTable("counted_positions", {
  userId: text("user_id").references(() => appUsers.id).notNull(), billId: text("bill_id").references(() => officialBills.id).notNull(),
  accountId: text("account_id").notNull(), stance: text("stance", { enum: ["support", "oppose"] }).notNull(), tier: integer("tier").notNull(),
  reason: text("reason"), reasonHash: text("reason_hash"), device: text("device"), ipRange: text("ip_range"),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [primaryKey({ columns: [t.userId, t.billId] }), index("counted_bill_idx").on(t.billId, t.createdAt), index("counted_account_idx").on(t.accountId),
  index("counted_reason_idx").on(t.reasonHash), check("counted_stance", sql`${t.stance} IN ('support', 'oppose')`)]);

// Recomputed totals. scope: "US" (national), a state ("TX") or a district ("TX-07"). group: "real" (tier 1+), "district" (tier 2).
export const sentimentTotals = sqliteTable("sentiment_totals", {
  billId: text("bill_id").notNull(), scope: text("scope").notNull(), tierGroup: text("tier_group", { enum: ["real", "district"] }).notNull(),
  support: integer("support").notNull(), oppose: integer("oppose").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [primaryKey({ columns: [t.billId, t.scope, t.tierGroup] }), index("sentiment_scope_idx").on(t.scope, t.tierGroup)]);

// Anomaly flags. Positions under an open or confirmed flag are left out of totals (never deleted).
export const integrityFlags = sqliteTable("integrity_flags", {
  id: text("id").primaryKey(), kind: text("kind", { enum: ["bill_surge", "district_surge", "ip_cluster", "device_cluster", "same_reason"] }).notNull(),
  subject: text("subject").notNull(), detail: text("detail", { mode: "json" }), status: text("status", { enum: ["open", "confirmed", "cleared"] }).notNull(),
  createdAt: integer("created_at").notNull(), decidedAt: integer("decided_at"),
}, t => [index("integrity_flags_status_idx").on(t.status, t.createdAt), index("integrity_flags_subject_idx").on(t.kind, t.subject)]);

export const flaggedPositions = sqliteTable("flagged_positions", {
  flagId: text("flag_id").references(() => integrityFlags.id).notNull(), userId: text("user_id").notNull(), billId: text("bill_id").notNull(),
}, t => [primaryKey({ columns: [t.flagId, t.userId, t.billId] }), index("flagged_positions_user_idx").on(t.userId, t.billId)]);

// Monthly aggregate counters for the transparency note and the verification spend cap. No ids.
export const integrityCounts = sqliteTable("integrity_counts", {
  month: text("month").notNull(), kind: text("kind").notNull(), reason: text("reason").notNull(), n: integer("n").notNull(),
}, t => [primaryKey({ columns: [t.month, t.kind, t.reason] })]);

// Sliding-window rate limits. key is a keyed hash of scope + value; rows older than 48 h are purged.
export const rateEvents = sqliteTable("rate_events", {
  id: text("id").primaryKey(), key: text("key").notNull(), action: text("action").notNull(), at: integer("at").notNull(),
}, t => [index("rate_events_key_idx").on(t.key, t.action, t.at), index("rate_events_at_idx").on(t.at)]);

// ── Round A: federal data depth (migration 0019). New tables only. Copies of public records, each with its source. ──
export const officialBillActions = sqliteTable("official_bill_actions", {
  billId: text("bill_id").notNull(), seq: integer("seq").notNull(), actionDate: text("action_date").notNull(), text: text("text").notNull(),
  type: text("type"), actionCode: text("action_code"), chamber: text("chamber"), stage: text("stage"), committees: text("committees", { mode: "json" }),
  sourceUrl: text("source_url").notNull(), retrievedAt: integer("retrieved_at").notNull(),
}, t => [primaryKey({ columns: [t.billId, t.seq] }), index("bill_actions_date_idx").on(t.actionDate), index("bill_actions_stage_idx").on(t.stage)]);

// Per-bill fetch state for actions, amendments and text versions (refreshed when the latest action changes).
export const officialBillDepth = sqliteTable("official_bill_depth", {
  billId: text("bill_id").primaryKey(), latestActionAt: text("latest_action_at"), stage: text("stage"), stageDate: text("stage_date"),
  actionsAt: integer("actions_at"), amendmentsAt: integer("amendments_at"), textsAt: integer("texts_at"), error: text("error"),
});

export const officialAmendments = sqliteTable("official_amendments", {
  id: text("id").primaryKey(), billId: text("bill_id").notNull(), chamber: text("chamber").notNull(), number: integer("number").notNull(),
  description: text("description"), purpose: text("purpose"), latestActionDate: text("latest_action_date"), latestActionText: text("latest_action_text"),
  outcome: text("outcome", { enum: ["adopted", "failed", "withdrawn", "pending"] }).notNull(), sourceUrl: text("source_url").notNull(), retrievedAt: integer("retrieved_at").notNull(),
}, t => [index("amendments_bill_idx").on(t.billId)]);

export const officialBillTexts = sqliteTable("official_bill_texts", {
  billId: text("bill_id").notNull(), type: text("type").notNull(), date: text("date"), xmlUrl: text("xml_url"), htmlUrl: text("html_url"), pdfUrl: text("pdf_url"),
  retrievedAt: integer("retrieved_at").notNull(),
}, t => [primaryKey({ columns: [t.billId, t.type] })]);

// "What changed" between two text versions: section numbers (Official, computed) and plain-English bullets (Analysis).
export const analysisVersionChanges = sqliteTable("analysis_version_changes", {
  billId: text("bill_id").notNull(), fromType: text("from_type").notNull(), toType: text("to_type").notNull(),
  added: text("added", { mode: "json" }), removed: text("removed", { mode: "json" }), changed: text("changed", { mode: "json" }),
  bullets: text("bullets", { mode: "json" }), status: text("status", { enum: ["sections", "explained", "failed"] }).notNull(),
  costUsd: real("cost_usd").notNull().default(0), createdAt: integer("created_at").notNull(),
}, t => [primaryKey({ columns: [t.billId, t.fromType, t.toType] })]);

export const officialCommittees = sqliteTable("official_committees", {
  id: text("id").primaryKey(), chamber: text("chamber").notNull(), name: text("name").notNull(), parentId: text("parent_id"), url: text("url"),
  sourceUrl: text("source_url").notNull(), retrievedAt: integer("retrieved_at").notNull(),
});
export const officialCommitteeMembers = sqliteTable("official_committee_members", {
  committeeId: text("committee_id").notNull(), politicianId: text("politician_id").notNull(), side: text("side"), rank: integer("rank"), title: text("title"),
  retrievedAt: integer("retrieved_at").notNull(),
}, t => [primaryKey({ columns: [t.committeeId, t.politicianId] }), index("committee_members_politician_idx").on(t.politicianId)]);
// Committees a bill was referred to or reported by, from its actions.
export const officialBillCommittees = sqliteTable("official_bill_committees", {
  billId: text("bill_id").notNull(), committeeId: text("committee_id").notNull(), referredAt: text("referred_at"), reportedAt: text("reported_at"),
}, t => [primaryKey({ columns: [t.billId, t.committeeId] }), index("bill_committees_committee_idx").on(t.committeeId)]);

export const officialFloorSchedule = sqliteTable("official_floor_schedule", {
  chamber: text("chamber").notNull(), weekOf: text("week_of").notNull(), label: text("label").notNull(), billId: text("bill_id"), description: text("description"),
  sourceUrl: text("source_url").notNull(), retrievedAt: integer("retrieved_at").notNull(),
}, t => [primaryKey({ columns: [t.chamber, t.weekOf, t.label] }), index("floor_schedule_bill_idx").on(t.billId)]);

// Daily integrity check: each roll call's official totals against its stored member votes. A mismatch is shown as
// "tally under review" and alerts; it is never displayed silently.
export const officialTallyChecks = sqliteTable("official_tally_checks", {
  rollCallId: text("roll_call_id").primaryKey(), ok: integer("ok").notNull(), detail: text("detail", { mode: "json" }), checkedAt: integer("checked_at").notNull(),
}, t => [index("tally_checks_ok_idx").on(t.ok)]);

// ── Round B: following a bill (migration 0020). A reader's own follows; alerts when the bill's stage changes. ──
export const billFollows = sqliteTable("bill_follows", {
  userId: text("user_id").references(() => appUsers.id).notNull(), billId: text("bill_id").notNull(), createdAt: integer("created_at").notNull(),
  lastStage: text("last_stage"), lastAlertAt: integer("last_alert_at"),
}, t => [primaryKey({ columns: [t.userId, t.billId] }), index("bill_follows_bill_idx").on(t.billId)]);

// ── Round C: a reader's districts for "Your legislators" (migration 0021). District ids only, never the address. ──
export const readerLocations = sqliteTable("reader_locations", {
  userId: text("user_id").primaryKey().references(() => appUsers.id), state: text("state").notNull(), congressional: text("congressional"),
  stateUpper: text("state_upper"), stateLower: text("state_lower"), source: text("source", { enum: ["zip", "address"] }).notNull(), updatedAt: integer("updated_at").notNull(),
});
