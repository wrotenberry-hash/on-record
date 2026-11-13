import { editorialAuth, editorJson } from "@/lib/editor-auth";
import { runAnalysisBatch } from "@/lib/analysis/generate";
import { sendSummariesReadyIfDue } from "@/lib/analysis/report";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** "Write summaries now": the same batch the scheduled run does, inside the same summary and spend caps. */
export async function POST() {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const run = await runAnalysisBatch({ budgetMs: 270_000, trigger: "editor" });
  const summariesEmail = await sendSummariesReadyIfDue();
  return editorJson({ ...run, summariesEmail }, run.status === "FAILED" ? 502 : 200);
}
