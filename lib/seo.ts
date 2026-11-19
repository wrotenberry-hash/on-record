import { BRAND } from "./brand.ts";
/**
 * Titles and descriptions for search and link previews. Pure; tested in
 * tests/trial.test.mjs. Builders never invent content: they combine official
 * fields (name, seat, bill number and title) and, for bills, the Analysis
 * headline, which is labelled as such on the page itself.
 */
/** The product name (lib/brand.ts). Kept under this name for the callers and tests that already use it. */
export const SITE_NAME = BRAND.name;
export const TITLE_MAX = 60, DESCRIPTION_MAX = 160;

export function clamp(text: string, max: number) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "").trimEnd()}…`;
}

/** "<page> · On Record", the page part shortened so the whole stays within 60 characters. */
export function pageTitle(page: string) {
  const suffix = ` · ${SITE_NAME}`;
  return `${clamp(page, TITLE_MAX - suffix.length)}${suffix}`;
}

export function memberMeta(p: { fullName: string; chamber: string; party: string; state: string; district: number | null }) {
  const seat = p.chamber === "senate" ? `U.S. Senator from ${p.state}` : `U.S. Representative, ${p.state}${p.district ? `-${p.district}` : p.district === 0 ? " at large" : ""}`;
  return { title: pageTitle(`${p.fullName}: votes`), description: clamp(`${p.fullName} (${p.party}), ${seat}. Recent recorded votes copied from official roll calls, each with its source and a plain explanation. No grades.`, DESCRIPTION_MAX) };
}

export function billMeta(b: { label: string; title: string }, headline?: string | null) {
  return { title: pageTitle(`${b.label}: ${b.title}`),
    description: clamp(headline ? `${headline} Plain-language summary, cost estimate, the case for and against, and how members voted.`
      : `${b.title}. Status, recorded votes and sources from official records.`, DESCRIPTION_MAX) };
}

/**
 * An issue's entry page (owner's point 11): "What Congress did on health care this month". `heading` and `phrase`
 * come from lib/entry/rules.ts (issueHeading, issuePhrase); `month` is the calendar month, "November 2026".
 */
export function issueMeta(heading: string, phrase: string, month: string) {
  return { title: pageTitle(heading), description: clamp(`Votes in Congress on ${phrase} in ${month} and how each came out, and the bills that passed, became law or were vetoed. From official records, with sources.`, DESCRIPTION_MAX) };
}

/**
 * What crawlers may read. Everything is closed while public reading is off, with one exception: when the narrower
 * switch SHARED_PAGES_PUBLIC is on (lib/public-access.ts; off by default), the 14 issue pages may be read and
 * indexed, and a link preview may fetch a share link, the bill it opens and the card picture. Those bill pages carry
 * "noindex" themselves, and without a share code they show the private notice.
 */
export function robotsRules(publicRead: boolean, siteUrl: string, sharedPages = false) {
  return publicRead
    ? { rules: [{ userAgent: "*", allow: "/", disallow: ["/editor", "/api/", "/login", "/skip", "/trial", "/following"] }], sitemap: `${siteUrl}/sitemap.xml` }
    : sharedPages ? { rules: [{ userAgent: "*", allow: ["/issues/", "/s/", "/bills/", "/texas/bills/", "/api/cards/g"], disallow: "/" }], sitemap: `${siteUrl}/sitemap.xml` }
    : { rules: [{ userAgent: "*", disallow: "/" }] };
}

/**
 * The paths the sitemap lists for the issue pages. None while both switches are off; the issue pages when either is on.
 * (With public reading on, app/sitemap.ts adds every other public page.)
 */
export function sitemapPaths(publicRead: boolean, sharedPages: boolean, issueSlugs: readonly string[]): string[] {
  return publicRead || sharedPages ? issueSlugs.map(slug => `/issues/${slug}`) : [];
}

/** Round G: per-item link previews (X, Facebook, Threads, Bluesky, LinkedIn, iMessage all read Open Graph; X also reads twitter:*). */
export function previewMeta(siteUrl: string, path: string, title: string, description: string, imagePath: string) {
  const image = { url: `${siteUrl}${imagePath}`, width: 1200, height: 630, alt: title };
  return { openGraph: { title, description, url: `${siteUrl}${path}`, siteName: SITE_NAME, type: "article" as const, images: [image] },
    twitter: { card: "summary_large_image" as const, title, description, images: [image.url] } };
}
