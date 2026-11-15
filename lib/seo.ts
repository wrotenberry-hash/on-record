/**
 * Titles and descriptions for search and link previews. Pure; tested in
 * tests/trial.test.mjs. Builders never invent content: they combine official
 * fields (name, seat, bill number and title) and, for bills, the Analysis
 * headline, which is labelled as such on the page itself.
 */
export const SITE_NAME = "On Record";
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

export function issueMeta(name: string) {
  return { title: pageTitle(`${name}: bills in Congress`), description: clamp(`Bills in Congress about ${name.toLowerCase()}, most recent action first, sorted by fixed published rules.`, DESCRIPTION_MAX) };
}

/** What crawlers may read. Everything is closed while public reading is off. */
export function robotsRules(publicRead: boolean, siteUrl: string) {
  return publicRead
    ? { rules: [{ userAgent: "*", allow: "/", disallow: ["/editor", "/api/", "/login", "/skip", "/trial", "/following"] }], sitemap: `${siteUrl}/sitemap.xml` }
    : { rules: [{ userAgent: "*", disallow: "/" }] };
}
