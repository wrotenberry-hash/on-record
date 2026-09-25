import { z } from "zod";
import { getDb } from "@/db";
import { evidenceObjects, evidenceSearches, propositionEvidence, scoringProposals } from "@/db/schema";
import { editorialAuth, editorJson } from "@/lib/editor-auth";
import { loadCase } from "../../_shared";

export const runtime = "edge";

/** Promotion copies machine leads into the checking instrument only after human gates. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return editorJson({ error: "Invalid case ID" }, 400);
  const current = await loadCase(id);
  if (!current) return editorJson({ error: "Case not found" }, 404);
  if (!current.sourceAuthentication || current.status !== "APPROVED" || !current.materiality)
    return editorJson({ error: "Compare the original, approve the exact claim, and lock materiality first" }, 409);
  if (current.materiality.tier === "NOT_MATERIAL" || current.searches.length || current.assessment || current.adjudication)
    return editorJson({ error: "This case is excluded or research has already begun" }, 409);
  const draft = current.researchDraft;
  if (draft?.status !== "COMPLETE" || !draft.supportStrategy || !draft.supportingSummary ||
      !draft.contraryStrategy || !draft.contrarySummary || !draft.assessment)
    return editorJson({ error: "Complete private bilateral research before promotion" }, 409);
  const assessment = draft.assessment;
  const searchedAt = Math.max(Date.now(), current.materiality.lockedAt + 1);
  const evidenceAt = searchedAt + 2, assessmentAt = evidenceAt + 1;
  const db = getDb();
  try {
    const statements: Parameters<typeof db.batch>[0] = [
      db.insert(evidenceSearches).values({ id: crypto.randomUUID(), representationId: id,
        propositionId: current.propositionId, materialityDecisionId: current.materiality.id, side: "SUPPORTS",
        strategy: draft.supportStrategy, resultsSummary: draft.supportingSummary, searchedAt,
        reviewerId: `machine-draft-promoted:${auth.user.userId}` }),
      db.insert(evidenceSearches).values({ id: crypto.randomUUID(), representationId: id,
        propositionId: current.propositionId, materialityDecisionId: current.materiality.id, side: "CONTRADICTS",
        strategy: draft.contraryStrategy, resultsSummary: draft.contrarySummary, searchedAt: searchedAt + 1,
        reviewerId: `machine-draft-promoted:${auth.user.userId}` }),
      ...(draft.citations ?? []).flatMap(candidate => {
        const evidenceId = crypto.randomUUID();
        return [
          db.insert(evidenceObjects).values({ id: evidenceId, title: candidate.title, sourceUrl: candidate.url,
            sourceName: new URL(candidate.url).hostname, sourceType: "AI search lead", capturedAt: evidenceAt,
            excerpt: "Machine-discovered citation. Open the source; no excerpt has been authenticated.", createdAt: evidenceAt }),
          db.insert(propositionEvidence).values({ id: crypto.randomUUID(), propositionId: current.propositionId,
            evidenceId, stance: candidate.side, applicability: "Unverified lead; human must check content and scope.", createdAt: evidenceAt }),
        ];
      }),
      db.insert(scoringProposals).values({ id: crypto.randomUUID(), representationId: id,
        propositionId: current.propositionId, methodologyVersionId: current.materiality.methodologyVersionId,
        revision: 1, accuracyAnchor: assessment.accuracyAnchor, contextIntegrity: assessment.contextIntegrity,
        authority: assessment.authority, sufficiency: assessment.sufficiency, directness: assessment.directness,
        temporalFit: assessment.temporalFit, explanation: `${assessment.explanation} [Machine draft; human QA required]`,
        createdAt: assessmentAt, authoredBy: `machine-draft-promoted:${auth.user.userId}` }),
    ];
    await db.batch(statements);
    return editorJson({ status: "PROMOTED", message: "Draft research copied into the checking instrument. Inspect cited sources before adjudication." }, 201);
  } catch (caught) {
    console.error("Draft promotion failed", caught);
    return editorJson({ error: "Could not promote research draft; the case may have changed" }, 409);
  }
}
