import { inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBills } from "@/db/schema";
import { READER_S } from "@/lib/analysis/publish-gate";
import { recordFor, type ReaderRecord, type RecordBill, type RecordPlace } from "@/lib/record/store";

/**
 * "Your record" (the page at /voice, owner's point 5, 18 Nov 2026): the reader's own answers beside what happened to
 * each bill, how their legislators voted on it and their district's counted total; then one plain count per legislator.
 * OPINION content, read only for that reader. The database functions are lib/record/store.ts (tested against a
 * temporary database); the wording and counting rules are lib/voice-rules.ts and lib/agreement.ts.
 *
 * This file only adds what needs the running site: the plain headline of a federal bill, and only when its summary is
 * on show to readers (lib/analysis/publish-gate.ts). Texas summaries are not on show to readers, so a Texas bill is
 * listed under its official caption.
 */
export type RecordBillView = RecordBill & { headline: string | null };
export type ReaderRecordView = Omit<ReaderRecord, "bills"> & { bills: RecordBillView[] };

export async function readerRecord(userId: string | null, input: { place: RecordPlace | null; verificationEnabled: boolean }): Promise<ReaderRecordView> {
  const db = getDb(), record = await recordFor(db, userId, { place: input.place, verificationOn: input.verificationEnabled });
  const fedIds = record.bills.filter(b => b.level === "federal").map(b => b.billKey);
  const headlines = fedIds.length ? await db.select({ id: officialBills.id,
    headline: sql<string | null>`(select s.headline from analysis_bill_summaries s where s.bill_id = ${officialBills.id} and ${READER_S} order by s.created_at desc limit 1)` })
    .from(officialBills).where(inArray(officialBills.id, fedIds)).catch(() => []) : [];
  const byId = new Map(headlines.map(h => [h.id, h.headline]));
  return { ...record, bills: record.bills.map(b => ({ ...b, headline: byId.get(b.billKey) ?? null })) };
}
