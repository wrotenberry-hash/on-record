import { and, desc, inArray, like, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { people, propositions, representations, sourceCaptures, sourceCommunications } from "@/db/schema";
import { editorJson } from "@/lib/editor-auth";
import { INVENTORY_WITHHELD_REASON, PUBLIC_INVENTORY_MIN_PUBLISHED, PUBLIC_INVENTORY_STATUSES, PUBLIC_READ_DISABLED_MESSAGE, PUBLIC_READ_FLAG, inventoryVisible, publicReadEnabled } from "@/lib/public-access";
import { countPublishedRecords } from "@/lib/published-records";


/** Public quote inventory: no private evidence, provisional assessments or verdicts. */
export async function GET() {
  const publicRead = publicReadEnabled(process.env[PUBLIC_READ_FLAG]);
  if (!publicRead) return editorJson({ error: PUBLIC_READ_DISABLED_MESSAGE }, 403);
  try {
    // Unreviewed machine captures are withheld until the published record is large
    // enough to give readers reviewed context for them.
    if (!inventoryVisible(publicRead, await countPublishedRecords()))
      return editorJson({ error: `Incoming representations are withheld until ${PUBLIC_INVENTORY_MIN_PUBLISHED} reviewed records are published`,
        reason: INVENTORY_WITHHELD_REASON }, 403);
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
      // A representation a reviewer rejected (misattributed, out of context, not a
      // claim) must leave the public inventory the moment it is rejected.
      .where(and(like(sourceCommunications.sourceType, "discovered:%"),
        inArray(representations.status, [...PUBLIC_INVENTORY_STATUSES])))
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
