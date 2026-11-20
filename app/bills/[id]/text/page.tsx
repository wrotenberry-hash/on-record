import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBills, officialBillTexts } from "@/db/schema";
import { PublicShell } from "@/components/public/public-shell";
import { BillText } from "@/components/changes/bill-text";
import { billLabel } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { sectionsOf, versionsOf } from "@/lib/changes/text-store";
import { BRAND, brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * The text of a federal bill, section by section, as stored from the official file (Suggest changes; owner, 20 Nov
 * 2026). The same readers as the bill page: the editor, an invited reader, or everyone when public reading is on
 * (viewerAccess). It is not one of the pages a share link can open: the narrower switch stays with the bill page.
 * This page only shows what is stored; it never fetches. `?v=eh` picks a version; the newest is shown otherwise.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  if (!(await viewerAccess()).allowed) return { title: BRAND.name };
  const bill = await getDb().select().from(officialBills).where(eq(officialBills.id, (await params).id)).get();
  if (!bill) return { title: brandTitle("Not found") };
  return { title: brandTitle(`${billLabel(bill.billType, bill.number)}: bill text`), description: `The text of ${billLabel(bill.billType, bill.number)}, section by section, as published.`, robots: { index: false, follow: false } };
}

export default async function BillTextPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/issues" access={access} page="/bills/[id]/text">{null}</PublicShell>;
  const db = getDb(), bill = await db.select().from(officialBills).where(eq(officialBills.id, id)).get();
  if (!bill) notFound();
  const versions = await versionsOf(bill.id), want = (await searchParams).v;
  const current = versions.find(v => v.version === want) ?? versions[0] ?? null;
  const sections = current ? await sectionsOf(bill.id, current.version) : [];
  // Nothing stored yet: the newest official text on file, or the bill's text page on Congress.gov.
  const onFile = current ? null : await db.select().from(officialBillTexts).where(eq(officialBillTexts.billId, bill.id)).orderBy(desc(officialBillTexts.date)).limit(1).get();
  return <PublicShell current="/issues" access={access} page="/bills/[id]/text">
    <BillText base={`/bills/${bill.id}/text`} back={`/bills/${bill.id}`} backLabel={billLabel(bill.billType, bill.number)} eyebrow={`${billLabel(bill.billType, bill.number)} · ${bill.congress}th Congress`}
      title={bill.title} versions={versions} current={current} sections={sections}
      officialUrl={onFile?.htmlUrl ?? onFile?.pdfUrl ?? `${bill.congressUrl}/text`} officialLabel="Read the official text" />
  </PublicShell>;
}
