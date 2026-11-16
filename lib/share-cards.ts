import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { READER_S, readerVisible } from "@/lib/analysis/publish-gate";
import { adjudications, analysisBillSummaries, officialBillIndex, officialBills, officialMemberVotes, officialPoliticians, officialRollCalls, people, publications,
  representations, sourceCaptures, sourceCommunications } from "@/db/schema";
import { voteLine, type Card, type CardVote } from "@/lib/card-content";
import { KIND_LABEL, positionLine, voteKind } from "@/lib/federal/vote-kinds";
import { billLabel, memberLine } from "@/components/federal/badges";
import { partyCode } from "@/lib/federal/bill-depth";
import { withPartyMajority } from "@/lib/federal/member-stats-rules";
import { memberDistrictId, MIN_SHOWN, totalsLine } from "@/lib/verify/rules";
import { scopeTotals } from "@/lib/verify/store";
import { isQuietKill, saidAboutBill, saidVsDid } from "@/lib/said-did-rules";
import type { Slide } from "@/components/cards/card-image";
import { congressDashboard } from "@/lib/federal/dashboard";
import { FUNNEL_LABEL, FUNNEL_ORDER } from "@/lib/federal/dashboard-rules";

/**
 * Round G card builders. Every card is built only from record data and approved
 * (visible) summaries; nothing a reader typed ever appears on an image. Each
 * returns null when the data does not support the card (for example, district
 * totals under 25), so a card is never shown with thin or missing evidence.
 */
const date = (ms: number | string) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const PARTY = { D: "Democrats", R: "Republicans", I: "Independents", Other: "others" } as Record<string, string>;

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

/** Quiet kill: a bill stopped by a procedural vote (cloture or a motion to proceed failed, or a motion to table or recommit carried). */
export async function quietKillCard(rollId: string): Promise<Card | null> {
  const r = await roll(rollId);
  if (!r?.billId || voteKind(r.question, r.billTitle ?? r.title) !== "procedural") return null;
  if (!isQuietKill("procedural", r.question, r.result)) return null;
  return { eyebrow: "STOPPED BY A PROCEDURAL VOTE", title: r.billType ? `${billLabel(r.billType, r.number!)}` : "A bill", subtitle: (r.billTitle ?? r.title ?? "").slice(0, 110),
    lines: [voteLine(cardVote(r, `${r.question}: ${r.result} ${r.yea}–${r.nay}`))], note: "A procedural vote decides whether or how the chamber moves to a final vote. It is not a vote on the bill itself.", footer: "Talk is cheap." };
}

/** Breaking ranks: a member voted against most of their own party on a roll call. */
export async function breakingRanksCard(memberId: string, rollId: string): Promise<Card | null> {
  const db = getDb(), r = await roll(rollId);
  const m = await db.select().from(officialPoliticians).where(eq(officialPoliticians.id, memberId)).get();
  const mine = await db.select({ position: officialMemberVotes.position }).from(officialMemberVotes).where(and(eq(officialMemberVotes.rollCallId, rollId), eq(officialMemberVotes.politicianId, memberId))).get();
  if (!r || !m || !mine || (mine.position !== "Yea" && mine.position !== "Nay")) return null;
  const counts = await db.select({ party: officialPoliticians.party, position: officialMemberVotes.position, n: sql<number>`count(*)` }).from(officialMemberVotes)
    .innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId)).where(eq(officialMemberVotes.rollCallId, rollId)).groupBy(officialPoliticians.party, officialMemberVotes.position);
  const code = partyCode(m.party), own: { Yea?: number; Nay?: number } = {};
  for (const c of counts) if (partyCode(c.party) === code && (c.position === "Yea" || c.position === "Nay")) own[c.position] = (own[c.position] ?? 0) + Number(c.n);
  if (withPartyMajority(mine.position, own) !== false) return null;
  const kind = voteKind(r.question, r.billTitle ?? r.title);
  return { eyebrow: "BREAKING RANKS", title: m.fullName, subtitle: memberLine(m),
    lines: [voteLine(cardVote(r, positionLine(mine.position, kind)))], note: `Most ${PARTY[code]} voted ${mine.position === "Yea" ? "no" : "yes"} (${PARTY[code]}: ${own.Yea ?? 0} yes, ${own.Nay ?? 0} no).`, footer: "Talk is cheap." };
}

/** My district vs my legislator: the member's recorded vote beside district-matched totals (n >= 25 only). */
export async function districtVsLegislatorCard(memberId: string, billId: string): Promise<Card | null> {
  const db = getDb();
  const m = await db.select().from(officialPoliticians).where(eq(officialPoliticians.id, memberId)).get();
  if (!m) return null;
  const scope = m.chamber === "senate" ? m.state : memberDistrictId(m.state, m.district);
  const t = (await scopeTotals(scope, [billId]).catch(() => []))[0];
  if (!t || t.support + t.oppose < MIN_SHOWN) return null;
  const v = await db.select({ id: officialRollCalls.id, position: officialMemberVotes.position, question: officialRollCalls.question, title: officialRollCalls.title })
    .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId))
    .where(and(eq(officialMemberVotes.politicianId, memberId), eq(officialRollCalls.billId, billId))).orderBy(desc(officialRollCalls.votedAt));
  const pick = v.find(x => voteKind(x.question, x.title) === "passage") ?? v[0];
  const r = pick ? await roll(pick.id) : null;
  if (!r || !pick) return null;
  const line = voteLine(cardVote(r, `${m.fullName}: ${positionLine(pick.position, voteKind(r.question, r.billTitle ?? r.title))}`));
  return { eyebrow: `MY DISTRICT VS MY LEGISLATOR · ${scope}`, title: r.billType ? billLabel(r.billType, r.number!) : "This bill", subtitle: (r.billTitle ?? "").slice(0, 110),
    lines: [line, { ...line, vote: totalsLine(`District-matched readers in ${scope}`, t), describe: { label: "Readers", text: "Verified readers who matched an address to this district. Not a scientific poll." }, kindLabel: "Readers", source: "On Record, aggregate counts only" }],
    note: null, footer: "Talk is cheap." };
}

/** Said vs. Did: a published, human-reviewed statement that names a bill and states a position, beside the speaker's passage vote. */
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
export async function saidVsDidCard(publicationId: string): Promise<Card | null> {
  const p = (await saidVsDidPairs(200)).find(x => x.publicationId === publicationId);
  if (!p) return null;
  const r = await roll(p.rollId);
  if (!r) return null;
  const said = p.said.length > 220 ? `${p.said.slice(0, 218)}…` : p.said;
  return { eyebrow: p.result === "match" ? "SAID AND DID: A MATCH" : "SAID VS. DID: A CONTRADICTION", title: p.speaker, subtitle: `Said: “${said}”`,
    lines: [voteLine(cardVote(r, `Did: ${positionLine(p.position, "passage")}`))], note: `Rule: a statement that names the bill and says the speaker supports or opposes it, compared with their vote on passing it. Same rule for every party.${p.url ? ` Statement: ${p.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}` : ""}`, footer: "Talk is cheap." };
}

/** The 5-slide explainer for a bill with a visible (approved or unflagged) summary. */
export async function carouselSlides(billId: string): Promise<Slide[] | null> {
  const db = getDb();
  const bill = await db.select().from(officialBills).where(eq(officialBills.id, billId)).get();
  const s = await db.select().from(analysisBillSummaries).where(and(eq(analysisBillSummaries.billId, billId), readerVisible())).orderBy(desc(analysisBillSummaries.createdAt)).limit(1).get();
  if (!bill || !s) return null;
  const idx = await db.select().from(officialBillIndex).where(eq(officialBillIndex.billId, billId)).get();
  const votes = await db.select().from(officialRollCalls).where(eq(officialRollCalls.billId, billId)).orderBy(desc(officialRollCalls.votedAt)).limit(2);
  const label = billLabel(bill.billType, bill.number), src = "congress.gov", d = date(s.createdAt);
  const pts = (x: unknown) => ((x as Array<{ text: string; section: string }>) ?? []).slice(0, 4).map(p => `${p.text} (${p.section})`);
  const args = (x: unknown) => ((x as Array<{ argument: string; attribution: string }>) ?? []).slice(0, 2).map(a => `${a.argument} (${a.attribution})`);
  const base = { total: 5, eyebrow: label, source: src, date: d };
  return [
    { ...base, index: 1, heading: s.headline, badge: "Analysis", points: [`Official title: ${bill.title.slice(0, 160)}`], source: src },
    { ...base, index: 2, heading: "What it does", badge: "Analysis", points: pts(s.whatItDoes) },
    { ...base, index: 3, heading: "Who it affects", badge: "Analysis", points: pts(s.whoItAffects) },
    { ...base, index: 4, heading: "The case for and against", badge: "Analysis", points: [...args(s.caseFor).map(a => `For: ${a}`), ...args(s.caseAgainst).map(a => `Against: ${a}`)] },
    { ...base, index: 5, heading: "Where it stands", badge: "Official", points: [bill.latestActionText ? `${bill.latestActionText} (${bill.latestActionAt})` : "No action recorded yet.",
      ...votes.map(v => `${v.chamber === "senate" ? "Senate" : "House"}, ${date(v.votedAt)}: ${v.question}, ${v.result ?? ""} ${v.yea}–${v.nay}`), ...(idx ? [`Stage: ${idx.stage.replace("_", " ")}`] : [])].slice(0, 4), date: date(Date.now()) },
  ];
}

/** Dashboard cards: the funnel or control of this Congress, from the stored snapshot. */
export async function dashboardCard(kind: "funnel" | "control" | "players"): Promise<Card | null> {
  const d = await congressDashboard();
  if (!d) return null;
  const today = date(d.generatedAt), src = "congress.gov";
  if (kind === "funnel") {
    const f = d.funnels[0].all;
    return { eyebrow: `${d.current}TH CONGRESS · THE BILL FUNNEL`, title: `${f.reach.law} of ${f.reach.filed.toLocaleString("en-US")} became law`, subtitle: d.funnels[0].takeaway.replace(/^[^:]+: /, ""),
      lines: FUNNEL_ORDER.slice(1).map(s => ({ what: FUNNEL_LABEL[s], describe: { label: "Official" as const, text: `${f.pct[s]}% of bills filed` }, vote: f.reach[s].toLocaleString("en-US"), kindLabel: "Bills", date: today, source: src })).slice(0, 3),
      note: "Stage read from each bill's latest official action.", footer: "Talk is cheap." };
  }
  if (kind === "players") {
    if (!d.leaders.length) return null;
    const by = (c: string) => d.leaders.filter(l => l.chamber === c).slice(0, 4).map(l => `${l.title}: ${l.name}`).join(" · ");
    return { eyebrow: `${d.current}TH CONGRESS · KEY PLAYERS`, title: "Who runs Congress", subtitle: `Leadership roles as of ${today}`,
      lines: (["house", "senate"] as const).filter(c => by(c)).map(c => ({ what: c === "house" ? "House" : "Senate", describe: { label: "Official" as const, text: by(c) }, vote: c === "house" ? "House leadership" : "Senate leadership", kindLabel: "Roles", date: today, source: "congress-legislators" })),
      note: "Roles as listed in the congress-legislators data. A role is not a measure of influence.", footer: "Talk is cheap." };
  }
  const seats = (c: string) => d.seats.filter(s => s.chamber === c).map(s => `${s.party} ${s.n}`).join(" · ");
  return { eyebrow: `${d.current}TH CONGRESS · WHO CONTROLS IT`, title: "Control of Congress", subtitle: `Data as of ${today}`,
    lines: [{ what: "House", describe: { label: "Official", text: "435 voting seats; delegates are not counted" }, vote: seats("house"), kindLabel: "House seats", date: today, source: "congress-legislators" },
      { what: "Senate", describe: { label: "Official", text: "100 seats" }, vote: seats("senate"), kindLabel: "Senate seats", date: today, source: "congress-legislators" }],
    note: d.leaders.slice(0, 3).map(l => `${l.title}: ${l.name}`).join(" · ") || null, footer: "Talk is cheap." };
}

/** Link-preview card for a bill page: official title, the Analysis headline when one is visible, and the latest official action. */
export async function billCard(billId: string): Promise<Card | null> {
  const db = getDb(), bill = await db.select().from(officialBills).where(eq(officialBills.id, billId)).get();
  if (!bill) return null;
  const s = await db.select({ headline: analysisBillSummaries.headline }).from(analysisBillSummaries).where(and(eq(analysisBillSummaries.billId, billId), readerVisible())).orderBy(desc(analysisBillSummaries.createdAt)).limit(1).get();
  const label = billLabel(bill.billType, bill.number), when = bill.latestActionAt ? date(bill.latestActionAt) : date(Date.now());
  return { eyebrow: `${bill.congress}TH CONGRESS · ${label}`, title: bill.title.length > 110 ? `${bill.title.slice(0, 108)}…` : bill.title, subtitle: "",
    lines: [{ what: "Where it stands", describe: s ? { label: "Analysis", text: s.headline } : { label: "Official", text: bill.title.slice(0, 140) }, vote: (bill.latestActionText ?? "No action recorded yet.").slice(0, 120), kindLabel: "Latest action", date: when, source: "congress.gov" }],
    note: null, footer: "Talk is cheap." };
}

/** Link-preview card for a member page: their two most recent recorded votes. */
export async function memberCard(memberId: string): Promise<Card | null> {
  const db = getDb(), m = await db.select().from(officialPoliticians).where(eq(officialPoliticians.id, memberId)).get();
  if (!m) return null;
  const v = await db.select({ id: officialRollCalls.id, position: officialMemberVotes.position }).from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId))
    .where(eq(officialMemberVotes.politicianId, memberId)).orderBy(desc(officialRollCalls.votedAt)).limit(2);
  const lines = [];
  for (const x of v) { const r = await roll(x.id); if (r) lines.push(voteLine(cardVote(r, positionLine(x.position, voteKind(r.question, r.billTitle ?? r.title))))); }
  return { eyebrow: "HOW THEY VOTED", title: m.fullName, subtitle: memberLine(m), lines, note: lines.length ? null : "No recorded votes yet.", footer: "Talk is cheap." };
}

/** A member's recent recorded votes against most of their own party (yes/no votes only). Same rule for every member. */
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
