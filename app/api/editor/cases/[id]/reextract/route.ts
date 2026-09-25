import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { propositions, representations } from "@/db/schema";
import { editorialAuth, editorJson } from "@/lib/editor-auth";
import { extractClaims } from "@/lib/automated-research";
import { loadCase } from "../../_shared";

export const runtime = "edge";

/** Find stronger exact claims in a preserved capture without duplicating its source. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return editorJson({ error: "Invalid case ID" }, 400);
  const current = await loadCase(id);
  if (!current) return editorJson({ error: "Case not found" }, 404);
  const settings = env as unknown as { OPENAI_API_KEY?: string; OPENAI_EXTRACT_MODEL?: string };
  if (!settings.OPENAI_API_KEY) return editorJson({ error: "Extraction credential is unavailable" }, 503);
  try {
    const extracted = await extractClaims(settings.OPENAI_API_KEY, settings.OPENAI_EXTRACT_MODEL || "gpt-5.4-mini",
      current.originalContent.slice(0, 30000));
    const db = getDb();
    const existing = await db.select({ exactText: representations.exactText }).from(representations)
      .where(eq(representations.captureId, current.captureId));
    const seen = new Set(existing.map(x => x.exactText));
    const caseIds: string[] = [];
    for (const item of extracted.claims.slice(0, 3)) {
      if (seen.has(item.exactText)) continue;
      const offset = current.originalContent.indexOf(item.exactText);
      if (offset < 0) continue;
      seen.add(item.exactText);
      const matching = await db.select({ id: propositions.id }).from(propositions)
        .where(eq(propositions.canonicalText, item.proposition)).limit(1).get();
      const propositionId = matching?.id || crypto.randomUUID(), representationId = crypto.randomUUID(), now = Date.now();
      if (!matching) await db.insert(propositions).values({ id: propositionId, canonicalText: item.proposition,
        issue: item.issue, createdAt: now });
      await db.insert(representations).values({ id: representationId, captureId: current.captureId, propositionId,
        exactText: item.exactText, startOffset: offset, endOffset: offset + item.exactText.length,
        context: `AI re-extracted. Suggested pre-research materiality ${item.materiality}: ${item.materialityRationale}. Human review required.`,
        extractedAt: now, status: "CANDIDATE" });
      caseIds.push(representationId);
    }
    return editorJson({ caseIds, status: "AWAITING_SOURCE_REVIEW",
      message: caseIds.length ? "New exact claim candidates added to the existing source" : "No additional distinct checkable claim was found" });
  } catch (caught) {
    console.error("Re-extraction failed", caught);
    return editorJson({ error: caught instanceof Error ? caught.message : "Could not re-extract source" }, 502);
  }
}
