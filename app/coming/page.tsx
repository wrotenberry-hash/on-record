import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { comingItems, remindersOf } from "@/lib/reminders";
import { toggleReminder } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "What's coming · On Record", robots: { index: false, follow: false } };

/** Floor votes and hearings ahead, Congress and Texas, with one-tap reminders. */
export default async function ComingPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/coming" access={access} page="/coming">{null}</PublicShell>;
  const [items, mine] = await Promise.all([comingItems().catch(() => []), currentAppUserId().then(remindersOf).catch(() => new Set<string>())]);
  const canRemind = !!access.invite || !!access.editor;
  return <PublicShell current="/coming" access={access} page="/coming">
    <section className="fed-page">
      <div className="eyebrow">WHAT&apos;S COMING <OfficialBadge /></div>
      <h1>Floor votes and hearings ahead</h1>
      <p className="meta">From the House and Senate floor schedules and Texas committee hearings. The House posts its schedule a week at a time.</p>
      {items.length ? <ul className="result-list">{items.map(i => <li key={i.key} className="coming-item">
        <span className="meta">{i.where} · {i.when}</span><Link href={i.href}>{i.title}</Link><span className="meta">{i.detail}</span>
        {canRemind && <form action={toggleReminder}><input type="hidden" name="key" value={i.key} /><input type="hidden" name="on" value={mine.has(i.key) ? "0" : "1"} />
          <button className={mine.has(i.key) ? "follow-btn on" : "follow-btn"} aria-pressed={mine.has(i.key)}>{mine.has(i.key) ? "Reminder set" : "Remind me"}</button></form>}
      </li>)}</ul> : <p className="meta">Nothing scheduled yet. Floor schedules usually appear late in the week before.</p>}
      <p className="meta">Reminders arrive by email from the next scheduled update before the item (the Monday of a floor week, the day before a hearing). <Link href="/account">Sign in</Link> to receive them.</p>
    </section>
  </PublicShell>;
}
