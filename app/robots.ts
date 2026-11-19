import type { MetadataRoute } from "next";
import { PUBLIC_READ_FLAG, publicReadEnabled, SHARED_PAGES_FLAG, sharedPagesEnabled } from "@/lib/public-access";
import { robotsRules } from "@/lib/seo";

export const dynamic = "force-dynamic";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";

/** Closed to every crawler while public reading is off, unless SHARED_PAGES_PUBLIC is on: then the issue pages and share links only (lib/seo.ts). */
export default function robots(): MetadataRoute.Robots {
  return robotsRules(publicReadEnabled(process.env[PUBLIC_READ_FLAG]), SITE_URL, sharedPagesEnabled(process.env[SHARED_PAGES_FLAG]));
}
