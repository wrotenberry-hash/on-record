import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { briefingArchive, buildBriefing, isSubscribed, latestBriefing, type Briefing, type BriefSection } from "@/lib/briefing";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { toggleBriefingEmail } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Briefing · On Record", robots: { index: false, follow: false } };

function Section({ s }: { s: BriefSection }) {
  const lists = [["Passed", s.passed], ["Failed", s.failed], ["Stopped by a procedural vote", s.blocked], ["Coming next", s.coming]] as const;
  const any = lists.some(([, l]) => l.length);
  return <div className="fed-section"><h2>{s.name} <OfficialBadge /></h2><p className="meta">{s.inSession ? "In session." : "Not in session."}</p>
    {any ? lists.filter(([, l]) => l.length).map(([h, l]) => <div key={h}><h3 className="subhead">{h}</h3><ul className="result-list">{l.map((i, n) => <li key={n}><Link href={i.href}><span className="bill-tag">{i.label}</span> {i.title}</Link><span className="meta">{shortDate(i.date)} · {i.note}{h === "Coming next" && i.href.includes("#your-view") ? " · Coming up — weigh in now" : ""}</span></li>)}</ul></div>)
      : <p className="meta">Nothing recorded in this period.</p>}</div>;
}

/** A two-minute read for Congress and Texas, from official records only. */
export default async function BriefingPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/briefing" access={access} page="/briefing">{null}</PublicShell>;
  const id = (await searchParams).id ?? null;
  const row = await latestBriefing(id && /^(daily|weekly)-\d{4}-\d{2}-\d{2}$/.test(id) ? id : null).catch(() => null);
  const b: Briefing = (row?.content as Briefing | undefined) ?? await buildBriefing();
  const account = (await currentAccount()) ?? await currentAppUserId().then(u => (u ? accountForAppUser(u) : null));
  const subscribed = account ? await isSubscribed(account.id).catch(() => false) : false;
  const archive = await briefingArchive().catch(() => []);
  return <PublicShell current="/briefing" access={access} page="/briefing">
    <section className="fed-page">
      <div className="eyebrow">{b.kind === "daily" ? "DAILY BRIEFING" : "WEEKLY BRIEFING"}</div>
      <h1>{b.periodLabel}: what happened</h1>
      <p className="meta">A two-minute read built from official records only: votes, floor schedules and hearings. {row ? "" : "This is a live preview; the saved briefing is written each evening."}</p>
      <Section s={b.congress} />
      {b.texas && <Section s={b.texas} />}
      <div className="fed-section">
        {row && <p><a className="secondary-link" href={`/api/cards/briefing?id=${row.id}&format=feed`} download={`on-record-${row.id}.png`}>Save the briefing card</a></p>}
        {account ? <form action={toggleBriefingEmail}><input type="hidden" name="on" value={subscribed ? "0" : "1"} /><button className="follow-btn">{subscribed ? "Stop the briefing email" : "Email me the briefing"}</button></form>
          : <p className="meta"><Link href="/account">Sign in</Link> to get the briefing by email.</p>}
        {archive.length > 1 && <p className="meta">Earlier: {archive.slice(0, 10).map((a, i) => <span key={a.id}>{i ? " · " : ""}<Link href={`/briefing?id=${a.id}`}>{shortDate(a.createdAt)}</Link></span>)}</p>}
      </div>
    </section>
  </PublicShell>;
}
