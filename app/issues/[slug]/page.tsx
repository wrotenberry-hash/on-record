import type { Metadata } from "next";
import Link from "next/link";
import { issueMeta } from "@/lib/seo";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { AnalysisBadge, OfficialBadge, billLabel, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { billsInCategory, getCategory } from "@/lib/federal/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  if (!(await viewerAccess()).allowed) return { title: "On Record" };
  const c = await getCategory((await params).slug);
  return c ? { ...issueMeta(c.name), alternates: { canonical: `/issues/${c.slug}` } } : { title: "Not found · On Record" };
}

export default async function IssuePage({ params }: { params: Promise<{ slug: string }> }) {
  const access = await viewerAccess();
  const { slug } = await params;
  if (!access.allowed) return <PublicShell current="/issues" access={access} page="/issues/[slug]">{null}</PublicShell>;
  const category = await getCategory(slug);
  if (!category) notFound();
  const bills = await billsInCategory(slug, 30);
  return <PublicShell current="/issues" access={access} page="/issues/[slug]">
    <section className="fed-page">
      <p className="crumbs"><Link href="/issues">← All issues</Link></p>
      <div className="eyebrow">ISSUE <OfficialBadge /></div>
      <h1>{category.name}</h1>
      <p className="lede">Bills and joint resolutions that can become law, most recent action first.</p>
      {bills.length ? <ul className="bill-list">{bills.map(b => <li key={b.id}><Link href={`/bills/${b.id}`}>
        <span className="bill-tag">{billLabel(b.billType, b.number)}</span><b>{b.title}</b>{b.method === "ai" && <span className="ai-sorted">Sorted into this issue by AI <AnalysisBadge /></span>}
        {b.latestActionText && <small>{shortDate(b.latestActionAt)} · {b.latestActionText}</small>}</Link></li>)}</ul>
        : <p className="empty-note">No bills under {category.name} yet.{access.preview ? " Bill topics come from Congress.gov, which needs its API key in Vercel before bills can be sorted into issues." : ""}</p>}
    </section>
  </PublicShell>;
}
