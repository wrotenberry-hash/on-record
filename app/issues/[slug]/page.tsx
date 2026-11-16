import type { Metadata } from "next";
import Link from "next/link";
import { issueMeta } from "@/lib/seo";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { AnalysisBadge, OfficialBadge, billLabel, shortDate } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { pickedIssues } from "@/lib/reader-issues";
import { toggleIssue } from "../actions";
import { billsInCategory, getCategory } from "@/lib/federal/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  if (!(await viewerAccess()).allowed) return { title: "On Record" };
  const c = await getCategory((await params).slug);
  return c ? { ...issueMeta(c.name), alternates: { canonical: `/issues/${c.slug}` } } : { title: "Not found · On Record" };
}

export default async function IssuePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ full?: string; followed?: string }> }) {
  const access = await viewerAccess();
  const { slug } = await params;
  if (!access.allowed) return <PublicShell current="/issues" access={access} page="/issues/[slug]">{null}</PublicShell>;
  const category = await getCategory(slug);
  if (!category) notFound();
  const bills = await billsInCategory(slug, 30);
  const sp = await searchParams, picked = await pickedIssues(await currentAppUserId().catch(() => null)), following = picked.includes(slug);
  return <PublicShell current="/issues" access={access} page="/issues/[slug]">
    <section className="fed-page">
      <p className="crumbs"><Link href="/issues">← All issues</Link></p>
      <div className="eyebrow">ISSUE <OfficialBadge /></div>
      <h1>{category.name}</h1>
      <p className="lede">Bills and joint resolutions that can become law, most recent action first.</p>
      <form action={toggleIssue} className="issue-follow"><input type="hidden" name="slug" value={slug} />
        {following ? <><span className="following-note" role="status">Following this issue: its bills show on your home page.</span> <button className="link-button">Stop following</button></>
          : <button>Follow this issue</button>}</form>
      {sp.full && !following && <p className="gate gate-closed" role="status">You already follow 3 issues, the most at once. <Link href="/start?step=2">Change your issues</Link></p>}
      {bills.length ? <ul className="bill-list">{bills.map(b => <li key={b.id}><Link href={`/bills/${b.id}`}>
        <span className="bill-tag">{billLabel(b.billType, b.number)}</span><b>{b.title}</b>{b.method === "ai" && <span className="ai-sorted">Sorted into this issue by AI <AnalysisBadge /></span>}
        {b.latestActionText && <small>{shortDate(b.latestActionAt)} · {b.latestActionText}</small>}</Link></li>)}</ul>
        : <p className="empty-note">No bills under {category.name} yet.{access.preview ? " Bill topics come from Congress.gov, which needs its API key in Vercel before bills can be sorted into issues." : ""}</p>}
    </section>
  </PublicShell>;
}
