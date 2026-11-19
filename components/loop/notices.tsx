import Link from "next/link";
import { getDb } from "@/db";
import { listNotices, markNoticesSeen, NOTICES_PAGE, NOTICES_SHOWN, type NoticeView } from "@/lib/loop/notices";
import styles from "./notices.module.css";

/**
 * Closing the loop (owner's point 4, 18 Nov 2026): what happened to the bills this reader answered or follows.
 * Each notice gives the result with its numbers and date, how each of the reader's own legislators voted, the
 * reader's own answer, and whether the result matched what counted residents of their district said.
 *
 * Renders nothing public: the page that uses it has already stopped at viewerAccess(), and every line is the
 * reader's own (their notices, their answer). Nothing here shows another person.
 *
 * The list is short and it ends: newest first, never more than `limit`, then how many older ones there are (with
 * the page that lists them), then "You're caught up."
 */
const when = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

function Notice({ n }: { n: NoticeView }) {
  const [result, ...rest] = n.lines, district = rest.length ? rest[rest.length - 1] : null, members = rest.slice(0, -1);
  return <li className={styles.notice}>
    <h3>{n.isNew && <><span className={styles.new}>New</span>{" "}</>}{n.title}</h3>
    <p>{result}</p>
    {members.length > 0 && <ul className={styles.members}>{members.map((m, i) => <li key={i}>{m}</li>)}</ul>}
    {n.answer && <p className={styles.answer}>{n.answer}</p>}
    {district && <p className={styles.district}>{district}</p>}
    <p className={styles.foot}><Link href={n.url}>See the bill</Link><span className="meta">Noted {when(n.createdAt)}</span></p>
  </li>;
}

/**
 * For the top of the home screen. Shows a reader's notices they have not seen yet, or from the last 14 days, at
 * most three. Renders nothing when there are none, so a reader with no news sees no empty box.
 */
/** `end={false}` on the home screen, where the panel below says "You're caught up." once for the whole screen. */
export async function LoopNotices({ userId, limit = NOTICES_SHOWN, end = true }: { userId: string | null; limit?: number; end?: boolean }) {
  if (!userId) return null;
  const db = getDb();
  const list = await listNotices(db, userId, { limit, recentOnly: true }).catch(() => null);
  if (!list?.items.length) return null;
  // Shown once as "New": the next visit lists them without the mark.
  await markNoticesSeen(db, userId, list.items.filter(n => n.isNew).map(n => n.id)).catch(() => undefined);
  return <section className={styles.panel} aria-label="What happened to bills you weighed in on">
    <h2>What happened to bills you weighed in on</h2>
    <ul className={styles.list}>{list.items.map(n => <Notice key={n.id} n={n} />)}</ul>
    {list.more > 0 ? <p className={styles.more}><Link href="/notices">{list.more} earlier {list.more === 1 ? "notice" : "notices"}</Link></p>
      : <p className={styles.more}>{list.items.length === 1 ? "That is the only notice." : `Those are all ${list.items.length} notices.`} <Link href="/notices">Earlier notices</Link></p>}
    {end && <p className={styles.end}>You&rsquo;re caught up.</p>}
  </section>;
}

/** The whole list, for the page at /notices: the newest 30, then a line that says it is the end. */
export async function AllNotices({ userId }: { userId: string | null }) {
  const db = getDb();
  const list = userId ? await listNotices(db, userId, { limit: NOTICES_PAGE }).catch(() => null) : null;
  if (!list?.items.length) return <div className={styles.page}>
    <p>No notices yet. When a bill you answered or follow gets a floor vote, passes, fails, is signed or is vetoed, it is listed here with how your legislators voted.</p>
    <p className={styles.end}>You&rsquo;re caught up.</p>
  </div>;
  await markNoticesSeen(db, userId!, list.items.filter(n => n.isNew).map(n => n.id)).catch(() => undefined);
  return <div className={styles.page}>
    <ul className={styles.list}>{list.items.map(n => <Notice key={n.id} n={n} />)}</ul>
    <p className={styles.more}>{list.more > 0 ? `These are the newest ${list.items.length} of ${list.total} notices.` : `That is all ${list.total === 1 ? "1 notice" : `${list.total} notices`}.`}</p>
    <p className={styles.end}>You&rsquo;re caught up.</p>
  </div>;
}
