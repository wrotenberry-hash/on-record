import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, billLabel, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { billsInCategory, getCategory } from "@/lib/federal/queries";

export const dynamic = "force-dynamic";

export default async function IssuePage({ params }: { params: Promise<{ slug: string }> }) {
  const access = await viewerAccess();
  const { slug } = await params;
  if (!access.allowed) return <PublicShell current="/issues" access={access}>{null}</PublicShell>;
  const category = await getCategory(slug);
  if (!category) notFound();
  const bills = await billsInCategory(slug, 30);
  return <PublicShell current="/issues" access={access}>
    <section className="fed-page">
      <p className="crumbs"><Link href="/issues">← All issues</Link></p>
      <div className="eyebrow">ISSUE <OfficialBadge /></div>
      <h1>{category.name}</h1>
      <p className="lede">Bills and joint resolutions that can become law, most recent action first.</p>
      {bills.length ? <ul className="bill-list">{bills.map(b => <li key={b.id}><Link href={`/bills/${b.id}`}>
        <span className="bill-tag">{billLabel(b.billType, b.number)}</span><b>{b.title}</b>
        {b.latestActionText && <small>{shortDate(b.latestActionAt)} · {b.latestActionText}</small>}</Link></li>)}</ul>
        : <p className="empty-note">No bills under {category.name} yet.{access.preview ? " Bill topics come from Congress.gov, which needs its API key in Vercel before bills can be sorted into issues." : ""}</p>}
    </section>
  </PublicShell>;
}
