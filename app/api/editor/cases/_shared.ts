import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { adjudicationEvidence, adjudications, evidenceObjects, evidenceSearches, machineResearchDrafts, materialityDecisions, people, propositionEvidence, propositions, publications, representations, reviews, scoringProposals, sourceAuthentications, sourceCaptures, sourceCommunications } from "@/db/schema";

export async function loadCase(id: string) {
  const db = getDb();
  const core = await db.select({
    id: representations.id, communicationId: sourceCommunications.id, captureId: sourceCaptures.id, representationId: representations.id,
    propositionId: propositions.id, speakerName: people.displayName, canonicalUrl: sourceCommunications.canonicalUrl,
    sourceType: sourceCommunications.sourceType, publishedAt: sourceCommunications.publishedAt,
    originalContent: sourceCaptures.originalContent, exactText: representations.exactText,
    canonicalProposition: propositions.canonicalText, issue: propositions.issue, status: representations.status, context: representations.context,
    contentHash: sourceCaptures.contentHash, capturedAt: sourceCaptures.capturedAt,
  }).from(sourceCommunications).innerJoin(people, eq(sourceCommunications.speakerId, people.id))
    .innerJoin(sourceCaptures, eq(sourceCaptures.communicationId, sourceCommunications.id))
    .innerJoin(representations, eq(representations.captureId, sourceCaptures.id))
    .innerJoin(propositions, eq(representations.propositionId, propositions.id))
    .where(eq(representations.id, id)).limit(1).get();
  if (!core) return null;
  const [sourceAuthentication, materiality, evidenceRows, adjudication, assessment, searchRows, researchDraft] = await Promise.all([
    db.select().from(sourceAuthentications).where(and(eq(sourceAuthentications.captureId, core.captureId),
      ne(sourceAuthentications.method, "automated-http-fetch"))).orderBy(desc(sourceAuthentications.verifiedAt)).limit(1).get(),
    db.select().from(materialityDecisions).where(eq(materialityDecisions.representationId, core.representationId)).limit(1).get(),
    db.select({ propositionEvidenceId: propositionEvidence.id, id: evidenceObjects.id,
      title: evidenceObjects.title, sourceName: evidenceObjects.sourceName, sourceUrl: evidenceObjects.sourceUrl,
      sourceType: evidenceObjects.sourceType, excerpt: evidenceObjects.excerpt, stance: propositionEvidence.stance,
      applicability: propositionEvidence.applicability, publishedAt: evidenceObjects.publishedAt,
      createdAt: propositionEvidence.createdAt,
    }).from(propositionEvidence).innerJoin(evidenceObjects, eq(evidenceObjects.id, propositionEvidence.evidenceId))
      .where(eq(propositionEvidence.propositionId, core.propositionId)).orderBy(desc(propositionEvidence.createdAt)),
    db.select().from(adjudications).where(eq(adjudications.representationId, core.representationId)).orderBy(desc(adjudications.revision)).limit(1).get(),
    db.select().from(scoringProposals).where(eq(scoringProposals.representationId, core.representationId)).orderBy(desc(scoringProposals.revision)).limit(1).get(),
    db.select().from(evidenceSearches).where(eq(evidenceSearches.representationId, core.representationId)).orderBy(desc(evidenceSearches.searchedAt)),
    db.select().from(machineResearchDrafts).where(eq(machineResearchDrafts.representationId, core.representationId)).get(),
  ]);
  const review = adjudication ? await db.select().from(reviews).where(eq(reviews.adjudicationId, adjudication.id)).orderBy(desc(reviews.createdAt)).limit(1).get() : null;
  const publication = adjudication ? await db.select().from(publications).where(eq(publications.adjudicationId, adjudication.id)).orderBy(desc(publications.publishedAt)).limit(1).get() : null;
  const considered = adjudication ? await db.select({ propositionEvidenceId: adjudicationEvidence.propositionEvidenceId })
    .from(adjudicationEvidence).where(eq(adjudicationEvidence.adjudicationId, adjudication.id)) : [];
  const missingRequirements: string[] = [];
  if (!sourceAuthentication) missingRequirements.push("Authenticate the original source and captured content");
  if (core.status !== "APPROVED") missingRequirements.push(core.status === "REJECTED" ? "Representation was rejected" : "Approve the exact representation");
  if (!materiality) missingRequirements.push("Lock materiality before evidence search");
  if (materiality?.tier === "NOT_MATERIAL") {
    missingRequirements.push("M0: excluded from factual adjudication and public records");
  } else {
    if (!searchRows.some(x => x.side === "SUPPORTS")) missingRequirements.push("Log a search for supporting evidence");
    if (!searchRows.some(x => x.side === "CONTRADICTS")) missingRequirements.push("Log a search for contrary evidence");
    if (!evidenceRows.length && !adjudication) missingRequirements.push("Attach applicable evidence if found, or document bilateral searches finding none");
    if (!assessment) missingRequirements.push("Record a provisional accuracy, context, and evidence confidence assessment");
    if (!adjudication) missingRequirements.push("Record bilateral searches and an adjudication");
    if (adjudication?.state === "RATED") missingRequirements.push("Numerical verdict publication disabled pending founder policy");
    if (!review || review.decision !== "APPROVED") missingRequirements.push("Obtain an approved human review");
    if (!publication) missingRequirements.push("Explicitly publish the reviewed CHECKING record");
  }
  const stage = publication ? "PUBLISHED" : !sourceAuthentication ? "SOURCE_AUTH" : core.status !== "APPROVED" ? "REPRESENTATION"
    : !materiality ? "MATERIALITY" : materiality.tier === "NOT_MATERIAL" ? "EXCLUDED" : (!searchRows.some(x => x.side === "SUPPORTS") || !searchRows.some(x => x.side === "CONTRADICTS")) ? "EVIDENCE" : !assessment ? "ASSESSMENT" : !adjudication ? "ADJUDICATION" : !review || review.decision !== "APPROVED" ? "REVIEW" : "PUBLISH";
  return { ...core, stage, sourceAuthentication: sourceAuthentication ?? null, materiality: materiality ? { ...materiality, level: ({ NOT_MATERIAL: "M0", SUPPORTING: "M1", MAJOR: "M2", CRITICAL: "M3" } as const)[materiality.tier] } : null,
    evidence: evidenceRows, searches: searchRows, assessment: assessment ? { ...assessment, materialityLevel: materiality ? ({ NOT_MATERIAL: "M0", SUPPORTING: "M1", MAJOR: "M2", CRITICAL: "M3" } as const)[materiality.tier] : null,
      evidenceConfidenceTotal: assessment.authority + assessment.sufficiency + assessment.directness + assessment.temporalFit } : null, adjudication: adjudication ? { ...adjudication, consideredEvidenceIds: considered.map(x => x.propositionEvidenceId) } : null,
    researchDraft: researchDraft ?? null, review: review ?? null, publication: publication ?? null, missingRequirements };
}

export type EditorialCase = NonNullable<Awaited<ReturnType<typeof loadCase>>>;
