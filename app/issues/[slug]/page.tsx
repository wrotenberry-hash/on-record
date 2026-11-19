import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { issueMeta } from "@/lib/seo";
import { EntryShell } from "@/components/share/entry-shell";
import { AnalysisBadge, OfficialBadge, shortDate } from "@/components/federal/badges";
import { entryViewer, currentAppUserId, sharedPagesOn } from "@/lib/viewer";
import { pickedIssues } from "@/lib/reader-issues";
import { toggleIssue } from "../actions";
import { getCategory } from "@/lib/federal/queries";
import { BILLS_CAP, billLabel, earlierEnd, issueHeading, issueIntro, issuePhrase, longDay, MONTH_END, monthWindow, nothingThisMonth, otherVotesLine, type EntryItem } from "@/lib/entry/rules";
import { issueBills, issueMonth } from "@/lib/entry/store";
import { visibleHeadlines } from "@/lib/share-cards";
import { BRAND, brandTitle } from "@/lib/brand";
import "@/components/share/share.css";

export const dynamic = "force-dynamic";

/**
 * Titles and descriptions follow the switch. Today (SHARED_PAGES_PUBLIC off) only the editor and invited readers get
 * them, and the page stays out of search results, as before. With the switch on, everyone gets them and the page may
 * be indexed.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  if (!(await entryViewer({ kind: "issue" })).allowed) return { title: BRAND.name };
  const c = await getCategory((await params).slug);
  if (!c) return { title: brandTitle("Not found") };
  return { ...issueMeta(issueHeading(c.slug, c.name), issuePhrase(c.slug, c.name), monthWindow(Date.now()).label), alternates: { canonical: `/issues/${c.slug}` },
    ...(sharedPagesOn() ? { robots: { index: true, follow: true } } : {}) };
}

/** "This month" is the calendar month in Washington at the moment the page is opened. */
const thisMonth = (slug: string) => issueMonth(getDb(), slug, Date.now(), { headlines: visibleHeadlines });

/**
 * An issue's entry page (owner's point 11), written for someone arriving from search or social with no context:
 * what Congress did on this subject this calendar month, built from the record with fixed wording (lib/entry/rules.ts;
 * no model writes any of it). Then the most recent few from before, then a closing line. Every list is capped and ends.
 *
 * Who may read it: the editor and invited readers, today. With SHARED_PAGES_PUBLIC on (off by default) anyone; such a
 * visitor (`shared`) gets no follow button and no links into the private parts of the site, only the official sources.
 */
export default async function IssuePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ full?: string; followed?: string }> }) {
  const access = await entryViewer({ kind: "issue" }), shared = access.shared;
  const { slug } = await params;
  if (!access.allowed) return <EntryShell current="/issues" access={access} page="/issues/[slug]">{null}</EntryShell>;
  const category = await getCategory(slug);
  if (!category) notFound();
  const [data, list] = await Promise.all([thisMonth(slug), issueBills(getDb(), slug, BILLS_CAP)]);
  if (!data) notFound();
  const sp = await searchParams, following = shared ? false : (await pickedIssues(await currentAppUserId().catch(() => null))).includes(slug);
  const others = otherVotesLine(data.otherVotes);
  const row = (i: EntryItem) => <li key={i.key}>
    <span className="entry-date">{longDay(i.day)}</span>
    <p className="entry-fact">{i.sentence}</p>
    <span className="entry-src"><OfficialBadge />{i.nameLabel === "Analysis" && <><AnalysisBadge /> <span>the description of the bill</span></>}
      <a href={i.source.url} target="_blank" rel="noopener noreferrer">Source: {i.source.text}</a>
      {shared ? <span>{i.billLabel}</span> : <Link href={`/bills/${i.billId}`}>{i.billLabel}: the bill and every vote on it</Link>}</span></li>;
  return <EntryShell current="/issues" access={access} page="/issues/[slug]">
    <section className="fed-page entry-page">
      {!shared && <p className="crumbs"><Link href="/issues">← All issues</Link></p>}
      <div className="eyebrow">{category.name.toUpperCase()} · {data.label.toUpperCase()} <OfficialBadge /></div>
      <h1>{issueHeading(slug, category.name)}</h1>
      {issueIntro(slug, category.name).map((p, i) => <p key={i} className={i ? "meta" : "lede"}>{p}</p>)}
      {!shared && <form action={toggleIssue} className="issue-follow"><input type="hidden" name="slug" value={slug} />
        {following ? <><span className="following-note" role="status">Following this issue: its bills show on your home page.</span> <button className="link-button">Stop following</button></>
          : <button>Follow this issue</button>}</form>}
      {!shared && sp.full && !following && <p className="gate gate-closed" role="status">You already follow 3 issues, the most at once. <Link href="/start#coming-up">Change your issues</Link></p>}

      <h2>{data.label}</h2>
      {data.month.length ? <ul className="entry-list">{data.month.map(row)}</ul> : <p className="empty-note">{nothingThisMonth(slug, category.name, data.label)}</p>}
      {others && <p className="meta">{others}</p>}
      <p className="end-line">{MONTH_END}</p>

      <h2>Earlier</h2>
      {data.earlier.length ? <><ul className="entry-list">{data.earlier.map(row)}</ul><p className="end-line">{earlierEnd(data.earlier.length, data.earlierMore)}</p></>
        : <p className="end-line">Nothing in the twelve months before this month.</p>}

      <h2>Bills on this issue</h2>
      {list.bills.length ? <><ul className="entry-list">{list.bills.map(b => <li key={b.id}>
        <span className="entry-date">{billLabel(b.billType, b.number)}{b.latestActionAt ? ` · ${shortDate(b.latestActionAt)}` : ""}</span>
        <p className="entry-fact">{shared ? b.title : <Link href={`/bills/${b.id}`}>{b.title}</Link>}</p>
        <span className="entry-src"><OfficialBadge />{b.latestActionText ? <span>Latest action: {b.latestActionText}</span> : <span>No action recorded yet.</span>}
          <a href={b.congressUrl} target="_blank" rel="noopener noreferrer">Source: Congress.gov</a>{b.method === "ai" && <span className="ai-sorted">Sorted into this issue by AI <AnalysisBadge /></span>}</span></li>)}</ul>
        <p className="end-line">{list.total > list.bills.length ? `Those are the ${list.bills.length} with the most recent action, of ${list.total} bills sorted into this issue.` : list.total === 1 ? "That is the only bill sorted into this issue." : `That is all ${list.total} bills sorted into this issue.`}
          {" "}Bills are sorted by fixed, published rules, the same for every bill and every sponsor.</p></>
        : <p className="empty-note">No bills are sorted into {category.name} yet.{access.preview ? " Bill topics come from Congress.gov, which needs its API key in Vercel before bills can be sorted into issues." : ""}</p>}

      <p className="meta">This page is rebuilt from the official records each time it is opened. Dates are Washington, D.C. dates.</p>
    </section>
  </EntryShell>;
}
