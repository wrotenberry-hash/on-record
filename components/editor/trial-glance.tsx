import { trialAnalyticsNow } from "@/lib/trial-analytics-data";
import { errorsReport } from "@/lib/error-events";
import { uptimeNow } from "@/lib/uptime-data";

const pct = (v: number | null) => (v === null ? "" : ` (${v}%)`);
const row = (k: string, a: React.ReactNode, b: React.ReactNode) => <tr><th scope="row">{k}</th><td>{a}</td><td>{b}</td></tr>;
const head = <thead><tr><th scope="col">What</th><th scope="col">Last 7 days</th><th scope="col">Last 28 days</th></tr></thead>;

/**
 * Editor → Metrics, "Trial at a glance": the numbers the owner asked to watch
 * during the trial. Counts only, from the daily counters and existing tables
 * (lib/trial-analytics.ts); no reader, page or bill is identified. Each block
 * has a plain label and says so when there is nothing to show yet.
 */
export async function TrialGlance() {
  const a = await trialAnalyticsNow().catch(() => null);
  if (!a) return <section className="fed-section" id="trial"><h2>Trial at a glance</h2><p className="empty-note">The trial numbers could not be loaded. Reload in a minute.</p></section>;
  const w = a.last7d, m = a.last28d, r = a.weeklyReturn, f = a.followsNow;
  const bands: Array<[keyof typeof w.firstAnswer.bands, string]> = [["under_60", "Under 1 minute"], ["60_120", "1 to 2 minutes"], ["120_300", "2 to 5 minutes"], ["over_300", "Over 5 minutes"]];
  return <section className="fed-section" id="trial">
    <h2>Trial at a glance</h2>
    <p className="meta">Trial readers only where the counter says who it was (your own visits as editor are left out). A dash of nothing means nothing has happened yet, not that something is broken.</p>

    <h3 className="subhead">Getting started: how many finish</h3>
    {m.onboarding.started ? <table className="chart history" tabIndex={0}>{head}<tbody>
      {row("Started (opened the ZIP step)", w.onboarding.started, m.onboarding.started)}
      {row("Gave a ZIP", w.onboarding.gaveZip, m.onboarding.gaveZip)}
      {row("Finished", `${w.onboarding.completed}${pct(w.onboarding.completionPct)}`, `${m.onboarding.completed}${pct(m.onboarding.completionPct)}`)}
    </tbody></table> : <p className="empty-note">No trial reader has started yet.</p>}

    <h3 className="subhead">Time to the first weigh-in</h3>
    {m.flow.landing || m.firstAnswer.timed ? <>
      <table className="chart history" tabIndex={0}>{head}<tbody>
        {row("Opened the first page", w.flow.landing, m.flow.landing)}
        {row("Gave a ZIP", `${w.flow.zip}${pct(w.flow.zipPctOfLanding)}`, `${m.flow.zip}${pct(m.flow.zipPctOfLanding)}`)}
        {row("Added a street address", w.flow.address, m.flow.address)}
        {row("Weighed in on something", `${w.flow.firstAnswer}${pct(w.flow.firstAnswerPctOfLanding)}`, `${m.flow.firstAnswer}${pct(m.flow.firstAnswerPctOfLanding)}`)}
        {bands.map(([k, label]) => <tr key={k}><th scope="row">First answer: {label.toLowerCase()}</th><td>{w.firstAnswer.bands[k]}</td><td>{m.firstAnswer.bands[k]}</td></tr>)}
        {row("Share answering within 60 seconds", w.firstAnswer.within60sPct === null ? "no first answers yet" : `${w.firstAnswer.within60sPct}% of ${w.firstAnswer.timed}`, m.firstAnswer.within60sPct === null ? "no first answers yet" : `${m.firstAnswer.within60sPct}% of ${m.firstAnswer.timed}`)}
      </tbody></table>
      <p className="meta">Percentages are of readers who opened the first page. The goal is a first answer within 60 seconds.</p></>
      : <p className="empty-note">No first visits timed yet. This fills in as readers come through the first-visit flow.</p>}

    <h3 className="subhead">Coming back each week</h3>
    {r.activeReaders || r.invitesActive ? <table className="chart history" tabIndex={0}><tbody>
      <tr><th scope="row">Readers seen in the last 7 days</th><td>{r.activeReaders}</td></tr>
      <tr><th scope="row">…who had visited before</th><td>{r.returningReaders}{pct(r.returningPct)}</td></tr>
      <tr><th scope="row">Invite links used in the last 7 days</th><td>{r.invitesActive} of {r.invitesUsed} ever used ({r.invites} made)</td></tr>
      <tr><th scope="row">…also used on an earlier day</th><td>{r.invitesReturning}{pct(r.invitesReturningPct)}</td></tr>
    </tbody></table> : <p className="empty-note">No readers in the last 7 days.</p>}

    <h3 className="subhead">Follows</h3>
    {f.readersFollowingMembers || f.readersFollowingBills || m.follows.members || m.follows.bills || m.follows.issues ? <table className="chart history" tabIndex={0}>{head}<tbody>
      {row("Members followed (new)", w.follows.members, m.follows.members)}
      {row("Bills followed (new)", w.follows.bills, m.follows.bills)}
      {row("Issues followed (new)", w.follows.issues, m.follows.issues)}
      <tr><th scope="row">Readers following a member, now</th><td colSpan={2}>{f.readersFollowingMembers}{f.followsPerFollower !== null ? `, ${f.followsPerFollower} members each on average` : ""}</td></tr>
      <tr><th scope="row">Readers following a bill, now</th><td colSpan={2}>{f.readersFollowingBills} ({f.billFollows} bill follows)</td></tr>
    </tbody></table> : <p className="empty-note">Nobody follows a member, a bill or an issue yet.</p>}

    <h3 className="subhead">Shares</h3>
    {m.shares.total || m.shares.cardsMade ? <table className="chart history" tabIndex={0}>{head}<tbody>
      {row("Share cards made", w.shares.cardsMade, m.shares.cardsMade)}
      {row("Shared with the phone's share sheet", w.shares.shareSheet, m.shares.shareSheet)}
      {row("Images saved", w.shares.downloads, m.shares.downloads)}
      {row("Links or captions copied", w.shares.linkCopies, m.shares.linkCopies)}
      {row("Videos and 5-slide explainers shared", w.shares.videos + w.shares.carousels, m.shares.videos + m.shares.carousels)}
      {row("All shares", w.shares.total, m.shares.total)}
    </tbody></table> : <p className="empty-note">Nothing shared yet.</p>}

    <h3 className="subhead">Contact taps</h3>
    {m.contact.opened || m.contact.taps ? <table className="chart history" tabIndex={0}>{head}<tbody>
      {row("Opened “Contact your legislator”", w.contact.opened, m.contact.opened)}
      {row("Tapped the phone number", w.contact.call, m.contact.call)}
      {row("Opened the official contact form", w.contact.form, m.contact.form)}
      {row("Copied the message", w.contact.copy, m.contact.copy)}
      {row("Opened their email app", w.contact.email, m.contact.email)}
      {row("All contact taps", w.contact.taps, m.contact.taps)}
      {row("…from a bill / a Texas bill / a member page", `${w.contact.byPlace.bill} / ${w.contact.byPlace.tx_bill} / ${w.contact.byPlace.member}`, `${m.contact.byPlace.bill} / ${m.contact.byPlace.tx_bill} / ${m.contact.byPlace.member}`)}
    </tbody></table> : <p className="empty-note">No contact taps yet. This fills in as readers use “Contact your legislator”.</p>}
    <p className="meta">Nothing is ever sent for a reader: a tap opens their own phone, mail app or the official form, and only the tap is counted.</p>

    <h3 className="subhead">Weigh-ins</h3>
    {m.weighIns.total ? <table className="chart history" tabIndex={0}>{head}<tbody>
      {row("Support", w.weighIns.support, m.weighIns.support)}
      {row("Oppose", w.weighIns.oppose, m.weighIns.oppose)}
      {row("Unsure", w.weighIns.unsure, m.weighIns.unsure)}
      {row("All answers", w.weighIns.total, m.weighIns.total)}
    </tbody></table> : <p className="empty-note">No Support, Oppose or Unsure answers yet.</p>}
  </section>;
}

/** Editor → Metrics: the site's own errors in the last 24 hours, and the hours in which the health probe answered. */
export async function SiteHealth() {
  const [e, up] = await Promise.all([errorsReport().catch(() => null), uptimeNow(undefined, 7).catch(() => null)]);
  return <>
    <section className="fed-section" id="errors">
      <h2>Site errors, last 24 hours</h2>
      {!e ? <p className="empty-note">The error list could not be loaded.</p> : <>
        <p className={e.breakage ? "gate gate-closed" : "gate gate-open"} role="status"><b>{e.breakage ? "Real breakage." : "No real breakage."}</b> {e.breakage ? e.reasons.join(" ")
          : e.last24h.errors ? `${e.last24h.errors} error${e.last24h.errors === 1 ? "" : "s"} of ${e.last24h.kinds} kind${e.last24h.kinds === 1 ? "" : "s"}, none repeated enough to count.` : "No errors recorded."}</p>
        {e.top.length ? <table className="chart history" tabIndex={0}><thead><tr><th scope="col">Where</th><th scope="col">What</th><th scope="col">Times</th></tr></thead>
          <tbody>{e.top.map((t, i) => <tr key={i}><th scope="row">{t.route}{t.source === "client" ? " (error page shown)" : ""}</th><td>{t.message}</td><td>{t.n}</td></tr>)}</tbody></table>
          : <p className="empty-note">Nothing went wrong in the last 24 hours.</p>}
        <p className="meta">Flagged on What&apos;s next only for real breakage: the same error 3 times within an hour (or 10 times in a day) on a reader page, any error on sign-in, an invite link, saving an answer or the health probe, or the error page shown 3 times in a day. Stored per day, kind of page and short message; never an address, a cookie or a reader.</p></>}
    </section>
    <section className="fed-section" id="uptime">
      <h2>Uptime</h2>
      {up && up.some(d => d.checks) ? <table className="chart history" tabIndex={0}><thead><tr><th scope="col">Day (UTC)</th><th scope="col">Hours with an answer</th><th scope="col">Checks answered</th><th scope="col">Hours with none</th></tr></thead>
        <tbody>{up.map(d => <tr key={d.day}><th scope="row">{d.day}</th><td>{d.hoursAnswered} of {d.hoursSoFar}</td><td>{d.checks}</td><td>{d.missedHours.length ? (d.missedHours.length > 6 ? `${d.missedHours.length} hours` : d.missedHours.join(", ")) : "none"}</td></tr>)}</tbody></table>
        : <p className="empty-note">No health checks counted yet.</p>}
      <p className="meta">Counts each time the public health probe answered. An outside check (GitHub, every 15 minutes) asks it and sends you GitHub&apos;s failure notice if it does not answer twice in a row; until that check is running, hours with nobody asking show as hours with none.</p>
    </section>
  </>;
}
