import { BRAND } from "./brand.ts";
import { groupLine, NOT_SCIENTIFIC, shownTotals, type ScopeTotals } from "./constituent/rules.ts";
/**
 * What a share card says (Round 3; one fact per card since 18 Nov 2026, owner's point 10). Pure; tested in
 * tests/trial.test.mjs and tests/share-entry.test.mjs. Cards are built only from record data: never from anything a
 * reader types. A reader's own caption travels beside the image in the share sheet, never on it.
 *
 * ONE SOURCED FACT PER CARD. A card has exactly one block (`lines` has one entry), and that block carries the fact,
 * its date, its badge and its source. There are three kinds:
 *   a VOTE          one member's one vote (voteCard), or one roll call's result (rollCard);
 *   a BILL CHANGE   one change between two versions of a bill (changeCard);
 *   a DISTRICT TOTAL  what counted residents of one district said on one bill (totalCard), only from 25 counted
 *                   voters, through shownTotals, and always with "Not a scientific poll."
 * The reader's own comparison with a legislator (agreementCard) stays as one count, labelled as the reader's own.
 * `oneFact` is the check; lib/share-resolve.ts refuses to hand out a card that fails it.
 *
 * The reader's stance ("I support this bill.") is not part of the record. It is drawn only when the reader chose to
 * add it, in a separate block that says who added it (`stance`, STANCE_LABEL).
 */

export const CARD_FORMATS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 }, link: { width: 1200, height: 630 } } as const;
export type CardFormat = keyof typeof CARD_FORMATS;
export function cardFormat(value: string | null | undefined): CardFormat { return value === "story" || value === "link" ? value : "feed"; }

/** voteText and kindLabel come from lib/federal/vote-kinds (positionLine, KIND_LABEL); passed in so this file stays import-free. */
export type CardVote = { billLabel: string; billTitle: string; headline: string | null; voteText: string; kind: string; kindLabel: string; votedAt: number; sourceUrl: string };
export type CardBlock = { label: "Analysis" | "Official" | "Readers"; text: string };
export type CardLine = { what: string; describe: CardBlock; vote: string; kindLabel: string; date: string; source: string };
export type Card = { eyebrow: string; title: string; subtitle: string; lines: CardLine[]; note: string | null; footer: string;
  /** The sharer's own answer, drawn apart from the fact. Absent unless the reader switched it on. */
  stance?: string | null };

/** A card carries one fact: one block, with its date and its source. */
export function oneFact(card: Pick<Card, "lines">): boolean {
  return card.lines.length === 1 && card.lines[0].vote.trim().length > 0 && card.lines[0].date.trim().length > 0 && card.lines[0].source.trim().length > 0;
}

/* ───────────────────────────── The reader's stance, if they choose ───────────────────────────── */

export type Stance = "support" | "oppose" | "unsure";
export const STANCE_LINE: Record<Stance, string> = { support: "I support this bill.", oppose: "I oppose this bill.", unsure: "I'm unsure about this bill." };
/** Printed above the stance line on the picture, so it is never read as part of the record. */
export const STANCE_LABEL = "ADDED BY THE PERSON SHARING THIS CARD";
export function asStance(value: string | null | undefined): Stance | null { return value === "support" || value === "oppose" || value === "unsure" ? value : null; }
/**
 * The stance to draw, or null. A line is drawn only when it was asked for AND it is a reader's own answer: either the
 * answer of the reader making the card now (`own`), or one a reader already chose to put on this exact card, which
 * is what the share record says (`recorded`). Asking for a stance nobody gave draws nothing.
 */
export function stanceToDraw(input: { requested: string | null | undefined; own: Stance | null; recorded: boolean }): Stance | null {
  const s = asStance(input.requested);
  return s && (input.own === s || input.recorded) ? s : null;
}
export function withStance(card: Card, stance: Stance | null): Card { return stance ? { ...card, stance: STANCE_LINE[stance] } : card; }

const date = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
/** "clerk.house.gov/evs/2026/roll323.xml" without the scheme, so it reads as an address. */
export function sourceText(url: string) { return url.replace(/^https?:\/\//, "").replace(/^www\./, ""); }
const clip = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);

/** The blocks drawn at each size: the 630px link preview shows one block and no note so nothing overlaps (Round G fix). */
export function visibleBlocks(card: Card, format: CardFormat) { return format === "link" ? { lines: card.lines.slice(0, 1), note: null } : { lines: card.lines, note: card.note }; }

export function voteLine(v: CardVote): CardLine {
  return { what: v.headline ? `${v.billLabel}: ${clip(v.billTitle, 90)}` : v.billLabel, describe: v.headline ? { label: "Analysis", text: clip(v.headline, 140) } : { label: "Official", text: clip(v.billTitle, 140) },
    vote: v.voteText, kindLabel: v.kindLabel, date: date(v.votedAt), source: sourceText(v.sourceUrl) };
}

export function voteCard(member: { name: string; seat: string }, v: CardVote): Card {
  return { eyebrow: "HOW THEY VOTED", title: member.name, subtitle: member.seat, lines: [voteLine(v)],
    note: v.kind === "procedural" ? "A procedural vote decides how the chamber proceeds. It is not a vote on the bill itself." : null, footer: BRAND.taglineShort };
}

/**
 * The reader's own comparison with one legislator on one issue: ONE count, never a percentage, never a list of bills.
 * `votes` are the passage votes that were counted; they give the card its date (the most recent one) and its sources.
 */
export function agreementCard(member: { name: string; seat: string }, issueName: string, agreed: number, differed: number, votes: readonly CardVote[] = [], asOf = Date.now()): Card {
  const total = agreed + differed, latest = votes.reduce((m, v) => Math.max(m, v.votedAt), 0);
  const hosts = [...new Set(votes.map(v => sourceText(v.sourceUrl).split("/")[0]).filter(Boolean))].slice(0, 2);
  return { eyebrow: `MY OWN COMPARISON · ${issueName.toUpperCase()}`, title: member.name, subtitle: member.seat,
    lines: [{ what: `Bills about ${issueName.toLowerCase()} where I answered Support or Oppose and they voted on passing the bill`,
      describe: { label: "Readers", text: "My own comparison. Not a grade or score of the legislator." },
      vote: `Voted the way I did on ${agreed} of ${total} bill${total === 1 ? "" : "s"}`, kindLabel: "My own comparison", date: date(latest || asOf),
      source: `my own answers on ${BRAND.name} and recorded votes${hosts.length ? ` (${hosts.join(", ")})` : ""}` }],
    note: `Left out: procedural votes, bills with no recorded vote on passing, and my Unsure answers. Not a rating by ${BRAND.name}.`, footer: BRAND.taglineShort };
}

/* ───────────────────────────── A VOTE: one roll call's result ───────────────────────────── */

export type RollFact = { billLabel: string; billTitle: string; headline: string | null; chamber: string; question: string; result: string | null; yea: number; nay: number;
  /** false while the member votes on file do not add up to the official totals: the numbers are then left off. */
  tallyOk: boolean; kind: string; kindLabel: string; votedAt: number; sourceUrl: string };
/** "House: Passed, 392–18". The official result wording, never reworded. */
export function rollResult(f: Pick<RollFact, "chamber" | "result" | "yea" | "nay" | "tallyOk">): string {
  return `${f.chamber === "senate" ? "Senate" : "House"}: ${f.result?.trim() || "Result not stated"}${f.tallyOk && f.yea + f.nay > 0 ? `, ${f.yea}–${f.nay}` : ""}`;
}
const PROCEDURAL_NOTE = "A procedural vote decides whether or how the chamber moves to a final vote. It is not a vote on the bill itself.";
export function rollCard(f: RollFact, eyebrow = "HOW THE VOTE WENT"): Card {
  return { eyebrow, title: f.billLabel, subtitle: clip(f.billTitle, 110),
    lines: [{ what: `${f.billLabel}: ${clip(f.question, 90)}`, describe: f.headline ? { label: "Analysis", text: clip(f.headline, 140) } : { label: "Official", text: clip(f.billTitle, 140) },
      vote: rollResult(f), kindLabel: f.kindLabel, date: date(f.votedAt), source: sourceText(f.sourceUrl) }],
    note: f.kind === "procedural" ? PROCEDURAL_NOTE : null, footer: BRAND.taglineShort };
}

/* ───────────────────────────── A BILL CHANGE: one change between two versions ───────────────────────────── */

/**
 * One change, as the bill page lists them (analysis_version_changes). `key` names it in a link: "b1".."b5" is a
 * plain-language bullet (Analysis); "a-2", "c-2", "r-2" is a section added, changed or removed (Official, computed).
 */
export type ChangeItem = { key: string; label: "Analysis" | "Official"; text: string; section: string | null };
export const CHANGE_KEY = /^(b[1-5]|[acr]-[0-9A-Za-z.]{1,12})$/;
const SECTION_FACT = { a: "was added", c: "was changed", r: "was removed" } as const;
export function changeItems(row: { added?: unknown; removed?: unknown; changed?: unknown; bullets?: unknown } | null | undefined): ChangeItem[] {
  if (!row) return [];
  const list = (x: unknown) => (Array.isArray(x) ? x.map(String).filter(n => /^[0-9A-Za-z.]{1,12}$/.test(n)) : []);
  const bullets = (Array.isArray(row.bullets) ? row.bullets : []).slice(0, 5).map((b, i) => ({ key: `b${i + 1}`, label: "Analysis" as const, text: String((b as { text?: unknown })?.text ?? "").trim(), section: String((b as { section?: unknown })?.section ?? "").trim() || null }))
    .filter(b => b.text);
  const sections = (["a", "c", "r"] as const).flatMap(k => list(k === "a" ? row.added : k === "c" ? row.changed : row.removed).map(n => ({ key: `${k}-${n}`, label: "Official" as const, text: `Section ${n} ${SECTION_FACT[k]}.`, section: `Sec. ${n}` })));
  return [...bullets, ...sections];
}
export type ChangeFact = { billLabel: string; billTitle: string; fromType: string; toType: string; item: ChangeItem; at: number | string; sourceUrl: string };
export function changeCard(f: ChangeFact): Card {
  return { eyebrow: "WHAT CHANGED IN THE BILL", title: f.billLabel, subtitle: clip(f.billTitle, 110),
    lines: [{ what: `${f.billLabel}: from the ${f.fromType.toLowerCase()} text to the ${f.toType.toLowerCase()} text`,
      describe: f.item.label === "Analysis" ? { label: "Analysis", text: `One change${f.item.section ? ` (${f.item.section})` : ""}, described in plain words from the two official texts.` }
        : { label: "Official", text: "Found by comparing the section numbers of the two official texts." },
      vote: clip(f.item.text, 220), kindLabel: "Bill change", date: typeof f.at === "number" ? date(f.at) : date(Date.parse(`${f.at.slice(0, 10)}T17:00:00Z`)), source: sourceText(f.sourceUrl) }],
    note: null, footer: BRAND.taglineShort };
}

/* ───────────────────────────── A DISTRICT TOTAL: counted residents of one place on one bill ───────────────────────────── */

export type TotalFact = { billLabel: string; billTitle: string; scope: string; kind: "district" | "state"; totals: ScopeTotals | null | undefined; updatedAt: number };
/**
 * Null below 25 counted voters: the card is then not made at all. From 25, the two groups are listed mail-verified
 * first, and a group under 5 by its size only (shownTotals and groupLine decide; nothing here does).
 */
export function totalCard(f: TotalFact): Card | null {
  const shown = shownTotals(f.totals, f.kind);
  if (!shown.show) return null;
  return { eyebrow: `WHAT COUNTED RESIDENTS SAID · ${f.scope}`, title: f.billLabel, subtitle: clip(f.billTitle, 110),
    lines: [{ what: `${shown.voters} counted residents of ${f.scope} answered on ${f.billLabel}`,
      describe: { label: "Readers", text: `Counted residents are mail-verified or address-matched. ${NOT_SCIENTIFIC}` },
      vote: shown.groups.map(groupLine).join("; "), kindLabel: f.kind === "state" ? "State total" : "District total", date: date(f.updatedAt), source: `${BRAND.name}, anonymous totals of counted residents` }],
    note: null, footer: BRAND.taglineShort }; // the poll line is in the block itself, so it is on every size of the picture
}
