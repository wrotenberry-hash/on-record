import { desc, like, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { people, propositions, representations, sourceCaptures, sourceCommunications } from "@/db/schema";
import { editorJson } from "@/lib/editor-auth";

export const runtime = "edge";

/** Public quote inventory: no private evidence, provisional assessments or verdicts. */
export async function GET() {
  try {
    const rows = await getDb().select({ id: representations.id, speakerName: people.displayName,
      sourceUrl: sourceCommunications.canonicalUrl, sourceType: sourceCommunications.sourceType,
      exactText: representations.exactText, proposition: propositions.canonicalText,
      issue: propositions.issue, capturedAt: sourceCaptures.capturedAt,
      publishedAt: sourceCommunications.publishedAt,
    }).from(representations)
      .innerJoin(sourceCaptures, eq(representations.captureId, sourceCaptures.id))
      .innerJoin(sourceCommunications, eq(sourceCaptures.communicationId, sourceCommunications.id))
      .innerJoin(people, eq(sourceCommunications.speakerId, people.id))
      .innerJoin(propositions, eq(representations.propositionId, propositions.id))
      .where(like(sourceCommunications.sourceType, "discovered:%"))
      .orderBy(desc(sourceCaptures.capturedAt)).limit(50);
    return editorJson({ representations: rows.map(row => ({ ...row,
      lane: row.sourceType.split(":")[1] ?? "Unclassified",
      medium: row.sourceType.split(":")[2] ?? "web",
      era: row.sourceType.split(":")[3] ?? "current",
      status: "AWAITING_HUMAN_QA" as const, sourceType: undefined })) });
  } catch (error) {
    console.error("Representation inventory unavailable", error);
    return editorJson({ error: "Incoming representations unavailable" }, 503);
  }
}
