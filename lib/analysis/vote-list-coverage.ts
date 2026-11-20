import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { onShowToReaders } from "./publish-gate";
import { meaningfulVote, RECENT_VOTE_MS } from "@/lib/flow/votes";
import { summaryScope } from "@/lib/summary-scope";
import { isDebateRule } from "@/lib/procedural";

/**
 * Summary coverage of the vote lists (owner, 20 Nov 2026: "of the bills that appear in any legislator's recent vote
 * list, how many have an approved summary and how many don't … in priority order: bills with a recorded vote in the
 * last 90 days first"). Counts only; nothing is written and no model is called.
 *
 * A legislator's vote lists reach back 12 months (lib/flow/votes.ts RECENT_VOTE_MS), so "appears in a recent vote list"
 * is every bill with a recorded roll-call vote in the last 12 months. Each bill falls in one group, by its newest
 * vote: the last 90 days first, then 91 days to 12 months. "Approved" is a summary readers can see today: visible,
 * written by a generator at or after the public gate, and not hidden after a reading against its sources.
 */
type Group = { bills: number; approved: number; notApproved: number;
  /** Of the not approved: written before but not on show (held by the rules or the reader test, or hidden after a reading). */ writtenNotOnShow: number;
  /** Of the not approved: no summary was ever written. */ neverWritten: number;
  /** Of the never written: the bill's own record is not fully loaded yet, so it cannot be written until it is. */ recordNotLoaded: number;
  /** Bills whose vote counts on a legislator's card (a vote on the bill itself, not a procedural step). */ onCards: number; onCardsApproved: number };
const empty = (): Group => ({ bills: 0, approved: 0, notApproved: 0, writtenNotOnShow: 0, neverWritten: 0, recordNotLoaded: 0, onCards: 0, onCardsApproved: 0 });

export async function voteListCoverage(now = Date.now()) {
  const db = getDb(), since = now - RECENT_VOTE_MS, d90 = now - 90 * 86_400_000;
  const [rolls, summaries, tx] = await Promise.all([
    db.all<{ billId: string; votedAt: number; question: string; result: string | null; title: string | null; billTitle: string | null; billType: string | null; complete: number | null }>(sql`
      select r.bill_id as billId, r.voted_at as votedAt, r.question as question, r.result as result, r.title as title, b.title as billTitle, b.bill_type as billType, (b.detail_status = 'complete') as complete
      from official_roll_calls r left join official_bills b on b.id = r.bill_id where r.bill_id is not null and r.voted_at >= ${since}`),
    db.all<{ billId: string; status: string; promptVersion: string }>(sql`select bill_id as billId, status as status, prompt_version as promptVersion from analysis_bill_summaries`),
    db.get<{ n: number }>(sql`select count(distinct v.bill_id) as n from tx_votes v where v.date >= ${new Date(since).toISOString().slice(0, 10)}`).catch(() => null),
  ]);
  const approved = new Set<string>(), written = new Set<string>();
  for (const s of summaries) { written.add(s.billId); if (onShowToReaders(s)) approved.add(s.billId); }
  type Bill = { last: number; type: string | null; complete: boolean; onCards: boolean; rule: boolean; scope: ReturnType<typeof summaryScope>; lawmaking: boolean; title: string };
  const bills = new Map<string, Bill>();
  for (const r of rolls) {
    const type = r.billType ?? r.billId.match(/^\d+-([a-z]+)-\d+$/)?.[1] ?? null;
    const b = bills.get(r.billId) ?? { last: 0, type, complete: !!Number(r.complete), onCards: false, rule: isDebateRule({ billId: r.billId, billType: type, title: r.billTitle ?? r.title }),
      scope: summaryScope({ billId: r.billId, billType: type, title: r.billTitle ?? r.title }), title: String(r.billTitle ?? r.title ?? "").slice(0, 110), lawmaking: ["hr", "s", "hjres", "sjres"].includes(String(type)) };
    b.last = Math.max(b.last, Number(r.votedAt));
    if (r.billTitle !== null && meaningfulVote({ question: r.question, result: r.result, title: r.title, billTitle: r.billTitle, hasBill: true })) b.onCards = true;
    bills.set(r.billId, b);
  }
  const last90 = empty(), older = empty(), resolutions = { bills: 0, last90: 0, /** Resolutions that only set debate rules: collapsed into "Procedural votes (N)" in every list. */ debateRules: 0,
    /** Ceremonial, a statement of position only, or a step in another bill's passage: no summary, none promised. */ ceremonial: 0,
    /** Resolutions that do something themselves (owner, 20 Nov 2026): summarised like a bill. */ doSomething: 0, doSomethingLast90: 0, doSomethingApproved: 0, doSomethingWritten: 0, doSomethingRecordNotLoaded: 0,
    /** Which they are, and which were set aside as ceremonial, so the sorting can be read (official titles, cut short). */ doSomethingList: [] as string[], ceremonialList: [] as string[] };
  for (const [id, b] of bills) {
    if (!b.lawmaking) {
      resolutions.bills++; if (b.last >= d90) resolutions.last90++;
      if (b.scope === "debate_rule") resolutions.debateRules++; else if (b.scope !== "summarised") { resolutions.ceremonial++; resolutions.ceremonialList.push(`${id} [${b.scope}]: ${b.title}`); }
      else { resolutions.doSomething++; resolutions.doSomethingList.push(`${id}${b.last >= d90 ? " (90d)" : ""}: ${b.title}`); if (b.last >= d90) resolutions.doSomethingLast90++; if (approved.has(id)) resolutions.doSomethingApproved++; else if (written.has(id)) resolutions.doSomethingWritten++; if (!b.complete) resolutions.doSomethingRecordNotLoaded++; }
      continue;
    }
    const g = b.last >= d90 ? last90 : older, ok = approved.has(id);
    g.bills++;
    if (ok) g.approved++; else { g.notApproved++; if (written.has(id)) g.writtenNotOnShow++; else { g.neverWritten++; if (!b.complete) g.recordNotLoaded++; } }
    if (b.onCards) { g.onCards++; if (ok) g.onCardsApproved++; }
  }
  const all = { bills: last90.bills + older.bills, approved: last90.approved + older.approved, notApproved: last90.notApproved + older.notApproved };
  return { asOf: new Date(now).toISOString(), months: 12, federal: { ...all, last90Days: last90, days91To12Months: older },
    // Simple and concurrent resolutions in vote lists, by what they are (lib/summary-scope.ts).
    resolutions,
    // Texas summaries are not on show to readers (lib/analysis/publish-gate.ts), so every Texas bill in a vote list has none.
    texas: { billsWithARecordVote: Number(tx?.n ?? 0), approved: 0 } };
}
