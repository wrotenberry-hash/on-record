/**
 * One bill in a list of votes (owner, 20 Nov 2026, from three trial readers: "the reader sees the vote but not what the
 * bill is, and the only way in is the underlined bill number, which does not read as a link to an explanation").
 *
 * Everywhere a vote is listed, the row reads in this order:
 *   1. the plain-English headline of the bill (never the bill number);
 *   2. one sentence on what the bill does, from the approved summary;
 *   3. how the legislator voted;
 *   4. the bill number, small;
 *   and it ends with a labelled link, "What this bill does". The whole row can be tapped.
 *
 * A bill with no approved summary shows its official title and "Plain-English explanation coming", and still links to
 * the bill page. Nothing here is written for the row: the headline and the sentence are the approved summary's own
 * words, picked by a fixed rule. Pure (relative imports only), so node's test runner loads it: tests/bill-row.test.mjs.
 */
import { sentencesOf } from "./briefing-inline.ts";
import { clip } from "./flow/votes.ts";
import { summaryScope } from "./summary-scope.ts";

/** The owner's wording. */
export const WHAT_THIS_BILL_DOES = "What this bill does";
export const EXPLANATION_COMING = "Plain-English explanation coming";
/** A bill known only from a roll call: its record, and so its title, has not been loaded yet. */
export const TITLE_NOT_ON_FILE = "Official title not on file yet";

/** What an approved summary gives a row. Only summaries a reader may see are ever passed in (lib/analysis/publish-gate.ts). */
export type RowSummary = { headline: string; plainEnglish?: string | null; whatItDoes?: ReadonlyArray<{ text: string }> | null };
export type BillRowText = {
  /** The main line: the summary's headline, or the official title. */ main: string;
  /** One sentence on what the bill does; null when there is no approved summary (or it has no such sentence). */ does: string | null;
  /** True when there is no approved summary: the row says an explanation is coming. */ coming: boolean;
  label: "Analysis" | "Official";
  /** The bill number, shown small: "H.R. 1234". */ number: string;
};

// The summary's "In plain English" part is two or three sentences: often how things work today, then what the bill
// does, then where it stands. The sentence about the bill is the first one that says "this bill" (or "this new law"
// once it is signed), at its start or after "Today …;".
const NAMES_THE_BILL = /\bthis (?:(?:new|proposed) )?(?:bill|law|measure|resolution|joint resolution|act)\b/i;

/**
 * One sentence on what the bill does, in the approved summary's own words: the first sentence of "In plain English"
 * that says "this bill" ("This bill would …", "Today …; this bill lets …", "This new law lets …"); when none does, the
 * first line of the summary's "What it does" list. A sentence is taken whole: never cut and never reworded.
 */
export function whatItDoesSentence(s: Pick<RowSummary, "plainEnglish" | "whatItDoes">): string | null {
  const named = sentencesOf(String(s.plainEnglish ?? "")).find(x => NAMES_THE_BILL.test(x));
  if (named) return named;
  const first = sentencesOf(String(s.whatItDoes?.[0]?.text ?? ""))[0]?.trim();
  return first ? (/[.!?]["”')\]]*$/.test(first) ? first : `${first}.`) : null;
}

const NUMBER_ONLY = /^(?:H|S)\.\s?(?:R\.|J\.\s?Res\.|Con\.\s?Res\.|Res\.)?\s?\d+(?:,? as amended)?$/i;
/**
 * The official title as a main line. A title that is really the wording of a floor motion, or only the bill's own
 * number, is not a title: the row then says the title is not on file yet. Long titles are cut at a word, marked "…".
 */
export function officialMain(title: string | null | undefined): string {
  const t = String(title ?? "").replace(/\s+/g, " ").trim().replace(/,? as amended$/i, "").replace(/\.$/, "");
  if (!t || /^motion to\b/i.test(t) || NUMBER_ONLY.test(t)) return TITLE_NOT_ON_FILE;
  return clip(t, 140);
}

/**
 * The row for one bill. `summary` is the newest summary a reader may see, or null. `billType` is the federal type
 * ("hr", "hres", …) when known; leave it out for a Texas bill. A measure that will never get a summary (a debate rule,
 * a purely ceremonial resolution: lib/summary-scope.ts) does not say one is coming.
 */
export function billRowText(b: { number: string; title: string | null | undefined; summary?: RowSummary | null; billType?: string | null }): BillRowText {
  const headline = String(b.summary?.headline ?? "").replace(/\s+/g, " ").trim();
  if (b.summary && headline) return { main: headline, does: whatItDoesSentence(b.summary), coming: false, label: "Analysis", number: b.number };
  return { main: officialMain(b.title), does: null, coming: summaryScope({ billType: b.billType, title: b.title }) === "summarised", label: "Official", number: b.number };
}

const TYPE_LABELS: Record<string, string> = { hr: "H.R.", s: "S.", hres: "H.Res.", sres: "S.Res.", hjres: "H.J.Res.", sjres: "S.J.Res.", hconres: "H.Con.Res.", sconres: "S.Con.Res." };
/** "119-hr-2102" → "H.R. 2102"; null when the id is not a federal bill id. */
export function numberFromBillId(id: string | null | undefined): string | null {
  const m = String(id ?? "").match(/^\d+-([a-z]+)-(\d+)$/);
  return m ? `${TYPE_LABELS[m[1]] ?? m[1].toUpperCase()} ${Number(m[2])}` : null;
}
/** "119-hres-1247" → "hres"; null when the id is not a federal bill id. */
export const typeFromBillId = (id: string | null | undefined): string | null => String(id ?? "").match(/^\d+-([a-z]+)-\d+$/)?.[1] ?? null;

// Federal ("H.R. 1234", "S.J.Res. 12", "HR 1234") and Texas ("HB 2", "SJR 81") bill numbers, and nothing else in the text.
const BARE = /^(?:H\.?\s?R\.?|S\.?|H\.?\s?J\.?\s?Res\.?|S\.?\s?J\.?\s?Res\.?|H\.?\s?Con\.?\s?Res\.?|S\.?\s?Con\.?\s?Res\.?|H\.?\s?Res\.?|S\.?\s?Res\.?|HB|SB|HJR|SJR|HCR|SCR|HR|SR)\s?\d+$/i;
/** The owner's rule: "No link on the site should be a bare bill number." True when a link's words are only a bill number. */
export function isBareBillNumber(text: string | null | undefined): boolean {
  return BARE.test(String(text ?? "").replace(/\s+/g, " ").trim());
}
