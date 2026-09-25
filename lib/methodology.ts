import type {
  Adjudication,
  CapturedRevision,
  CheckingInstrument,
  ContextAssessment,
  EvidenceApplicability,
  EvidenceSearch,
  MaterialityDecision,
  MaterialityLevel,
  Proposition,
  PublicationEvent,
  Rating,
  RecordView,
} from "./record-model";

export const RATING_ANCHORS = [100, 95, 85, 65, 35, 15, 0] as const;
export const CONTEXT_ANCHORS = [100, 85, 60, 30, 0, "N/A"] as const;
export const MATERIALITY_WEIGHTS: Readonly<Record<MaterialityLevel, number>> = {
  M0: 0,
  M1: .75,
  M2: 1,
  M3: 1.25,
};

export function isRating(value: unknown): value is Rating {
  return typeof value === "number" && RATING_ANCHORS.some((anchor) => anchor === value);
}

export function isContextAssessment(value: unknown): value is ContextAssessment {
  return CONTEXT_ANCHORS.some((anchor) => anchor === value);
}

/** Validates human-selected components; returns errors rather than silently choosing an anchor. */
export function instrumentErrors(input: CheckingInstrument): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== "object") return ["Completed checking instrument is required"];
  if (input.accuracy !== "U" && !isRating(input.accuracy)) errors.push("Unknown accuracy anchor");
  if (!isContextAssessment(input.contextIntegrity)) errors.push("Unknown context integrity anchor");
  if (!Object.hasOwn(MATERIALITY_WEIGHTS, input.materiality)) errors.push("Unknown materiality tier");
  for (const [name, value] of Object.entries(input.evidenceConfidence ?? {})) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 25) {
      errors.push(`${name} must be between 0 and 25`);
    }
  }
  for (const name of ["authority", "sufficiencyCorroboration", "directness", "temporalMethodologicalFit"] as const) {
    if (!Object.hasOwn(input.evidenceConfidence ?? {}, name)) errors.push(`${name} is required`);
  }
  if (!hasText(input.accuracyRationale) || !hasText(input.contextRationale) || !hasText(input.evidenceRationale)) {
    errors.push("Each instrument component requires a rationale");
  }
  if (!hasText(input.assessedBy) || !hasText(input.methodologyVersion) || !Number.isFinite(validTime(input.assessedAt))) {
    errors.push("Instrument requires assessor, version and assessment time");
  }
  if (input.materiality === "M0" && input.accuracy !== "U") errors.push("M0 cannot carry a resolved accuracy rating");
  return errors;
}

export function evidenceConfidenceTotal(input: CheckingInstrument): number {
  const errors = instrumentErrors(input);
  if (errors.length) throw new Error(errors.join("; "));
  const { authority, sufficiencyCorroboration, directness, temporalMethodologicalFit } = input.evidenceConfidence;
  return authority + sufficiencyCorroboration + directness + temporalMethodologicalFit;
}

/** Internal mathematical calculation only. No public aggregate is eligible until coverage gates are settled. */
export function calculateInternalRAS(clusters: readonly {
  id: string;
  claims: readonly { materiality: MaterialityLevel; accuracy: Rating }[];
}[]): number {
  if (!clusters.length || new Set(clusters.map(c => c.id)).size !== clusters.length) throw new Error("Distinct dependency clusters are required");
  let weightedSum = 0;
  let totalClusterWeight = 0;
  for (const cluster of clusters) {
    if (!hasText(cluster.id) || !cluster.claims.length) throw new Error("Each cluster needs an ID and claims");
    let numerator = 0;
    let materialityTotal = 0;
    for (const claim of cluster.claims) {
      if (!Object.hasOwn(MATERIALITY_WEIGHTS, claim.materiality) || !isRating(claim.accuracy)) throw new Error("Invalid cluster claim");
      const weight = MATERIALITY_WEIGHTS[claim.materiality];
      numerator += weight * claim.accuracy;
      materialityTotal += weight;
    }
    if (materialityTotal <= 0) throw new Error("Cluster needs positive materiality weight");
    const clusterAccuracy = numerator / materialityTotal;
    const clusterWeight = Math.sqrt(materialityTotal);
    weightedSum += clusterWeight * clusterAccuracy;
    totalClusterWeight += clusterWeight;
  }
  return weightedSum / totalClusterWeight;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid timestamp: ${value}`);
  return parsed;
}

function validTime(value: string | undefined): number {
  return value ? Date.parse(value) : Number.NaN;
}

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Speaker and affiliation are deliberately absent from the factual identity of a proposition. */
export function propositionsEquivalent(a: Proposition, b: Proposition): boolean {
  return a.canonicalText.trim().toLocaleLowerCase() === b.canonicalText.trim().toLocaleLowerCase()
    && (Object.keys(a.meaning) as (keyof Proposition["meaning"])[])
      .every((field) => a.meaning[field].trim().toLocaleLowerCase() === b.meaning[field].trim().toLocaleLowerCase());
}

export function lockMateriality(input: {
  level: MaterialityLevel;
  rationale: string;
  decidedAt: string;
  lockedAt: string;
  reviewerId: string;
  evidenceEvaluationStartedAt?: string;
}): MaterialityDecision {
  if (!Object.hasOwn(MATERIALITY_WEIGHTS, input.level)) throw new Error("Unknown materiality level");
  if (!hasText(input.rationale) || !hasText(input.reviewerId)) throw new Error("Materiality requires a rationale and reviewer");
  if (timestamp(input.lockedAt) < timestamp(input.decidedAt)) throw new Error("Materiality cannot lock before its decision");
  if (input.evidenceEvaluationStartedAt && timestamp(input.lockedAt) >= timestamp(input.evidenceEvaluationStartedAt)) {
    throw new Error("Materiality must be locked before evidence evaluation");
  }
  return {
    level: input.level,
    rationale: input.rationale,
    decidedAt: input.decidedAt,
    lockedAt: input.lockedAt,
    reviewerId: input.reviewerId,
  };
}

/** Returns every failed gate, suitable for an editorial review UI. */
export function publicationErrors(adjudication: Adjudication, applicability: readonly EvidenceApplicability[]): string[] {
  const errors: string[] = [];
  if (!hasText(adjudication.propositionId) || !hasText(adjudication.methodologyVersion)) {
    errors.push("A proposition and methodology version are required");
  }
  try {
    lockMateriality({ ...adjudication.materiality, evidenceEvaluationStartedAt: adjudication.evidenceEvaluationStartedAt });
  } catch (error) {
    errors.push((error as Error).message);
  }
  if (!Number.isFinite(validTime(adjudication.evidenceEvaluationStartedAt)) ||
      !Number.isFinite(validTime(adjudication.materiality.lockedAt)) ||
      validTime(adjudication.materiality.lockedAt) >= validTime(adjudication.evidenceEvaluationStartedAt)) {
    errors.push("Evidence evaluation must start after materiality is locked");
  }
  if (!hasText(adjudication.outcome.rationale)) errors.push("An outcome rationale is required");
  if (adjudication.outcome.status === "CHECKING") {
    if ("score" in adjudication.outcome && adjudication.outcome.score !== undefined) {
      errors.push("CHECKING cannot have a numeric score");
    }
  } else if (adjudication.outcome.status === "RESOLVED") {
    if (!isRating(adjudication.outcome.score)) errors.push("Score is not an allowed rating anchor");
    if (!adjudication.outcome.instrument) errors.push("Resolved rating requires a completed checking instrument");
    else {
      errors.push(...instrumentErrors(adjudication.outcome.instrument));
      if (adjudication.outcome.instrument.accuracy !== adjudication.outcome.score) errors.push("Rating must match the instrument accuracy anchor");
      if (adjudication.outcome.instrument.materiality !== adjudication.materiality.level) errors.push("Instrument materiality must match locked materiality");
      if (adjudication.outcome.instrument.methodologyVersion !== adjudication.methodologyVersion) errors.push("Instrument methodology version must match adjudication");
      if (validTime(adjudication.outcome.instrument.assessedAt) < validTime(adjudication.evidenceEvaluationStartedAt)) errors.push("Instrument must follow evidence evaluation");
    }
    for (const side of ["supporting", "contrary"] as const) {
      const searches = adjudication.searches.filter((search: EvidenceSearch) => search.side === side);
      if (!searches.some((search) => hasText(search.strategy) &&
        Number.isFinite(validTime(search.searchedAt)) &&
        validTime(search.searchedAt) >= validTime(adjudication.materiality.lockedAt))) {
        errors.push(`A documented ${side} evidence search after materiality lock is required`);
      }
    }
    const applicable = applicability.filter((link) => adjudication.applicabilityIds.includes(link.id)
      && link.propositionId === adjudication.propositionId && hasText(link.rationale));
    if (!applicable.length) errors.push("At least one considered evidence link to the proposition is required");
    if (adjudication.applicabilityIds.some((id) => !applicable.some((link) => link.id === id))) {
      errors.push("Every considered evidence link must belong to this proposition and include a rationale");
    }
  } else {
    errors.push("Unknown adjudication status");
  }
  if (!hasText(adjudication.reviewedBy) || !Number.isFinite(validTime(adjudication.reviewedAt))) {
    errors.push("Human review is required before publication");
  } else if (validTime(adjudication.reviewedAt) < validTime(adjudication.evidenceEvaluationStartedAt)) {
    errors.push("Human review must follow evidence evaluation");
  }
  return errors;
}

export function canPublishAdjudication(adjudication: Adjudication, applicability: readonly EvidenceApplicability[]): boolean {
  return publicationErrors(adjudication, applicability).length === 0;
}

/** Appends an immutable revision, retaining every earlier capture. */
export function appendCapturedRevision(existing: readonly CapturedRevision[], revision: CapturedRevision): readonly CapturedRevision[] {
  if (existing.some((item) => item.id === revision.id)) throw new Error("Revision ID already exists");
  const previous = existing.at(-1);
  if (revision.previousRevisionId !== previous?.id) throw new Error("Revision must link to the most recent capture");
  if (previous && timestamp(revision.capturedAt) <= timestamp(previous.capturedAt)) throw new Error("Revision must follow the earlier capture");
  if (!hasText(revision.contentSha256)) throw new Error("Revision requires a content digest");
  return [...existing, Object.freeze({ ...revision })];
}

export function appendPublicationEvent(existing: readonly PublicationEvent[], event: PublicationEvent): readonly PublicationEvent[] {
  if (existing.some((item) => item.id === event.id)) throw new Error("Publication event ID already exists");
  if (event.correctionOfEventId) {
    if (!existing.some((item) => item.id === event.correctionOfEventId)) throw new Error("Correction must point to a prior publication");
    if (!hasText(event.correctionExplanation)) throw new Error("Correction explanation is required");
  }
  return [...existing, Object.freeze({ ...event })];
}

/** The policy threshold is intentionally unset; no caller may reveal an aggregate score. */
export function assessAggregateEligibility(_records: readonly RecordView[]): {
  eligible: false;
  score: null;
  reason: string;
} {
  void _records;
  return { eligible: false, score: null, reason: "Founder-approved coverage and sampling gates are pending" };
}
