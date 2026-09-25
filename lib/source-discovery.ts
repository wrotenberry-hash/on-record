/** Original communications: an index supplies leads, never evidence or authenticated quotations. */
export const sourceCatalog = [
  { id: "house-republican", name: "Speaker of the House", lane: "Republican", medium: "written", era: "current", index: "https://www.speaker.gov/category/press-releases/", host: "www.speaker.gov", path: /^\/20\d\d\/\d\d\// },
  { id: "senate-republican", name: "Senate Republican leader", lane: "Republican", medium: "written", era: "current", index: "https://www.thune.senate.gov/news/press-releases/", host: "www.thune.senate.gov", path: /^\/news\/press-releases\/.+/ },
  { id: "white-house", name: "White House statements and remarks", lane: "Executive", medium: "written/speech", era: "current", index: "https://www.whitehouse.gov/briefings-statements/", host: "www.whitehouse.gov", path: /^\/(?:briefings-statements|releases)\/20\d\d\/\d\d\// },
  { id: "white-house-video", name: "White House original recordings", lane: "Executive", medium: "video-needs-transcript", era: "current", index: "https://www.whitehouse.gov/remarks/", host: "www.whitehouse.gov", path: /^\/videos\/[^/]+\/$/ },
  { id: "house-democratic", name: "House Democratic leader", lane: "Democratic", medium: "written", era: "current", index: "https://democraticleader.house.gov/media/press-releases", host: "democraticleader.house.gov", path: /^\/media\/press-releases\/.+/ },
  { id: "senate-democratic", name: "Senate Democratic leader", lane: "Democratic", medium: "written", era: "current", index: "https://www.schumer.senate.gov/newsroom/press-releases", host: "www.schumer.senate.gov", path: /^\/newsroom\/press-releases\/.+/ },
  { id: "senate-independent", name: "Senator Sanders statements", lane: "Independent", medium: "written", era: "current", index: "https://www.sanders.senate.gov/press-releases/", host: "www.sanders.senate.gov", path: /^\/press-releases\/(?!page\/)[^/]+\/$/ },
] as const;

/** Historically significant original speech and debate pages. They are leads, not reviewed claims. */
export const historicLeads = [
  { id: "kennedy-cuba-1962", lane: "Democratic", medium: "broadcast/transcript", era: "historical", url: "https://microsites.jfklibrary.org/cmc/oct22/doc5.html" },
  { id: "reagan-wall-1987", lane: "Republican", medium: "radio/transcript", era: "historical", url: "https://www.reaganlibrary.gov/archives/speech/radio-address-nation-26th-anniversary-berlin-wall" },
  { id: "bush-iraq-2003", lane: "Republican", medium: "speech/transcript", era: "historical", url: "https://georgewbush-whitehouse.archives.gov/news/releases/2003/03/20030319-17.html" },
  { id: "obama-aca-2010", lane: "Multi-speaker", medium: "speech/transcript", era: "historical", url: "https://obamawhitehouse.archives.gov/the-press-office/remarks-president-and-vice-president-signing-health-insurance-reform-bill" },
  { id: "obama-immigration-2014", lane: "Democratic", medium: "broadcast/transcript", era: "historical", url: "https://obamawhitehouse.archives.gov/the-press-office/2014/11/20/remarks-President-address-nation-immigration" },
  { id: "trump-tax-2017", lane: "Republican", medium: "speech/transcript", era: "historical", url: "https://trumpwhitehouse.archives.gov/briefings-statements/remarks-president-trump-tax-reform-2/" },
  { id: "biden-remarks-2022", lane: "Multi-speaker", medium: "speech/interview-transcript", era: "historical", url: "https://bidenwhitehouse.archives.gov/briefing-room/speeches-remarks/2022/05/17/remarks-by-president-biden-before-air-force-one-departure-16/" },
  { id: "reagan-mondale-1984", lane: "Multi-speaker", medium: "debate/transcript", era: "historical", url: "https://www.presidency.ucsb.edu/documents/debate-between-the-president-and-former-vice-president-walter-f-mondale-kansas-city" },
] as const;

export type Source = typeof sourceCatalog[number];
export function originalLinks(html: string, index: string, host: string, path: RegExp) {
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    try {
      const url = new URL(match[1].replace(/&amp;/gi, "&"), index);
      if (url.protocol !== "https:" || url.hostname !== host || !path.test(url.pathname) ||
          url.pathname === new URL(index).pathname || url.username || url.password || url.port) continue;
      url.hash = ""; url.search = ""; links.add(url.toString());
    } catch { /* Malformed links do not enter the queue. */ }
  }
  return [...links].slice(0, 12);
}

export async function discoverOriginalLinks(source: Source) {
  const response = await fetch(source.index, { redirect: "manual", headers: { Accept: "text/html" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok || !response.headers.get("content-type")?.includes("html")) throw Error(`Index returned HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > 600_000) throw Error("Index too large");
  const html = await response.text();
  if (html.length > 600_000) throw Error("Index too large");
  const links = originalLinks(html, source.index, source.host, source.path);
  if (!links.length) throw Error("No matching original links found; check the index adapter");
  return links;
}
