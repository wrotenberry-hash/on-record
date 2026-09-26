import { and, eq, lt, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { machineResearchDrafts } from "@/db/schema";
import { editorialAuth, editorJson } from "@/lib/editor-auth";
import { proposeAssessment, searchSide } from "@/lib/automated-research";
import { reservePrivateResearch } from "@/lib/research-budget";
import { loadCase } from "../../_shared";

export const maxDuration = 300;


/** Private machine analysis: deliberately outside the canonical evidence and scoring tables. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const { id } = await context.params;
  return runMachineResearch(id);
}

export async function runMachineResearch(id: string) {
  if (!z.string().uuid().safeParse(id).success) return editorJson({ error: "Invalid case ID" }, 400);
  const current = await loadCase(id);
  if (!current) return editorJson({ error: "Case not found" }, 404);
  if (current.status === "REJECTED") return editorJson({ error: "Rejected representations cannot be researched" }, 409);
  const settings = process.env;
  if (!settings.OPENAI_API_KEY) return editorJson({ error: "Research credential is unavailable" }, 503);
  const db = getDb(), now = Date.now();
  const inserted = await db.insert(machineResearchDrafts).values({ representationId: id, status: "PROCESSING", attemptedAt: now })
    .onConflictDoNothing().returning({ id: machineResearchDrafts.representationId });
  if (!inserted.length) {
    const existing = await db.select().from(machineResearchDrafts).where(eq(machineResearchDrafts.representationId, id)).get();
    if (existing?.status === "COMPLETE") return editorJson({ status: "COMPLETE", message: "Private research draft already exists" });
    const reset = await db.update(machineResearchDrafts).set({ status: "PROCESSING", attemptedAt: now, completedAt: null, error: null })
      .where(and(eq(machineResearchDrafts.representationId, id), or(eq(machineResearchDrafts.status, "FAILED"),
        and(eq(machineResearchDrafts.status, "PROCESSING"), lt(machineResearchDrafts.attemptedAt, now - 15 * 60_000)))))
      .returning({ id: machineResearchDrafts.representationId });
    if (!reset.length) return editorJson({ error: "Research is already in progress" }, 409);
  }
  const budget = await reservePrivateResearch();
  if (!budget.allowed) {
    if (inserted.length) await db.delete(machineResearchDrafts).where(eq(machineResearchDrafts.representationId, id));
    else await db.update(machineResearchDrafts).set({ status: "FAILED", error: "Daily private research limit reached", completedAt: Date.now() })
      .where(eq(machineResearchDrafts.representationId, id));
    return editorJson({ error: `Daily research limit of ${budget.limit} attempts reached; try again tomorrow UTC` }, 429);
  }
  try {
    const model = settings.OPENAI_RESEARCH_MODEL || "gpt-5.5";
    const date = new Date(current.publishedAt ?? current.capturedAt).toISOString();
    const supporting = await searchSide(settings.OPENAI_API_KEY, model, current.canonicalProposition, "SUPPORTS", date);
    const contrary = await searchSide(settings.OPENAI_API_KEY, model, current.canonicalProposition, "CONTRADICTS", date);
    const proposal = await proposeAssessment(settings.OPENAI_API_KEY, model, current.canonicalProposition,
      current.originalContent, supporting.summary, contrary.summary);
    const citations = [...supporting.citations.map(c => ({ ...c, side: "SUPPORTS" as const })),
      ...contrary.citations.map(c => ({ ...c, side: "CONTRADICTS" as const }))].slice(0, 12);
    await db.update(machineResearchDrafts).set({ status: "COMPLETE", supportStrategy: supporting.strategy,
      supportingSummary: supporting.summary, contraryStrategy: contrary.strategy, contrarySummary: contrary.summary,
      citations, assessment: proposal, error: null, completedAt: Date.now() })
      .where(eq(machineResearchDrafts.representationId, id));
    return editorJson({ status: "COMPLETE", message: "Private bilateral research draft saved; human review and promotion remain required" }, 201);
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : "Research failed";
    await db.update(machineResearchDrafts).set({ status: "FAILED", error: error.slice(0, 400), completedAt: Date.now() })
      .where(eq(machineResearchDrafts.representationId, id));
    return editorJson({ error }, 502);
  }
}
