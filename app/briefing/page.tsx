import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { briefingArchive, buildBriefing, isSubscribed, latestBriefing, type Briefing, type BriefSection } from "@/lib/briefing";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { toggleBriefingEmail } from "./actions";
import { BRAND, brandTitle } from "@/lib/brand";
import { BRIEFING_INLINE_LIVE } from "@/lib/briefing-inline";
import { inlineBriefing } from "@/lib/briefing-items";
import { InlineItems } from "@/components/briefing/inline-items";
import { cookies } from "next/headers";
import { LOCATION_COOKIE } from "@/lib/location";
import { coverageFromPlaceCookie, STATE_COMING } from "@/lib/state-coverage";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Briefing"), robots: { index: false, follow: false } };

function Section({ s }: { s: BriefSection }) {
  const lists = [["Passed", s.passed], ["Failed", s.failed], ["Stopped by a procedural vote", s.blocked], ["Coming next", s.coming]] as const;
  const any = lists.some(([, l]) => l.length);
  return <div className="fed-section"><h2>{s.name} <OfficialBadge /></h2><p className="meta">{s.inSession ? "In session." : "Not in session."}</p>
    {any ? lists.filter(([, l]) => l.length).map(([h, l]) => <div key={h}><h3 className="subhead">{h}</h3><ul className="result-list">{l.map((i, n) => <li key={n}><Link href={i.href}><span className="bill-tag">{i.label}</span> {i.title}</Link><span className="meta">{shortDate(i.date)} · {i.note}{h === "Coming next" && i.href.includes("#your-view") ? " · Coming up — weigh in now" : ""}</span></li>)}</ul></div>)
      : <p className="meta">Nothing recorded in this period.</p>}</div>;
}

/** A two-minute read for Congress and Texas, from official records only. */
export default async function BriefingPage({ searchParams }: { searchParams: Promise<{ id?: string; preview?: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/briefing" access={access} page="/briefing">{null}</PublicShell>;
  const sp = await searchParams, id = sp.id ?? null;
  // 20 Nov 2026: the briefing readable without opening anything. Readers get it once it is switched on; until then only
  // the editor can open it (?preview=1), to see real items before they go to trial readers.
  const preview = !!access.editor && sp.preview === "1", inline = BRIEFING_INLINE_LIVE || preview;
  const row = await latestBriefing(id && /^(daily|weekly)-\d{4}-\d{2}-\d{2}$/.test(id) ? id : null).catch(() => null);
  const b: Briefing = (row?.content as Briefing | undefined) ?? await buildBriefing();
  const account = (await currentAccount()) ?? await currentAppUserId().then(u => (u ? accountForAppUser(u) : null));
  const subscribed = account ? await isSubscribed(account.id).catch(() => false) : false;
  const archive = await briefingArchive().catch(() => []);
  // 20 Nov 2026: a reader whose saved place is outside Texas gets one line where the Texas part would be.
  const coverage = coverageFromPlaceCookie((await cookies()).get(LOCATION_COOKIE)?.value);
  const forReader: Briefing = coverage === "coming" ? { ...b, texas: null } : b;
  const items = inline ? await inlineBriefing(forReader, await currentAppUserId().catch(() => null), preview ? "editor" : "reader").catch(() => null) : null;
  return <PublicShell current="/briefing" access={access} page="/briefing">
    <section className="fed-page">
      <div className="eyebrow">{b.kind === "daily" ? "DAILY BRIEFING" : "WEEKLY BRIEFING"}</div>
      <h1>{b.periodLabel}: what happened</h1>
      {items ? <>
        <p className="meta">A two-minute read: at most five items, each from the official record and the approved plain-English summary. {row ? "" : "This is a live preview; the saved briefing is written each evening."}</p>
        {preview ? <p className="gate">Editor preview of the new format. Readers still see the earlier briefing until you say this can go live. The grey line under each item says what readers would see. <Link href={id ? `/briefing?id=${id}` : "/briefing"}>See the briefing as readers see it now</Link></p> : null}
        <InlineItems items={items} editor={preview} />
      </> : <>
        <p className="meta">A two-minute read built from official records only: votes, floor schedules and hearings. {row ? "" : "This is a live preview; the saved briefing is written each evening."}</p>
        {access.editor && !BRIEFING_INLINE_LIVE ? <p className="meta"><Link href={id ? `/briefing?id=${id}&preview=1` : "/briefing?preview=1"}>Editor: preview the new format</Link></p> : null}
        <Section s={b.congress} />
        {forReader.texas && <Section s={forReader.texas} />}
      </>}
      {coverage === "coming" && <p className="meta state-coming-line">{STATE_COMING}</p>}
      <div className="fed-section">
        {row && <p><a className="secondary-link" href={`/api/cards/briefing?id=${row.id}&format=feed`} download={`${BRAND.fileSlug}-${row.id}.png`}>Save the briefing card</a></p>}
        {account ? <form action={toggleBriefingEmail}><input type="hidden" name="on" value={subscribed ? "0" : "1"} /><button className="follow-btn">{subscribed ? "Stop the briefing email" : "Email me the briefing"}</button></form>
          : <p className="meta"><Link href="/account">Sign in</Link> to get the briefing by email.</p>}
        {archive.length > 1 && <p className="meta">Earlier: {archive.slice(0, 10).map((a, i) => <span key={a.id}>{i ? " · " : ""}<Link href={`/briefing?id=${a.id}`}>{shortDate(a.createdAt)}</Link></span>)}</p>}
      </div>
    </section>
  </PublicShell>;
}
