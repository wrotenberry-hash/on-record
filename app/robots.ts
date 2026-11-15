import type { MetadataRoute } from "next";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import { robotsRules } from "@/lib/seo";

export const dynamic = "force-dynamic";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";

/** Closed to every crawler while public reading is off. */
export default function robots(): MetadataRoute.Robots {
  return robotsRules(publicReadEnabled(process.env[PUBLIC_READ_FLAG]), SITE_URL);
}
