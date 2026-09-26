import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { people, propositions, representations, sourceCaptures, sourceCommunications } from "@/db/schema";
import { editorialAuth, editorJson } from "@/lib/editor-auth";
import { extractClaims, fetchSource } from "@/lib/automated-research";

export const maxDuration = 300;

const inputSchema = z.object({ sourceUrl: z.string().url().max(2000) }).strict();

async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, "0")).join("");
}

/** Capture machine-extracted claims for human source and representation review. */
export async function POST(request: Request) {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return editorJson({ error: "Enter a public HTTPS source URL" }, 400);
  return runAutomatedReview(parsed.data.sourceUrl, `automation:${auth.user.userId}`);
}

/** Shared intake for a submitted original and for balanced source discovery. */
export async function runAutomatedReview(sourceUrl: string, actor: string, sourceType = "web", maxClaims = 3) {
  const settings = process.env;
  if (!settings.OPENAI_API_KEY) return editorJson({ error: "Automated research is not connected. A server-side AI research credential is required." }, 503);
  const db = getDb();
  const caseIds: string[] = [];
  try {
    const source = await fetchSource(sourceUrl);
    const duplicate = await db.select({ id: sourceCommunications.id }).from(sourceCommunications)
      .where(eq(sourceCommunications.canonicalUrl, source.url)).limit(1).get();
    if (duplicate) {
      const existing = await db.select({ id: representations.id }).from(sourceCaptures)
        .innerJoin(representations, eq(representations.captureId, sourceCaptures.id))
        .where(eq(sourceCaptures.communicationId, duplicate.id));
      return editorJson({ status: "ALREADY_CAPTURED", caseIds: existing.map(x => x.id),
        message: "Existing claim candidates retained for source review" });
    }
    const extractModel = settings.OPENAI_EXTRACT_MODEL || "gpt-5.4-mini";
    const extracted = await extractClaims(settings.OPENAI_API_KEY, extractModel, source.text.slice(0, 30000));
    if (!extracted.claims.length) return editorJson({ error: "No checkable factual claim was identified in this communication." }, 422);

    const start = Date.now();
    const slug = extracted.speakerName.toLocaleLowerCase("en-US").normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID();
    await db.insert(people).values({ id: crypto.randomUUID(), displayName: extracted.speakerName, slug, createdAt: start }).onConflictDoNothing();
    const speaker = await db.select({ id: people.id }).from(people).where(eq(people.slug, slug)).get();
    if (!speaker) throw Error("Could not record speaker");
    const communicationId = crypto.randomUUID(), captureId = crypto.randomUUID(), digest = await sha256(source.text);
    await db.batch([
      db.insert(sourceCommunications).values({ id: communicationId, speakerId: speaker.id, sourceType,
        canonicalUrl: source.url, publishedAt: source.publishedAt, createdAt: start }),
      db.insert(sourceCaptures).values({ id: captureId, communicationId, revision: 1, capturedAt: start,
        captureUrl: source.url, contentType: source.contentType, originalContent: source.text, contentHash: digest,
        retrievalMetadata: { intake: "automated-http", extractedAt: start, extractionResponseId: extracted.responseId,
          contentNormalization: "HTML tags removed and whitespace collapsed", sourcePublishedAtCandidate: source.publishedAt,
          submittedBy: actor } }),
    ]);

    for (const item of extracted.claims.slice(0, maxClaims)) {
      const matching = await db.select({ id: propositions.id }).from(propositions)
        .where(eq(propositions.canonicalText, item.proposition)).limit(1).get();
      const propositionId = matching?.id ?? crypto.randomUUID(), representationId = crypto.randomUUID();
      const offset = source.text.indexOf(item.exactText);
      if (offset < 0) continue; // Never substitute a paraphrase for an exact representation.
      const extractedAt = Math.max(Date.now(), start + 1);
      if (!matching) await db.insert(propositions).values({ id: propositionId, canonicalText: item.proposition, issue: item.issue, createdAt: extractedAt });
      await db.insert(representations).values({ id: representationId, captureId, propositionId, exactText: item.exactText,
        startOffset: offset, endOffset: offset + item.exactText.length,
        context: `AI-extracted. Suggested pre-research materiality ${item.materiality}: ${item.materialityRationale}. Reviewer must independently compare the source and lock materiality.`,
        extractedAt, status: "CANDIDATE" });
      caseIds.push(representationId);
    }
    return editorJson({ caseIds, status: "AWAITING_SOURCE_REVIEW", message: "Exact claim candidates saved. Compare the original, approve the representation and lock materiality before bilateral research." }, 201);
  } catch (error) {
    console.error("Automated review stopped", error);
    return editorJson({ error: error instanceof Error ? error.message : "Automated research failed", caseIds,
      status: "INCOMPLETE", message: "Any captured cases remain private and require review; no result was published." }, 502);
  }
}
