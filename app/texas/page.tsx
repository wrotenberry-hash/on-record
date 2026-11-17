import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { txOverview } from "@/lib/texas/queries";
import { TX_STAGE_LABEL, type TxStage } from "@/lib/texas/parse";
import { texasConfig } from "@/lib/texas/ingest";
import { TX_OFFICERS } from "@/lib/texas/dashboard";
import { getDb } from "@/db";
import { txPeople } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Texas Legislature"), robots: { index: false, follow: false } };

/** What is happening in the Texas Legislature this week. Official, from Open States; Texas Legislature Online is the source of record. */
export default async function TexasPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/texas" access={access} page="/texas">{null}</PublicShell>;
  const o = await txOverview().catch(() => null), c = texasConfig();
  const seats = await getDb().select({ chamber: txPeople.chamber, party: txPeople.party, n: sql<number>`count(*)` }).from(txPeople).where(eq(txPeople.isCurrent, 1)).groupBy(txPeople.chamber, txPeople.party).catch(() => []);
  return <PublicShell current="/texas" access={access} page="/texas">
    <section className="fed-page">
      <div className="eyebrow">TEXAS LEGISLATURE <OfficialBadge /></div>
      <h1>{o?.inSession ? `${o.session.name}: in session` : o?.upcoming ? `Next: ${o.upcoming.name}` : "Texas Legislature"}</h1>
      {o && <p className="meta">{o.inSession ? `In session since ${shortDate(o.session.start)}; scheduled to end ${o.session.end ? shortDate(o.session.end) : "when it adjourns"}.` : o.upcoming ? `Convenes ${shortDate(o.upcoming.start)}. Bills filed early (prefiled) appear below as they are filed.` : ""}</p>}
      {!c.openStates && !c.legiscan && <p className="gate gate-closed" role="status">Texas bills load once the Open States key is set (an owner setup step). Until then this page shows the session calendar only.</p>}
      {o && o.total > 0 && <div className="fed-section"><h2>{o.focus.name}: {o.total} bills so far</h2>
        <ul className="analysis-list">{(["filed", "committee", "passed_first", "passed_both", "governor", "law", "vetoed", "failed"] as TxStage[]).filter(s => o.counts[s]).map(s => <li key={s}>{TX_STAGE_LABEL[s]}: {o.counts[s]}</li>)}</ul></div>}
      <div className="fed-section"><h2>Moving this week</h2>
        {o?.moving.length ? <ul className="result-list">{o.moving.map(b => <li key={b.id}><Link href={`/texas/bills/${b.id}`}><span className="bill-tag">{b.identifier}</span> {b.title}</Link>
          <span className="meta">{TX_STAGE_LABEL[b.stage as TxStage] ?? b.stage}{b.latestActionDescription ? ` · ${b.latestActionDescription}` : ""}{b.latestActionDate ? ` (${shortDate(b.latestActionDate)})` : ""}</span></li>)}</ul>
          : <p className="meta">No Texas bill moved in the last 7 days{o?.inSession ? "" : "; the Legislature is not in session"}.</p>}</div>
      <div className="fed-section"><h2>Who controls it and who runs it <OfficialBadge /></h2>
        {seats.length ? <ul className="analysis-list">{(["upper", "lower"] as const).map(ch => { const rows = seats.filter(x => x.chamber === ch); return rows.length ? <li key={ch}><b>{ch === "upper" ? "Texas Senate (31 seats)" : "Texas House (150 seats)"}:</b> {rows.map(r => `${r.party ?? "Unknown"} ${r.n}`).join(" · ")}</li> : null; })}</ul>
          : <p className="meta">Seat counts appear once the Texas member list loads (Open States).</p>}
        <ul className="analysis-list">{TX_OFFICERS.map(x => <li key={x.title}><b>{x.title}:</b> {x.name} ({x.party}){x.title === "Lieutenant Governor" ? ", who presides over the Texas Senate" : x.title.startsWith("Speaker") ? ", who presides over the Texas House" : ""}. <span className="meta">As of the {x.asOf}.</span></li>)}</ul>
        <p className="meta"><Link href="/dashboard/texas">Texas dashboard: seats, leaders and where bills stall</Link></p></div>
      <div className="fed-section"><h2>Coming up: hearings and floor calendars</h2>
        {o?.events.length ? <ul className="result-list">{o.events.map(e => <li key={e.id}><b>{e.name}</b><span className="meta">{new Date(e.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })} CT{e.location ? ` · ${e.location}` : ""}{(e.bills as string[] | null)?.length ? ` · ${(e.bills as string[]).slice(0, 6).join(", ")}` : ""}</span></li>)}</ul>
          : <p className="meta">No hearings posted yet.</p>}
        <p className="meta"><Link href="/coming">Everything coming up, Congress and Texas</Link></p></div>
      <p className="source-line">Texas bills, votes, members and hearings from Open States (openstates.org); each bill links to its history on Texas Legislature Online (capitol.texas.gov), the source of record.</p>
    </section>
  </PublicShell>;
}
