import { desc, eq, isNotNull, and } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisBillSummaries, officialBills, officialRollCalls } from "@/db/schema";
import { getCursor, setCursor } from "@/lib/federal/ingest";
import { readerVisible } from "@/lib/analysis/publish-gate";
import { billLabel } from "@/components/federal/badges";
import { buildBriefing, latestBriefing, type Briefing } from "@/lib/briefing";
import { inlineBriefing } from "@/lib/briefing-items";
import { itemText, CAUGHT_UP } from "@/lib/briefing-inline";

/**
 * Writes briefing items in the new inline format to the function's own log, so that real items can be read before the
 * format goes to trial readers (owner, 20 Nov 2026: "Show me three real briefing items in the new format before it
 * goes live"). Two sets: the current briefing as it would be drawn, and the newest voted bills that have an approved
 * summary (so there are real examples even on a quiet day).
 *
 * It answers with counts and bill numbers only: the site is private, so the text goes to the log, which only the
 * owner's host account can read. It makes no model call and changes nothing. Paced: one run every 10 minutes.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const EVERY_MS = 10 * 60 * 1000, CURSOR = "briefing:preview";

export async function GET() {
  const db = getDb(), now = Date.now(), last = Number(await getCursor(db, CURSOR)) || 0;
  if (now - last < EVERY_MS) return Response.json({ service: "on-record", ran: false, nextAfter: new Date(last + EVERY_MS).toISOString() }, { headers: { "Cache-Control": "no-store" } });
  await setCursor(db, CURSOR, String(now));
  const stored = await latestBriefing(null).catch(() => null);
  const current: Briefing = (stored?.content as Briefing | undefined) ?? await buildBriefing(now);
  const live = await buildBriefing(now).catch(() => null);
  // Real examples: the newest recorded votes on bills that have an approved summary, as "passed" or "failed" items.
  const voted = await db.select({ billId: officialRollCalls.billId, rollId: officialRollCalls.id, chamber: officialRollCalls.chamber, votedAt: officialRollCalls.votedAt, yea: officialRollCalls.yea, nay: officialRollCalls.nay,
    result: officialRollCalls.result, question: officialRollCalls.question, billType: officialBills.billType, number: officialBills.number, title: officialBills.title })
    .from(officialRollCalls).innerJoin(officialBills, eq(officialBills.id, officialRollCalls.billId)).innerJoin(analysisBillSummaries, eq(analysisBillSummaries.billId, officialRollCalls.billId))
    .where(and(isNotNull(officialRollCalls.billId), readerVisible())).orderBy(desc(officialRollCalls.votedAt)).limit(60);
  const seen = new Set<string>(), passed = [] as Briefing["congress"]["passed"];
  for (const r of voted) {
    if (!r.billId || seen.has(r.billId) || !/passage|pass the bill|suspend the rules and pass/i.test(r.question)) continue;
    seen.add(r.billId);
    passed.push({ label: billLabel(r.billType, r.number), title: r.title, href: `/bills/${r.billId}`, date: new Date(r.votedAt).toISOString().slice(0, 10),
      note: `${r.chamber === "senate" ? "Senate" : "House"}, ${r.yea}–${r.nay}. ${r.question}`, billId: r.billId, voteId: r.rollId, chamber: r.chamber === "senate" ? "senate" : "house" });
    if (passed.length >= 5) break;
  }
  const examples: Briefing = { kind: "daily", periodLabel: "examples", congress: { name: "Congress", inSession: true, passed, failed: [], blocked: [], coming: [] }, texas: null, generatedAt: new Date(now).toISOString() };
  let lines = 0;
  const log = (line: string) => { console.log(line.slice(0, 3800)); lines++; };
  const out: Record<string, Array<{ item: string; state: string }>> = {};
  for (const [name, b] of [["stored", current], ["live", live], ["examples", examples]] as Array<[string, Briefing | null]>) {
    if (!b) continue;
    const items = await inlineBriefing(b, null, "editor").catch(() => []);
    out[name] = items.map(i => ({ item: i.label, state: i.state }));
    log(`BRIEF_PREVIEW ${name} | ${b.kind} ${b.periodLabel} | ${items.length} items`);
    items.forEach((i, n) => log(`BRIEF_PREVIEW ${name} | item ${n + 1} | ${i.state}${i.reasons.length ? ` (${i.reasons.join(" ")})` : ""} | ${JSON.stringify(itemText(i))}`));
    log(`BRIEF_PREVIEW ${name} | end | ${CAUGHT_UP}`);
  }
  return Response.json({ service: "on-record", ran: true, sets: out, lines }, { headers: { "Cache-Control": "no-store" } });
}
