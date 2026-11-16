import Link from "next/link";
import { headers } from "next/headers";
import { requireEditorUser } from "@/lib/auth";
import { ALERT_PLAIN, flags, ownerStepDone, standing } from "@/lib/whats-next";
import { OWNER_STEPS, PLAN_NOTE, PLAN_UPDATED, RECOMMENDED, ROUNDS } from "@/lib/whats-next-plan";
import { ownerEmailsEnabled } from "@/lib/monitoring-runtime";
import { runUpdateNow } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "What's next · On Record", robots: { index: false, follow: false } };
const fmt = (v: string | number) => new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

/**
 * Editor → What's next: the same view Claude gives at a check-in, open any time. Live numbers
 * come from the health probe at the moment the page loads; the ranked recommendations and the
 * owner-only steps are written by Claude and dated. Automatic emails are off, so anything the
 * system flags shows here instead.
 */
export default async function WhatsNextPage({ searchParams }: { searchParams: Promise<{ run?: string; at?: string }> }) {
  await requireEditorUser("/editor/next");
  const h = await headers(), host = h.get("x-forwarded-host") ?? h.get("host"), proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const probe = await fetch(`${proto}://${host}/api/automation/health`, { cache: "no-store", signal: AbortSignal.timeout(20_000) }).then(r => r.json()).catch(() => null) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  const now = new Date().toISOString(), sp = await searchParams;
  const fl = probe ? flags(probe) : [], recent = ((probe?.recentAlerts ?? []) as { kind: string; sentAt: string }[]).filter(a => Date.parse(now) - Date.parse(a.sentAt) < 7 * 86400e3 && a.kind !== "DAILY_CASE" && a.kind !== "DAILY_NUDGE").slice(0, 8);
  const steps = OWNER_STEPS.map(s => ({ ...s, done: probe ? ownerStepDone(s, probe) : null }));
  const open = steps.filter(s => s.done !== true), minutes = open.filter(s => s.key !== "threads").reduce((a, s) => a + s.minutes, 0);
  return <>
    <header className="topbar"><Link className="brand" href="/">ON <span>RECORD</span><i/></Link><nav><Link href="/editor">Cases</Link><Link href="/editor/analysis">Bill summaries</Link><Link href="/editor/trial">Trial invites</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>
    <main className="fed-page analysis-admin whats-next">
      <div className="eyebrow">EDITOR · WHAT&apos;S NEXT</div><h1>Where things stand, and what&apos;s next</h1>
      <p className="meta">Live numbers as of {fmt(now)} CT. Recommendations written by Claude, {fmt(PLAN_UPDATED)} CT. {ownerEmailsEnabled() ? "Automatic emails are on." : "Automatic emails are off: this page replaces them."}</p>

      <form action={runUpdateNow} className="run-now" id="run">
        <button>Run the update now</button>
        <span className="meta">{sp.run === "started" ? `Started ${fmt(Number(sp.at) || now)} CT. It takes up to 5 minutes; reload this page after.`
          : sp.run === "recent" ? "An update was started in the last 10 minutes and is still running. Reload in a few minutes."
          : sp.run === "limit" ? "Already run twice in the last hour. Try again later."
          : sp.run === "scheduled" ? "A scheduled update runs within 10 minutes of now (13:00 and 19:00 UTC), so this one was skipped."
          : sp.run === "nosecret" ? "Could not start: the scheduler secret is not set in Vercel."
          : "Same work as the 13:00 and 19:00 UTC runs: official records, Texas, bill summaries. Costs a few cents."}</span>
      </form>

      <h2>Needs you now</h2>
      {!probe ? <p className="gate gate-closed" role="status">The live numbers could not be loaded. Reload in a minute.</p>
        : fl.length ? <ul className="next-flags">{fl.map((f, i) => <li key={i} className={`next-${f.level}`}><b>{f.level === "blocker" ? "Blocking" : f.level === "soon" ? "Soon" : "FYI"}</b> {f.text}{f.href && <> <Link href={f.href}>Open</Link></>}</li>)}</ul>
        : <p className="following-note">Nothing needs you right now.</p>}

      <h2>Where things stand</h2>
      <p><b>Claude&apos;s note, {fmt(PLAN_UPDATED)} CT:</b> {PLAN_NOTE}</p>
      {probe && <ul className="analysis-list">{standing(probe).map((l, i) => <li key={i}>{l}</li>)}</ul>}

      <h2>Recommended next, in order</h2>
      <ol className="analysis-list next-ranked">{RECOMMENDED.map(r => <li key={r.title}><b>{r.title}</b> <span className="next-needs">{r.needs === "you" ? "Only you can do this" : r.needs === "your go-ahead" ? "Waits for your go-ahead" : "In progress"}</span><br />{r.why}</li>)}</ol>
      <p className="meta">Claude starts a major step only after you say go. Tell Claude “status” for a fresh check, or “go” with the number.</p>

      <h2>Only you can do{open.length ? ` (${open.length} open, about ${minutes} minutes without Threads)` : ""}</h2>
      {steps.map(s => <details key={s.key} className="method next-step" open={s.key === "openaiKey" && s.done !== true}>
        <summary>{s.done === true ? "✓ Done: " : ""}{s.title} <span className="meta">· {s.minutes} min{s.done === null ? " · cannot be checked from here" : ""}</span></summary>
        <p className="meta">{s.why}</p><ol className="analysis-list">{s.steps.map((x, i) => <li key={i}>{x}</li>)}</ol><p className="meta">Marked done when {s.doneWhen}.</p></details>)}

      <h2>What the system flagged this week</h2>
      {recent.length ? <ul className="analysis-list">{recent.map((a, i) => <li key={i}>{fmt(a.sentAt)} CT: {ALERT_PLAIN[a.kind] ?? a.kind}</li>)}</ul> : <p className="meta">Nothing flagged in the last 7 days.</p>}

      <h2>Master plan progress</h2>
      <table className="chart history" tabIndex={0}><thead><tr><th scope="col">Round</th><th scope="col">What</th><th scope="col">State</th></tr></thead>
        <tbody>{ROUNDS.map(r => <tr key={r.round}><th scope="row">{r.round}</th><td>{r.what}</td><td>{r.state}</td></tr>)}</tbody></table>
      <p className="meta">“Waiting on data” means the feature is live and fills in as scheduled runs, keys or real summaries arrive. <Link href="/editor/metrics">Retention and sharing</Link> · <Link href="/editor/quality">Summary quality</Link> · <a href="/api/automation/health">Health probe</a></p>
    </main></>;
}
