/**
 * Entry pages and share links (owner's points 10, 11 and 12, 18 Nov 2026): the rules as pure functions. No database,
 * no network, no request. The database side is lib/entry/store.ts; both are tested in tests/share-entry.test.mjs.
 *
 *   1. Which bill a share link is about (billRefOfTarget), so the link can open that one bill's page and no other.
 *   2. The issue entry page ("What Congress did on health care this month"): the calendar month, and the fixed
 *      wording of every line. Nothing here is written by a model, and nothing says a vote was good or bad.
 *   3. The share rate per bill view (shareRate).
 */
import { BRAND } from "../brand.ts";
import { carried, meaningfulVote, plainBillName, type MeaningfulKind } from "../flow/votes.ts";

/* ───────────────────────────── Share links ───────────────────────────── */

export const SHARE_CODE = /^[A-Za-z0-9]{7}$/;
const BILL_KEY = /^[a-z0-9-]{4,40}$/, ROLL_ID = /^[a-z0-9-]{5,40}$/;

/**
 * The bill a share link's target is about: named outright (a bill card, a change, a district total, a bill page), or
 * through one roll call (a vote card), which the database then turns into its bill. Null: the link is about no bill
 * (a dashboard card, a member's page), so it opens nothing for a visitor without an invite.
 */
export function billRefOfTarget(target: string): { billKey: string } | { rollId: string } | null {
  const [path, query = ""] = target.split("?");
  const page = path.match(/^\/(?:texas\/)?bills\/([^/]+)$/);
  if (page) { const key = decodeURIComponent(page[1]); return BILL_KEY.test(key) ? { billKey: key } : null; }
  if (path !== "/share/card") return null;
  const p = new URLSearchParams(query), bill = p.get("bill"), roll = p.get("roll");
  if (bill && BILL_KEY.test(bill)) return { billKey: bill };
  if (roll && ROLL_ID.test(roll)) return { rollId: roll };
  return null;
}
/** Where a bill's page is. Federal bills at /bills/…, a state's bills under that state's pages. */
export function billPagePath(billKey: string, level: "federal" | "state"): string {
  return level === "federal" ? `/bills/${billKey}` : `/texas/bills/${encodeURIComponent(billKey)}`;
}
/** The address a share link sends a visitor without an invite to, when shared pages are open: the bill, with the link's code. */
export function sharedBillAddress(billKey: string, level: "federal" | "state", code: string): string { return `${billPagePath(billKey, level)}?s=${code}`; }
/** The share record of a card: its page address. The same text is the key of share_links.target. */
export function cardTarget(query: string): string { return `/share/card?${query}`; }

/* ───────────────────────────── The calendar month ───────────────────────────── */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** The calendar day in Washington, where Congress sits: "2026-11-12". */
export function easternDay(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** "This month" is the calendar month in Washington at the time the page is read. */
export function monthWindow(now: number): { key: string; label: string } {
  const day = easternDay(now), key = day.slice(0, 7);
  return { key, label: `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` };
}
/** "2026-11-12" → "November 12, 2026". */
export function longDay(day: string): string {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return MONTHS[m - 1] && y && d ? `${MONTHS[m - 1]} ${d}, ${y}` : day;
}

/* ───────────────────────────── The issue entry page: wording ───────────────────────────── */

const PHRASE: Record<string, string> = { "cost-of-living-housing": "the cost of living and housing", "public-safety-crime": "public safety and crime", "tech-privacy": "technology and privacy",
  "agriculture-rural": "agriculture and rural areas", "economy-jobs": "the economy and jobs" };
/** The issue as it reads inside a sentence: "health care", "the economy and jobs". */
export function issuePhrase(slug: string, name: string): string { return PHRASE[slug] ?? name.toLowerCase().replace(/\s*&\s*/g, " and "); }
/** "What Congress did on health care this month". */
export function issueHeading(slug: string, name: string): string { return `What Congress did on ${issuePhrase(slug, name)} this month`; }
/** The two or three plain sentences under the heading: what the page is and where its facts come from. */
export function issueIntro(slug: string, name: string): string[] {
  return [
    `This page lists what the U.S. House and Senate did this month on bills about ${issuePhrase(slug, name)}: the votes they held and how each one came out, and the bills that passed a chamber, became law or were vetoed.`,
    "Every line is copied from an official record (the House Clerk, the Senate or Congress.gov) and links to it.",
    `${BRAND.name} does not grade legislators and does not take a side.`,
  ];
}
export function nothingThisMonth(slug: string, name: string, label: string): string {
  return `In ${label}, the records on this site show no vote on a bill about ${issuePhrase(slug, name)}, and no such bill passed the House or the Senate, became law or was vetoed.`;
}
export const MONTH_END = "That is everything this month.";
export const EARLIER_CAP = 5, BILLS_CAP = 10;
export function earlierEnd(shown: number, more: number): string {
  return more > 0 ? `Those are the ${shown} most recent before this month. ${more} older ${more === 1 ? "one is" : "ones are"} not listed here.` : shown === 1 ? "That is the only one before this month." : `That is all ${shown} before this month.`;
}
export function otherVotesLine(n: number): string | null {
  if (n <= 0) return null;
  return `${n} other recorded ${n === 1 ? "vote" : "votes"} this month ${n === 1 ? "was a step" : "were steps"} on the way to a decision (for example a vote on the rules for debate, or on an amendment). ${n === 1 ? "It is" : "They are"} not a vote for or against a bill and ${n === 1 ? "is" : "are"} not listed here.`;
}

export type EntryBill = { id: string; billType: string; number: number; title: string; congressUrl: string; headline: string | null };
export type EntryVote = { id: string; billId: string; chamber: string; votedAt: number; question: string; title: string | null; result: string | null; yea: number; nay: number; sourceUrl: string; tallyOk: boolean };
export type EntryAction = { billId: string; date: string; stage: string | null; chamber: string | null; text: string };
export type EntryItem = {
  key: string; day: string; kind: "vote" | "passed" | "law" | "vetoed"; billId: string; billLabel: string;
  /** The whole fact as one sentence. */
  sentence: string;
  /** Whether the bill is named by the site's summary headline (Analysis) or by its official title (Official). */
  nameLabel: "Analysis" | "Official";
  source: { url: string; text: string };
};

const LABELS: Record<string, string> = { hr: "H.R.", s: "S.", hres: "H.Res.", sres: "S.Res.", hjres: "H.J.Res.", sjres: "S.J.Res.", hconres: "H.Con.Res.", sconres: "S.Con.Res." };
export function billLabel(billType: string, number: number): string { return `${LABELS[billType] ?? billType.toUpperCase()} ${number}`; }
const chamberName = (c: string | null | undefined) => (c === "senate" ? "Senate" : c === "house" ? "House" : null);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One vote and its result, as a sentence. The same words whichever side won and whoever sponsored the bill.
 *   "The House passed the GUARD Act, 232–198."
 *   "The Senate voted on ending debate on a bill to …. The vote failed, 48–51 (60 votes were needed), so the bill stalled."
 * The count is left off while it is under review.
 */
export function voteSentence(v: { chamber: string; kind: MeaningfulKind; result: string | null; yea: number; nay: number; tallyOk: boolean; question: string }, name: string): string {
  const C = chamberName(v.chamber) ?? "Congress", other = v.chamber === "house" ? "Senate" : "House";
  const won = carried(v.result), n = v.tallyOk && v.yea + v.nay > 0 ? `, ${v.yea}–${v.nay}` : "";
  const full = name.endsWith("…") ? "" : ".";
  const asked = (what: string, wonLine: string, lostLine: string) => (won === true ? wonLine : `The ${C} voted on ${what} ${name}${full}${won === false ? ` ${lostLine}` : ""}`);
  switch (v.kind) {
    case "pass": return asked("passing", `The ${C} passed ${name}${n}.`, `It did not pass${n}.`);
    case "override": return asked("overriding the President’s veto of", `The ${C} overrode the President’s veto of ${name}${n}.`, `The veto stood${n}.`);
    case "final_version": return asked("the final House–Senate version of", `The ${C} approved the final House–Senate version of ${name}${n}.`, `It was not approved${n}.`);
    case "other_chamber": return asked(`accepting the ${other}’s changes to`, `The ${C} accepted the ${other}’s changes to ${name}${n}.`, `The changes were not accepted${n}.`);
    case "take_up": return `The ${C} voted on taking up ${name}${full} The vote failed${n}${/cloture/i.test(v.question) && n ? " (60 votes were needed)" : ""}, so the bill stalled.`;
    case "end_debate": return `The ${C} voted on ending debate on ${name}${full} The vote failed${n}${n ? " (60 votes were needed)" : ""}, so the bill stalled.`;
  }
}
/** A step the record gives with no recorded vote of its own: passed a chamber, became law, vetoed. */
export function actionSentence(a: { stage: "passed" | "law" | "vetoed"; chamber: string | null; text: string }, name: string): string {
  const full = name.endsWith("…") ? "" : ".";
  if (a.stage === "law") return `${upperFirst(name)} became law.`;
  if (a.stage === "vetoed") return `The President vetoed ${name}${full}`;
  const C = chamberName(a.chamber), how = /unanimous consent/i.test(a.text) ? " without a recorded vote (by unanimous consent)" : /voice vote/i.test(a.text) ? " by voice vote" : "";
  return `${C ? `The ${C}` : "One chamber of Congress"} passed ${name}${how}${how ? "." : full}`;
}

/**
 * Every line the page can show for one issue, newest first: each meaningful vote with its result, and each bill that
 * passed a chamber, became law or was vetoed. A passage that has its own recorded vote is listed once, as the vote.
 * `otherVotes` are the recorded votes that are not listed, by day, so the page can say how many there were this month.
 */
export function entryItems(bills: ReadonlyMap<string, EntryBill>, votes: readonly EntryVote[], actions: readonly EntryAction[]): { items: EntryItem[]; otherVotes: string[] } {
  const items: EntryItem[] = [], otherVotes: string[] = [], passedByVote = new Set<string>(), seen = new Set<string>();
  const named = (b: EntryBill) => { const label = billLabel(b.billType, b.number); return { label, name: plainBillName({ title: b.title, billType: b.billType, headline: b.headline, label }) }; };
  for (const v of votes) {
    const b = bills.get(v.billId);
    if (!b) continue;
    const day = easternDay(v.votedAt), kind = meaningfulVote({ question: v.question, result: v.result, title: v.title, billTitle: b.title, hasBill: true });
    if (!kind) { otherVotes.push(day); continue; }
    const { label, name } = named(b);
    if (kind === "pass" && carried(v.result) === true) passedByVote.add(`${v.billId}|${v.chamber}|${day}`);
    items.push({ key: `v:${v.id}`, day, kind: "vote", billId: b.id, billLabel: label, sentence: voteSentence({ ...v, kind }, name.text), nameLabel: name.label,
      source: { url: v.sourceUrl, text: v.chamber === "senate" ? "Senate roll call" : "House Clerk roll call" } });
  }
  for (const a of actions) {
    const b = bills.get(a.billId), stage = a.stage === "passed_first" || a.stage === "passed_second" ? "passed" : a.stage === "law" || a.stage === "vetoed" ? a.stage : null;
    if (!b || !stage) continue;
    const day = a.date.slice(0, 10), key = `a:${a.billId}:${stage}:${a.chamber ?? ""}:${day}`;
    if (seen.has(key) || (stage === "passed" && passedByVote.has(`${a.billId}|${a.chamber}|${day}`))) continue;
    seen.add(key);
    const { label, name } = named(b);
    items.push({ key, day, kind: stage, billId: b.id, billLabel: label, sentence: actionSentence({ stage, chamber: a.chamber, text: a.text }, name.text), nameLabel: name.label,
      source: { url: `${b.congressUrl.replace(/\/$/, "")}/all-actions`, text: "Congress.gov" } });
  }
  items.sort((x, y) => y.day.localeCompare(x.day) || x.key.localeCompare(y.key));
  return { items, otherVotes };
}

export type IssueMonth = { key: string; label: string; month: EntryItem[]; earlier: EntryItem[]; earlierMore: number; otherVotes: number };
/** This calendar month in full; before it, the most recent few and a count of the rest. Nothing dated after today is shown. */
export function splitMonth(all: { items: EntryItem[]; otherVotes: string[] }, now: number, earlierCap = EARLIER_CAP): IssueMonth {
  const { key, label } = monthWindow(now), today = easternDay(now);
  const past = all.items.filter(i => i.day <= today), month = past.filter(i => i.day.startsWith(key)), before = past.filter(i => i.day < `${key}-01`);
  return { key, label, month, earlier: before.slice(0, earlierCap), earlierMore: Math.max(0, before.length - earlierCap), otherVotes: all.otherVotes.filter(d => d.startsWith(key) && d <= today).length };
}

/* ───────────────────────────── Share rate per bill view (point 12) ───────────────────────────── */

/** The page-view counters that are a bill page read by a reader. The editor's own views and the closed notice are left out. */
export const BILL_VIEW_DIMS = ["trial", "public", "shared"].flatMap(a => [`${a}:/bills/[id]`, `${a}:/texas/bills/[id]`]);
/** Counted once each time the share screen is opened from a bill page's share menu. The dimension is "bill:<card kind>". */
export const SHARE_START_EVENT = "share_start";
export function shareRate(billViews: number, sharesStarted: number): number | null { return billViews > 0 ? Math.round((1000 * sharesStarted) / billViews) / 1000 : null; }
