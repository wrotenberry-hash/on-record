import { EmbedCard } from "../embed-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "On Record bill card", robots: { index: false } };
export default async function EmbedBill({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <EmbedCard type="bill" params={await searchParams} />;
}
