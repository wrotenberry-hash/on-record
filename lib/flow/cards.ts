/**
 * The first screen (owner, 18 Nov 2026; docs/PERSUASION_RETENTION.md, points 1, 2 and 6): the words around a reader's
 * legislators. The heading ("Your five legislators"), the party as its own word, the seat, the last three meaningful
 * votes on a card, what the screen says about follows and alerts, and the lines that end the home screen's lists.
 *
 * One layout and one set of words for every member: nothing here looks at who a member is or which party they are in,
 * beyond spelling the party's own name. Pure, with relative imports only, so node's test runner loads it directly
 * (tests/first-screen.test.mjs).
 */
import { placeName } from "../constituent/rules.ts";
import { meaningfulVote, plainBillName, txMeaningfulVote, txVoteLine, voteLine, type BillName, type MeaningfulKind, type TxMeaningfulKind } from "./votes.ts";

/* ------------------------------------------------------------------- numbers --- */

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** 5 → "five". Past ten the figure is used. */
export function numberWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}

/* ------------------------------------------------------------------- heading --- */

/**
 * The heading over the cards. "Your five legislators" only when all five are found (two U.S. senators, the U.S.
 * representative, the state senator and the state representative). Otherwise it says what is on the screen:
 * "Your three legislators in Congress", "Your two U.S. senators". A vacant seat or a seat that still needs a street
 * address is not counted.
 */
export function legislatorsHeading(n: { senators: number; representative: number; state: number }): string {
  const federal = n.senators + n.representative, all = federal + n.state;
  if (all === 0) return "Your legislators";
  if (n.state === 0) {
    if (n.representative === 0) return n.senators === 1 ? "Your U.S. senator" : `Your ${numberWord(n.senators)} U.S. senators`;
    return federal === 1 ? "Your legislator in Congress" : `Your ${numberWord(federal)} legislators in Congress`;
  }
  return all === 1 ? "Your legislator" : `Your ${numberWord(all)} legislators`;
}

/**
 * What a place could not find, in one plain sentence, or null when everyone was found. A ZIP code alone finds the
 * members of Congress; the two Texas state legislators need a street address, and so does a House district when the
 * ZIP crosses a line.
 */
export function notFoundLine(i: { source: "zip" | "address"; needsAddress: boolean; chooseDistrict: boolean }): string | null {
  const missing = [...(i.chooseDistrict ? ["your U.S. representative"] : []), ...(i.needsAddress ? ["your Texas state senator", "your Texas state representative"] : [])];
  if (!missing.length) return null;
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  if (i.source === "address") return `That address did not find ${list}. ${i.chooseDistrict ? "Choose your district below." : "Check it and try again below."}`;
  return `A ZIP code alone could not find ${list}. ${i.needsAddress ? "Add your street address below." : "Choose your district below, or add your street address."}`;
}

/* --------------------------------------------------------------- party and seat --- */

// How the sources spell each party, and the one word the cards use. A spelling list, nothing else: no party changes
// what a card shows or how it looks.
const PARTY_WORDS: Record<string, string> = { democrat: "Democrat", democratic: "Democrat", d: "Democrat", republican: "Republican", r: "Republican", independent: "Independent", i: "Independent",
  libertarian: "Libertarian", l: "Libertarian", green: "Green" };
export const NO_PARTY = "Party not listed";

/** The party as its own word: "Republican", "Democrat", "Independent". A party the list does not know keeps its own name. */
export function partyWord(party: string | null | undefined): string {
  const p = String(party ?? "").replace(/\s+/g, " ").trim();
  return p ? PARTY_WORDS[p.toLowerCase()] ?? p : NO_PARTY;
}

/** "U.S. Senator for Texas", "U.S. Representative for Texas, District 37", "Texas State Senator, District 14". */
export function seatLine(m: { level: "federal"; chamber: string; state: string; district: number | null } | { level: "state"; chamber: "upper" | "lower"; district: string }): string {
  if (m.level === "state") return `Texas State ${m.chamber === "upper" ? "Senator" : "Representative"}, District ${m.district}`;
  if (m.chamber === "senate") return `U.S. Senator for ${placeName(m.state)}`;
  return `U.S. Representative for ${placeName(m.state)}${m.district ? `, District ${m.district}` : " (at large)"}`;
}

/* ------------------------------------------------------------------- photos --- */

/** Up to two letters for the placeholder: the first letter of the first and the last name ("Sarah Eckhardt" → "SE"). */
export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)|["“”]/g, " ").split(/[\s,]+/).filter(w => /^\p{L}/u.test(w) && !/^(jr|sr|ii|iii|iv)\.?$/i.test(w));
  if (!parts.length) return "?";
  const first = parts[0], last = parts.length > 1 ? parts[parts.length - 1] : "";
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}
export const photoAlt = (name: string) => `Official portrait of ${name}`;
export const noPhotoLabel = (name: string) => `No official photo on file for ${name}`;

/* ------------------------------------------------------- the last three votes --- */

export const VOTES_PER_CARD = 3;
export type CardVote = { line: string; label: BillName["label"]; when: number | string; billHref: string; billLabel: string; billId: string | null };

const LABELS: Record<string, string> = { hr: "H.R.", s: "S.", hres: "H.Res.", sres: "S.Res.", hjres: "H.J.Res.", sjres: "S.J.Res.", hconres: "H.Con.Res.", sconres: "S.Con.Res." };
export const billLabel = (billType: string, number: number) => `${LABELS[billType] ?? billType.toUpperCase()} ${number}`;

export type FedVoteRow = { rollCallId: string; votedAt: number; question: string; title: string | null; result: string | null; yea: number; nay: number; chamber: string;
  billId: string; billTitle: string; billType: string; number: number; position: string };
export type MeaningfulFed = FedVoteRow & { kind: MeaningfulKind };

/** A member's recorded votes (newest first) → only the meaningful ones, in the same order (lib/flow/votes.ts decides). */
export function meaningfulFed(rows: readonly FedVoteRow[]): MeaningfulFed[] {
  return rows.flatMap(v => { const kind = meaningfulVote({ question: v.question, result: v.result, title: v.title, billTitle: v.billTitle, hasBill: true }); return kind ? [{ ...v, kind }] : []; });
}

/** One vote on a card: the plain line, its date and the link to the bill. `headline` is the Analysis headline when a summary is on show. */
export function fedCardVote(v: MeaningfulFed, o: { headline?: string | null; tallyUnderReview?: boolean } = {}): CardVote {
  const label = billLabel(v.billType, v.number), name = plainBillName({ title: v.billTitle, billType: v.billType, headline: o.headline, label });
  return { line: voteLine({ position: v.position, kind: v.kind, name: name.text, result: v.result, yea: v.yea, nay: v.nay, question: v.question, chamber: v.chamber, billType: v.billType, tallyUnderReview: o.tallyUnderReview }),
    label: name.label, when: v.votedAt, billHref: `/bills/${v.billId}`, billLabel: label, billId: v.billId };
}

export type TxVoteRow = { motion: string; date: string; result: string; counts: unknown; tallyOk: number; option: string; billId: string; identifier: string; title: string };
export type MeaningfulTx = TxVoteRow & { kind: TxMeaningfulKind };

export function meaningfulTx(rows: readonly TxVoteRow[]): MeaningfulTx[] {
  return rows.flatMap(r => { const kind = txMeaningfulVote(r.motion); return kind ? [{ ...r, kind }] : []; });
}

export function txCardVote(v: MeaningfulTx): CardVote {
  const counts = (v.counts ?? null) as Record<string, number> | null, name = plainBillName({ title: v.title, billType: "hb", label: v.identifier });
  return { line: txVoteLine({ option: v.option, kind: v.kind, name: name.text, result: v.result, yes: counts?.yes, no: counts?.no, tallyOk: v.tallyOk === 1 }), label: name.label,
    when: v.date, billHref: `/texas/bills/${encodeURIComponent(v.billId)}`, billLabel: v.identifier, billId: null };
}

/**
 * The line that ends a card's votes. Three shown of more: how many there are. Fewer than three on record: it says so.
 * `atLeast` is true when only the member's latest recorded votes were read, so the count is a floor, not the full number.
 */
export function cardVotesNote(shown: number, total: number, atLeast = false): string | null {
  if (shown <= 0) return null;
  if (total > shown) return `The ${numberWord(shown)} most recent of ${atLeast ? "at least " : ""}${total} votes on bills in the past 12 months.`;
  if (shown < VOTES_PER_CARD) return `Only ${numberWord(shown)} vote${shown === 1 ? "" : "s"} on ${shown === 1 ? "a bill" : "bills"} on record in the past 12 months.`;
  return `All ${numberWord(shown)} votes on bills on record in the past 12 months.`;
}

/* --------------------------------------------------------- follows and alerts --- */

export type FollowSummary = { line: string; alerts: string; button: string | null; all: boolean };

/**
 * What the screen says about follows, in the reader's own numbers: "You follow all five. Vote alerts are on." When a
 * reader does not follow every one of their own legislators there is one button, named with the real number.
 */
export function followSummary(i: { total: number; followed: number; alertsOn: boolean }): FollowSummary | null {
  if (i.total <= 0) return null;
  const all = i.followed >= i.total, alerts = `Vote alerts are ${i.alertsOn ? "on" : "off"}.`;
  if (all) return { all, alerts, button: null, line: i.total === 1 ? "You follow your legislator." : i.total === 2 ? "You follow both." : `You follow all ${numberWord(i.total)}.` };
  return { all, alerts, button: i.total === 1 ? "Follow your legislator" : i.total === 2 ? "Follow both" : `Follow all ${numberWord(i.total)}`,
    line: i.followed === 0 ? `You do not follow ${i.total === 1 ? "your legislator" : "any of your legislators"} yet.` : `You follow ${numberWord(i.followed)} of your ${numberWord(i.total)} legislators.` };
}

/**
 * How an alert reaches the reader. The site cannot switch either one on for them: a phone asks permission before it
 * shows notifications, and email needs an address. Each line says which is the case today, and `links` are the
 * places to change it (the Following page and the Account page, which already exist).
 */
export function deliveryLines(i: { devices: number; hasEmail: boolean; alertsOn: boolean; emailOpen?: boolean }): { push: string; email: string; links: { href: string; label: string }[] } {
  // 19 Nov: until the site has its own sending address it emails no reader, so the line must not offer email.
  const emailOpen = i.emailOpen !== false;
  return {
    push: i.devices > 0 ? `Notifications are on for ${numberWord(i.devices)} device${i.devices === 1 ? "" : "s"}.`
      : "To get them on this phone or computer, turn on notifications on your Account page. Your device will ask for your permission first.",
    email: !emailOpen ? "Alerts by email are not switched on yet." : i.hasEmail ? "They also go to the email address on your account." : "To get them by email, add your email address on your Account page.",
    links: [{ href: "/following", label: "Change who you follow" },
      { href: "/account#alerts", label: !i.alertsOn ? "Turn on vote alerts" : i.devices > 0 ? "Change or turn off alerts" : "Turn on notifications, or turn alerts off" },
      ...(i.hasEmail || !emailOpen ? [] : [{ href: "/account", label: "Add your email address" }])],
  };
}

/* ------------------------------------------------------------ how a list ends --- */

export const CAUGHT_UP = "You’re caught up.";

/**
 * The line that ends a list (owner's point 6: every list ends). Everything shown: "That is all four." A capped list:
 * how many are shown, how many more there are; the caller adds the link to the page that has the rest.
 */
export function endOfList(shown: number, total: number, noun: { one: string; many: string }, atLeast = false): { text: string; more: number } {
  const more = Math.max(0, total - shown);
  if (more > 0) return { text: `Showing ${numberWord(shown)} of ${atLeast ? "at least " : ""}${total} ${noun.many}. ${more === 1 && !atLeast ? `There is one more ${noun.one}.` : `There are ${atLeast ? "at least " : ""}${more} more.`}`, more };
  return { text: shown === 1 ? `That is the only ${noun.one}.` : shown === 2 ? `Those are both ${noun.many}.` : `That is all ${numberWord(shown)} ${noun.many}.`, more: 0 };
}

/**
 * Whether the home screen may say "You're caught up." near the top: the reader has been here before and nothing from
 * their legislators or the bills they follow is newer than that visit. A first visit has nothing to be caught up
 * with, so it says nothing.
 */
export function caughtUp(i: { previousVisit: number | null; newVotes: number; newBills: number }): boolean {
  return !!i.previousVisit && i.newVotes + i.newBills === 0;
}
