import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { previousVisit } from "@/lib/visits";
import { congressDashboard } from "@/lib/federal/dashboard";
import { capList, DASH_CAPS } from "@/lib/dashboard-end";
import { CaughtUp, ListEnd } from "@/components/dashboard/list-end";
import { ROLE_NOTE } from "@/lib/federal/dashboard-rules";
import { FunnelChart, RowBars, SeatBar } from "@/components/charts/charts";
import { BRAND, brandTitle } from "@/lib/brand";
import { cookies } from "next/headers";
import { LOCATION_COOKIE } from "@/lib/location";
import { coverageFromPlaceCookie, STATE_COMING } from "@/lib/state-coverage";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Congress dashboard"), robots: { index: false, follow: false } };
const PRESIDENT = { name: "Donald J. Trump", party: "Republican", since: "2025-01-20", source: "https://www.whitehouse.gov/" };

const when = (ms: number) => `${new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`;

/**
 * Congress at a glance: the bill funnel, history, control, key players, where bills stall, and issues. Official data;
 * method under each figure. Finite (owner, 18 Nov 2026, point 6): every list is capped and ends with a line saying it
 * is the end, and the page closes with "You're caught up." and the time the figures were last updated.
 */
export default async function DashboardPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/dashboard" access={access} page="/dashboard">{null}</PublicShell>;
  const d = await congressDashboard().catch(() => null);
  if (!d) return <PublicShell current="/dashboard" access={access} page="/dashboard"><section className="fed-page"><h1>Congress dashboard</h1><p className="meta">The figures are computed by the next scheduled update (twice a day). Check back after it runs.</p></section></PublicShell>;
  const cur = d.funnels[0], hist = d.funnels.filter(f => f.all.reach.filed > 0);
  // Each list, capped, with how many rows there are in all (for its last line).
  const history = capList(d.funnels, DASH_CAPS.history), leaders = capList(d.leaders, DASH_CAPS.leaders), changes = capList(d.changes, DASH_CAPS.changes), chairs = capList(d.chairs, DASH_CAPS.chairs);
  const advanced = capList(d.advanced, DASH_CAPS.top), againstParty = capList(d.againstParty, DASH_CAPS.top), missed = capList(d.missed, DASH_CAPS.top), stall = capList(d.stall, DASH_CAPS.stall), byIssue = capList(d.byIssue, DASH_CAPS.issues);
  // When this reader was last here (a time only, never a page): the closing line says whether the figures are newer than that.
  const lastVisit = await previousVisit(access.invite || access.editor ? await currentAppUserId().catch(() => null) : null).catch(() => null);
  const coverage = coverageFromPlaceCookie((await cookies()).get(LOCATION_COOKIE)?.value);
  return <PublicShell current="/dashboard" access={access} page="/dashboard">
    <section className="fed-page">
      <div className="eyebrow">CONGRESS DASHBOARD <OfficialBadge /></div>
      <h1>{d.current}th Congress at a glance</h1>
      <p className="as-of">Data as of {when(d.generatedAt)}{coverage === "coming" ? <> · {STATE_COMING}</> : <> · <Link href="/dashboard/texas">Texas Legislature</Link></>}</p>

      <div className="fed-section"><h2>The bill funnel <Link className="src-link" href="/share/card?t=dash&kind=funnel">Share</Link></h2>
        <p className="lead-stat">{cur.takeaway}</p>
        <div className="dash-grid"><FunnelChart f={cur.all} caption="All bills and joint resolutions" /><FunnelChart f={cur.house} caption="Started in the House" /><FunnelChart f={cur.senate} caption="Started in the Senate" /></div>
        <details className="method"><summary>How this is counted</summary><p className="meta">Every House and Senate bill and joint resolution of the {d.current}th Congress from the Congress.gov bill list ({cur.all.reach.filed.toLocaleString("en-US")} so far). Each bill&apos;s furthest step is read from its latest official action, and later steps imply earlier ones (a bill received in the Senate passed the House). Simple and concurrent resolutions, which cannot become law, are left out.
          {d.reconcile && <> Check against Congress.gov&apos;s own totals ({shortDate(d.reconcile.at)}): {d.reconcile.indexedBills.toLocaleString("en-US")} of {d.reconcile.officialBills?.toLocaleString("en-US") ?? "?"} measures listed{d.reconcile.billsMatch ? " (complete)" : " (list still loading)"}; {d.reconcile.indexedLaws} of {d.reconcile.officialLaws ?? "?"} public laws{d.reconcile.lawsMatch ? " (matches)" : ""}.</>}</p></details></div>

      {hist.length > 1 && <div className="fed-section"><h2>Compared with earlier Congresses</h2>
        <table className="chart history" tabIndex={0}><caption>Bills and joint resolutions, roll calls, procedural and party-line shares</caption><thead><tr><th scope="col">Congress</th><th scope="col">Filed</th><th scope="col">Passed a chamber</th><th scope="col">Became law</th><th scope="col">Roll calls on file</th><th scope="col">Procedural</th><th scope="col">Party-line</th></tr></thead>
          <tbody>{history.rows.map((f, i) => { const r = d.rollStats[i]; return <tr key={f.congress}><th scope="row">{f.congress}th</th><td>{f.all.reach.filed.toLocaleString("en-US") || "loading"}</td><td>{f.all.pct.passed_one}%</td><td>{f.all.reach.law.toLocaleString("en-US")}</td>
            <td>{r.total || "loading"}</td><td>{r.proceduralPct ?? "–"}{r.proceduralPct !== null ? "%" : ""}</td><td>{r.partyLinePct ?? "–"}{r.partyLinePct !== null ? "%" : ""}</td></tr>; })}</tbody></table>
        <p className="meta">Roll calls: the votes {BRAND.name} holds; earlier Congresses fill in as the backfill runs. Party-line: most voting Democrats and most voting Republicans on opposite sides. Procedural: cloture, motions to proceed, table, recommit and similar, and House rules.</p>
        <ListEnd shown={history.shown} total={history.total} what="Congresses" /></div>}

      <div className="fed-section"><h2>Who controls Congress <Link className="src-link" href="/share/card?t=dash&kind=control">Share</Link></h2>
        <SeatBar chamber="House" seats={d.seats.filter(s => s.chamber === "house")} total={435} />
        <SeatBar chamber="Senate" seats={d.seats.filter(s => s.chamber === "senate")} total={100} />
        <ul className="result-list">
          <li><b>President: {PRESIDENT.name}</b> ({PRESIDENT.party}) since {shortDate(PRESIDENT.since)}<span className="meta">{ROLE_NOTE.President} Vetoes this Congress: {d.vetoes}.</span></li>
          {leaders.rows.map(l => <li key={`${l.politicianId}-${l.title}`}><span><b>{l.title}</b> ({l.chamber === "senate" ? "Senate" : "House"}): <Link href={`/politicians/${l.politicianId}`}>{l.name}</Link></span>{ROLE_NOTE[l.title.replace(/^(House|Senate) /, "")] && <span className="meta">{ROLE_NOTE[l.title.replace(/^(House|Senate) /, "")]}</span>}</li>)}
        </ul>
        <ListEnd shown={leaders.shown + 1} total={leaders.total + 1} />
        {changes.shown > 0 && <p className="meta">Recent leadership changes: {changes.rows.map(c => `${c.title}: ${c.fromName ?? "vacant"} → ${c.toName} (${shortDate(c.at)})`).join("; ")}. {changes.shown === DASH_CAPS.changes ? `Only the ${DASH_CAPS.changes} most recent are listed.` : changes.shown === 1 ? "That is the only one on file." : `That is all ${changes.shown} on file.`}</p>}
        <p className="meta">Seats from congress-legislators (current members; vacancies are the gap to 435 and 100). Leaders from the same file, checked daily.</p></div>

      <div className="fed-section"><h2>Key players <OfficialBadge /></h2>
        <p className="meta">Counts, not grades. Same method for every member.</p>
        {advanced.shown > 0 && <><RowBars caption="Most bills sponsored that passed at least one chamber" unit="bills" rows={advanced.rows.map(a => ({ label: <Link href={`/politicians/${a.id}`}>{a.name} ({a.party.slice(0, 1)}-{a.state})</Link>, value: a.n }))} />
          <ListEnd shown={advanced.shown} total={d.listTotals?.advanced} top={advanced.shown === DASH_CAPS.top} /></>}
        {againstParty.shown > 0 && <><RowBars caption="Most votes against their own party's majority (votes on file)" unit="votes" rows={againstParty.rows.map(a => ({ label: <Link href={`/politicians/${a.id}`}>{a.name} ({a.party.slice(0, 1)}-{a.state})</Link>, value: a.value, note: `of ${a.counted}` }))} />
          <ListEnd shown={againstParty.shown} total={d.listTotals?.againstParty} top={againstParty.shown === DASH_CAPS.top} /></>}
        {missed.shown > 0 && <><RowBars caption="Most missed votes (votes on file)" unit="missed" rows={missed.rows.map(a => ({ label: <Link href={`/politicians/${a.id}`}>{a.name} ({a.party.slice(0, 1)}-{a.state})</Link>, value: a.value, note: `of ${a.total}` }))} />
          <ListEnd shown={missed.shown} total={d.listTotals?.missed} top={missed.shown === DASH_CAPS.top} /></>}
        {chairs.shown > 0 && <details className="method"><summary>Committee chairs and ranking members ({chairs.total})</summary><ul className="analysis-list">{chairs.rows.map(c => <li key={`${c.committeeId}-${c.politicianId}`}>{c.committee}: <Link href={`/politicians/${c.politicianId}`}>{c.name ?? c.politicianId}</Link> ({c.title})</li>)}</ul>
          <ListEnd shown={chairs.shown} total={chairs.total} /></details>}</div>

      {stall.shown > 0 && <div className="fed-section"><h2>Where bills stall</h2>
        <RowBars caption="Committees by bills referred, with how many they reported" unit="referred" rows={stall.rows.map(s => ({ label: `${s.name ?? s.committeeId}${s.chamber ? ` (${s.chamber === "senate" ? "Senate" : "House"})` : ""}`, value: s.referred, note: `· ${s.reported} reported` }))} />
        <p className="meta">From the {d.fullRecords} bills {BRAND.name} holds with full action records (voted and recently active bills), not every bill. Chairs are listed under Key players.</p>
        <ListEnd shown={stall.shown} total={d.listTotals?.stall} top={stall.shown === DASH_CAPS.stall} /></div>}

      <div className="fed-section"><h2>By issue</h2>
        <table className="chart history" tabIndex={0}><caption>Bills sorted into each issue: filed, passed at least one chamber, became law</caption><thead><tr><th scope="col">Issue</th><th scope="col">Filed</th><th scope="col">Advanced</th><th scope="col">Enacted</th></tr></thead>
          <tbody>{byIssue.rows.map(b => <tr key={b.slug}><th scope="row"><Link href={`/issues/${b.slug}`}>{b.name}</Link></th><td>{b.filed}</td><td>{b.advanced}</td><td>{b.enacted}</td></tr>)}</tbody></table>
        <p className="meta">Covers the bills {BRAND.name} has sorted into issues (from Congress.gov policy areas and subjects), not every bill.</p>
        <ListEnd shown={byIssue.shown} total={byIssue.total} what="issues" /></div>

      <CaughtUp updated={when(d.generatedAt)} updatedAt={d.generatedAt} previousVisit={lastVisit} />
    </section>
  </PublicShell>;
}
