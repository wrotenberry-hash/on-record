import { editorialAuth, editorJson } from "@/lib/editor-auth";
import { runFederalIngest } from "@/lib/federal/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** "Update now" for the editor: the same federal ingestion the scheduled run does, with a longer budget. */
export async function POST() {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const summary = await runFederalIngest({ budgetMs: 240_000, trigger: "editor" });
  return editorJson(summary, summary.status === "FAILED" ? 502 : 200);
}
