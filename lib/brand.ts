/**
 * The product's name, in one place. Every page, card, email and meta tag reads from here.
 *
 * Owner, 17 Nov 2026: the product is called "Constituent". "On Record" stays as the name of the voting-record section
 * (BRAND.recordSection: the menu entry for members' records and the record section on a member's page). The tagline
 * stays. NEXT_PUBLIC_BRAND_NAME in Vercel still overrides the name without a code change.
 * Pure: no imports, so tests and scripts load it directly.
 *
 * Not for renaming: the repository, the Vercel project and the site address (they wait for a domain), cookie names,
 * the invite-link signing string in lib/trial-token.ts and database names. Those keep their "or_" / "on-record"
 * spellings, because changing them would sign every reader out and break every invite link.
 */
const DEFAULT_NAME = "Constituent";
const name = (process.env.NEXT_PUBLIC_BRAND_NAME ?? "").trim() || DEFAULT_NAME;

export const BRAND = {
  /** The product name: "Constituent" unless NEXT_PUBLIC_BRAND_NAME says otherwise. */
  name,
  /** The name of the voting-record section. Shown as its own name only when the product is called something else. */
  recordSection: "On Record",
  /** True when the product and the voting-record section have different names. */
  hasSeparateRecordName: name !== "On Record",
  tagline: "Talk is cheap. The record isn't.",
  taglineShort: "Talk is cheap.",
  /** The wordmark as drawn in the top bar. A name of several words sets its last word apart; a one-word name is drawn whole. */
  wordmark: (() => { const w = name.toUpperCase().split(/\s+/); return w.length > 1 ? { lead: w.slice(0, -1).join(" "), tail: w[w.length - 1] } : { lead: "", tail: w[0] }; })(),
  /** The name in capitals, for eyebrows and the footer of share cards. */
  nameUpper: name.toUpperCase(),
  /** For outgoing requests to official sources ("Constituent/0.2 (+https://…)"). Letters and digits only, so it is always a valid header. */
  userAgentName: name.replace(/[^A-Za-z0-9]+/g, "") || DEFAULT_NAME,
  /**
   * The home-screen and notification icons. The original icons have "ON REC." drawn on them, so they are used only
   * while the product is called "On Record"; under another name the plain mark (no words) is used instead.
   */
  icons: name === "On Record" ? { small: "/icon-192.png", large: "/icon-512.png" } : { small: "/icon-mark-192.png", large: "/icon-mark-512.png" },
  /** For the names of files a reader saves ("constituent-recap.png"). */
  fileSlug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "record",
} as const;

/** "<page> · <product name>". */
export const brandTitle = (page: string) => `${page} · ${BRAND.name}`;

/**
 * The label of the place that holds members' voting records (the "Politicians" menu entry). It keeps its usual label
 * while the product is called "On Record"; under another product name it becomes the voting-record section's own name.
 */
export const recordSectionLabel = (usual: string) => (BRAND.hasSeparateRecordName ? BRAND.recordSection : usual);
