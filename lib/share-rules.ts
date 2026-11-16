/**
 * Round G pure sharing rules (no imports; tested in tests/dashboard.test.mjs).
 */

/** Only same-site paths to one item may be shortened. */
export function shareableTarget(path: string) { return /^\/(bills|politicians|texas|share|dashboard|recap|briefing|compare)(\/[\w\-./?=&%]*)?$/.test(path) && !path.includes(".."); }

/** The plain-facts caption for a card: title, first block, note. The title is skipped when the block already starts with it (Round G fix). */
export function captionFromCard(c: { title: string; note: string | null; lines: { what: string; vote: string; date: string }[] }) {
  return [c.lines[0]?.what.startsWith(c.title) ? null : c.title, c.lines[0] ? `${c.lines[0].what}: ${c.lines[0].vote} (${c.lines[0].date})` : null, c.note].filter(Boolean).join(". ").replace(/\.\./g, ".");
}

/** Caption that travels beside the image: plain facts plus the exact link. Never drawn on the image. */
export function captionWith(text: string, link: string | null) { return link ? `${text}\n\nThe record and its source: ${link}` : text; }

/** Bluesky's 300-character limit, keeping the link whole and marking it as a link facet (UTF-8 byte offsets). */
export function blueskyText(caption: string, link: string) {
  const body = caption.replace(link, "").replace(/\s*The record and its source:\s*$/, "").trim();
  const room = 300 - link.length - 2, text = `${body.length > room ? `${body.slice(0, room - 1).replace(/\s+\S*$/, "")}…` : body}\n\n${link}`;
  const enc = new TextEncoder(), start = enc.encode(text.slice(0, text.lastIndexOf(link))).length;
  return { text, facets: [{ index: { byteStart: start, byteEnd: start + enc.encode(link).length }, features: [{ $type: "app.bsky.richtext.facet#link", uri: link }] }] };
}
