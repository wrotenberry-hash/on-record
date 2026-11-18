import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { AnalysisBadge, OfficialBadge, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { texasDashboard, type TexasDashboard } from "@/lib/texas/dashboard";
import { ROLE_NOTE } from "@/lib/federal/dashboard-rules";
import { FunnelChart, RowBars, SeatBar } from "@/components/charts/charts";
import { BRAND, brandTitle } from "@/lib/brand";
import type { FigureCell } from "@/lib/texas/history-parse";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Texas dashboard"), robots: { index: false, follow: false } };

const TAP = "inline-flex min-h-11 items-center underline underline-offset-2";
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
const num = (n: number) => n.toLocaleString("en-US");
const COUNTED = "Counted by the site from a data feed, not copied from a government page";

/** A history figure: the number, or the plain reason it is missing. */
function Cell({ c }: { c: FigureCell }) {
  if (c.n === null) return <span className="meta">Not loaded</span>;
  return <>{num(c.n)}{c.basis === "counted" ? <span className="meta"> (counted)</span> : null}</>;
}

/** Where each figure of a session came from, one line per source. */
function Sources({ cells }: { cells: FigureCell[] }) {
  const by = new Map<string, { url: string; readAt: number; basis: string; labels: string[] }>();
  for (const c of cells) if (c.source && c.url && c.readAt && c.basis !== "sum") { const e = by.get(c.source) ?? { url: c.url, readAt: c.readAt, basis: c.basis ?? "", labels: [] }; e.labels.push(c.label); by.set(c.source, e); }
  return <ul className="analysis-list">
    {[...by].map(([source, e]) => <li key={source}>{e.basis === "counted" ? <AnalysisBadge title={COUNTED} /> : <OfficialBadge />} {e.labels.join("; ")}. {e.basis === "counted" ? source : <a className={TAP} href={e.url} {...ext}>{source}</a>} <span className="meta">read {shortDate(e.readAt)}</span></li>)}
  </ul>;
}

function History({ d }: { d: TexasDashboard }) {
  const any = d.history.some(h => h.anyLoaded);
  const col = (h: TexasDashboard["history"][number], k: string) => h.cells.find(c => c.key === k)!;
  return <div className="fed-section"><h2>Compared with earlier sessions <OfficialBadge title="Figures from Texas Legislature Online unless marked counted" /></h2>
    {!any && <p className="lead-stat" role="status">The figures for earlier sessions are not loaded yet. They are read from the official statistics on Texas Legislature Online by the scheduled update; nothing below is a zero.</p>}
    <table className="chart history" tabIndex={0}><caption>House and Senate bills in each session, 2021 to 2027</caption>
      <thead><tr><th scope="col">Session</th><th scope="col">Filed</th><th scope="col">Sent to the Governor</th><th scope="col">Became law</th><th scope="col">Vetoed</th></tr></thead>
      <tbody>{d.history.map(h => <tr key={h.id}><th scope="row"><b>{h.name.replace(" Legislature,", ",")}</b><br /><span className="meta">{h.regular ? h.year : `Special session · ${h.year}`}{h.isFocus ? " · this session" : ""}</span></th>
        <td><Cell c={col(h, "filed")} /></td><td><Cell c={col(h, "passedBoth")} /></td><td><Cell c={col(h, "becameLaw")} /></td><td><Cell c={col(h, "vetoed")} /></td></tr>)}</tbody></table>
    <p className="meta">Bills only: House bills and Senate bills, the measures that can become law. A regular session meets every two years; a called (special) session is one the Governor calls, on the subjects the Governor names. “Sent to the Governor” means the bill passed both the House and the Senate. “Became law” adds the bills the Governor signed and the bills that became law without a signature. “Not loaded” means the figure has not been read yet, not that it is zero.</p>
    <details className="method"><summary className="py-3">Every figure, with its source and the date it was read</summary>
      {d.history.map(h => <div key={h.id} className="mt-3"><h3 className="text-base font-bold">{h.name} <span className="meta">({h.kind.toLowerCase()}, {h.year})</span></h3>
        {h.anyLoaded ? <ul className="analysis-list">{h.cells.map(c => <li key={c.key}>{c.label}: {c.n === null ? <span className="meta">{c.missing}</span> : <><b>{num(c.n)}</b>{c.basis === "counted" ? " (counted)" : ""}{c.basis === "sum" ? " (signed plus unsigned)" : ""}</>}</li>)}</ul>
          : <p className="meta">Not loaded yet.</p>}
        {h.gap !== null && h.gap !== 0 && <p className="meta">The official pages do not add up for this session yet: {num(Math.abs(h.gap))} {h.gap > 0 ? "bills sent to the Governor are on none of the signed, unsigned or vetoed lists (the Governor may still be acting on them)" : "more bills are on the Governor's lists than passed both chambers"}. The official record is Texas Legislature Online.</p>}
        {h.anyLoaded && <Sources cells={h.cells} />}
        {h.onFile && <p className="meta">On file here from Open States (read {shortDate(h.onFile.readAt)}): {num(h.onFile.filed)} bills, {num(h.onFile.passedHouse)} passed the House, {num(h.onFile.passedSenate)} passed the Senate, {num(h.votes.total)} recorded {h.votes.total === 1 ? "vote" : "votes"}{h.votes.proceduralPct !== null ? ` (${h.votes.proceduralPct}% on procedure)` : ""}.</p>}
      </div>)}
      {d.historyRun && <p className="meta">Last read of the official pages: {shortDate(d.historyRun.at)}, {d.historyRun.requests} requests{d.historyRun.stoppedBy ? `; stopped: ${d.historyRun.stoppedBy}` : ""}{d.historyRun.left ? `; ${d.historyRun.left} pages still to read` : ""}.</p>}
    </details></div>;
}

export default async function TexasDashboardPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/dashboard" access={access} page="/dashboard/texas">{null}</PublicShell>;
  const d = await texasDashboard().catch(() => null);
  if (!d) return <PublicShell current="/dashboard" access={access} page="/dashboard/texas"><section className="fed-page"><h1>Texas dashboard</h1><p className="meta">The Texas figures could not be read right now. Check back after the next scheduled update.</p></section></PublicShell>;
  const c = d.current, R = d.rules, has = c.all.reach.filed > 0;
  return <PublicShell current="/dashboard" access={access} page="/dashboard/texas">
    <section className="fed-page">
      <div className="eyebrow">TEXAS DASHBOARD <OfficialBadge /></div>
      <h1>Texas Legislature at a glance</h1>
      <p className="as-of">Page built {new Date(d.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })} Austin time · {d.inSession ? `${d.session.name} in session` : d.upcoming ? `${d.upcoming.name} convenes ${shortDate(d.upcoming.start)}` : "Not in session"} · <Link className={TAP} href="/dashboard">Congress dashboard</Link></p>

      <div className="fed-section"><h2>How the Texas Legislature meets <OfficialBadge title="Quoted from the Texas Constitution and Government Code" /></h2>
        <ul className="analysis-list">
          <li>The Legislature meets in a regular session once every two years, starting on the second Tuesday in January of odd-numbered years, and a regular session can last at most 140 days. <a className={TAP} href={R.convene.sourceUrl} {...ext}>Source: {R.convene.cite}</a> · <a className={TAP} href={R.length.sourceUrl} {...ext}>{R.length.cite}</a></li>
          <li>The Governor can call the Legislature back for a special session, which the official record calls a “called session”. It can last at most 30 days, and lawmakers can pass laws only on the subjects the Governor gives them. <a className={TAP} href={R.specialLength.sourceUrl} {...ext}>Source: {R.specialLength.cite}</a> · <a className={TAP} href={R.specialCall.sourceUrl} {...ext}>{R.specialCall.cite}</a></li>
          <li>Texas Legislature Online (capitol.texas.gov) is the official record. Where a figure here differs from it, the official record is right.</li>
        </ul>
        <p className="meta">Rules read on {shortDate(R.length.readOn)} from the official text printed on Texas Legislature Online.</p></div>

      <div className="fed-section"><h2>The bill funnel: {c.name}</h2>
        {has ? <><p className="lead-stat">{c.takeaway}</p>
          <div className="dash-grid"><FunnelChart f={c.all} caption="All House and Senate bills on file" /><FunnelChart f={c.house} caption="House bills" /><FunnelChart f={c.senate} caption="Senate bills" /></div>
          <table className="chart history" tabIndex={0}><caption>How far bills on file have got, by chamber</caption><tbody>
            <tr><th scope="row">Passed the House</th><td>{num(c.passage.passedHouse)}</td></tr><tr><th scope="row">Passed the Senate</th><td>{num(c.passage.passedSenate)}</td></tr>
            <tr><th scope="row">Passed both, sent to the Governor</th><td>{num(c.passage.passedBoth)}</td></tr><tr><th scope="row">Waiting for the Governor</th><td>{num(c.passage.awaitingGovernor)}</td></tr>
            <tr><th scope="row">Became law</th><td>{num(c.passage.law)}</td></tr><tr><th scope="row">Vetoed by the Governor</th><td>{num(c.passage.vetoed)}</td></tr></tbody></table></>
          : <p className="lead-stat" role="status">No bills from this session are on file here yet, so the funnel is not shown.{c.officialFiled.n !== null ? ` Texas Legislature Online counts ${num(c.officialFiled.n)} House and Senate bills filed so far.` : ""}</p>}
        <details className="method"><summary className="py-3">How this is counted</summary><p className="meta">Bills on file come from Open States{c.readAt ? `, last read ${shortDate(c.readAt)}` : ""}. Each bill&apos;s furthest step is read from its official actions, and later steps imply earlier ones (a bill sent to the Governor passed both chambers). A bill that failed a vote is not counted as passing anywhere, because the record kept for it does not say where it failed. Joint resolutions propose changes to the Texas Constitution and go to the voters, not the Governor, so they are left out, as are simple and concurrent resolutions.
          {" "}Check against the official count{c.officialFiled.readAt ? ` (Texas Legislature Online, read ${shortDate(c.officialFiled.readAt)})` : ""}: {c.reconcile.line}</p></details></div>

      <History d={d} />

      <div className="fed-section"><h2>Who controls the Legislature</h2>
        {d.seats.length ? <><SeatBar chamber="Texas House" seats={d.seats.filter(s => s.chamber === "lower")} total={150} /><SeatBar chamber="Texas Senate" seats={d.seats.filter(s => s.chamber === "upper")} total={31} /></>
          : <p className="meta" role="status">The member list is not loaded yet, so seats by party are not shown.</p>}
        <ul className="result-list">{d.officers.map(o => <li key={o.title}><span><b>{o.title}</b>: {o.name} ({o.party})</span><span className="meta">{ROLE_NOTE[o.title]}{o.title === "Governor" ? ` Vetoes this session: ${c.officialVetoed.n !== null ? `${num(c.officialVetoed.n)} (Texas Legislature Online, read ${shortDate(c.officialVetoed.readAt)})` : has ? `${num(c.passage.vetoed)} among the bills on file` : "not loaded yet"}.` : ""} As of the {o.asOf}; <a className="tap" href={o.source} {...ext}>source</a>.</span></li>)}</ul>
        <p className="meta">Seats: current members from Open States{d.seatsReadAt ? `, read ${shortDate(d.seatsReadAt)}` : ""}; empty seats are the gap to 150 and 31. The Lieutenant Governor is elected statewide and presides over the Senate; the Speaker is elected by House members when each regular session opens.</p></div>

      <div className="fed-section"><h2>Key players <OfficialBadge /></h2>
        <p className="meta">Counts, not grades. Same method for every member. From the bills and recorded votes on file for the {c.name}.</p>
        {d.advanced.length ? <RowBars caption="Most bills authored that passed at least one chamber" unit="bills" rows={d.advanced.map(a => ({ label: a.personId ? <Link className={TAP} href={`/texas/members/${encodeURIComponent(a.personId)}`}>{a.name}</Link> : a.name, value: a.n }))} /> : <p className="meta">No bill on file for this session has passed a chamber yet.</p>}
        {d.againstParty.length > 0 ? <RowBars caption="Most votes against their own party's majority (recorded votes on file)" unit="votes" rows={d.againstParty.map(a => ({ label: <Link className={TAP} href={`/texas/members/${encodeURIComponent(a.id)}`}>{a.name}</Link>, value: a.value, note: `of ${a.counted}` }))} />
          : <p className="meta">No recorded vote with each member listed is on file for this session yet. Many Texas votes are voice votes, which do not list how each member voted.</p>}
        {d.missed.length > 0 && <RowBars caption="Most missed votes (recorded votes on file)" unit="missed" rows={d.missed.map(a => ({ label: <Link className={TAP} href={`/texas/members/${encodeURIComponent(a.id)}`}>{a.name}</Link>, value: a.value, note: `of ${a.total}` }))} />}
        {d.rollStats.total > 0 && <p className="meta">{num(d.rollStats.total)} recorded votes on file{d.rollStats.proceduralPct !== null ? `; ${d.rollStats.proceduralPct}% on procedure` : ""}{d.rollStats.partyLinePct !== null ? `; ${d.rollStats.partyLinePct}% party-line (most voting Democrats and most voting Republicans on opposite sides), of the ${num(d.rollStats.withMemberVotes)} that list each member` : ""}.</p>}
        {d.chairs.length > 0 ? <details className="method"><summary className="py-3">Committee chairs ({d.chairs.length})</summary><ul className="analysis-list">{d.chairs.map((x, i) => <li key={i}>{x.committee}: {x.personId ? <Link className={TAP} href={`/texas/members/${encodeURIComponent(x.personId)}`}>{x.name}</Link> : x.name} ({x.role})</li>)}</ul>
          <p className="meta">From Open States{d.committeesReadAt ? `, read ${shortDate(d.committeesReadAt)}` : ""}. In Texas the Speaker names House committee chairs and the Lieutenant Governor names Senate committee chairs.</p></details>
          : <p className="meta">Committee chairs are not loaded yet.</p>}</div>

      <div className="fed-section"><h2>Where bills stall</h2>
        {d.stall.length ? <><RowBars caption="Committees by bills referred, with how many they reported" unit="referred" rows={d.stall.map(s => ({ label: s.name, value: s.referred, note: `· ${s.reported} reported` }))} />
          <p className="meta">From the {num(d.billsWithActions)} bills {BRAND.name} holds with their actions for this session (Open States), not every bill filed. A bill “reported” was sent on by the committee.</p></>
          : <p className="meta" role="status">No committee referrals are on file for this session yet.</p>}</div>

      <div className="fed-section"><h2>By issue</h2>
        {d.withSubjects ? <><table className="chart history" tabIndex={0}><caption>Bills sorted into each issue: filed, passed at least one chamber, became law</caption><thead><tr><th scope="col">Issue</th><th scope="col">Filed</th><th scope="col">Advanced</th><th scope="col">Enacted</th></tr></thead>
          <tbody>{d.byIssue.map(b => <tr key={b.slug}><th scope="row">{b.name}</th><td>{b.filed}</td><td>{b.advanced}</td><td>{b.enacted}</td></tr>)}</tbody></table>
          <p className="meta">Covers the {num(d.withSubjects)} bills on file that Open States lists subjects for, matched to issues by their words; not every bill.</p></>
          : <p className="meta" role="status">No bill on file for this session has subjects listed yet, so bills by issue are not shown.</p>}</div>
    </section>
  </PublicShell>;
}
