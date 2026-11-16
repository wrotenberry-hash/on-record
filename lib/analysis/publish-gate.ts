import { and, eq, sql, type SQL } from "drizzle-orm";
import { analysisBillSummaries } from "@/db/schema";

/**
 * Owner instruction, 16 Nov 2026: summaries restated titles and S.J.Res. 197's headline was wrong, so no more
 * summaries go out until the rebuilt generator passes and the owner has reviewed S.J.Res. 197.
 * Readers see a summary only when it is visible AND was written by a generator at or after PUBLIC_MIN_PROMPT.
 * null = readers see none (the signed-in editor still previews them, labelled). Prompt versions compare as text,
 * so keep them "b5-…" through "b9-…" (or zero-pad) for this to order correctly.
 */
export const PUBLIC_MIN_PROMPT = null as string | null;

/** Paused unless ANALYSIS_PAUSED=0: the scheduled runs write no summaries while the generator is rebuilt. */
export function analysisPaused(): boolean { return process.env.ANALYSIS_PAUSED?.trim() !== "0"; }

export function readerVisible(): SQL {
  if (PUBLIC_MIN_PROMPT === null) return sql`0 = 1`;
  return and(eq(analysisBillSummaries.status, "visible"), sql`${analysisBillSummaries.promptVersion} >= ${PUBLIC_MIN_PROMPT}`)!;
}

/** The same gate for raw subqueries that alias analysis_bill_summaries as "s". */
export const READER_S = PUBLIC_MIN_PROMPT === null ? sql.raw("0 = 1")
  : sql.raw(`s.status = 'visible' and s.prompt_version >= '${PUBLIC_MIN_PROMPT.replace(/'/g, "")}'`);
