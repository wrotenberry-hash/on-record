import { editorialAuth, editorJson } from "@/lib/editor-auth";
import { runAnalysisBatch } from "@/lib/analysis/generate";
import { sendSummariesReadyIfDue } from "@/lib/analysis/report";
import { runClassifyBatch } from "@/lib/analysis/classify";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** "Write summaries now": the same batch the scheduled run does, inside the same summary and spend caps. */
export async function POST() {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const started = Date.now();
  const run = await runAnalysisBatch({ budgetMs: 230_000, trigger: "editor" });
  const summariesEmail = await sendSummariesReadyIfDue();
  // Then sort bills without an official topic, unless OpenAI refused for billing (AI work stops).
  const left = 280_000 - (Date.now() - started);
  const classify = /billing or usage limit/i.test(run.error ?? "") || left < 30_000 ? null : await runClassifyBatch({ budgetMs: left }).catch(() => null);
  return editorJson({ ...run, summariesEmail, classify }, run.status === "FAILED" ? 502 : 200);
}
