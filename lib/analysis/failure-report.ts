import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { READER_HOLDS } from "./reader-holds.ts";
import { generatorNumber } from "./prompt-order";
import { PUBLIC_MIN_PROMPT } from "./publish-gate";

/**
 * Why a written summary is not on show (owner, 20 Nov 2026: "tell me why 32 of this month's 50 summaries were not
 * approved: the top failure reasons with counts, and one real example of each"). For each summary readers cannot see:
 * the bill, how it was stopped, and the reasons recorded at its last attempt, in the checks' own words. Reads only;
 * it makes no model call and changes nothing. The reasons are about wording, never about a person.
 */
export async function summaryFailures() {
  const db = getDb(), gate = generatorNumber(PUBLIC_MIN_PROMPT);
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
    const n = generatorNumber(r.promptVersion), hidden = READER_HOLDS[r.billId] ?? null;
    const onShow = gate !== null && r.status === "visible" && n !== null && n >= gate && !hidden;
    return { bill: `${r.billType}-${r.number}`, onShow, status: r.status, queue: r.queue, queueStatus: r.queueStatus, attempts: Number(r.attempts), generator: r.promptVersion.split("-")[0],
      hiddenAfterReading: hidden, ruleFailures: list(r.failures).map(x => x.slice(0, 400)), readerTest: r.readerPassed === null ? "not run" : Number(r.readerPassed) ? "pass" : "fail",
      readerReasons: Number(r.readerPassed) ? [] : list(r.readerReasons).map(x => x.slice(0, 400)), readerTests: Number(r.readerTests) };
  });
  return { written: out.length, onShow: out.filter(x => x.onShow).length, notOnShow: out.filter(x => !x.onShow) };
}
