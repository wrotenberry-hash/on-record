import Link from "next/link";
import { SiteHealth, TrialGlance } from "@/components/editor/trial-glance";
import { requireEditorUser } from "@/lib/auth";
import { retentionCounts } from "@/lib/retention";
import { trialCounts } from "@/lib/trial";
import { shareFunnel } from "@/lib/share";
import { Wordmark } from "@/components/brand/wordmark";

export const dynamic = "force-dynamic";

/** Round D: retention and sharing, aggregate counts only. */
export default async function MetricsPage() {
  await requireEditorUser("/editor/metrics");
  const [r, t, f] = await Promise.all([retentionCounts().catch(() => null), trialCounts().catch(() => null), shareFunnel(7).catch(() => null)]);
  const row = (k: string, v: React.ReactNode) => <tr><th scope="row">{k}</th><td>{v}</td></tr>;
  return <>
    <header className="topbar"><Link className="brand" href="/"><Wordmark /><i/></Link><nav><Link href="/editor">Cases</Link><Link href="/editor/trial">Trial invites</Link><small>PRIVATE CHECKING INSTRUMENT</small></nav></header>
    <main className="fed-page analysis-admin">
      <div className="eyebrow">EDITOR · RETENTION AND SHARING</div><h1>Are readers coming back?</h1>
      <p className="meta">Counts only. No reader, page or bill is identified.</p>
      <TrialGlance />
      <h2>Retention and sharing in detail</h2>
      {r && <table className="chart history" tabIndex={0}><tbody>
        {row("Readers active this week", r.weeklyActiveReaders)}{row("…who had visited before (returning)", r.weeklyReturningReaders)}
        {t && row("Trial invites used this week / on 2+ days", `${t.activeLast7Days} / ${t.usedOnTwoOrMoreDays}`)}
        {row("Onboarding this week: started / finished", `${r.onboarding7d.started} / ${r.onboarding7d.completed}${r.onboarding7d.completionPct !== null ? ` (${r.onboarding7d.completionPct}%)` : ""}`)}
        {row("Readers following members (average follows)", `${r.readersFollowingMembers} (${r.followsPerFollower ?? "–"})`)}
        {row("Readers following bills (bill follows)", `${r.readersFollowingBills} (${r.billFollows})`)}
        {row("Instant vote alerts on", r.alertOptIn.instantVotes)}{row("Readers with push on", r.alertOptIn.pushReaders)}
        {row("Briefing email / weekly email", `${r.alertOptIn.briefingEmail} / ${r.alertOptIn.weeklyEmail}`)}
        {row("Cards made this week", r.shares7d.cardsRendered)}{row("Shared via share sheet / downloaded / links copied", `${r.shares7d.shareSheet} / ${r.shares7d.downloads} / ${r.shares7d.linkCopies}`)}
        {f && row("Share → visit (visits per share, last 7 days)", `${f.shares} shares → ${f.visits} visits${f.visitPerShare !== null ? ` (${f.visitPerShare})` : ""}`)}
        {f && row("Visit → finished onboarding", `${f.signups}${f.signupPct !== null ? ` (${f.signupPct}% of visits)` : ""}`)}
        {f && row("Short links made / all-time visits / sign-ups", `${f.links.total} / ${f.links.visitsAllTime} / ${f.links.signupsAllTime}`)}
      </tbody></table>}
      <SiteHealth />
    </main></>;
}
