/**
 * Which measures get a plain-English summary (owner, 20 Nov 2026): "Resolutions that do something themselves (war
 * powers, disapproval of a rule, impeachment, constitutional amendments) get a full summary like any bill. Only
 * debate-rule and purely ceremonial resolutions are excluded. … Never show 'summary coming' for something that will
 * not get one."
 *
 *   summarised    a bill, a joint resolution, or a simple or concurrent resolution that does something itself
 *   debate_rule   a House resolution that only sets the rules for debating another measure (lib/procedural.ts)
 *   ceremonial    a resolution that only honours, marks a day, or handles the chamber's own housekeeping
 *
 * Decided from the measure's type and official title alone, by fixed rules, the same for every sponsor. Pure (one
 * relative import), so node's test runner loads it: tests/summary-scope.test.mjs.
 */
import { isDebateRule } from "./procedural.ts";

export type SummaryScope = "summarised" | "debate_rule" | "ceremonial";
export const RESOLUTION_TYPES = ["hres", "sres", "hconres", "sconres"] as const;
/** Every federal type a summary can be written for; the title decides for the last four. */
export const SUMMARY_TYPES = ["hr", "s", "hjres", "sjres", ...RESOLUTION_TYPES] as const;

// How a purely ceremonial or housekeeping resolution's title opens. A resolution that takes a position on policy
// ("Condemning …", "Expressing the sense of the House that …") is not on this list: it does say something of its own.
const CEREMONIAL = new RegExp("^(?:" + [
  "honoring", "recognizing", "commemorating", "congratulating", "celebrating", "commending", "mourning", "remembering", "saluting", "thanking",
  "expressing (?:the )?(?:condolences|gratitude|appreciation|sympathy)", "expressing support for (?:the )?(?:designation|goals)", "supporting the (?:goals and ideals|designation)",
  "designating", "electing", "ranking (?:a )?(?:certain )?members?", "providing for (?:a |an )?(?:conditional )?(?:adjournment|recess)", "providing for a joint session",
  "providing for the printing", "authorizing the printing", "authorizing the use of (?:the )?(?:capitol|rotunda|emancipation hall)", "permitting the use of",
  "fixing the (?:daily )?hour", "notifying the", "to inform the", "informing the", "adopting the rules of the house", "providing amounts for the expenses",
].join("|") + ")\\b", "i");

const typeOf = (v: { billType?: string | null; billId?: string | null }) => (v.billType ?? String(v.billId ?? "").match(/^\d+-([a-z]+)-\d+$/)?.[1] ?? "").toLowerCase();

/** Where a measure falls. A measure whose type is not known (a Texas bill) is "summarised": Texas summaries are decided elsewhere. */
export function summaryScope(v: { billType?: string | null; billId?: string | null; title?: string | null }): SummaryScope {
  const type = typeOf(v);
  if (!(RESOLUTION_TYPES as readonly string[]).includes(type)) return "summarised";
  const title = String(v.title ?? "").replace(/\s+/g, " ").trim();
  if (isDebateRule({ billType: type, title })) return "debate_rule";
  return CEREMONIAL.test(title) ? "ceremonial" : "summarised";
}
