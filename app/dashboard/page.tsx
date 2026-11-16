import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { congressDashboard } from "@/lib/federal/dashboard";
import { ROLE_NOTE } from "@/lib/federal/dashboard-rules";
import { FunnelChart, RowBars, SeatBar } from "@/components/charts/charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Congress dashboard · On Record", robots: { index: false, follow: false } };
const PRESIDENT = { name: "Donald J. Trump", party: "Republican", since: "2025-01-20", source: "https://www.whitehouse.gov/" };

/** Congress at a glance: the bill funnel, history, control, key players, where bills stall, and issues. Official data; method under each figure. */
export default async function DashboardPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/dashboard" access={access} page="/dashboard">{null}</PublicShell>;
  const d = await congressDashboard().catch(() => null);
  if (!d) return <PublicShell current="/dashboard" access={access} page="/dashboard"><section className="fed-page"><h1>Congress dashboard</h1><p className="meta">The figures are computed by the next scheduled update (twice a day). Check back after it runs.</p></section></PublicShell>;
  const cur = d.funnels[0], hist = d.funnels.filter(f => f.all.reach.filed > 0);
  return <PublicShell current="/dashboard" access={access} page="/dashboard">
    <section className="fed-page">
      <div className="eyebrow">CONGRESS DASHBOARD <OfficialBadge /></div>
      <h1>{d.current}th Congress at a glance</h1>
      <p className="as-of">Data as of {new Date(d.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET · <Link href="/dashboard/texas">Texas Legislature</Link></p>

      <div className="fed-section"><h2>The bill funnel <Link className="src-link" href="/share/card?t=dash&kind=funnel">Share</Link></h2>
        <p className="lead-stat">{cur.takeaway}</p>
        <div className="dash-grid"><FunnelChart f={cur.all} caption="All bills and joint resolutions" /><FunnelChart f={cur.house} caption="Started in the House" /><FunnelChart f={cur.senate} caption="Started in the Senate" /></div>
        <details className="method"><summary>How this is counted</summary><p className="meta">Every House and Senate bill and joint resolution of the {d.current}th Congress from the Congress.gov bill list ({cur.all.reach.filed.toLocaleString("en-US")} so far). Each bill&apos;s furthest step is read from its latest official action, and later steps imply earlier ones (a bill received in the Senate passed the House). Simple and concurrent resolutions, which cannot become law, are left out.
          {d.reconcile && <> Check against Congress.gov&apos;s own totals ({shortDate(d.reconcile.at)}): {d.reconcile.indexedBills.toLocaleString("en-US")} of {d.reconcile.officialBills?.toLocaleString("en-US") ?? "?"} measures listed{d.reconcile.billsMatch ? " (complete)" : " (list still loading)"}; {d.reconcile.indexedLaws} of {d.reconcile.officialLaws ?? "?"} public laws{d.reconcile.lawsMatch ? " (matches)" : ""}.</>}</p></details></div>

      {hist.length > 1 && <div className="fed-section"><h2>Compared with earlier Congresses</h2>
        <table className="chart history" tabIndex={0}><caption>Bills and joint resolutions, roll calls, procedural and party-line shares</caption><thead><tr><th scope="col">Congress</th><th scope="col">Filed</th><th scope="col">Passed a chamber</th><th scope="col">Became law</th><th scope="col">Roll calls on file</th><th scope="col">Procedural</th><th scope="col">Party-line</th></tr></thead>
          <tbody>{d.funnels.map((f, i) => { const r = d.rollStats[i]; return <tr key={f.congress}><th scope="row">{f.congress}th</th><td>{f.all.reach.filed.toLocaleString("en-US") || "loading"}</td><td>{f.all.pct.passed_one}%</td><td>{f.all.reach.law.toLocaleString("en-US")}</td>
            <td>{r.total || "loading"}</td><td>{r.proceduralPct ?? "–"}{r.proceduralPct !== null ? "%" : ""}</td><td>{r.partyLinePct ?? "–"}{r.partyLinePct !== null ? "%" : ""}</td></tr>; })}</tbody></table>
        <p className="meta">Roll calls: the votes On Record holds; earlier Congresses fill in as the backfill runs. Party-line: most voting Democrats and most voting Republicans on opposite sides. Procedural: cloture, motions to proceed, table, recommit and similar, and House rules.</p></div>}

      <div className="fed-section"><h2>Who controls Congress <Link className="src-link" href="/share/card?t=dash&kind=control">Share</Link></h2>
        <SeatBar chamber="House" seats={d.seats.filter(s => s.chamber === "house")} total={435} />
        <SeatBar chamber="Senate" seats={d.seats.filter(s => s.chamber === "senate")} total={100} />
        <ul className="result-list">
          <li><b>President: {PRESIDENT.name}</b> ({PRESIDENT.party}) since {shortDate(PRESIDENT.since)}<span className="meta">{ROLE_NOTE.President} Vetoes this Congress: {d.vetoes}.</span></li>
          {d.leaders.map(l => <li key={`${l.politicianId}-${l.title}`}><span><b>{l.title}</b> ({l.chamber === "senate" ? "Senate" : "House"}): <Link href={`/politicians/${l.politicianId}`}>{l.name}</Link></span>{ROLE_NOTE[l.title.replace(/^(House|Senate) /, "")] && <span className="meta">{ROLE_NOTE[l.title.replace(/^(House|Senate) /, "")]}</span>}</li>)}
        </ul>
        {d.changes.length > 0 && <p className="meta">Recent leadership changes: {d.changes.map(c => `${c.title}: ${c.fromName ?? "vacant"} → ${c.toName} (${shortDate(c.at)})`).join("; ")}.</p>}
        <p className="meta">Seats from congress-legislators (current members; vacancies are the gap to 435 and 100). Leaders from the same file, checked daily.</p></div>

      <div className="fed-section"><h2>Key players <OfficialBadge />{d.leaders.length > 0 && <> <Link className="src-link" href="/share/card?t=dash&kind=players">Share</Link></>}</h2>
        <p className="meta">Counts, not grades. Same method for every member.</p>
        {d.advanced.length > 0 && <RowBars caption="Most bills sponsored that passed at least one chamber" unit="bills" rows={d.advanced.map(a => ({ label: <Link href={`/politicians/${a.id}`}>{a.name} ({a.party.slice(0, 1)}-{a.state})</Link>, value: a.n }))} />}
        {d.againstParty.length > 0 && <RowBars caption="Most votes against their own party's majority (votes on file)" unit="votes" rows={d.againstParty.map(a => ({ label: <Link href={`/politicians/${a.id}`}>{a.name} ({a.party.slice(0, 1)}-{a.state})</Link>, value: a.value, note: `of ${a.counted}` }))} />}
        {d.missed.length > 0 && <RowBars caption="Most missed votes (votes on file)" unit="missed" rows={d.missed.map(a => ({ label: <Link href={`/politicians/${a.id}`}>{a.name} ({a.party.slice(0, 1)}-{a.state})</Link>, value: a.value, note: `of ${a.total}` }))} />}
        {d.chairs.length > 0 && <details className="method"><summary>Committee chairs and ranking members ({d.chairs.length})</summary><ul className="analysis-list">{d.chairs.map(c => <li key={`${c.committeeId}-${c.politicianId}`}>{c.committee}: <Link href={`/politicians/${c.politicianId}`}>{c.name ?? c.politicianId}</Link> ({c.title})</li>)}</ul></details>}</div>

      {d.stall.length > 0 && <div className="fed-section"><h2>Where bills stall</h2>
        <RowBars caption="Committees by bills referred, with how many they reported" unit="referred" rows={d.stall.map(s => ({ label: `${s.name ?? s.committeeId}${s.chamber ? ` (${s.chamber === "senate" ? "Senate" : "House"})` : ""}`, value: s.referred, note: `· ${s.reported} reported` }))} />
        <p className="meta">From the {d.fullRecords} bills On Record holds with full action records (voted and recently active bills), not every bill. Chairs are listed under Key players.</p></div>}

      <div className="fed-section"><h2>By issue</h2>
        <table className="chart history" tabIndex={0}><caption>Bills sorted into each issue: filed, passed at least one chamber, became law</caption><thead><tr><th scope="col">Issue</th><th scope="col">Filed</th><th scope="col">Advanced</th><th scope="col">Enacted</th></tr></thead>
          <tbody>{d.byIssue.map(b => <tr key={b.slug}><th scope="row"><Link href={`/issues/${b.slug}`}>{b.name}</Link></th><td>{b.filed}</td><td>{b.advanced}</td><td>{b.enacted}</td></tr>)}</tbody></table>
        <p className="meta">Covers the bills On Record has sorted into issues (from Congress.gov policy areas and subjects), not every bill.</p></div>
    </section>
  </PublicShell>;
}
