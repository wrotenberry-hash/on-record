import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireEditorUser } from "@/lib/auth";
import { getDb } from "@/db";
import { officialBills, officialFloorSchedule, officialMemberVotes, officialPoliticians, officialRollCalls } from "@/db/schema";
import { memberDistrictId, totalsLine } from "@/lib/verify/rules";
import { scopeTotals } from "@/lib/verify/store";
import { positionLine, voteKind } from "@/lib/federal/vote-kinds";
import { weekOf } from "@/lib/federal/depth-parse";

export const dynamic = "force-dynamic";
const requestTime = () => Date.now();

/** Round J design: the weekly office email, previewed for one member. Never sent (docs/OFFICE_EMAIL_DESIGN.md). */
export default async function OfficeEmailPreview({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  await requireEditorUser("/editor/office-email");
  const db = getDb(), id = (await searchParams).member ?? "";
  const m = /^[A-Z]\d{6}$/.test(id) ? await db.select().from(officialPoliticians).where(eq(officialPoliticians.id, id)).get() : await db.select().from(officialPoliticians).where(eq(officialPoliticians.chamber, "house")).limit(1).get();
  if (!m) return <main className="fed-page"><p>No member.</p></main>;
  const scope = m.chamber === "senate" ? m.state : memberDistrictId(m.state, m.district);
  const week = requestTime() - 7 * 86400e3;
  const voted = await db.select({ billId: officialRollCalls.billId, question: officialRollCalls.question, title: officialRollCalls.title, billTitle: officialBills.title, position: officialMemberVotes.position })
    .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId)).leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId))
    .where(and(eq(officialMemberVotes.politicianId, m.id), gte(officialRollCalls.votedAt, week), sql`${officialRollCalls.billId} is not null`)).orderBy(desc(officialRollCalls.votedAt)).limit(10);
  const upcoming = await db.select({ billId: officialFloorSchedule.billId, label: officialFloorSchedule.label, title: officialBills.title }).from(officialFloorSchedule).leftJoin(officialBills, eq(officialBills.id, officialFloorSchedule.billId))
    .where(and(eq(officialFloorSchedule.chamber, m.chamber), sql`${officialFloorSchedule.weekOf} >= ${weekOf(Date.now())}`, sql`${officialFloorSchedule.billId} is not null`)).limit(10);
  const ids = [...voted.map(v => v.billId!), ...upcoming.map(u => u.billId!)];
  const totals = await scopeTotals(scope, ids).catch(() => []);
  const t = (b: string) => totals.find(x => x.billId === b) ?? null;
  const text = [`On Record: what verified constituents in ${scope} said this week`, "", `To the office of ${m.fullName}. Not a scientific poll: answers from readers who verified a mobile number and matched an address to ${scope}; totals shown only from 25 answers.`, "",
    "Votes this week:", ...(voted.length ? voted.map(v => `- ${v.billTitle ?? v.title}: ${positionLine(v.position, voteKind(v.question, v.billTitle ?? v.title))}. ${totalsLine("District-matched", t(v.billId!))}`) : ["- none recorded"]), "",
    "On the floor schedule next:", ...(upcoming.length ? upcoming.map(u => `- ${u.label} ${u.title ?? ""}: ${totalsLine("District-matched", t(u.billId!))}`) : ["- none posted"]), "",
    "Aggregates only; no names or individual answers. Transparency note: /transparency. Stop these emails: (one-click link)."].join("\n");
  return <>
    <header className="topbar"><Link className="brand" href="/">ON <span>RECORD</span><i/></Link><nav><Link href="/editor">Cases</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>
    <main className="fed-page analysis-admin"><div className="eyebrow">EDITOR · OFFICE EMAIL (DESIGN, NOT SENT)</div><h1>Preview for {m.fullName}</h1>
      <p className="gate gate-closed" role="status">This email is never sent. It needs public reading on, a verified sending domain and the owner&apos;s go-ahead.</p>
      <pre className="email-preview">{text}</pre><p className="meta">Try another member: /editor/office-email?member=BIOGUIDE.</p></main></>;
}
