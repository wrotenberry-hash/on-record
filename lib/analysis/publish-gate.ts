import { and, eq, notInArray, sql, type SQL } from "drizzle-orm";
import { analysisBillSummaries } from "@/db/schema";
import { generatorNumber, generatorNumberSql } from "./prompt-order";
import { heldBillIds, READER_HOLDS } from "./reader-holds.ts";
import { READ_FROM_GENERATOR, readAndSoundIds } from "./reader-read.ts";
export { READER_HOLDS };

/**
 * Owner instruction, 16 Nov 2026: summaries restated titles and S.J.Res. 197's headline was wrong, so no more
 * summaries go out until the rebuilt generator passes and the owner has reviewed S.J.Res. 197.
 * Readers see a summary only when it is visible AND was written by a generator at or after PUBLIC_MIN_PROMPT.
 * null = readers see none (the signed-in editor still previews them, labelled). Versions are compared by generator
 * number ("b11" is after "b9"), never as text: see lib/analysis/prompt-order.ts.
 */
// Owner, 17 Nov ("Trial readers should see the summaries that passed"): open from generator b11, the first to pass the full
// standard (written rules and the average-reader test). Held summaries stay with the editor. The site itself is still
// reachable only by trial invite or the editor's key.
export const PUBLIC_MIN_PROMPT = "b11-2026-11-17" as string | null;
/** Texas summaries are in the old format and have not met the standard: readers see none, whatever the federal gate says. */
export const TEXAS_SUMMARIES_PUBLIC = false;

/**
 * Federal summaries run again from generator b5 (16 Nov): what they write stays hidden from readers (PUBLIC_MIN_PROMPT
 * is null) until the owner has reviewed S.J.Res. 197. ANALYSIS_PAUSED=1 stops the runs entirely.
 */
// Owner instruction, 17 Nov: the summary structure is changing ("how it works today", "what would change"). No summary is
// written until the owner has approved the redone gold examples. Set ANALYSIS_PAUSED=0 (or change this default) to resume.
// 17 Nov, later: the owner approved the redone gold examples and the first five explainers, so writing resumes.
// What is written stays hidden from readers (PUBLIC_MIN_PROMPT is null) and the cap stays at 5 until the owner says otherwise.
export function analysisPaused(): boolean { return process.env.ANALYSIS_PAUSED?.trim() === "1"; }
/** Texas summaries still use the old template, so they stay paused unless TEXAS_SUMMARIES_PAUSED=0. */
export function texasSummariesPaused(): boolean { return process.env.TEXAS_SUMMARIES_PAUSED?.trim() !== "0"; }

/** The gate's generator number; null while the gate is closed or its value cannot be read (closed is the safe side). */
const MIN_GENERATOR = generatorNumber(PUBLIC_MIN_PROMPT);

// The list of summaries hidden after a reading against their sources, and why: lib/analysis/reader-holds.ts.
const HELD_IDS = heldBillIds();
const READ_IDS = readAndSoundIds(), readList = READ_IDS.map(id => `'${id}'`).join(", ");
const heldList = HELD_IDS.map(id => `'${id}'`).join(", ");

export function readerVisible(): SQL {
  if (MIN_GENERATOR === null) return sql`0 = 1`;
  return and(eq(analysisBillSummaries.status, "visible"), sql`cast(substr(${analysisBillSummaries.promptVersion}, 2) as integer) >= ${MIN_GENERATOR}`,
    ...(HELD_IDS.length ? [notInArray(analysisBillSummaries.billId, HELD_IDS)] : []),
    // Owner, 20 Nov 2026: nothing unread is shown. A summary by generator b12 or later needs its reading (lib/analysis/reader-read.ts).
    sql.raw(`(cast(substr(analysis_bill_summaries.prompt_version, 2) as integer) < ${READ_FROM_GENERATOR}${READ_IDS.length ? ` or analysis_bill_summaries.bill_id in (${readList})` : ""})`))!;
}

/** The same gate for raw subqueries that alias analysis_bill_summaries as "s". */
export const READER_S = MIN_GENERATOR === null ? sql.raw("0 = 1")
  : sql.raw(`s.status = 'visible' and ${generatorNumberSql("s.prompt_version")} >= ${MIN_GENERATOR}${HELD_IDS.length ? ` and s.bill_id not in (${heldList})` : ""} and (${generatorNumberSql("s.prompt_version")} < ${READ_FROM_GENERATOR}${READ_IDS.length ? ` or s.bill_id in (${readList})` : ""})`);

/** Whether a stored summary is one readers can see, for code that already holds the row (the counts in the health probe). Same rule as readerVisible(). */
export function onShowToReaders(s: { billId: string; status: string; promptVersion: string }): boolean {
  const n = generatorNumber(s.promptVersion);
  return MIN_GENERATOR !== null && s.status === "visible" && n !== null && n >= MIN_GENERATOR && !HELD_IDS.includes(s.billId) && (n < READ_FROM_GENERATOR || READ_IDS.includes(s.billId));
}
