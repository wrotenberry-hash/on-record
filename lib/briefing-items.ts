import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisBillSummaries, officialMemberVotes } from "@/db/schema";
import { readerVisible } from "@/lib/analysis/publish-gate";
import { summaryForBill } from "@/lib/analysis/queries";
import { billWindow } from "@/lib/changes/window-store";
import { ownLegislators, placeOf, type Place } from "@/lib/loop/people";
import { memberLines, type MemberVote } from "@/lib/loop/rules";
import { inlineTestFor } from "@/lib/briefing-test";
import { reachOf } from "@/lib/briefing-reach";
import { rowSummaries } from "@/lib/bill-row-store";
import type { RowSummary } from "@/lib/bill-row";
import { summaryScope } from "@/lib/summary-scope";
import { inlineFromSummary, inlineProblems, pickItems, standsLine, MAX_ITEMS, NO_SUMMARY_YET, SHORT_NOT_READY, SUMMARY_COMING, type BriefEvent, type BriefPick, type InlineItem } from "@/lib/briefing-inline";
import type { Briefing, BriefItem, BriefSection } from "@/lib/briefing";

/**
 * The five items of a briefing, with their inline text, for one reader (owner, 20 Nov 2026). The text is read from the
 * approved summary each time the page is drawn, through the same gate as every other reader page, so a summary taken
 * off show never lingers in an old briefing. Nothing is written here and no model is called.
 */
export type ItemState = "inline" | "no_summary" | "older_format" | "rule" | "untested" | "failed";
export type ComposedItem = InlineItem & { state: ItemState; reasons: string[] };

const billKeyOf = (i: BriefItem) => i.billId ?? (/^\/bills\/([0-9]+-[a-z]+-[0-9]+)/.exec(i.href)?.[1] ?? (/^\/texas\/bills\/([^#?]+)/.exec(i.href)?.[1] ? decodeURIComponent(/^\/texas\/bills\/([^#?]+)/.exec(i.href)![1]) : null));

/** Every candidate in a stored or live briefing, decided things first. Old stored briefings carry no vote ids; those items simply show no legislators. */
export function candidates(b: Briefing): BriefPick[] {
  const out: BriefPick[] = [];
  const add = (s: BriefSection | null, system: "federal" | "texas") => {
    if (!s) return;
    for (const [event, list] of [["passed", s.passed], ["failed", s.failed], ["blocked", s.blocked], ["coming", s.coming]] as Array<[BriefEvent, BriefItem[]]>)
      for (const i of list) out.push({ key: `${system}:${event}:${i.href}:${i.date}`, system, billKey: billKeyOf(i), label: i.label, title: i.title, href: i.href.replace(/#.*$/, ""), date: i.date,
        event: system === "texas" && event === "coming" ? "hearing" : event, note: i.note, voteId: i.voteId ?? null, chamber: i.chamber ?? null });
  };
  add(b.congress, "federal"); add(b.texas, "texas");
  return out;
}

/**
 * `audience` "reader": an item's two lines are shown only when the summary is approved, the written rules pass and the
 * reader test has passed. "editor": the lines are shown whatever the test says, with the state and reasons beside
 * them, so the editor sees exactly what readers would and would not get.
 */
export async function inlineBriefing(b: Briefing, userId: string | null, audience: "reader" | "editor" = "reader",
  o: { /** More than five only for the editor's log of examples; a reader's briefing is always at most five. */ max?: number; /** A sample place, for the same log. */ place?: Place | null } = {}): Promise<ComposedItem[]> {
  const db = getDb(), all = candidates(b);
  const fedKeys = [...new Set(all.filter(c => c.system === "federal" && c.billKey).map(c => c.billKey!))];
  const approved = new Set(fedKeys.length ? (await db.select({ billId: analysisBillSummaries.billId }).from(analysisBillSummaries).where(and(readerVisible(), inArray(analysisBillSummaries.billId, fedKeys)))).map(r => r.billId) : []);
  const place = o.place ?? (userId ? await placeOf(db, userId).catch(() => null) : null);
  const mine = place ? (await ownLegislators(db, place).catch(() => [])).filter(m => m.level === "federal") : [];
  // Owner, 20 Nov 2026: items on which the reader's own legislators cast a vote come first, then by how many people the
  // bill affects (lib/briefing-reach.ts has the rule). Both are read here, before the five are chosen.
  const voteIds = [...new Set(all.flatMap(c => (c.system === "federal" && c.voteId ? [c.voteId] : [])))];
  const cast = new Set(voteIds.length && mine.length ? (await db.select({ voteId: officialMemberVotes.rollCallId, position: officialMemberVotes.position }).from(officialMemberVotes)
    .where(and(inArray(officialMemberVotes.rollCallId, voteIds), inArray(officialMemberVotes.politicianId, mine.map(m => m.id)))).catch(() => []))
    .filter(r => /^(?:yea|nay|aye|no|yes|present)$/i.test(r.position.trim())).map(r => r.voteId) : []);
  const words = await rowSummaries(fedKeys).catch(() => new Map<string, RowSummary>());
  const picks = pickItems(all, k => approved.has(k), audience === "editor" ? o.max ?? MAX_ITEMS : MAX_ITEMS,
    { ownVote: c => !!c.voteId && cast.has(c.voteId), reach: c => reachOf(c.billKey && approved.has(c.billKey) ? words.get(c.billKey) ?? null : null) });
  const out: ComposedItem[] = [];
  for (const p of picks) {
    const window = p.billKey ? await billWindow(p.billKey).catch(() => null) : null;
    const stands = standsLine(p, window ? window.where : null);
    let legislators: string[] = [];
    if (p.system === "federal" && p.voteId && p.chamber && mine.length) {
      const voters = mine.filter(m => m.chamber === p.chamber);
      if (voters.length) {
        const rows = await db.select({ memberId: officialMemberVotes.politicianId, position: officialMemberVotes.position }).from(officialMemberVotes)
          .where(and(eq(officialMemberVotes.rollCallId, p.voteId), inArray(officialMemberVotes.politicianId, voters.map(v => v.id)))).catch(() => []);
        const votes: MemberVote[] = rows.map(r => ({ voteId: p.voteId!, memberId: r.memberId, position: r.position, chamber: p.chamber!, date: p.date }));
        legislators = memberLines(voters, { voteId: p.voteId, chamber: p.chamber, date: p.date }, votes);
      }
    }
    const base = { key: p.key, label: p.label, href: p.href, stands, legislators };
    const plain = (state: ItemState, note: string | null, reasons: string[] = []): ComposedItem => ({ ...base, headline: p.title, today: null, thisBill: null, note, state, reasons });
    if (p.system !== "federal" || !p.billKey) { out.push(plain("no_summary", p.billKey ? NO_SUMMARY_YET : null)); continue; }
    const s = approved.has(p.billKey) ? await summaryForBill(p.billKey, false).catch(() => null) : null;
    // Owner, 20 Nov 2026: "Never show 'summary coming' for something that will not get one" (a debate rule, a purely ceremonial resolution).
    if (!s) { out.push(plain("no_summary", summaryScope({ billId: p.billKey, title: p.title }) === "summarised" ? SUMMARY_COMING : null)); continue; }
    const text = s.structure ? inlineFromSummary({ headline: s.summary.headline, changes: s.structure.changes, howItWorksToday: s.structure.howItWorksToday }) : null;
    // An approved summary in the older format has a plain-English headline and no "today / if this passes" rows.
    if (!text) { out.push({ ...plain("older_format", SHORT_NOT_READY), headline: s.summary.headline }); continue; }
    const rules = inlineProblems(text), test = rules.length ? null : await inlineTestFor(s.summary.id, text).catch(() => null);
    const state: ItemState = rules.length ? "rule" : !test ? "untested" : test.passed ? "inline" : "failed";
    const reasons = rules.length ? rules : test && !test.passed ? test.reasons : [];
    const show = state === "inline" || audience === "editor";
    out.push({ ...base, headline: text.headline, today: show ? text.today : null, thisBill: show ? text.thisBill : null, note: show ? null : SHORT_NOT_READY, state, reasons });
  }
  return out;
}
