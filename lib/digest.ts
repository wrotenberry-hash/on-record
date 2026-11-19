import { and, desc, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisBillSummaries, digestSends, readerAccounts } from "@/db/schema";
import { readerVisible } from "@/lib/analysis/publish-gate";
import { sendTo } from "@/lib/mailer";
import { unsubscribeToken } from "@/lib/accounts";
import { countEvent } from "@/lib/events";
import { runWeekly } from "@/lib/loop/weekly";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";

/** The newest summary headline a reader may see for each bill (the same gate as the bill page). Empty while the gate is shut. */
async function visibleHeadlines(billIds: string[]) {
  const out = new Map<string, string>();
  if (!billIds.length) return out;
  const rows = await getDb().select({ billId: analysisBillSummaries.billId, headline: analysisBillSummaries.headline }).from(analysisBillSummaries)
    .where(and(inArray(analysisBillSummaries.billId, billIds), readerVisible())).orderBy(desc(analysisBillSummaries.createdAt));
  for (const r of rows) if (!out.has(r.billId)) out.set(r.billId, r.headline);
  return out;
}

/**
 * Monday's email (owner's point 3, 18 Nov 2026): one per reader per week. What goes in it and the once-a-week rule
 * are lib/loop/weekly.ts; the words and the order are lib/digest-format.ts. This file only hands over the things
 * that need the running site: the database, the mailer, the secret for the open mark and the unsubscribe link.
 */
export async function runDigests(now = Date.now()) {
  const out = await runWeekly(getDb(), now, { site: SITE_URL, secret: process.env.EDITOR_ACCESS_KEY?.trim() || "", send: sendTo, headlines: visibleHeadlines,
    unsubscribe: async accountId => `${SITE_URL}/account/unsubscribe?t=${encodeURIComponent(await unsubscribeToken(accountId))}` });
  if (out.sent) await countEvent("digest_sent", "", { skipBotCheck: true }).catch(() => undefined);
  return out;
}

export async function digestCounts() {
  const row = await getDb().select({ sent: sql<number>`sum(case when ok = 1 then 1 else 0 end)`, failed: sql<number>`sum(case when ok = 0 then 1 else 0 end)` }).from(digestSends).get();
  const accounts = await getDb().select({ n: sql<number>`count(*)`, optIn: sql<number>`sum(digest_opt_in)` }).from(readerAccounts).where(isNotNull(readerAccounts.verifiedAt)).get();
  return { readerAccounts: Number(accounts?.n ?? 0), digestOptIn: Number(accounts?.optIn ?? 0), digestsSent: Number(row?.sent ?? 0), digestsFailed: Number(row?.failed ?? 0) };
}
