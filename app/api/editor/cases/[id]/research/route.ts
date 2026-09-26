import { z } from "zod";
import { getDb } from "@/db";
import { evidenceObjects, evidenceSearches, propositionEvidence, scoringProposals } from "@/db/schema";
import { editorialAuth, editorJson } from "@/lib/editor-auth";
import { proposeAssessment, searchSide } from "@/lib/automated-research";
import { loadCase } from "../../_shared";

export const maxDuration = 300;


/** Research begins only after a person compares and approves the source claim and locks materiality. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return editorJson({ error: "Invalid case ID" }, 400);
  const current = await loadCase(id);
  if (!current) return editorJson({ error: "Case not found" }, 404);
  if (!current.sourceAuthentication || current.status !== "APPROVED" || !current.materiality)
    return editorJson({ error: "Compare the original source, approve the exact representation, and lock materiality first" }, 409);
  if (current.materiality.tier === "NOT_MATERIAL") return editorJson({ error: "M0 claims are excluded from factual research" }, 409);
  if (current.searches.length || current.assessment || current.adjudication)
    return editorJson({ error: "Research has already begun; inspect the saved searches before any further work" }, 409);
  const settings = process.env;
  if (!settings.OPENAI_API_KEY) return editorJson({ error: "Research credential is unavailable" }, 503);
  try {
    const model = settings.OPENAI_RESEARCH_MODEL || "gpt-5.5";
    const statementDate = new Date(current.capturedAt).toISOString();
    const supporting = await searchSide(settings.OPENAI_API_KEY, model, current.canonicalProposition, "SUPPORTS", statementDate);
    const contrary = await searchSide(settings.OPENAI_API_KEY, model, current.canonicalProposition, "CONTRADICTS", statementDate);
    const proposal = await proposeAssessment(settings.OPENAI_API_KEY, model, current.canonicalProposition,
      current.originalContent, supporting.summary, contrary.summary);
    const searchedAt = Math.max(Date.now(), current.materiality.lockedAt + 1);
    const sources = [...supporting.citations.map(c => ({ ...c, side: "SUPPORTS" as const })),
      ...contrary.citations.map(c => ({ ...c, side: "CONTRADICTS" as const }))].slice(0, 12);
    const evidenceAt = searchedAt + 2, assessmentAt = evidenceAt + 1;
    const db = getDb();
    // D1 batch commits together: no misleading half-researched case after a failed write.
    await db.batch([
      db.insert(evidenceSearches).values({ id: crypto.randomUUID(), representationId: id,
        propositionId: current.propositionId, materialityDecisionId: current.materiality.id, side: "SUPPORTS",
        strategy: `${supporting.strategy} [response ${supporting.responseId}]`.slice(0, 4000),
        resultsSummary: supporting.summary, searchedAt, reviewerId: `automation:${auth.user.userId}` }),
      db.insert(evidenceSearches).values({ id: crypto.randomUUID(), representationId: id,
        propositionId: current.propositionId, materialityDecisionId: current.materiality.id, side: "CONTRADICTS",
        strategy: `${contrary.strategy} [response ${contrary.responseId}]`.slice(0, 4000),
        resultsSummary: contrary.summary, searchedAt: searchedAt + 1, reviewerId: `automation:${auth.user.userId}` }),
      ...sources.flatMap(candidate => {
        const evidenceId = crypto.randomUUID();
        return [
          db.insert(evidenceObjects).values({ id: evidenceId, title: candidate.title, sourceUrl: candidate.url,
            sourceName: new URL(candidate.url).hostname, sourceType: "AI search lead", capturedAt: evidenceAt,
            excerpt: "AI search citation; open the underlying source to verify the finding and its scope. No quotation has been authenticated.",
            createdAt: evidenceAt }),
          db.insert(propositionEvidence).values({ id: crypto.randomUUID(), propositionId: current.propositionId,
            evidenceId, stance: candidate.side,
            applicability: "Unverified AI-discovered lead; human reviewer must inspect content and applicability.", createdAt: evidenceAt }),
        ];
      }),
      db.insert(scoringProposals).values({ id: crypto.randomUUID(), representationId: id,
        propositionId: current.propositionId, methodologyVersionId: current.materiality.methodologyVersionId,
        revision: 1, accuracyAnchor: proposal.accuracyAnchor, contextIntegrity: proposal.contextIntegrity,
        authority: proposal.authority, sufficiency: proposal.sufficiency, directness: proposal.directness,
        temporalFit: proposal.temporalFit,
        explanation: `${proposal.explanation} [AI response ${proposal.responseId}; human QA required]`,
        createdAt: assessmentAt, authoredBy: `automation:${auth.user.userId}` }),
    ]);
    return editorJson({ status: "RESEARCHED", evidenceLeads: sources.length,
      message: "Bilateral searches and a private assessment proposal are ready for source-by-source human review" }, 201);
  } catch (caught) {
    console.error("Bilateral research failed", caught);
    return editorJson({ error: caught instanceof Error ? caught.message : "Research failed" }, 502);
  }
}
