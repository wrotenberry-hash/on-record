import { and, desc, eq, lt, notLike, or } from "drizzle-orm";
import { getDb } from "@/db";
import { intakeCandidates } from "@/db/schema";
import { editorialAuth, editorJson } from "@/lib/editor-auth";
import { runAutomatedReview } from "@/app/api/editor/automate/route";

export const maxDuration = 300;


export async function GET() {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const rows = await getDb().select().from(intakeCandidates).orderBy(desc(intakeCandidates.discoveredAt)).limit(100);
  const counts = rows.reduce((out, row) => ({ ...out, [row.status]: (out[row.status] ?? 0) + 1 }), {} as Record<string, number>);
  return editorJson({ candidates: rows, counts, limitedTo: 100 });
}

/** Process one lead per request to bound execution time, spending and retry impact. */
export async function POST(request: Request) {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const body = await request.json().catch(() => ({})) as { id?: unknown; retry?: unknown };
  return processOneCandidate(body, auth.user.userId);
}

export async function processOneCandidate(body: { id?: unknown; retry?: unknown }, actor: string) {
  if (body.id !== undefined && (typeof body.id !== "string" || body.id.length > 100)) return editorJson({ error: "Invalid candidate" }, 400);
  if (body.retry === true && !body.id) return editorJson({ error: "Select a failed lead to retry" }, 400);
  const db = getDb();
  if (body.retry === true) {
    const changed = await db.update(intakeCandidates).set({ status: "QUEUED", error: null })
      .where(and(eq(intakeCandidates.id, body.id as string), or(eq(intakeCandidates.status, "FAILED"),
        and(eq(intakeCandidates.status, "PROCESSING"), lt(intakeCandidates.attemptedAt, Date.now() - 15 * 60_000)))))
      .returning({ id: intakeCandidates.id });
    if (!changed.length) return editorJson({ error: "Only failed or stale processing leads can be retried" }, 409);
  }
  const pending = await db.select().from(intakeCandidates).where(body.id
    ? and(eq(intakeCandidates.id, body.id), eq(intakeCandidates.status, "QUEUED"))
    : and(eq(intakeCandidates.status, "QUEUED"), eq(intakeCandidates.era, "current"),
      notLike(intakeCandidates.medium, "%needs-transcript%"))).orderBy(desc(intakeCandidates.discoveredAt)).limit(1).get();
  if (!pending) return editorJson({ message: "No queued lead remains" });
  if (pending.lane === "Multi-speaker" || pending.medium.includes("needs-transcript"))
    return editorJson({ error: "Original recording or speaker turns require a checked transcript before extraction" }, 422);
  const claimed = await db.update(intakeCandidates).set({ status: "PROCESSING", attemptedAt: Date.now() })
    .where(and(eq(intakeCandidates.id, pending.id), eq(intakeCandidates.status, "QUEUED")))
    .returning({ id: intakeCandidates.id });
  if (!claimed.length) return editorJson({ error: "Another review is processing this lead" }, 409);
  try {
    const response = await runAutomatedReview(pending.canonicalUrl, `discovery:${actor}`, `discovered:${pending.lane}:${pending.medium}:${pending.era}`, 2);
    const result = await response.json() as { caseIds?: string[]; error?: string; status?: string };
    const count = result.caseIds?.length ?? 0;
    const status = result.status === "ALREADY_CAPTURED" ? "SKIPPED" : count ? "CAPTURED"
      : response.status === 409 || response.status === 422 ? "SKIPPED" : "FAILED";
    await db.update(intakeCandidates).set({ status, caseCount: count, completedAt: Date.now(),
      error: response.ok ? null : (result.error ?? "Research incomplete").slice(0, 400) }).where(eq(intakeCandidates.id, pending.id));
    return editorJson({ id: pending.id, status, caseIds: status === "CAPTURED" ? result.caseIds ?? [] : [], error: result.error,
      message: count ? "Private research case saved; human source and evidence review is required" : "Lead retained with its processing result" });
  } catch (caught) {
    const error = (caught instanceof Error ? caught.message : "Intake failed").slice(0, 400);
    await db.update(intakeCandidates).set({ status: "FAILED", error, completedAt: Date.now() }).where(eq(intakeCandidates.id, pending.id));
    return editorJson({ id: pending.id, status: "FAILED", error }, 502);
  }
}
