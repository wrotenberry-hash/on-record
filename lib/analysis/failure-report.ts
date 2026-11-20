import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { READER_HOLDS } from "./reader-holds.ts";
import { onShowToReaders } from "./publish-gate";

/**
 * Why a written summary is not on show (owner, 20 Nov 2026: "tell me why 32 of this month's 50 summaries were not
 * approved: the top failure reasons with counts, and one real example of each"). For each summary readers cannot see:
 * the bill, how it was stopped, and the reasons recorded at its last attempt, in the checks' own words. Reads only;
 * it makes no model call and changes nothing. The reasons are about wording, never about a person.
 */
export async function summaryFailures() {
  const db = getDb();
  const rows = await db.all<{ id: string; billId: string; billType: string; number: number; status: string; promptVersion: string; attempts: number; queue: string | null; queueStatus: string | null;
    failures: string | null; warnings: string | null; readerPassed: number | null; readerReasons: string | null; readerTests: number }>(sql`
    select s.id as id, s.bill_id as billId, b.bill_type as billType, b.number as number, s.status as status, s.prompt_version as promptVersion, s.attempts as attempts,
      (select q.reason from analysis_review_queue q where q.summary_id = s.id) as queue, (select q.status from analysis_review_queue q where q.summary_id = s.id) as queueStatus,
      (select c.failures from analysis_checks c where c.summary_id = s.id order by c.attempt desc, c.created_at desc limit 1) as failures,
      (select c.warnings from analysis_checks c where c.summary_id = s.id order by c.attempt desc, c.created_at desc limit 1) as warnings,
      (select t.passed from analysis_reader_tests t where t.summary_id = s.id order by t.at desc limit 1) as readerPassed,
      (select t.reasons from analysis_reader_tests t where t.summary_id = s.id order by t.at desc limit 1) as readerReasons,
      (select count(*) from analysis_reader_tests t where t.summary_id = s.id) as readerTests
    from analysis_bill_summaries s join official_bills b on b.id = s.bill_id order by s.sequence`);
  const list = (v: string | null): string[] => { try { const a = JSON.parse(v ?? "[]"); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
  const out = rows.map(r => {
    const hidden = READER_HOLDS[r.billId] ?? null, onShow = onShowToReaders(r);
    // Passed every automatic check but not yet read against its sources: hidden until it is (lib/analysis/reader-read.ts).
    const awaitingReading = !onShow && !hidden && r.status === "visible";
    return { bill: `${r.billType}-${r.number}`, onShow, status: r.status, queue: r.queue, queueStatus: r.queueStatus, attempts: Number(r.attempts), generator: r.promptVersion.split("-")[0],
      hiddenAfterReading: hidden, awaitingReading, ruleFailures: list(r.failures).map(x => x.slice(0, 400)), readerTest: r.readerPassed === null ? "not run" : Number(r.readerPassed) ? "pass" : "fail",
      readerReasons: Number(r.readerPassed) ? [] : list(r.readerReasons).map(x => x.slice(0, 400)), readerTests: Number(r.readerTests) };
  });
  // Two tiers (20 Nov 2026): for a summary by the current writer, the extended sections that did not pass and are left out.
  const { getCursor } = await import("@/lib/federal/ingest"), { readSectionState, sectionsKey } = await import("./tiers.ts");
  const withheld = new Map<string, string[]>();
  for (const r of rows) withheld.set(`${r.billType}-${r.number}`, readSectionState(await getCursor(db, sectionsKey(r.id)).catch(() => null), r.promptVersion).withheld);
  const notOnShow = out.filter(x => !x.onShow).map(x => ({ ...x, withheldSections: withheld.get(x.bill) ?? [] }));
  return { written: out.length, onShow: out.filter(x => x.onShow).length, notOnShow, withheldOnShow: out.filter(x => x.onShow && (withheld.get(x.bill) ?? []).length).map(x => ({ bill: x.bill, withheldSections: withheld.get(x.bill) })) };
}
