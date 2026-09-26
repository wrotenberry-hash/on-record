import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { adjudicationEvidence, adjudications, evidenceObjects, evidenceSearches, materialityDecisions, methodologyVersions, propositionEvidence, publications, representations, reviews, scoringProposals, sourceAuthentications } from "@/db/schema";
import { editorialAuth, editorJson } from "@/lib/editor-auth";
import { loadCase } from "../../_shared";

const nonempty = (limit: number) => z.string().trim().min(1).max(limit);
const https = z.string().url().max(2000).refine(x => new URL(x).protocol === "https:", "HTTPS URL required");
const schemas = {
  "source-auth": z.object({ method: nonempty(200), notes: nonempty(4000), reviewedUrl: https, reviewedContent: z.string().min(1).max(100_000) }).strict(),
  representation: z.object({ decision: z.enum(["APPROVED", "REJECTED"]), notes: nonempty(4000) }).strict(),
  materiality: z.object({ tier: z.enum(["M0", "M1", "M2", "M3"]), rationale: nonempty(4000) }).strict(),
  evidence: z.object({ title: nonempty(500), sourceName: nonempty(300), sourceUrl: https, sourceType: nonempty(100),
    excerpt: nonempty(20_000), stance: z.enum(["SUPPORTS", "CONTRADICTS", "CONTEXT"]), applicability: nonempty(4000),
    publishedAt: z.string().datetime({ offset: true }).optional() }).strict(),
  search: z.object({ side: z.enum(["SUPPORTS", "CONTRADICTS"]), strategy: nonempty(4000), resultsSummary: nonempty(4000) }).strict(),
  assessment: z.object({ accuracyAnchor: z.enum(["100", "95", "85", "65", "35", "15", "0", "U"]),
    contextIntegrity: z.enum(["100", "85", "60", "30", "0", "N/A"]),
    authority: z.number().int().min(0).max(25), sufficiency: z.number().int().min(0).max(25),
    directness: z.number().int().min(0).max(25), temporalFit: z.number().int().min(0).max(25),
    explanation: nonempty(10000) }).strict(),
  adjudication: z.object({ state: z.literal("CHECKING"), explanation: nonempty(10000),
    consideredEvidenceIds: z.array(z.string().uuid()).max(100) }).strict(),
  review: z.object({ decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]), notes: nonempty(4000),
    verifiedSource: z.boolean().optional(), verifiedEvidence: z.boolean().optional() }).strict(),
  publish: z.object({}).strict(),
} as const;
type Action = keyof typeof schemas;
const failure = (error: string, status = 409, missingRequirements?: string[]) => editorJson({ error, ...(missingRequirements ? { missingRequirements } : {}) }, status);

export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const { id, action } = await context.params;
  if (!(action in schemas)) return failure("Unknown case action", 404);
  if (!z.string().uuid().safeParse(id).success) return failure("Invalid case ID", 400);
  let body: unknown;
  try { body = await request.json(); } catch { return failure("Invalid JSON body", 400); }
  const parsed = schemas[action as Action].safeParse(body);
  if (!parsed.success) return editorJson({ error: "Invalid action input", details: parsed.error.flatten() }, 400);
  const input = parsed.data;
  try {
    const current = await loadCase(id);
    if (!current) return failure("Case not found", 404);
    const db = getDb();
    const now = Date.now();
    const actor = auth.user.userId;
    if (action === "source-auth") {
      if (current.sourceAuthentication) return failure("Source already authenticated; attestations are append-only");
      if (!current.canonicalUrl) return failure("Cannot authenticate without an original source URL");
      const v = input as z.infer<typeof schemas["source-auth"]>;
      if (v.reviewedUrl !== current.canonicalUrl) return failure("Reviewed URL must match the preserved canonical source URL", 400);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v.reviewedContent));
      const checkedHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      // HTML text extraction removes navigation and normalizes whitespace. Compare the
      // independently copied passage to the exact claim for automated web captures.
      // Manual captures still require byte-for-byte content comparison.
      const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
      if (current.sourceType === "web" || current.sourceType.startsWith("discovered:")) {
        if (!normalized(v.reviewedContent).includes(normalized(current.exactText)))
          return failure("Independent source text must contain the exact factual representation", 400);
      } else if (checkedHash !== current.contentHash) return failure("Reviewed content does not match the preserved source capture", 400);
      await db.insert(sourceAuthentications).values({ id: crypto.randomUUID(), captureId: current.captureId, reviewedUrl: v.reviewedUrl,
        reviewedContentHash: current.contentHash, reviewerId: actor, method: v.method,
        notes: `${v.notes} Independently copied passage SHA-256: ${checkedHash}.`, verifiedAt: now });
    } else if (action === "representation") {
      if (!current.sourceAuthentication) return failure("Authenticate the original source before approving a representation");
      if (current.status !== "CANDIDATE") return failure("Representation decision already recorded");
      const v = input as z.infer<typeof schemas.representation>;
      // The representation decision is a state transition; the authenticated user's identity is provided by the protected endpoint.
      await db.update(representations).set({ status: v.decision, context: v.notes })
        .where(and(eq(representations.id, current.representationId), eq(representations.status, "CANDIDATE")));
    } else if (action === "materiality") {
      if (current.status !== "APPROVED" || !current.sourceAuthentication) return failure("Source authentication and representation approval are required");
      if (current.materiality) return failure("Materiality is locked and cannot be changed");
      const v = input as z.infer<typeof schemas.materiality>;
      const methodologyId = "on-record-private-provisional-v1";
      await db.insert(methodologyVersions).values({ id: methodologyId, label: "Private provisional v1",
        description: "Provisional materiality and CHECKING workflow; numerical publication disabled", effectiveAt: now }).onConflictDoNothing();
      await db.insert(materialityDecisions).values({ id: crypto.randomUUID(), representationId: current.representationId,
        methodologyVersionId: methodologyId, tier: ({ M0: "NOT_MATERIAL", M1: "SUPPORTING", M2: "MAJOR", M3: "CRITICAL" } as const)[v.tier], rationale: v.rationale, lockedAt: now, decidedBy: actor });
    } else if (action === "evidence") {
      if (!current.materiality || current.status !== "APPROVED") return failure("Lock materiality before collecting evidence");
      if (current.materiality.tier === "NOT_MATERIAL") return failure("Not material: evidence collection for adjudication is disabled");
      if (current.adjudication) return failure("Adjudication already recorded; this case requires a new adjudication revision to consider later evidence");
      const v = input as z.infer<typeof schemas.evidence>;
      if (!current.searches.some(x => x.side === (v.stance === "CONTRADICTS" ? "CONTRADICTS" : "SUPPORTS")))
        return failure("Log the relevant evidence search before attaching evidence");
      const evidenceId = crypto.randomUUID();
      const evidenceDate = Math.max(now, current.materiality.lockedAt + 1, ...current.searches.map(x => x.searchedAt + 1));
      await db.batch([
        db.insert(evidenceObjects).values({ id: evidenceId, title: v.title, sourceName: v.sourceName,
          sourceUrl: v.sourceUrl, sourceType: v.sourceType, excerpt: v.excerpt,
          publishedAt: v.publishedAt ? Date.parse(v.publishedAt) : null, capturedAt: evidenceDate, createdAt: evidenceDate }),
        db.insert(propositionEvidence).values({ id: crypto.randomUUID(), propositionId: current.propositionId,
          evidenceId, stance: v.stance, applicability: v.applicability, createdAt: evidenceDate }),
      ]);
    } else if (action === "search") {
      if (!current.materiality || current.status !== "APPROVED" || !current.sourceAuthentication) return failure("Authenticate source, approve representation, and lock materiality before searching");
      if (current.materiality.tier === "NOT_MATERIAL") return failure("M0 is excluded from evidence search and factual assessment");
      if (current.adjudication) return failure("Evidence searches are locked after adjudication");
      const v = input as z.infer<typeof schemas.search>;
      await db.insert(evidenceSearches).values({ id: crypto.randomUUID(), representationId: current.representationId,
        propositionId: current.propositionId, materialityDecisionId: current.materiality.id, side: v.side,
        strategy: v.strategy, resultsSummary: v.resultsSummary, searchedAt: Math.max(now, current.materiality.lockedAt + 1), reviewerId: actor });
    } else if (action === "assessment") {
      if (!current.materiality || current.status !== "APPROVED" || !current.sourceAuthentication) return failure("Authenticate source, approve representation, and lock materiality first");
      if (current.materiality.tier === "NOT_MATERIAL") return failure("M0 is excluded from scoring assessment");
      if (current.adjudication || current.review) return failure("Assessment locked after adjudication");
      if (!current.searches.some(x => x.side === "SUPPORTS") || !current.searches.some(x => x.side === "CONTRADICTS"))
        return failure("Log supporting and contrary evidence searches before assessment");
      const v = input as z.infer<typeof schemas.assessment>;
      await db.insert(scoringProposals).values({ id: crypto.randomUUID(), representationId: current.representationId,
        propositionId: current.propositionId, methodologyVersionId: current.materiality.methodologyVersionId,
        revision: current.assessment ? current.assessment.revision + 1 : 1, ...v,
        createdAt: Math.max(now, current.materiality.lockedAt + 1, ...current.searches.map(x => x.searchedAt + 1)), authoredBy: actor });
    } else if (action === "adjudication") {
      if (!current.materiality || current.status !== "APPROVED" || !current.sourceAuthentication) return failure("Authenticate source, approve representation, and lock materiality first");
      if (current.adjudication) return failure("Adjudication already recorded; revision workflow has not been approved");
      if (current.materiality.tier === "NOT_MATERIAL") return failure("M0 is excluded from factual adjudication");
      if (!current.assessment) return failure("Record the provisional accuracy, context, and evidence confidence assessment first");
      const v = input as z.infer<typeof schemas.adjudication>;
      if (!current.searches.some(x => x.side === "SUPPORTS") || !current.searches.some(x => x.side === "CONTRADICTS"))
        return failure("Log supporting and contrary evidence searches before adjudication");
      const uniqueIds = [...new Set(v.consideredEvidenceIds)];
      if (uniqueIds.length !== v.consideredEvidenceIds.length) return failure("Duplicate considered evidence IDs", 400);
      const linked = new Set(current.evidence.map(e => e.propositionEvidenceId));
      if (uniqueIds.some(x => !linked.has(x))) return failure("Every considered evidence ID must belong to this proposition", 400);
      const searchStarted = Math.min(...current.searches.map(x => x.searchedAt));
      const searchText = (side: "SUPPORTS" | "CONTRADICTS") => current.searches.filter(x => x.side === side)
        .map(x => `${new Date(x.searchedAt).toISOString()} | ${x.strategy}: ${x.resultsSummary}`).join("\n");
      const adjudicationId = crypto.randomUUID();
      const createdAt = Math.max(Date.now(), searchStarted, current.assessment?.createdAt ?? 0,
        ...current.evidence.map(e => e.createdAt));
      await db.batch([
        db.insert(adjudications).values({ id: adjudicationId, representationId: current.representationId,
          propositionId: current.propositionId, materialityDecisionId: current.materiality.id,
          methodologyVersionId: current.materiality.methodologyVersionId, revision: 1, state: "CHECKING",
          score: null, explanation: v.explanation,
          supportingSearch: searchText("SUPPORTS"), contrarySearch: searchText("CONTRADICTS"),
          evidenceSearchStartedAt: searchStarted, evidenceCutoffAt: createdAt, createdAt, authoredBy: actor }),
        ...uniqueIds.map(propositionEvidenceId => db.insert(adjudicationEvidence).values({ adjudicationId, propositionEvidenceId, consideration: "Considered by editor" })),
      ]);
    } else if (action === "review") {
      if (!current.adjudication || !current.sourceAuthentication) return failure("Source authentication and adjudication required before review");
      if (current.review) return failure("A review decision already exists for this adjudication");
      const v = input as z.infer<typeof schemas.review>;
      if (v.decision === "APPROVED" && current.adjudication.state === "RATED") return failure("Numerical verdict approval disabled pending founder methodology policy");
      if (v.decision === "APPROVED" && (!v.verifiedSource || !v.verifiedEvidence))
        return failure("Confirm human inspection of the original and cited evidence before approval");
      await db.insert(reviews).values({ id: crypto.randomUUID(), adjudicationId: current.adjudication.id,
        reviewerId: actor, decision: v.decision,
        notes: v.decision === "APPROVED"
          ? `Human inspected source and cited evidence. ${v.notes}` : v.notes,
        createdAt: Math.max(now, current.adjudication.createdAt) });
    } else if (action === "publish") {
      if (current.publication) return failure("Already published");
      if (!current.sourceAuthentication || current.status !== "APPROVED" || !current.materiality || !current.adjudication || !current.review)
        return failure("Publication gates incomplete", 409, current.missingRequirements);
      if (current.materiality.tier === "NOT_MATERIAL") return failure("M0 is excluded from public factual records");
      if (current.adjudication.state !== "CHECKING") return failure("Numerical verdict publication disabled pending founder methodology policy");
      if (current.review.decision !== "APPROVED" || current.review.adjudicationId !== current.adjudication.id)
        return failure("A matching approved human review is required");
      await db.insert(publications).values({ id: crypto.randomUUID(), adjudicationId: current.adjudication.id,
        approvedReviewId: current.review.id, publishedAt: Math.max(now, current.review.createdAt, current.sourceAuthentication.verifiedAt), publishedBy: actor });
    }
    return editorJson({ case: await loadCase(id) });
  } catch (error) {
    console.error(`Editorial ${action} failed`, error);
    return failure("Action could not be completed; check whether the case changed and retry", 409);
  }
}
