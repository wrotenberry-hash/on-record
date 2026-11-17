import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { txCommitteesByChamber, txOverview } from "@/lib/texas/queries";
import { TX_STAGE_LABEL, type TxStage } from "@/lib/texas/parse";
import { texasConfig } from "@/lib/texas/ingest";
import { TX_OFFICERS } from "@/lib/texas/dashboard";
import { getDb } from "@/db";
import { txPeople } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { brandTitle } from "@/lib/brand";
import { inDays, txCalendar, txSessionState, txToday } from "@/lib/texas/calendar";
import { seatLine, TX_SEATS } from "@/lib/texas/coverage";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Texas Legislature"), robots: { index: false, follow: false } };

const clock = () => Date.now();
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const TAP = "inline-flex min-h-11 items-center underline underline-offset-2";

/** What is happening in the Texas Legislature: the session's key dates, bills, members, committees and hearings. Official, from Open States; Texas Legislature Online is the source of record. */
export default async function TexasPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/texas" access={access} page="/texas">{null}</PublicShell>;
  const now = clock(), today = txToday(now), st = txSessionState(today), cal = txCalendar(today), c = texasConfig();
  const [o, committees] = await Promise.all([txOverview(now).catch(() => null), txCommitteesByChamber().catch(() => null)]);
  const shown = o?.coverage.shown ?? null;
  return <PublicShell current="/texas" access={access} page="/texas">
    <section className="fed-page">
      <div className="eyebrow">TEXAS LEGISLATURE <OfficialBadge /></div>
      <h1>{st.inSession ? `${st.current.name}: in session` : st.upcoming ? `Next: ${st.upcoming.name}` : "Texas Legislature"}</h1>
      <p className="meta">{st.inSession ? `In session since ${shortDate(st.current.start)}; it can run until ${st.current.end ? shortDate(st.current.end) : "it adjourns"}.` : st.upcoming ? `Convenes ${shortDate(st.upcoming.start)}, ${inDays(st.daysUntilUpcoming ?? 0)}.` : `The last session ended ${st.current.end ? shortDate(st.current.end) : ""}.`}</p>
      <p className="lede" role="status">{o ? o.coverage.line : "Texas bills are not available right now."}</p>
      {!c.openStates && !c.legiscan && <p className="gate gate-closed" role="status">Texas bills load once the Open States key is set (an owner setup step). Until then this page shows the session calendar only.</p>}

      <div className="fed-section" id="key-dates"><h2>The {cal.session ? cal.session.start.slice(0, 4) : ""} session: key dates <OfficialBadge title="Dates from official records and rules; each row links to its source" /></h2>
        {cal.next ? <p className="lead-stat"><b>{cal.nextLine}</b> <span className="meta">({longDate(cal.next.date)})</span></p> : cal.rows.length > 0 && <p className="meta">Every key date of this session has passed.</p>}
        {cal.rows.length ? <ol className="timeline" aria-label="Key dates of the session">
          {cal.rows.map(r => <li key={r.id} className={`tl-step ${r.passed ? "done" : "todo"} ${cal.next?.id === r.id ? "now" : ""}`} aria-current={cal.next?.id === r.id ? "step" : undefined}>
            <span className="tl-dot" aria-hidden="true" />
            <span className="tl-label">{r.label}</span>
            <span className="tl-date">{shortDate(r.date)}{r.passed ? " · passed" : r.isToday ? " · today" : ""}</span>
            <span className="tl-text">{r.meaning} <a className={TAP} href={r.sourceUrl} target="_blank" rel="noopener noreferrer">Source: {r.sourceLabel}</a></span>
          </li>)}
        </ol> : <p className="meta">No key dates are on file for this session yet.</p>}
        <p className="meta">Each date comes from an official record or is worked out from the rule named in its source. Dates marked “expected” can still move: the House sets its rules when the session opens, and the session can end before its last possible day. The last days for House and Senate action near the end of the session are not listed here yet.</p></div>

      {o && shown && o.total > 0 && <div className="fed-section"><h2>{shown.name}: {o.total.toLocaleString("en-US")} bills on file here</h2>
        <ul className="analysis-list">{(["filed", "committee", "passed_first", "passed_both", "governor", "law", "vetoed", "failed"] as TxStage[]).filter(s => o.counts[s]).map(s => <li key={s}>{TX_STAGE_LABEL[s]}: {o.counts[s].toLocaleString("en-US")}</li>)}</ul>
        <p className="meta">This counts the bills loaded on this site, which can be fewer than the Legislature has filed.{o.newestAction ? ` Newest action on file: ${shortDate(o.newestAction)}.` : ""}</p></div>}
      <div className="fed-section"><h2>Moving this week</h2>
        {o?.moving.length ? <ul className="result-list">{o.moving.map(b => <li key={b.id}><Link className="block py-2.5" href={`/texas/bills/${b.id}`}><span className="bill-tag">{b.identifier}</span> {b.title}</Link>
          <span className="meta">{TX_STAGE_LABEL[b.stage as TxStage] ?? b.stage}{b.latestActionDescription ? ` · ${b.latestActionDescription}` : ""}{b.latestActionDate ? ` (${shortDate(b.latestActionDate)})` : ""}</span></li>)}</ul>
          : <p className="meta">No Texas bill on file here moved in the last 7 days{st.inSession ? "" : "; the Legislature is not in session"}.</p>}</div>

      <div className="fed-section"><h2>Who controls it and who runs it <OfficialBadge /></h2>
        {o && o.seats.filled > 0 ? <>
          <ul className="analysis-list">{(["upper", "lower"] as const).map(ch => o.parties[ch].length ? <li key={ch}><b>{ch === "upper" ? `Texas Senate (${TX_SEATS.upper} seats)` : `Texas House (${TX_SEATS.lower} seats)`}:</b> {o.parties[ch].map(r => `${r.party} ${r.n}`).join(" · ")}</li> : null)}</ul>
          <p className="meta">{seatLine(o.seats)}</p></>
          : <p className="meta">Seat counts appear once the Texas member list loads (Open States).</p>}
        <ul className="analysis-list">{TX_OFFICERS.map(x => <li key={x.title}><b>{x.title}:</b> {x.name} ({x.party}){x.title === "Lieutenant Governor" ? ", who presides over the Texas Senate" : x.title.startsWith("Speaker") ? ", who presides over the Texas House" : ""}. <span className="meta">As of the {x.asOf}.</span></li>)}</ul>
        <p className="meta"><Link className={TAP} href="/dashboard/texas">Texas dashboard: seats, leaders and where bills stall</Link></p></div>

      <div className="fed-section" id="committees"><h2>Committees <OfficialBadge /></h2>
        <p className="meta">A committee is a small group of lawmakers that studies bills on one subject and decides which ones move on to a vote by the full House or Senate.</p>
        {committees && committees.total > 0 ? committees.groups.filter(g => g.committees.length > 0).map(g => <details key={g.key} className="primer"><summary>{g.label} ({g.committees.length})</summary>
          <ul className="result-list">{g.committees.map(cm => <li key={cm.id}><b>{cm.name}</b>
            <span className="meta">{cm.members > 0 ? `${cm.members} ${cm.members === 1 ? "member" : "members"} listed` : "Members not listed by the source"}{cm.chair ? <> · Chair: {cm.chair.personId ? <Link className={TAP} href={`/texas/members/${encodeURIComponent(cm.chair.personId)}`}>{cm.chair.name}</Link> : cm.chair.name}</> : null}</span></li>)}</ul></details>)
          : <p className="meta">No committees have loaded yet.</p>}
        {committees && committees.total > 0 && <p className="meta">{committees.total} committees on file{committees.retrievedAt ? `, last read ${shortDate(committees.retrievedAt)}` : ""}. House committee seats are set again at the start of each regular session (House Rule 4), so this list can be the last session&apos;s until the new one is announced.</p>}</div>

      <div className="fed-section"><h2>Coming up: hearings and floor calendars</h2>
        {o?.events.length ? <ul className="result-list">{o.events.map(e => <li key={e.id}><b>{e.name}</b><span className="meta">{new Date(e.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })} CT{e.location ? ` · ${e.location}` : ""}{(e.bills as string[] | null)?.length ? ` · ${(e.bills as string[]).slice(0, 6).join(", ")}` : ""}</span></li>)}</ul>
          : <p className="meta">No hearings posted yet.</p>}
        <p className="meta"><Link className={TAP} href="/coming">Everything coming up, Congress and Texas</Link></p></div>
      <p className="source-line">Texas bills, votes, members, committees and hearings from Open States (openstates.org); each bill links to its history on Texas Legislature Online (capitol.texas.gov), the source of record. Session dates from the Texas Constitution, the Government Code and the House Rules, as printed on Texas Legislature Online.</p>
    </section>
  </PublicShell>;
}
