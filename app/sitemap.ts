import type { MetadataRoute } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { issueCategories, officialBills, officialPoliticians } from "@/db/schema";
import { PUBLIC_READ_FLAG, publicReadEnabled, SHARED_PAGES_FLAG, sharedPagesEnabled } from "@/lib/public-access";
import { sitemapPaths } from "@/lib/seo";
import { LAWMAKING_TYPES } from "@/lib/federal/parse";

export const dynamic = "force-dynamic";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";

/**
 * Empty while public reading is off; then every member, complete bill, issue and static page. The one exception:
 * with SHARED_PAGES_PUBLIC on (off by default) and public reading off, the 14 issue pages and nothing else.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const publicRead = publicReadEnabled(process.env[PUBLIC_READ_FLAG]), sharedPages = sharedPagesEnabled(process.env[SHARED_PAGES_FLAG]);
  if (!publicRead && !sharedPages) return [];
  const db = getDb();
  const page = (path: string, lastModified?: string | null): MetadataRoute.Sitemap[number] => ({ url: `${SITE_URL}${path}`, ...(lastModified ? { lastModified } : {}) });
  const issues = await db.select({ slug: issueCategories.slug }).from(issueCategories);
  if (!publicRead) return sitemapPaths(false, true, issues.map(i => i.slug)).map(p => page(p));
  const [members, bills] = await Promise.all([
    db.select({ id: officialPoliticians.id }).from(officialPoliticians).where(eq(officialPoliticians.isCurrent, 1)),
    db.select({ id: officialBills.id, at: officialBills.latestActionAt }).from(officialBills)
      .where(and(eq(officialBills.detailStatus, "complete"), inArray(officialBills.billType, [...LAWMAKING_TYPES]))),
  ]);
  return [...["/", "/politicians", "/issues", "/method", "/about", "/corrections", "/records"].map(p => page(p)),
    ...members.map(m => page(`/politicians/${m.id}`)), ...bills.map(b => page(`/bills/${b.id}`, b.at)), ...issues.map(i => page(`/issues/${i.slug}`))];
}
