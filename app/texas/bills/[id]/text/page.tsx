import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { txBills, txBillVersions } from "@/db/schema";
import { PublicShell } from "@/components/public/public-shell";
import { BillText } from "@/components/changes/bill-text";
import { viewerAccess } from "@/lib/viewer";
import { sectionsOf, versionsOf } from "@/lib/changes/text-store";
import { isOfficialUrl } from "@/lib/texas/analysis/sources";
import { TX_SESSIONS } from "@/lib/texas/parse";
import { BRAND, brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * The text of a Texas bill, section by section, as stored from the Legislature's file: the Texas twin of
 * app/bills/[id]/text/page.tsx, with the same readers (viewerAccess) and the same rule that it only shows what is
 * stored. In the text, «words inside these marks» are added to current law and [words in square brackets] are removed.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  if (!(await viewerAccess()).allowed) return { title: BRAND.name };
  const bill = await getDb().select().from(txBills).where(eq(txBills.id, (await params).id)).get();
  if (!bill) return { title: brandTitle("Not found") };
  return { title: brandTitle(`${bill.identifier}: bill text`), description: `The text of ${bill.identifier}, section by section, as published.`, robots: { index: false, follow: false } };
}

export default async function TexasBillTextPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/texas" access={access} page="/texas/bills/[id]/text">{null}</PublicShell>;
  const db = getDb(), bill = await db.select().from(txBills).where(eq(txBills.id, id)).get();
  if (!bill) notFound();
  const versions = await versionsOf(bill.id), want = (await searchParams).v;
  const current = versions.find(v => v.version === want) ?? versions[0] ?? null;
  const sections = current ? await sectionsOf(bill.id, current.version) : [];
  // Nothing stored yet: the newest official text the feed listed, or the bill's page on Texas Legislature Online.
  const listed = current ? [] : (await db.select().from(txBillVersions).where(eq(txBillVersions.billId, bill.id))).filter(v => v.url && isOfficialUrl(v.url)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const path = `/texas/bills/${encodeURIComponent(bill.id)}`;
  return <PublicShell current="/texas" access={access} page="/texas/bills/[id]/text">
    <BillText base={`${path}/text`} back={path} backLabel={bill.identifier} eyebrow={`${bill.identifier} · ${TX_SESSIONS.find(s => s.id === bill.session)?.name ?? `Session ${bill.session}`}`}
      title={bill.title} versions={versions} current={current} sections={sections}
      officialUrl={listed[0]?.url ?? bill.tloUrl} officialLabel={listed[0]?.url ? "Read the official text" : "See this bill on Texas Legislature Online"}
      marks="In this text, «words inside these marks» are added to current law and [words in square brackets] are removed from it. Words with no mark, in a section that changes a law, are current law that stays." />
  </PublicShell>;
}
