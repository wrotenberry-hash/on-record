/**
 * The briefing a reader can finish without opening anything (owner, 20 Nov 2026, from trial feedback: "readers want
 * the briefing to be readable without clicking through").
 *
 * Each bill shows, inline: the plain-English headline; "Today:" one sentence on how things work now; "This bill:" one
 * or two sentences on exactly what would change; where it stands; and, where relevant, how the reader's own
 * legislators voted. Every word of the first three comes from the approved summary: nothing is written for a
 * briefing. A bill with no approved summary shows its title and where it stands, and says a summary is coming. At
 * most five items, then "You're caught up." Pure: relative imports only.
 */
import { unexplainedAcronyms, unexplainedJargon } from "./analysis/standard.ts";
import { toneProblems } from "./analysis/tone.ts";

/** Off until the owner has seen three real items ("Show me three real briefing items in the new format before it goes live to trial readers"). */
export const BRIEFING_INLINE_LIVE = false;
/** Bumped when the way an item is cut from a summary changes, so each summary's item is tested again. */
export const INLINE_VERSION = "i1";
export const MAX_ITEMS = 5;
export const CAUGHT_UP = "You're caught up.";
export const SUMMARY_COMING = "A plain-English summary of this bill is coming.";
export const NO_SUMMARY_YET = "There is no plain-English summary of this bill yet.";
/** An approved summary whose short version has not passed the reader test on its own: the two lines are held back, and the reader is told where the summary is. */
export const SHORT_NOT_READY = "The short version of this bill's summary is not ready. The full explanation has the plain-English summary.";
export const FULL_EXPLANATION = "Full explanation";
export const INLINE_LIMITS = { headlineWords: 20, todayWords: 45, todayMinWords: 5, thisBillWords: 75, thisBillMinWords: 5 };

const ABBREV = /\b(?:U\.S|H\.R|H\.J|S\.J|Res|Sen|Rep|Dr|Mr|Ms|Mrs|No|Sec|St|Inc|Co|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|a\.m|p\.m|vs|etc|[A-Z])$/;
/** Sentences of a text, as written. A full stop after an abbreviation, an initial or inside a number does not end one. */
export function sentencesOf(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim(), out: string[] = [];
  let from = 0;
  for (const m of t.matchAll(/[.!?]["”')\]]*(?= |$)/g)) {
    const end = m.index! + m[0].length, before = t.slice(from, m.index!);
    if (m[0][0] === "." && ABBREV.test(before)) continue;
    const next = t.slice(end).trimStart();
    if (next && !/^[A-Z0-9“"‘'($\[]/.test(next)) continue;
    out.push(t.slice(from, end).trim()); from = end;
  }
  const rest = t.slice(from).trim(); if (rest) out.push(rest);
  return out;
}
const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** The summary's rows were written to sit under "Today" and "If this passes"; a row that repeats that lead-in loses it, and nothing else changes. */
const withoutLeadIn = (s: string, re: RegExp) => cap(s.trim().replace(re, "").trim());

export type SummaryForInline = { headline: string; changes: ReadonlyArray<{ today: string; ifPassed: string; before?: string; label?: string }>; howItWorksToday: ReadonlyArray<{ text: string }> };
export type InlineText = { headline: string; today: string; thisBill: string };

/**
 * The three lines, cut from an approved summary: the headline as it stands; the first sentence of the first change
 * row's "today" (or, failing that, of "how it works today"); and the first one or two sentences of that row's "if
 * this passes". Null when the summary has neither (an older format): then the item shows no inline text.
 */
export function inlineFromSummary(s: SummaryForInline): InlineText | null {
  const row = s.changes.find(r => r.today?.trim() && r.ifPassed?.trim()) ?? null;
  const todaySrc = row?.today?.trim() || s.howItWorksToday[0]?.text?.trim() || "", billSrc = row?.ifPassed?.trim() || "";
  if (!s.headline.trim() || !todaySrc || !billSrc) return null;
  const today = withoutLeadIn(sentencesOf(todaySrc)[0] ?? "", /^(?:today|now|currently|at present|under current law),?\s+/i);
  const thisBill = withoutLeadIn(sentencesOf(billSrc).slice(0, 2).join(" "), /^if (?:this|the bill|it) (?:passes|passed|becomes law),?\s+/i);
  return today && thisBill ? { headline: s.headline.trim(), today, thisBill } : null;
}

/**
 * Why an item cannot be shown inline, by rule (the reader test in lib/briefing-test.ts comes after these). An item is
 * read with nothing else in front of the reader, so it may not lean on the full page: no pointer to another part of
 * the page, no term or set of initials the item itself does not explain.
 */
export function inlineProblems(t: InlineText): string[] {
  const out: string[] = [];
  if (wc(t.headline) > INLINE_LIMITS.headlineWords) out.push(`The headline is ${wc(t.headline)} words; the limit is ${INLINE_LIMITS.headlineWords}.`);
  const n = sentencesOf(t.today).length, m = sentencesOf(t.thisBill).length;
  if (n !== 1) out.push(`“Today” must be one sentence; it is ${n}.`);
  if (m < 1 || m > 2) out.push(`“This bill” must be one or two sentences; it is ${m}.`);
  if (wc(t.today) > INLINE_LIMITS.todayWords || wc(t.today) < INLINE_LIMITS.todayMinWords) out.push(`“Today” is ${wc(t.today)} words; it should be ${INLINE_LIMITS.todayMinWords} to ${INLINE_LIMITS.todayWords}.`);
  if (wc(t.thisBill) > INLINE_LIMITS.thisBillWords || wc(t.thisBill) < INLINE_LIMITS.thisBillMinWords) out.push(`“This bill” is ${wc(t.thisBill)} words; it should be ${INLINE_LIMITS.thisBillMinWords} to ${INLINE_LIMITS.thisBillWords}.`);
  // A line may open with "They" or "It": the headline sits directly above it and names who or what. What a line may not
  // do is point at another part of the page, which the reader of a briefing does not have.
  for (const [name, line] of [["Today", t.today], ["This bill", t.thisBill]] as const)
    if (/\b(?:see|as noted|as described|described|mentioned|explained) (?:above|below|earlier)\b|\bthe (?:above|following)\b/i.test(line)) out.push(`“${name}” refers to another part of the page.`);
  const parts = [t.headline, t.today, t.thisBill];
  const acr = unexplainedAcronyms(parts); if (acr.length) out.push(`Initials the item does not explain: ${acr.join(", ")}.`);
  const jar = unexplainedJargon(parts); if (jar.length) out.push(`Terms the item does not explain: ${[...new Set(jar.map(j => j.term))].join(", ")}.`);
  if (toneProblems(parts.join(" ")).length) out.push("The wording is not calm.");
  return out;
}

export type BriefEvent = "passed" | "failed" | "blocked" | "coming" | "hearing";
/** One thing the briefing may show, before any summary text is attached. `voteId` is the roll call it reports, when it is one. */
export type BriefPick = { key: string; system: "federal" | "texas"; billKey: string | null; label: string; title: string; href: string; date: string; event: BriefEvent;
  /** What happened, from the official record ("House, 417–3."). */ note: string; voteId?: string | null; chamber?: "house" | "senate" | null };

const EVENT_ORDER: Record<BriefEvent, number> = { passed: 0, failed: 1, blocked: 2, coming: 3, hearing: 4 };
/**
 * At most five items, each bill once. Bills with an approved summary come first (they are the ones a reader can
 * finish here); within that, what was decided comes before what is coming, newest first.
 */
export function pickItems(candidates: readonly BriefPick[], hasSummary: (billKey: string) => boolean, max = MAX_ITEMS): BriefPick[] {
  const seen = new Set<string>(), unique: BriefPick[] = [];
  for (const c of candidates) { const k = c.billKey ?? c.key; if (seen.has(k)) continue; seen.add(k); unique.push(c); }
  const rank = (c: BriefPick) => (c.billKey && hasSummary(c.billKey) ? 0 : 1);
  return unique.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || EVENT_ORDER[a.c.event] - EVENT_ORDER[b.c.event] || b.c.date.localeCompare(a.c.date) || a.i - b.i)
    .slice(0, Math.max(0, max)).map(x => x.c);
}

/** One item as a reader sees it. `today` and `thisBill` are null when no approved summary may be shown inline. */
export type InlineItem = { key: string; label: string; href: string; headline: string; today: string | null; thisBill: string | null;
  /** Where the bill stands, from the official record. */ stands: string; /** How the reader's own legislators voted; empty when not relevant or not known. */ legislators: string[];
  /** Shown in place of the two lines when there is no approved summary to show. */ note: string | null };

const EVENT_WORD: Record<BriefEvent, string> = { passed: "Passed", failed: "Failed", blocked: "Stopped by a procedural vote", coming: "Coming up", hearing: "Hearing" };
/** Where it stands when the fuller line is not on file: the event itself, from the record. */
export function standsFallback(p: Pick<BriefPick, "event" | "note" | "date">): string {
  const note = p.note.trim().replace(/\.+$/, "");
  return `${EVENT_WORD[p.event]}${note ? `: ${note}` : ""}.`;
}

/** The item as plain text: what an email carries, and exactly what the reader test is shown. */
export function itemText(i: InlineItem, opts: { link?: string } = {}): string {
  return [`${i.label}: ${i.headline}`, ...(i.today && i.thisBill ? [`Today: ${i.today}`, `This bill: ${i.thisBill}`] : i.note ? [i.note] : []), `Where it stands: ${i.stands}`,
    ...(i.legislators.length ? [`Your legislators: ${i.legislators.join(" ")}`] : []), ...(opts.link ? [`${FULL_EXPLANATION}: ${opts.link}`] : [])].join("\n");
}

/** The whole briefing as plain text for email: at most five items, then the closing line. */
export function briefingInlineText(title: string, items: readonly InlineItem[], site: string, footer: readonly string[] = []): string {
  const shown = items.slice(0, MAX_ITEMS);
  return [title, "", ...(shown.length ? shown.flatMap(i => [itemText(i, { link: `${site}${i.href}` }), ""]) : ["Nothing was decided or scheduled in this period.", ""]), CAUGHT_UP, ...(footer.length ? ["", ...footer] : [])].join("\n");
}
