import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { currentLocation } from "@/lib/location";
import { STATE_COMING, stateCoverage } from "@/lib/state-coverage";
import { comingItems, remindersOf, type ComingItem } from "@/lib/reminders";
import { readerMembers } from "@/lib/coming";
import { comingView, EMPTY_SCOPE, mineOnly } from "@/lib/coming-rules";
import { brandTitle } from "@/lib/brand";
import { officialMain, TITLE_NOT_ON_FILE, WHAT_THIS_BILL_DOES } from "@/lib/bill-row";
import { toggleReminder } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("What's coming"), robots: { index: false, follow: false } };

const clip = (s: string, n = 280) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);

/**
 * Floor votes and committee hearings ahead, Congress and Texas, with one-tap reminders. "My legislators" keeps the
 * floor items of the reader's legislators' chambers and the hearings of committees those legislators sit on
 * (lib/coming-rules.ts). Town halls are not listed: no official source lists them.
 */
export default async function ComingPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/coming" access={access} page="/coming">{null}</PublicShell>;
  const userId = await currentAppUserId();
  const loc = await currentLocation(userId).catch(() => null);
  // 20 Nov 2026: a reader whose saved place is outside Texas is not shown Texas hearings; one line says their state is coming.
  const coverage = stateCoverage(loc?.state);
  const [allItems, reminded, who] = await Promise.all([comingItems().catch(() => [] as ComingItem[]), remindersOf(userId).catch(() => new Set<string>()),
    readerMembers(loc).catch(() => ({ scope: EMPTY_SCOPE, federal: [], texas: { reader: false, stateLegislators: 0, membershipsLoaded: false } }))]);
  const items = coverage === "coming" ? allItems.filter(i => i.where !== "Texas") : allItems;
  const matched = mineOnly(items, who.scope);
  const view = comingView((await searchParams).show, !!loc, matched.length);
  const shown = view === "mine" ? matched : items;
  const floor = shown.filter(i => i.kind === "floor"), hearings = shown.filter(i => i.kind === "hearing");
  const canRemind = !!access.invite || !!access.editor;
  // Texas hearings the "My legislators" view cannot place: no memberships loaded, no state legislators saved, or no committee found from the hearing's name.
  const txHearings = items.filter(i => i.where === "Texas"), txMatched = matched.filter(i => i.where === "Texas").length;
  const txNote = view === "mine" && who.texas.reader && txHearings.length > 0 && txMatched === 0
    ? !who.texas.membershipsLoaded ? <>Texas hearings cannot yet be matched to a member: Texas committee memberships are not loaded.</>
      : !who.texas.stateLegislators ? <>Texas hearings cannot yet be matched to your state legislators. Add your street address on <Link href="/legislators">Your legislators</Link> so we can find them.</>
      : txHearings.some(i => !i.txCommitteeId) ? <>Some Texas hearings cannot yet be matched to a committee, so they are not shown here.</> : null
    : null;
  const remind = (i: ComingItem) => canRemind && i.status !== "Canceled" && <form action={toggleReminder}><input type="hidden" name="key" value={i.key} /><input type="hidden" name="on" value={reminded.has(i.key) ? "0" : "1"} />
    <button className={reminded.has(i.key) ? "follow-btn on" : "follow-btn"} aria-pressed={reminded.has(i.key)}>{reminded.has(i.key) ? "Reminder set" : "Remind me"}</button></form>;

  return <PublicShell current="/coming" access={access} page="/coming">
    <section className="fed-page coming-page">
      <div className="eyebrow">WHAT&apos;S COMING <OfficialBadge /></div>
      <h1>Floor votes and hearings ahead</h1>
      <nav className="coming-toggle" aria-label="Which items to show">
        <Link href="/coming?show=all" aria-current={view === "all" ? "page" : undefined}>Everything</Link>
        <Link href="/coming?show=mine" aria-current={view === "mine" ? "page" : undefined}>My legislators</Link>
      </nav>
      {view === "mine"
        ? (loc ? <p className="meta">Showing floor votes in your legislators&apos; chambers and hearings of the committees they sit on.{who.federal.length > 0 && <> Your legislators: {who.federal.map(m => m.fullName).join(", ")}.</>}</p>
          : <p className="gate gate-open" role="note">Add your ZIP code on <Link href="/legislators">Your legislators</Link> and this view will show what is coming up for them.</p>)
        : <p className="meta">Everything on the House and Senate floor schedules{coverage === "coming" ? " and committee meetings in Congress." : ", committee meetings in Congress, and Texas hearings."}{!loc && <> <Link href="/legislators">Add your ZIP code</Link> to see only what your legislators will take part in.</>}</p>}

      {hearings.length > 0 && floor.length > 4 && <p className="meta coming-skip"><a href="#hearings">Skip to hearings ({hearings.length})</a></p>}

      <h2>Floor votes <OfficialBadge /></h2>
      {floor.length ? <ul className="result-list">{floor.map(i => <li key={i.key} className="coming-item">
        <span className="meta">{i.where} · {i.when}</span><Link href={i.href}>{i.title}</Link><span className="meta">{i.detail}</span>
        {remind(i)}
      </li>)}</ul> : <p className="empty-note">{view === "mine" && loc ? <>Nothing is on the floor schedule for your legislators&apos; chambers yet. <Link href="/coming?show=all">See everything</Link>.</>
        : view === "mine" ? "Nothing to show until you add your ZIP code." : "Nothing is scheduled yet. Floor schedules usually appear late in the week before."}</p>}
      <p className="meta">The floor is where the whole House or Senate debates and votes. The House posts its schedule a week at a time.</p>

      <h2 id="hearings">Hearings <OfficialBadge /></h2>
      {hearings.length ? <ul className="result-list">{hearings.map(i => <li key={i.key} className="coming-item">
        <span className="meta">{i.where} · {i.when}</span>
        <b className="coming-committee">{i.committee ?? (i.where === "Texas" ? "Texas Legislature hearing" : "Committee meeting")}</b>
        {(i.meetingKind || i.status) && <span className="meta">{i.meetingKind}{i.meetingKind && i.status ? " · " : ""}{i.status && <b className="coming-status">{i.status}</b>}</span>}
        <span className="official-line"><OfficialBadge /> <span>{clip(i.title)}</span></span>
        {i.place && <span className="meta">Where: {i.place}</span>}
        {/* 20 Nov 2026: a link is never only a bill number. The number is plain text; the link is the bill's title, or says where it goes. */}
        {!!i.bills?.length && <span className="meta">Bills named: {i.bills.map((b, n) => <span key={b.label}>{n ? "; " : ""}{b.label}{!b.href ? null : b.href.startsWith("/")
          ? <>: <Link href={b.href}>{officialMain(b.title) === TITLE_NOT_ON_FILE ? WHAT_THIS_BILL_DOES : clip(officialMain(b.title), 70)}</Link></>
          : <>: <a href={b.href} target="_blank" rel="noopener noreferrer">its page on Congress.gov</a></>}</span>)}</span>}
        {i.sourceUrl && <span className="meta"><a className="src-link" href={i.sourceUrl} target="_blank" rel="noopener noreferrer">Official listing</a></span>}
        {remind(i)}
      </li>)}</ul> : <p className="empty-note">{view === "mine" && loc ? <>No hearing is listed yet for a committee your legislators sit on. <Link href="/coming?show=all#hearings">See every hearing</Link>.</>
        : view === "mine" ? "Nothing to show until you add your ZIP code." : "No committee meetings are listed yet. Committees usually post them about a week ahead."}</p>}
      {txNote && <p className="meta">{txNote} <Link href="/coming?show=all#hearings">See every hearing</Link>.</p>}
      {coverage === "coming" && <p className="meta state-coming-line">{STATE_COMING}</p>}
      <p className="meta">{coverage === "coming" ? "Times are Eastern." : "Times are Eastern for Congress and Central for Texas."} Hearing titles are the committees&apos; own wording. A committee is a smaller group of members that studies bills before the whole chamber votes.</p>

      <div className="fed-section coming-townhalls"><h3 className="subhead">Town halls</h3>
        <p>Town halls: no official source lists them. Check your legislator&apos;s official website.</p>
        {who.federal.some(m => m.officialUrl) ? <ul className="coming-sites">{who.federal.filter(m => m.officialUrl).map(m => <li key={m.id}><a href={m.officialUrl!} target="_blank" rel="noopener noreferrer">{m.fullName}&apos;s official website</a></li>)}</ul>
          : <p className="meta"><Link href="/legislators">Find your legislators</Link> to get links to their official websites.</p>}</div>

      <p className="meta">Reminders arrive by email from the next scheduled update before the item (the Monday of a floor week, the day before a hearing). <Link href="/account">Sign in</Link> to receive them.</p>
    </section>
  </PublicShell>;
}
