/** Shared domain vocabulary. A Record is a projection over these objects, never a second verdict store. */
export type ID = string;
export type ISODateTime = string;

export interface Person {
  id: ID;
  displayName: string;
  affiliation?: string;
}

export interface SourceCommunication {
  id: ID;
  personId: ID;
  canonicalUrl?: string;
  platform: string;
  publishedAt?: ISODateTime;
  capturedRevisions: readonly CapturedRevision[];
}

/** Capture revisions are appended, never replaced. Original bytes/text may be retained externally by digest. */
export interface CapturedRevision {
  id: ID;
  capturedAt: ISODateTime;
  content: string;
  contentSha256: string;
  previousRevisionId?: ID;
}

export interface Representation {
  id: ID;
  communicationId: ID;
  capturedRevisionId: ID;
  exactText: string;
  propositionId?: ID;
  occurrenceStart?: number;
  occurrenceEnd?: number;
}

/** All four dimensions must be equivalent before occurrences share a normalized proposition. */
export interface PropositionScope {
  time: string;
  place: string;
  quantifier: string;
  scope: string;
}

export interface Proposition {
  id: ID;
  canonicalText: string;
  issueIds: readonly ID[];
  meaning: PropositionScope;
  relatedPropositionIds?: readonly ID[];
}

export interface EvidenceObject {
  id: ID;
  title: string;
  sourceUrl?: string;
  sourceAuthority?: string;
  publishedAt?: ISODateTime;
  capturedAt: ISODateTime;
  effectiveFrom?: ISODateTime;
  effectiveThrough?: ISODateTime;
  jurisdiction?: string;
  supersedesEvidenceId?: ID;
  contentSha256?: string;
}

export interface EvidenceApplicability {
  id: ID;
  propositionId: ID;
  evidenceId: ID;
  relation: "supports" | "contradicts" | "context";
  rationale: string;
  assessedAt: ISODateTime;
}

/** VC005/VC006 materiality, recorded and locked before evidence is evaluated. */
export type MaterialityLevel = "M0" | "M1" | "M2" | "M3";
export type MaterialityDecision = {
  level: MaterialityLevel;
  rationale: string;
  decidedAt: ISODateTime;
  lockedAt: ISODateTime;
  reviewerId: ID;
};

export interface EvidenceSearch {
  side: "supporting" | "contrary";
  searchedAt: ISODateTime;
  strategy: string;
  evidenceIds: readonly ID[];
}

export type Rating = 100 | 95 | 85 | 65 | 35 | 15 | 0;
export type AccuracyAssessment = Rating | "U";
export type ContextAssessment = 100 | 85 | 60 | 30 | 0 | "N/A";
export interface EvidenceConfidenceDimensions {
  authority: number;
  sufficiencyCorroboration: number;
  directness: number;
  temporalMethodologicalFit: number;
}
/** Human-selected components. The program validates anchors and sums evidence dimensions;
 * it must never infer an accuracy anchor from narrative text or confidence alone. */
export interface CheckingInstrument {
  accuracy: AccuracyAssessment;
  accuracyRationale: string;
  contextIntegrity: ContextAssessment;
  contextRationale: string;
  evidenceConfidence: EvidenceConfidenceDimensions;
  evidenceRationale: string;
  materiality: MaterialityLevel;
  assessedBy: ID;
  assessedAt: ISODateTime;
  methodologyVersion: string;
}
export type AdjudicationOutcome =
  | { status: "CHECKING"; score?: never; rationale: string }
  | { status: "RESOLVED"; score: Rating; rationale: string; instrument: CheckingInstrument };

/** A new adjudication supersedes a prior one; the prior entry remains in history. */
export interface Adjudication {
  id: ID;
  propositionId: ID;
  methodologyVersion: string;
  materiality: MaterialityDecision;
  evidenceEvaluationStartedAt?: ISODateTime;
  searches: readonly EvidenceSearch[];
  applicabilityIds: readonly ID[];
  outcome: AdjudicationOutcome;
  reviewedBy?: ID;
  reviewedAt?: ISODateTime;
  createdAt: ISODateTime;
  supersedesAdjudicationId?: ID;
}

export interface PublicationEvent {
  id: ID;
  adjudicationId: ID;
  publishedAt: ISODateTime;
  actorId: ID;
  correctionOfEventId?: ID;
  correctionExplanation?: string;
}

export interface RecordView {
  representation: Representation;
  communication: SourceCommunication;
  proposition: Proposition;
  adjudication: Adjudication;
  evidence: readonly EvidenceObject[];
  publication?: PublicationEvent;
  /** Demo data must remain visibly distinguished from verified reporting. */
  provenanceKind: "DEMONSTRATION" | "VERIFIED";
}
