import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { READER_S, readerVisible } from "@/lib/analysis/publish-gate";
import { adjudications, analysisBillSummaries, officialBillIndex, officialBills, officialMemberVotes, officialPoliticians, officialRollCalls, people, publications,
  representations, sourceCaptures, sourceCommunications, txBills } from "@/db/schema";
import { voteLine, type Card, type CardVote } from "@/lib/card-content";
import { KIND_LABEL, positionLine, voteKind } from "@/lib/federal/vote-kinds";
import { billLabel, memberLine } from "@/components/federal/badges";
import { partyCode } from "@/lib/federal/bill-depth";
import { withPartyMajority } from "@/lib/federal/member-stats-rules";
import { scopeForMember } from "@/lib/constituent/rules";
import { isQuietKill, saidAboutBill, saidVsDid } from "@/lib/said-did-rules";
import type { Slide } from "@/components/cards/card-image";
import { congressDashboard } from "@/lib/federal/dashboard";
import { changeCardFor, rollCardFor, totalCardFor } from "@/lib/entry/cards";
import type { HeadlineLoader } from "@/lib/entry/store";
import { BRAND } from "@/lib/brand";

/**
 * Round G card builders, brought to ONE SOURCED FACT PER CARD on 18 Nov 2026 (owner's point 10). Every card is built
 * only from record data and approved (visible) summaries; nothing a reader typed ever appears on an image. Each
 * returns null when the data does not support the card (for example, district totals under 25), so a card is never
 * shown with thin or missing evidence. The three kinds the owner named (a vote, a bill change, a district total) are
 * read in lib/entry/cards.ts, which the tests run against a temporary database; this file adds the request-side
 * pieces (the summary gate, the database handle) and the older cards, each cut down to one fact.
 */
const date = (ms: number | string) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

/** The plain headline of each bill whose summary a reader may see (the publish gate decides; never a held summary). */
export const visibleHeadlines: HeadlineLoader = async billIds => {
  if (!billIds.length) return new Map();
  const rows = await getDb().select({ billId: analysisBillSummaries.billId, headline: analysisBillSummaries.headline }).from(analysisBillSummaries)
    .where(and(inArray(analysisBillSummaries.billId, billIds), readerVisible())).orderBy(desc(analysisBillSummaries.createdAt));
  const out = new Map<string, string>();
  for (const r of rows) if (!out.has(r.billId)) out.set(r.billId, r.headline);
  return out;
};

async function roll(id: string) {
  return getDb().select({ id: officialRollCalls.id, chamber: officialRollCalls.chamber, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question, title: officialRollCalls.title,
    result: officialRollCalls.result, yea: officialRollCalls.yea, nay: officialRollCalls.nay, sourceUrl: officialRollCalls.sourceUrl, billId: officialRollCalls.billId, billTitle: officialBills.title,
    billType: officialBills.billType, number: officialBills.number,
    headline: sql<string | null>`(select s.headline from analysis_bill_summaries s where s.bill_id = ${officialRollCalls.billId} and ${READER_S} order by s.created_at desc limit 1)` })
    .from(officialRollCalls).leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId)).where(eq(officialRollCalls.id, id)).get();
}
const cardVote = (r: NonNullable<Awaited<ReturnType<typeof roll>>>, voteText: string): CardVote => {
  const kind = voteKind(r.question, r.billTitle ?? r.title);
  return { billLabel: r.billType ? billLabel(r.billType, r.number!) : r.question, billTitle: r.billTitle ?? r.title ?? r.question, headline: r.headline, voteText, kind, kindLabel: KIND_LABEL[kind], votedAt: r.votedAt, sourceUrl: r.sourceUrl };
};

/** A VOTE: one roll call's result (the official wording and the count). */
export async function rollResultCard(rollId: string) { return rollCardFor(getDb(), rollId, { headlines: visibleHeadlines }); }

/** Quiet kill: a bill stopped by a procedural vote (cloture or a motion to proceed failed, or a motion to table or recommit carried). One fact: that roll call's result. */
export async function quietKillCard(rollId: string): Promise<Card | null> {
  const r = await roll(rollId);
  if (!r?.billId || voteKind(r.question, r.billTitle ?? r.title) !== "procedural") return null;
  if (!isQuietKill("procedural", r.question, r.result)) return null;
  return (await rollCardFor(getDb(), rollId, { headlines: visibleHeadlines, eyebrow: "STOPPED BY A PROCEDURAL VOTE" }))?.card ?? null;
}

/** A BILL CHANGE: one change between a bill's two latest text versions. */
export async function billChangeCard(billId: string, key: string) { return changeCardFor(getDb(), billId, key); }

/** A DISTRICT TOTAL: counted residents of one district (or state) on one bill, from 25 counted voters. */
export async function districtTotalCard(billId: string, scope: string) { return totalCardFor(getDb(), billId, scope); }
/** The district a member answers to: a senator's state, a representative's district. For older links that name the member. */
export async function scopeOfMember(memberId: string): Promise<string | null> {
  const m = await getDb().select().from(officialPoliticians).where(eq(officialPoliticians.id, memberId)).get();
  return m ? scopeForMember({ level: "federal", chamber: m.chamber === "senate" ? "upper" : "lower", state: m.state, district: m.district }) : null;
}

/**
 * Said vs. Did: a published, human-reviewed statement that names a bill and states a position, beside the speaker's passage vote.
 * The member page lists these. The share card that paired the two was taken off on 18 Nov 2026 (two facts on one card);
 * an old link to it now opens the vote alone (lib/share-resolve.ts).
 */
export async function saidVsDidPairs(limit = 20) {
  const db = getDb();
  const rows = await db.select({ publicationId: publications.id, representationId: representations.id, publishedAt: publications.publishedAt, text: representations.exactText, speaker: people.displayName, url: sourceCommunications.canonicalUrl })
    .from(publications).innerJoin(adjudications, eq(adjudications.id, publications.adjudicationId)).innerJoin(representations, eq(representations.id, adjudications.representationId))
    .innerJoin(sourceCaptures, eq(sourceCaptures.id, representations.captureId)).innerJoin(sourceCommunications, eq(sourceCommunications.id, sourceCaptures.communicationId))
    .innerJoin(people, eq(people.id, sourceCommunications.speakerId))
    // Only live publications: not a retraction notice, and not since retracted.
    .where(sql`${publications.retractionOfId} is null and not exists (select 1 from publications r where r.retraction_of_id = ${publications.id})`).orderBy(desc(publications.publishedAt)).limit(200);
  const out: Array<{ publicationId: string; representationId: string; speaker: string; memberId: string; said: string; billId: string; stance: string; position: string; rollId: string; result: "match" | "contradiction"; url: string | null; votedAt: number }> = [];
  for (const r of rows) {
    const s = saidAboutBill(r.text);
    if (!s) continue;
    const member = await db.select().from(officialPoliticians).where(sql`lower(${officialPoliticians.fullName}) = lower(${r.speaker})`).get();
    if (!member) continue;
    const bills = await db.select({ id: officialBills.id }).from(officialBills).where(and(eq(officialBills.billType, s.type), eq(officialBills.number, s.number))).orderBy(desc(officialBills.congress)).limit(1);
    if (!bills.length) continue;
    const votes = await db.select({ rollId: officialRollCalls.id, question: officialRollCalls.question, title: officialRollCalls.title, position: officialMemberVotes.position, votedAt: officialRollCalls.votedAt })
      .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId))
      .where(and(eq(officialMemberVotes.politicianId, member.id), eq(officialRollCalls.billId, bills[0].id)));
    const v = votes.find(x => voteKind(x.question, x.title) === "passage");
    const result = v ? saidVsDid(s.stance, v.position) : null;
    if (!v || !result) continue;
    out.push({ publicationId: r.publicationId, representationId: r.representationId, speaker: member.fullName, memberId: member.id, said: r.text, billId: bills[0].id, stance: s.stance, position: v.position, rollId: v.rollId, result, url: r.url, votedAt: v.votedAt });
    if (out.length >= limit) break;
  }
  return out;
}
/**
 * The 5-slide explainer for a bill with a visible (approved or unflagged) summary. One sourced fact per slide:
 * the plain headline, the first thing it does, the first group it affects, the latest recorded vote, and where it
 * stands. The case for and against is left to the bill page: an argument is a view, and a fair slide would need two.
 */
export async function carouselSlides(billId: string): Promise<Slide[] | null> {
  const db = getDb();
  const bill = await db.select().from(officialBills).where(eq(officialBills.id, billId)).get();
  const s = await db.select().from(analysisBillSummaries).where(and(eq(analysisBillSummaries.billId, billId), readerVisible())).orderBy(desc(analysisBillSummaries.createdAt)).limit(1).get();
  if (!bill || !s) return null;
  const idx = await db.select().from(officialBillIndex).where(eq(officialBillIndex.billId, billId)).get();
  const vote = await db.select().from(officialRollCalls).where(eq(officialRollCalls.billId, billId)).orderBy(desc(officialRollCalls.votedAt)).limit(1).get();
  const label = billLabel(bill.billType, bill.number), src = "congress.gov", d = date(s.createdAt), today = date(Date.now());
  const first = (x: unknown) => { const p = ((x as Array<{ text: string; section: string }>) ?? [])[0]; return p ? [`${p.text} (${p.section})`] : ["The summary lists nothing here."]; };
  const base = { total: 5, eyebrow: label, source: src, date: d };
  return [
    { ...base, index: 1, heading: "In one line", badge: "Analysis", points: [s.headline] },
    { ...base, index: 2, heading: "What it does", badge: "Analysis", points: first(s.whatItDoes) },
    { ...base, index: 3, heading: "Who it affects", badge: "Analysis", points: first(s.whoItAffects) },
    { ...base, index: 4, heading: "The latest recorded vote", badge: "Official", points: [vote ? `${vote.chamber === "senate" ? "Senate" : "House"}, ${date(vote.votedAt)}: ${vote.question}. ${vote.result ?? "Result not stated"}, ${vote.yea}–${vote.nay}.` : "No recorded vote on this bill yet."],
      source: vote ? vote.sourceUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] : src, date: vote ? date(vote.votedAt) : today },
    { ...base, index: 5, heading: "Where it stands", badge: "Official", points: [bill.latestActionText ? `${bill.latestActionText} (${bill.latestActionAt})` : idx ? `Stage: ${idx.stage.replace("_", " ")}` : "No action recorded yet."], date: today },
  ];
}

/**
 * Dashboard cards, one fact each, from the stored snapshot: how many bills filed in this Congress became law
 * ("funnel"), and the seats each party holds in one chamber ("house", "senate"; the older "control" is the House).
 * The "players" card listed several people on one card and was taken off the share menu on 18 Nov 2026.
 */
export type DashKind = "funnel" | "house" | "senate";
export async function dashboardCard(kind: DashKind): Promise<Card | null> {
  const d = await congressDashboard();
  if (!d) return null;
  const today = date(d.generatedAt);
  if (kind === "funnel") {
    const f = d.funnels[0].all;
    return { eyebrow: `${d.current}TH CONGRESS · BILLS THAT BECAME LAW`, title: `${f.reach.law} of ${f.reach.filed.toLocaleString("en-US")} became law`, subtitle: `Bills and joint resolutions filed in the ${d.current}th Congress`,
      lines: [{ what: `Of ${f.reach.filed.toLocaleString("en-US")} filed`, describe: { label: "Official", text: "Stage read from each bill's latest official action." }, vote: `${f.reach.law.toLocaleString("en-US")} became law`, kindLabel: "Bills", date: today, source: "congress.gov" }],
      note: null, footer: BRAND.taglineShort };
  }
  const seats = d.seats.filter(s => s.chamber === kind).map(s => `${s.party} ${s.n}`).join(" · ");
  if (!seats) return null;
  const name = kind === "house" ? "House" : "Senate";
  return { eyebrow: `${d.current}TH CONGRESS · SEATS IN THE ${name.toUpperCase()}`, title: `Seats in the ${name}`, subtitle: `Data as of ${today}`,
    lines: [{ what: name, describe: { label: "Official", text: kind === "house" ? "435 voting seats; delegates are not counted" : "100 seats" }, vote: seats, kindLabel: `${name} seats`, date: today, source: "congress-legislators" }],
    note: null, footer: BRAND.taglineShort };
}

/** Link-preview card for a bill page, federal or Texas. One fact: its latest official action, with the date and the source. */
export async function billCard(billId: string): Promise<Card | null> {
  const db = getDb(), bill = await db.select().from(officialBills).where(eq(officialBills.id, billId)).get();
  if (!bill) {
    const tx = await db.select().from(txBills).where(eq(txBills.id, billId)).get();
    if (!tx) return null;
    return { eyebrow: `TEXAS LEGISLATURE · ${tx.identifier}`, title: tx.title.length > 110 ? `${tx.title.slice(0, 108)}…` : tx.title, subtitle: "",
      lines: [{ what: "Where it stands", describe: { label: "Official", text: tx.title.slice(0, 140) }, vote: (tx.latestActionDescription ?? "No action recorded yet.").slice(0, 120), kindLabel: "Latest action",
        date: tx.latestActionDate ? date(`${tx.latestActionDate.slice(0, 10)}T17:00:00Z`) : date(tx.retrievedAt), source: "capitol.texas.gov" }],
      note: null, footer: BRAND.taglineShort };
  }
  const s = await db.select({ headline: analysisBillSummaries.headline }).from(analysisBillSummaries).where(and(eq(analysisBillSummaries.billId, billId), readerVisible())).orderBy(desc(analysisBillSummaries.createdAt)).limit(1).get();
  const label = billLabel(bill.billType, bill.number), when = bill.latestActionAt ? date(bill.latestActionAt) : date(Date.now());
  return { eyebrow: `${bill.congress}TH CONGRESS · ${label}`, title: bill.title.length > 110 ? `${bill.title.slice(0, 108)}…` : bill.title, subtitle: "",
    lines: [{ what: "Where it stands", describe: s ? { label: "Analysis", text: s.headline } : { label: "Official", text: bill.title.slice(0, 140) }, vote: (bill.latestActionText ?? "No action recorded yet.").slice(0, 120), kindLabel: "Latest action", date: when, source: "congress.gov" }],
    note: null, footer: BRAND.taglineShort };
}

/** Link-preview card for a member page. One fact: their most recent recorded vote. Null when there is none on file. */
export async function memberCard(memberId: string): Promise<Card | null> {
  const db = getDb(), m = await db.select().from(officialPoliticians).where(eq(officialPoliticians.id, memberId)).get();
  if (!m) return null;
  const x = await db.select({ id: officialRollCalls.id, position: officialMemberVotes.position }).from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId))
    .where(eq(officialMemberVotes.politicianId, memberId)).orderBy(desc(officialRollCalls.votedAt)).limit(1).get();
  const r = x ? await roll(x.id) : null;
  if (!x || !r) return null;
  const kind = voteKind(r.question, r.billTitle ?? r.title);
  return { eyebrow: "HOW THEY VOTED", title: m.fullName, subtitle: memberLine(m), lines: [voteLine(cardVote(r, positionLine(x.position, kind)))],
    note: kind === "procedural" ? "A procedural vote decides how the chamber proceeds. It is not a vote on the bill itself." : null, footer: BRAND.taglineShort };
}

/**
 * A member's recent recorded votes against most of their own party (yes/no votes only). Same rule for every member.
 * The member page lists these. The "breaking ranks" share card put the member's vote and the party's count on one
 * card; it was taken off on 18 Nov 2026 and an old link to it now opens the vote alone.
 */
export async function breakingRanksFor(memberId: string, limit = 5) {
  const db = getDb(), m = await db.select({ party: officialPoliticians.party }).from(officialPoliticians).where(eq(officialPoliticians.id, memberId)).get();
  if (!m) return [];
  const mine = await db.select({ rollId: officialRollCalls.id, position: officialMemberVotes.position, question: officialRollCalls.question, votedAt: officialRollCalls.votedAt, billId: officialRollCalls.billId,
    title: sql<string | null>`coalesce(${officialBills.title}, ${officialRollCalls.title})` })
    .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId)).leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId))
    .where(and(eq(officialMemberVotes.politicianId, memberId), inArray(officialMemberVotes.position, ["Yea", "Nay"]))).orderBy(desc(officialRollCalls.votedAt)).limit(80);
  if (!mine.length) return [];
  const counts = await db.select({ rollId: officialMemberVotes.rollCallId, party: officialPoliticians.party, position: officialMemberVotes.position, n: sql<number>`count(*)` }).from(officialMemberVotes)
    .innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId)).where(inArray(officialMemberVotes.rollCallId, mine.map(x => x.rollId)))
    .groupBy(officialMemberVotes.rollCallId, officialPoliticians.party, officialMemberVotes.position);
  const code = partyCode(m.party), own = new Map<string, { Yea?: number; Nay?: number }>();
  for (const c of counts) if (partyCode(c.party) === code && (c.position === "Yea" || c.position === "Nay")) { const e = own.get(c.rollId) ?? {}; e[c.position] = (e[c.position] ?? 0) + Number(c.n); own.set(c.rollId, e); }
  return mine.filter(x => withPartyMajority(x.position as "Yea" | "Nay", own.get(x.rollId) ?? {}) === false).slice(0, limit).map(x => ({ ...x, party: own.get(x.rollId)! }));
}
