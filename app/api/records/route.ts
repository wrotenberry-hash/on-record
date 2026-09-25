import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adjudications, corrections, publications, representations, sourceCaptures, sourceCommunications } from "@/db/schema";
import { editorJson } from "@/lib/editor-auth";
import { loadCase } from "@/app/api/editor/cases/_shared";
import { PUBLIC_READ_DISABLED_MESSAGE, PUBLIC_READ_FLAG, passageAround, publicReadEnabled } from "@/lib/public-access";

export const runtime = "edge";
export async function GET() {
  if (!publicReadEnabled((env as unknown as Record<string, string | undefined>)[PUBLIC_READ_FLAG]))
    return editorJson({ error: PUBLIC_READ_DISABLED_MESSAGE }, 403);
  try {
    const db = getDb();
    const rows = await db.select({ publicationId: publications.id, representationId: representations.id,
      adjudicationId: adjudications.id, publishedAt: publications.publishedAt })
      .from(publications).innerJoin(adjudications, eq(publications.adjudicationId, adjudications.id))
      .innerJoin(representations, eq(adjudications.representationId, representations.id))
      .innerJoin(sourceCaptures, eq(representations.captureId, sourceCaptures.id))
      .innerJoin(sourceCommunications, eq(sourceCaptures.communicationId, sourceCommunications.id))
      .where(eq(adjudications.state, "CHECKING")).orderBy(desc(publications.publishedAt)).limit(100);
    const records = (await Promise.all(rows.map(async row => {
      const item = await loadCase(row.representationId);
      if (!item || item.publication?.id !== row.publicationId || item.adjudication?.id !== row.adjudicationId ||
          !item.sourceAuthentication || item.review?.decision !== "APPROVED") return null;
      const [correctionRows, retractions] = await Promise.all([
        db.select().from(corrections).where(eq(corrections.publicationId, row.publicationId)),
        db.select({ id: publications.id }).from(publications).where(eq(publications.retractionOfId, row.publicationId)).limit(1),
      ]);
      if (correctionRows.length || retractions.length) return null;
      return { id: item.id, publicationId: row.publicationId, publishedAt: row.publishedAt, status: "CHECKING" as const,
        communicationId: item.communicationId, speakerName: item.speakerName,
        source: { canonicalUrl: item.canonicalUrl, passage: passageAround(item.originalContent, item.exactText),
          sourceVerification: { recordedAt: item.sourceAuthentication.verifiedAt, method: item.sourceAuthentication.method } },
        representation: { exactText: item.exactText }, proposition: { text: item.canonicalProposition, issue: item.issue },
        evidence: item.evidence.filter(e => item.adjudication?.consideredEvidenceIds.includes(e.propositionEvidenceId))
          .map(e => ({ propositionEvidenceId: e.propositionEvidenceId, id: e.id, title: e.title, sourceName: e.sourceName,
            sourceUrl: e.sourceUrl, sourceType: e.sourceType, excerpt: e.excerpt, stance: e.stance, applicability: e.applicability,
            publishedAt: e.publishedAt })),
        adjudication: { state: "CHECKING" as const, explanation: item.adjudication.explanation,
          supportingSearch: item.adjudication.supportingSearch, contrarySearch: item.adjudication.contrarySearch,
          evidenceCutoffAt: item.adjudication.evidenceCutoffAt },
        review: { decision: item.review.decision, reviewedAt: item.review.createdAt },
        corrections: correctionRows };
    }))).filter(x => x !== null);
    return editorJson({ records });
  } catch (error) {
    console.error("Published records unavailable", error);
    return editorJson({ error: "Published records unavailable" }, 503);
  }
}
