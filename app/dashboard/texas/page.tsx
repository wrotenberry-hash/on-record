import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { texasDashboard } from "@/lib/texas/dashboard";
import { ROLE_NOTE } from "@/lib/federal/dashboard-rules";
import { FunnelChart, RowBars, SeatBar } from "@/components/charts/charts";
import { brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Texas dashboard"), robots: { index: false, follow: false } };

export default async function TexasDashboardPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/dashboard" access={access} page="/dashboard/texas">{null}</PublicShell>;
  const d = await texasDashboard().catch(() => null);
  if (!d) return <PublicShell current="/dashboard" access={access} page="/dashboard/texas"><section className="fed-page"><h1>Texas dashboard</h1><p className="meta">Not available yet.</p></section></PublicShell>;
  const focus = d.funnels.find(f => f.id === d.focus) ?? d.funnels[0];
  return <PublicShell current="/dashboard" access={access} page="/dashboard/texas">
    <section className="fed-page">
      <div className="eyebrow">TEXAS DASHBOARD <OfficialBadge /></div>
      <h1>Texas Legislature at a glance</h1>
      <p className="as-of">Data as of {new Date(d.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })} CT · {d.inSession ? `${d.session.name} in session` : d.upcoming ? `${d.upcoming.name} convenes ${shortDate(d.upcoming.start)}` : "Not in session"} · <Link href="/dashboard">Congress</Link></p>
      <div className="fed-section"><h2>The bill funnel: {focus.name}</h2>
        <p className="lead-stat">{focus.takeaway}</p>
        {focus.all.reach.filed > 0 ? <div className="dash-grid"><FunnelChart f={focus.all} caption="All bills" committeeKnown={focus.committeeKnown} /><FunnelChart f={focus.house} caption="House bills" /><FunnelChart f={focus.senate} caption="Senate bills" /></div>
          : <p className="meta">No bills on file for this session yet{focus.source ? "" : " (Texas data loads once the Open States key is set)"}.</p>}</div>
      <div className="fed-section"><h2>Earlier sessions</h2>
        <table className="chart history" tabIndex={0}><caption>Regular and called sessions</caption><thead><tr><th scope="col">Session</th><th scope="col">Filed</th><th scope="col">Passed a chamber</th><th scope="col">Became law</th><th scope="col">Vetoed</th><th scope="col">Source</th></tr></thead>
          <tbody>{d.funnels.map(f => <tr key={f.id}><th scope="row">{f.name}</th><td>{f.all.reach.filed || "–"}</td><td>{f.all.reach.filed ? `${f.all.pct.passed_one}%` : "–"}</td><td>{f.all.reach.law || "–"}</td><td>{f.all.reach.vetoed || "–"}</td><td>{f.source ?? "not loaded"}</td></tr>)}</tbody></table>
        <p className="meta">Earlier sessions come from LegiScan&apos;s session lists (one request per session) once its key is set; the current session from Open States. This session: {d.rollStats.total} recorded votes on file{d.rollStats.proceduralPct !== null ? `, ${d.rollStats.proceduralPct}% procedural` : ""}{d.rollStats.partyLinePct !== null ? `, ${d.rollStats.partyLinePct}% party-line` : ""}.</p></div>
      <div className="fed-section"><h2>Who controls the Legislature</h2>
        <SeatBar chamber="Texas House" seats={d.seats.filter(s => s.chamber === "lower")} total={150} />
        <SeatBar chamber="Texas Senate" seats={d.seats.filter(s => s.chamber === "upper")} total={31} />
        <ul className="result-list">{d.officers.map(o => <li key={o.title}><span><b>{o.title}</b>: {o.name} ({o.party})</span><span className="meta">{ROLE_NOTE[o.title]} As of the {o.asOf}; <a href={o.source} target="_blank" rel="noopener noreferrer">source</a>.</span></li>)}</ul>
        <p className="meta">The Lieutenant Governor presides over the Texas Senate; the Speaker is elected by House members when each regular session convenes.</p></div>
      <div className="fed-section"><h2>Key players <OfficialBadge /></h2>
        {d.advanced.length ? <RowBars caption="Most bills authored that passed at least one chamber" unit="bills" rows={d.advanced.map(a => ({ label: a.personId ? <Link href={`/texas/members/${encodeURIComponent(a.personId)}`}>{a.name}</Link> : a.name, value: a.n }))} /> : <p className="meta">No bill has passed a chamber in this session yet.</p>}
        {d.againstParty.length > 0 && <RowBars caption="Most votes against their own party's majority" unit="votes" rows={d.againstParty.map(a => ({ label: <Link href={`/texas/members/${encodeURIComponent(a.id)}`}>{a.name}</Link>, value: a.value }))} />}
        {d.missed.length > 0 && <RowBars caption="Most missed votes" unit="missed" rows={d.missed.map(a => ({ label: <Link href={`/texas/members/${encodeURIComponent(a.id)}`}>{a.name}</Link>, value: a.value, note: `of ${a.total}` }))} />}
        {d.chairs.length > 0 && <details className="method"><summary>Committee chairs ({d.chairs.length})</summary><ul className="analysis-list">{d.chairs.map((c, i) => <li key={i}>{c.committee}: {c.personId ? <Link href={`/texas/members/${encodeURIComponent(c.personId)}`}>{c.name}</Link> : c.name} ({c.role})</li>)}</ul></details>}</div>
      {d.stall.length > 0 && <div className="fed-section"><h2>Where bills stall</h2><RowBars caption="Committees by bills referred, with how many they reported" unit="referred" rows={d.stall.map(s => ({ label: s.name, value: s.referred, note: `· ${s.reported} reported` }))} /></div>}
      <div className="fed-section"><h2>By issue</h2><table className="chart history" tabIndex={0}><caption>Bills by issue (matched from Open States subjects)</caption><thead><tr><th scope="col">Issue</th><th scope="col">Filed</th><th scope="col">Advanced</th><th scope="col">Enacted</th></tr></thead>
        <tbody>{d.byIssue.map(b => <tr key={b.slug}><th scope="row">{b.name}</th><td>{b.filed}</td><td>{b.advanced}</td><td>{b.enacted}</td></tr>)}</tbody></table></div>
    </section>
  </PublicShell>;
}
