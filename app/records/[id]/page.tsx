import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { RecordDetail } from "@/components/public/record-detail";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import { getPublicRecord } from "@/lib/published-records";

export const dynamic = "force-dynamic";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  if (!publicReadEnabled(process.env[PUBLIC_READ_FLAG])) return { title: "On Record" };
  const record = await getPublicRecord((await params).id);
  if (!record) return { title: "Record not found · On Record", robots: { index: false } };
  const quote = record.representation.exactText.length > 120 ? `${record.representation.exactText.slice(0, 117).trimEnd()}…` : record.representation.exactText;
  const title = `${record.speakerName}: “${quote}”`;
  const description = `CHECKING record, no rating. ${record.proposition.text} What remains to check: ${record.adjudication.explanation.slice(0, 160).trimEnd()}`;
  const url = `${SITE_URL}/records/${record.id}`;
  return { title: `${title} · On Record`, description, alternates: { canonical: url },
    openGraph: { type: "article", url, siteName: "On Record", title, description, publishedTime: new Date(record.publishedAt).toISOString(), authors: ["On Record"] },
    twitter: { card: "summary", title, description } };
}

/** One published record at its own address. The same switch that closes /records closes this. */
export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const enabled = publicReadEnabled(process.env[PUBLIC_READ_FLAG]);
  const { id } = await params;
  const record = enabled ? await getPublicRecord(id) : null;
  if (enabled && !record) notFound();
  return <PublicShell current="/records">
    {record && <div className="record-page"><p className="crumbs"><Link href="/records">← All records</Link></p>
      <article className="detail standalone"><RecordDetail record={record} permalink={`${SITE_URL}/records/${record.id}`} /></article></div>}
  </PublicShell>;
}
