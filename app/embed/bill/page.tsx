import { EmbedCard } from "../embed-card";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: `${BRAND.name} bill card`, robots: { index: false } };
export default async function EmbedBill({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <EmbedCard type="bill" params={await searchParams} />;
}
