import { EmbedCard } from "../embed-card";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: `${BRAND.name} vote card`, robots: { index: false } };
export default async function EmbedVote({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <EmbedCard type="vote" params={await searchParams} />;
}
