import { and, desc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisBillSummaries, analysisSummaryDetails } from "@/db/schema";
import { readerVisible } from "@/lib/analysis/publish-gate";
import { billRowText, numberFromBillId, typeFromBillId, type BillRowText, type RowSummary } from "@/lib/bill-row";

/**
 * What a vote row may say about a bill (lib/bill-row.ts): the newest summary a reader may see, for each bill asked
 * about. One read for the whole list. Nothing is written and no model is called: this only reads approved words.
 */
export type VisibleSummary = RowSummary & { question: string | null };

/** The newest reader-visible summary for each bill. Empty while the gate is shut. Texas ids never match (its summaries are not on show). */
export async function rowSummaries(billIds: ReadonlyArray<string | null | undefined>): Promise<Map<string, VisibleSummary>> {
  const out = new Map<string, VisibleSummary>(), ids = [...new Set(billIds.filter((x): x is string => !!x))];
  if (!ids.length) return out;
  const db = getDb();
  const rows = await db.select({ id: analysisBillSummaries.id, billId: analysisBillSummaries.billId, headline: analysisBillSummaries.headline, whatItDoes: analysisBillSummaries.whatItDoes,
    promptVersion: analysisBillSummaries.promptVersion }).from(analysisBillSummaries).where(and(inArray(analysisBillSummaries.billId, ids), readerVisible())).orderBy(desc(analysisBillSummaries.createdAt));
  if (!rows.length) return out;
  const details = await db.select({ summaryId: analysisSummaryDetails.summaryId, question: analysisSummaryDetails.question, plainEnglish: analysisSummaryDetails.plainEnglish,
    promptVersion: analysisSummaryDetails.promptVersion }).from(analysisSummaryDetails).where(inArray(analysisSummaryDetails.summaryId, rows.map(r => r.id)));
  for (const r of rows) {
    if (out.has(r.billId)) continue;
    // Details written for an earlier wording of the summary are not that summary's words: they are left out.
    const d = details.find(x => x.summaryId === r.id && x.promptVersion === r.promptVersion);
    out.set(r.billId, { headline: r.headline, whatItDoes: r.whatItDoes, plainEnglish: d?.plainEnglish ?? null, question: d?.question ?? null });
  }
  return out;
}

/** A row for each federal bill in a list of votes, keyed by bill id. A read that fails leaves every row on its official title. */
export async function billRowsFor(bills: ReadonlyArray<{ billId: string | null | undefined; title: string | null | undefined; number?: string | null }>): Promise<Map<string, BillRowText>> {
  const summaries = await rowSummaries(bills.map(b => b.billId)).catch(() => new Map<string, VisibleSummary>());
  const out = new Map<string, BillRowText>();
  for (const b of bills) if (b.billId && !out.has(b.billId)) out.set(b.billId, billRowText({ number: b.number ?? numberFromBillId(b.billId) ?? b.billId, title: b.title, summary: summaries.get(b.billId), billType: typeFromBillId(b.billId) ?? undefined }));
  return out;
}
