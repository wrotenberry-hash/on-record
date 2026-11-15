import type { MetadataRoute } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { issueCategories, officialBills, officialPoliticians } from "@/db/schema";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import { LAWMAKING_TYPES } from "@/lib/federal/parse";

export const dynamic = "force-dynamic";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";

/** Empty while public reading is off; then every member, complete bill, issue and static page. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!publicReadEnabled(process.env[PUBLIC_READ_FLAG])) return [];
  const db = getDb();
  const [members, bills, issues] = await Promise.all([
    db.select({ id: officialPoliticians.id }).from(officialPoliticians).where(eq(officialPoliticians.isCurrent, 1)),
    db.select({ id: officialBills.id, at: officialBills.latestActionAt }).from(officialBills)
      .where(and(eq(officialBills.detailStatus, "complete"), inArray(officialBills.billType, [...LAWMAKING_TYPES]))),
    db.select({ slug: issueCategories.slug }).from(issueCategories),
  ]);
  const page = (path: string, lastModified?: string | null): MetadataRoute.Sitemap[number] => ({ url: `${SITE_URL}${path}`, ...(lastModified ? { lastModified } : {}) });
  return [...["/", "/politicians", "/issues", "/method", "/about", "/corrections", "/records"].map(p => page(p)),
    ...members.map(m => page(`/politicians/${m.id}`)), ...bills.map(b => page(`/bills/${b.id}`, b.at)), ...issues.map(i => page(`/issues/${i.slug}`))];
}
