import { desc, eq, isNotNull, and } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisBillSummaries, officialBills, officialRollCalls } from "@/db/schema";
import { getCursor, setCursor } from "@/lib/federal/ingest";
import { readerVisible } from "@/lib/analysis/publish-gate";
import { voteKind } from "@/lib/federal/vote-kinds";
import { billLabel } from "@/components/federal/badges";
import { buildBriefing, failedResult, latestBriefing, passedResult, type Briefing, type BriefItem } from "@/lib/briefing";
import { candidates, inlineBriefing } from "@/lib/briefing-items";
import { itemText, CAUGHT_UP } from "@/lib/briefing-inline";

/**
 * Writes briefing items in the new inline format to the function's own log, so that real items can be read before the
 * format goes to trial readers (owner, 20 Nov 2026: "Show me three real briefing items in the new format before it
 * goes live"). Three sets: the saved briefing, the briefing as it would be drawn now, and the newest decided votes on
 * bills that have an approved summary (so there are real examples even on a quiet day).
 *
 * It answers with counts and bill numbers only: the site is private, so the text goes to the log, which only the
 * owner's host account can read. It makes no model call and changes nothing. Paced: one run every 10 minutes.
 * `?state=TX` adds that state's two senators as a sample reader's legislators (no reader's own place is used).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const EVERY_MS = 10 * 60 * 1000, CURSOR = "briefing:preview", EXAMPLES = 15;

export async function GET(request: Request) {
  const db = getDb(), now = Date.now(), last = Number(await getCursor(db, CURSOR)) || 0;
  if (now - last < EVERY_MS) return Response.json({ service: "on-record", ran: false, nextAfter: new Date(last + EVERY_MS).toISOString() }, { headers: { "Cache-Control": "no-store" } });
  await setCursor(db, CURSOR, String(now));
  const state = (new URL(request.url).searchParams.get("state") ?? "").toUpperCase(), place = /^[A-Z]{2}$/.test(state) ? { state, congressional: null, stateUpper: null, stateLower: null } : null;
  const stored = await latestBriefing(null).catch(() => null);
  const live = await buildBriefing(now).catch(() => null);
  // Real examples: the newest decided votes on bills that have an approved summary, sorted as the briefing sorts them.
  const voted = await db.select({ billId: officialRollCalls.billId, rollId: officialRollCalls.id, chamber: officialRollCalls.chamber, votedAt: officialRollCalls.votedAt, yea: officialRollCalls.yea, nay: officialRollCalls.nay,
    result: officialRollCalls.result, question: officialRollCalls.question, voteTitle: officialRollCalls.title, billType: officialBills.billType, number: officialBills.number, title: officialBills.title })
    .from(officialRollCalls).innerJoin(officialBills, eq(officialBills.id, officialRollCalls.billId)).innerJoin(analysisBillSummaries, eq(analysisBillSummaries.billId, officialRollCalls.billId))
    .where(and(isNotNull(officialRollCalls.billId), readerVisible())).orderBy(desc(officialRollCalls.votedAt)).limit(200);
  const seen = new Set<string>(), passed: BriefItem[] = [], failed: BriefItem[] = [];
  for (const r of voted) {
    if (!r.billId || seen.has(r.billId) || voteKind(r.question, r.voteTitle ?? r.title) !== "passage") continue;
    const to = passedResult(r.result) ? passed : failedResult(r.result) ? failed : null;
    if (!to) continue;
    seen.add(r.billId);
    to.push({ label: billLabel(r.billType, r.number), title: r.title, href: `/bills/${r.billId}`, date: new Date(r.votedAt).toISOString().slice(0, 10),
      note: `${r.chamber === "senate" ? "Senate" : "House"}, ${r.yea}–${r.nay}. ${r.question}`, billId: r.billId, voteId: r.rollId, chamber: r.chamber === "senate" ? "senate" : "house" });
    if (seen.size >= EXAMPLES) break;
  }
  const examples: Briefing = { kind: "daily", periodLabel: "examples", congress: { name: "Congress", inSession: true, passed, failed, blocked: [], coming: [] }, texas: null, generatedAt: new Date(now).toISOString() };
  let lines = 0;
  const log = (line: string) => { console.log(line.slice(0, 3800)); lines++; };
  const out: Record<string, Array<{ item: string; state: string }>> = {};
  for (const [name, b, max] of [["stored", (stored?.content as Briefing | undefined) ?? null, 5], ["live", live, 5], ["examples", examples, EXAMPLES]] as Array<[string, Briefing | null, number]>) {
    if (!b) continue;
    const events = new Map(candidates(b).map(c => [c.key, `${c.event} ${c.date} | ${c.note}`]));
    const items = await inlineBriefing(b, null, "editor", { max, place }).catch(() => []);
    out[name] = items.map(i => ({ item: i.label, state: i.state }));
    log(`BRIEF_PREVIEW ${name} | ${b.kind} ${b.periodLabel} | ${items.length} items`);
    items.forEach((i, n) => log(`BRIEF_PREVIEW ${name} | item ${n + 1} | ${i.state}${i.reasons.length ? ` (${i.reasons.join(" ")})` : ""} | record: ${events.get(i.key) ?? "?"} | ${JSON.stringify(itemText(i))}`));
    log(`BRIEF_PREVIEW ${name} | end | ${CAUGHT_UP}`);
  }
  return Response.json({ service: "on-record", ran: true, sets: out, lines }, { headers: { "Cache-Control": "no-store" } });
}
