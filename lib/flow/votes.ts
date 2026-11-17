/**
 * The first 60 seconds (owner, 17 Nov 2026): each of a reader's legislators is shown with their most recent
 * MEANINGFUL vote, explained in one plain line. This file holds the two rules, for every member and party alike:
 *
 *   1. which recorded vote counts as meaningful (meaningfulVote, txMeaningfulVote);
 *   2. the one line that explains it (plainBillName, voteLine, txVoteLine), which never says a vote was good or bad.
 *
 * Pure (no imports), so node's test runner loads it directly: tests/flow.test.mjs.
 */

/* ------------------------------------------------------------ which vote counts --- */

/**
 *   pass           the chamber's vote on passing the bill or resolution itself
 *   override       a vote to pass it over the President's veto
 *   final_version  a vote on the final House-Senate compromise (a conference report)
 *   other_chamber  a vote to accept the other chamber's version
 *   take_up        a vote to start debate that failed, so the measure stopped there
 *   end_debate     a vote to end debate that failed, so the measure stopped there
 */
export type MeaningfulKind = "pass" | "override" | "final_version" | "other_chamber" | "take_up" | "end_debate";

/** Whether the question carried. null when the official result does not say. */
export function carried(result: string | null | undefined): boolean | null {
  const r = String(result ?? "").toLowerCase();
  if (!r.trim()) return null;
  if (/reject|fail|not agreed|not invoked|defeat|sustained|not passed|not adopted|lost/.test(r)) return false;
  if (/pass|agreed|adopt|overridden|invoked|confirmed/.test(r)) return true;
  return null;
}

// Steps that decide how or whether the chamber goes on, not the measure itself.
const ROUTINE = /previous question|adjourn|journal|quorum|\btable\b|recommit|\bcommit\b|\brefer\b|discharge|instruct|point of order|appeal|decision of the chair|waive|postpone|reconsider|election of|call of the house|sergeant at arms|germane/;
const PASSING = /^on (passage|motion to suspend the rules and (pass|agree)|agreeing to the resolution|the (joint |concurrent )?resolution|the bill)\b/;

/**
 * The kind of meaningful vote a roll call was, or null when it does not count.
 *
 * Counts: a vote on passing a bill or resolution, on a veto override, on a conference report, or on agreeing to the
 * other chamber's version. A vote to start or end debate counts only when it is what stopped the measure (it failed).
 * Never counts: routine procedural steps, quorum calls, the previous question, adjournment, the Journal, amendments,
 * a House rule that only sets the terms of debate, nominations and treaties. A roll call with no bill never counts,
 * because the line links to the bill.
 */
export function meaningfulVote(v: { question: string; result?: string | null; title?: string | null; billTitle?: string | null; hasBill: boolean }): MeaningfulKind | null {
  if (!v.hasBill) return null;
  const q = v.question.trim().toLowerCase(), title = String(v.title ?? ""), both = `${title} ${v.billTitle ?? ""}`;
  if (/nomination|treaty|resolution of ratification|guilty/.test(q) || /\bto be\b.*\b(judge|secretary|attorney|ambassador|director|administrator|commissioner|member)\b/i.test(title)) return null;
  if (/cloture/.test(q) || /motion to proceed/.test(q)) {
    if (carried(v.result) !== false) return null; // debate went on: the vote on the measure itself is the one that counts
    if (/amdt\.? no\.|amendment no\.|\bnomination\b/i.test(title)) return null; // debate on one amendment or a nominee
    if (/motion to proceed/.test(q) || /motion to proceed/i.test(title)) return "take_up";
    return "end_debate";
  }
  if (ROUTINE.test(q)) return null;
  if (/overrid|objections of the president/.test(q)) return "override";
  if (/conference report/.test(q)) return "final_version";
  if (/\bconcur\b/.test(q) || (/^on the motion$/.test(q) && /motion to concur/i.test(title))) return "other_chamber";
  if (/amendment/.test(q)) return null;
  if (/providing for (the )?consideration of/i.test(both)) return null;
  return PASSING.test(q) ? "pass" : null;
}

/** Texas (Open States motion text): the kinds that count. "advance" is the first of the two floor votes on a bill. */
export type TxMeaningfulKind = "pass" | "advance" | "final_version" | "other_chamber";

/** Same rules on the Texas vote data: votes on the bill count; procedural motions, amendments and confirmations do not. */
export function txMeaningfulVote(motion: string): TxMeaningfulKind | null {
  const m = motion.toLowerCase();
  if (/\btable\b|postpone|suspend|recommit|re-refer|previous question|adjourn|reconsider|point of order|motion to (proceed|instruct)|quorum|journal|nominat|confirm/.test(m)) return null;
  if (/conference/.test(m)) return "final_version";
  if (/\bconcur/.test(m) && !/concurrent/.test(m)) return "other_chamber";
  if (/amendment/.test(m)) return null;
  if (/engross|second reading|2nd reading|passed to (third|3rd) reading/.test(m)) return "advance";
  if (/third reading|3rd reading|(third|3rd) time|final|pass|adopt/.test(m)) return "pass";
  return null;
}

/* -------------------------------------------------------------- the bill's name --- */

export type BillName = { text: string; label: "Analysis" | "Official" };

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const LAW_TYPES = new Set(["hr", "s", "hb", "sb", ""]);
const noun = (billType?: string | null) => (LAW_TYPES.has(String(billType ?? "").toLowerCase()) ? "a bill" : "a measure");

/** Cuts at a word boundary near `max` characters and marks the cut. */
export function clip(text: string, max = 80): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1), at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;:.(–-]+$/, "")}…`;
}

/**
 * The bill's name as it reads inside a sentence. With a summary a reader may see, the Analysis headline turned into a
 * phrase ("Blocks new 2027 rules …" → "a bill that blocks new 2027 rules …"), labelled Analysis. Otherwise the
 * official title, clipped to about 80 characters, labelled Official ("the GUARD Act", "a bill to amend …"). A bill
 * known only from a roll call has no title of its own yet, so its number stands in ("H.R. 5334").
 */
export function plainBillName(b: { title: string; billType?: string | null; headline?: string | null; label?: string | null }): BillName {
  const h = String(b.headline ?? "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  if (h) {
    const would = h.match(/^Would\s+(.+)$/i);
    if (would) return { text: `${noun(b.billType)} that would ${clip(would[1], 110)}`, label: "Analysis" };
    if (/^[A-Z][a-z]+(s|es)\s+\S/.test(h)) return { text: `${noun(b.billType)} that ${clip(lowerFirst(h), 110)}`, label: "Analysis" };
    return { text: `${noun(b.billType)} described as “${clip(h, 110)}”`, label: "Analysis" };
  }
  const t = b.title.replace(/\s+/g, " ").trim().replace(/,? as amended$/i, "").replace(/\.$/, "");
  const official = (text: string): BillName => ({ text, label: "Official" });
  // Not a title: the wording of a floor motion, or only the bill's number.
  if (!t || /^motion to\b/i.test(t) || /^(H|S)\.\s?(R\.|J\.\s?Res\.|Con\.\s?Res\.|Res\.)?\s?\d+$/i.test(t)) return official(b.label?.trim() || t || "this bill");
  const formal = t.match(/^(?:A bill|An act|A joint resolution|A concurrent resolution|A resolution)\s+(to\s.+)$/i);
  if (formal) return official(`${noun(b.billType)} ${clip(lowerFirst(formal[1]), 80)}`);
  if (/^To\s+[a-z]/.test(t)) return official(`${noun(b.billType)} ${clip(lowerFirst(t), 80)}`);
  if (/^[A-Z][a-z]+ing\s+[a-z]/.test(t)) return official(`${noun(b.billType)} ${clip(lowerFirst(t), 80)}`); // "Providing for …", "Relating to …"
  if (/^the\s/i.test(t)) return official(clip(lowerFirst(t), 80));
  if (/\b(Act|Resolution)(,? (of )?\d{4})?$/.test(t)) return official(`the ${clip(t, 80)}`);
  return official(`${noun(b.billType)} titled “${clip(t, 80)}”`);
}

/* ---------------------------------------------------------------- the one line --- */

const tally = (yea: number, nay: number, show: boolean) => (show && yea + nay > 0 ? `${yea}–${nay}` : "");
const measure = (billType?: string | null) => (LAW_TYPES.has(String(billType ?? "").toLowerCase()) ? "the bill" : "the measure");

// What a Yes was for ("to pass …") and the neutral form used for No, Present and absences ("on passing …").
const ACT: Record<MeaningfulKind | "advance", { to: string; on: string }> = {
  pass: { to: "to pass", on: "on passing" },
  override: { to: "to override the President’s veto of", on: "on overriding the President’s veto of" },
  final_version: { to: "to approve the final House–Senate version of", on: "on approving the final House–Senate version of" },
  other_chamber: { to: "to accept the other chamber’s changes to", on: "on accepting the other chamber’s changes to" },
  take_up: { to: "on taking up", on: "on taking up" },
  end_debate: { to: "on ending debate on", on: "on ending debate on" },
  advance: { to: "to move", on: "on moving" },
};

function lead(position: string, kind: MeaningfulKind | "advance", name: string, otherChamber?: string): string {
  const p = position.toLowerCase(), swap = (s: string) => (otherChamber ? s.replace("the other chamber’s", `the ${otherChamber}’s`) : s);
  const tail = kind === "advance" ? " forward" : "";
  if (p === "yea" || p === "yes") return `Voted Yes ${swap(ACT[kind].to)} ${name}${tail}`;
  if (p === "nay" || p === "no") return `Voted No ${swap(ACT[kind].on)} ${name}${tail}`;
  if (p === "present") return `Voted Present ${swap(ACT[kind].on)} ${name}${tail}`;
  if (p === "not voting" || p === "absent" || p === "excused") return `Did not vote ${swap(ACT[kind].on)} ${name}${tail}`;
  return `Was recorded as “${position}” ${swap(ACT[kind].on)} ${name}${tail}`;
}

/**
 * One plain line for a member's vote: what they voted for, then the outcome in a few words.
 *   "Voted Yes to pass the GUARD Act. It passed 232–198."
 *   "Voted No on taking up a bill to …; the bill stalled, 48–51 (60 votes were needed)."
 * The tally is left out when it is under review or missing. Never says the vote was good or bad.
 */
export function voteLine(v: { position: string; kind: MeaningfulKind; name: string; result?: string | null; yea: number; nay: number; question?: string | null;
  chamber?: string | null; billType?: string | null; tallyUnderReview?: boolean }): string {
  const won = carried(v.result), n = tally(v.yea, v.nay, !v.tallyUnderReview), q = String(v.question ?? "").toLowerCase();
  const other = v.chamber === "house" ? "Senate" : v.chamber === "senate" ? "House" : undefined;
  const start = lead(v.position, v.kind, v.name, v.kind === "other_chamber" ? other : undefined);
  if (v.kind === "take_up" || v.kind === "end_debate") return `${start}; ${measure(v.billType)} stalled${n ? `, ${n}` : ""}${/cloture/.test(q) && n ? " (60 votes were needed)" : ""}.`;
  const stop = start.endsWith("…") ? "" : ".";
  if (won === null) return `${start}${stop}`;
  const twoThirds = !won && v.yea > v.nay && n ? " (it needed two-thirds)" : "";
  const outcome = v.kind === "override" ? (won ? `The veto was overridden${n ? `, ${n}` : ""}.` : `The veto stood${n ? `, ${n}` : ""}.`)
    : v.kind === "final_version" ? (won ? `It was approved${n ? ` ${n}` : ""}.` : `It was not approved${n ? `, ${n}` : ""}.`)
    : v.kind === "other_chamber" ? (won ? `The changes were accepted${n ? ` ${n}` : ""}.` : `The changes were not accepted${n ? `, ${n}` : ""}.`)
    : won ? `It passed${n ? ` ${n}` : ""}.` : `It did not pass${n ? `, ${n}` : ""}${twoThirds}.`;
  return `${start}${stop} ${outcome}`;
}

/** The same line for a Texas vote. `option` is Open States' yes / no / absent / not voting / excused / other. */
export function txVoteLine(v: { option: string; kind: TxMeaningfulKind; name: string; result?: string | null; yes?: number | null; no?: number | null; tallyOk?: boolean }): string {
  const won = carried(v.result), n = tally(Number(v.yes ?? 0), Number(v.no ?? 0), v.tallyOk !== false);
  const start = lead(v.option, v.kind, v.name), stop = start.endsWith("…") ? "" : ".";
  if (won === null) return `${start}${stop}`;
  const outcome = v.kind === "advance" ? (won ? `It went on to a final vote${n ? `, ${n}` : ""}.` : `It was stopped${n ? `, ${n}` : ""}.`)
    : v.kind === "final_version" ? (won ? `It was approved${n ? ` ${n}` : ""}.` : `It was not approved${n ? `, ${n}` : ""}.`)
    : v.kind === "other_chamber" ? (won ? `The changes were accepted${n ? ` ${n}` : ""}.` : `The changes were not accepted${n ? `, ${n}` : ""}.`)
    : won ? `It passed${n ? ` ${n}` : ""}.` : `It did not pass${n ? `, ${n}` : ""}.`;
  return `${start}${stop} ${outcome}`;
}

/* ------------------------------------------------------- when there is no vote --- */

/** How far back "recent" reaches. New members may have no vote on a bill yet. */
export const RECENT_VOTE_MS = 365 * 24 * 3600 * 1000;
export const NO_RECENT_VOTE = "No recent vote on a bill on record.";

/** "2027-01-12" → "12 January 2027". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1];
  return month && y && d ? `${d} ${month} ${y}` : iso;
}

/**
 * What a Texas member's card says when they have no vote on a bill in the last 12 months. The date of the next
 * session comes from the session list (lib/texas/parse.ts), never from a literal.
 */
export function txNoVoteLine(today: string, sessions: ReadonlyArray<{ start: string; end: string | null }>): string {
  const inSession = sessions.some(s => s.start <= today && (!s.end || today <= s.end));
  if (inSession) return "No votes yet this session.";
  const next = sessions.filter(s => s.start > today).sort((a, b) => a.start.localeCompare(b.start))[0];
  return next ? `The Texas Legislature next meets on ${longDate(next.start)}; no votes yet this session.` : `The Texas Legislature is not in session. ${NO_RECENT_VOTE}`;
}
