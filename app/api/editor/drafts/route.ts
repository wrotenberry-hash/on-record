import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { type ChatGPTUser } from "@/app/chatgpt-auth";
import { editorialAuth, editorJson as json } from "@/lib/editor-auth";
import { getDb } from "@/db";
import { people, propositions, representations, sourceCaptures, sourceCommunications } from "@/db/schema";

export const runtime = "edge";

const intake = z.object({
  speakerName: z.string().trim().min(1).max(200),
  sourceType: z.string().trim().min(1).max(80),
  canonicalUrl: z.string().url().max(2000).refine(value => new URL(value).protocol === "https:", "Use an HTTPS URL"),
  publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
  originalContent: z.string().min(1).max(100_000),
  exactText: z.string().min(1).max(10_000),
  canonicalProposition: z.string().trim().min(1).max(10_000),
  issue: z.string().trim().min(1).max(200).nullable().optional(),
}).strict();

function speakerSlug(name: string) {
  return name.toLocaleLowerCase("en-US").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    || `speaker-${crypto.randomUUID()}`;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET() {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  try {
    const db = getDb();
    const drafts = await db.select({
      id: representations.id, communicationId: sourceCommunications.id,
      speakerName: people.displayName,
      exactText: representations.exactText,
      canonicalProposition: propositions.canonicalText,
      issue: propositions.issue,
      createdAt: sourceCommunications.createdAt,
    }).from(representations)
      .innerJoin(sourceCaptures, eq(representations.captureId, sourceCaptures.id))
      .innerJoin(sourceCommunications, eq(sourceCaptures.communicationId, sourceCommunications.id))
      .innerJoin(people, eq(sourceCommunications.speakerId, people.id))
      .innerJoin(propositions, eq(representations.propositionId, propositions.id))
      .where(eq(representations.status, "CANDIDATE"))
      .orderBy(desc(sourceCommunications.createdAt)).limit(100);
    return json({ drafts });
  } catch (error) {
    console.error("Draft listing failed", error);
    return json({ error: "Draft listing unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const editor: ChatGPTUser = auth.user;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = intake.safeParse(raw);
  if (!parsed.success) return json({ error: "Invalid intake", details: parsed.error.flatten() }, 400);
  const input = parsed.data;
  const startOffset = input.originalContent.indexOf(input.exactText);
  if (startOffset < 0) return json({ error: "exactText must appear verbatim in originalContent" }, 400);

  const db = getDb();
  const now = Date.now();
  const slug = speakerSlug(input.speakerName);
  const newPersonId = crypto.randomUUID();
  const communicationId = crypto.randomUUID();
  const captureId = crypto.randomUUID();
  const propositionId = crypto.randomUUID();
  const representationId = crypto.randomUUID();
  try {
    // A duplicate speaker slug is reused; no inferred proposition equivalence is made at intake.
    await db.insert(people).values({ id: newPersonId, displayName: input.speakerName, slug, createdAt: now }).onConflictDoNothing();
    const speaker = await db.select({ id: people.id }).from(people).where(eq(people.slug, slug)).get();
    if (!speaker) throw new Error("Speaker creation failed");
    const contentHash = await sha256(input.originalContent);
    // D1 batches are atomic; a failed statement does not leave a partial communication.
    await db.batch([
      db.insert(sourceCommunications).values({ id: communicationId, speakerId: speaker.id, sourceType: input.sourceType,
        canonicalUrl: input.canonicalUrl, publishedAt: input.publishedAt ? Date.parse(input.publishedAt) : null, createdAt: now }),
      db.insert(sourceCaptures).values({ id: captureId, communicationId, revision: 1, capturedAt: now,
        captureUrl: input.canonicalUrl, contentType: "text/plain", originalContent: input.originalContent, contentHash,
        retrievalMetadata: { intake: "manual", submittedBy: editor.userId } }),
      db.insert(propositions).values({ id: propositionId, canonicalText: input.canonicalProposition, issue: input.issue ?? null, createdAt: now }),
      db.insert(representations).values({ id: representationId, captureId, propositionId,
        exactText: input.exactText, startOffset, endOffset: startOffset + input.exactText.length, extractedAt: now, status: "CANDIDATE" }),
    ]);
    return json({ id: representationId, communicationId, captureId, representationId, propositionId, speakerId: speaker.id,
      status: "CANDIDATE" }, 201);
  } catch (error) {
    console.error("Draft creation failed", error);
    return json({ error: "Draft creation unavailable" }, 503);
  }
}
