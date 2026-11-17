/**
 * How each decision on a Texas bill was voted on (owner, 17 Nov 2026, point 4): "Clearly label when a Texas vote was
 * a voice vote or isn't individually recorded; never imply a member's position without a recorded vote."
 *
 * Pure, no imports; tested in tests/texas-vote-record.test.mjs. Input: a bill's actions (tx_bill_actions, in the
 * feed's order) and its recorded votes (tx_votes, with how many members each lists in tx_member_votes). Output: the
 * decisions on the bill, each one of:
 *   - "recorded": a record vote (each member's vote listed by name). With the feed's vote attached there is a tally
 *     and a member list; without it the page says the list is in the official journal.
 *   - "voice": the record says viva voce or voice vote.
 *   - "not_recorded": the record says it was a nonrecord vote, or decided by unanimous consent.
 *   - "unknown": the wording does not say how the vote was taken; the page says the record does not say.
 *
 * Wording read from Texas Legislature Online bill histories (89th Legislature, e.g. HB 2, SB 1, SB 500), which the
 * Open States feed copies: a decision line ("Passed", "Passed to engrossment", "Amendment tabled", "Motion
 * prevails", "House concurs in Senate amendment(s)") is followed, on the same day and journal page, by a line that
 * says how it was voted: "Record vote" (House lines add "RV#303"), "Nonrecord vote recorded in Journal" (House), or
 * "Vote recorded in Journal" (Senate; it does not say whether each senator is listed, so it stays "unknown").
 * "Statement(s) of vote recorded in Journal" and "Reason for vote recorded in Journal" are members' notes on a vote
 * and change nothing. A decision with no such line is "unknown": this file never guesses.
 */

export type TxActionIn = { seq?: number | null; date: string; description: string; chamber: string | null; classification?: string[] | null };
export type TxVoteIn = { id: string; motion: string; date: string; result: string; chamber: string | null; counts: Record<string, number> | null; tallyOk: number | boolean;
  /** How many members tx_member_votes lists for this vote (0: the feed gave totals only). */
  listed: number };

export type DecisionKind = "recorded" | "voice" | "not_recorded" | "unknown";
export type DecisionReason =
  | "record_vote"          // recorded, and the feed's vote (tally and member list) is attached
  | "record_vote_no_list"  // the history says "Record vote" but this site has no member list for it
  | "viva_voce"            // voice vote
  | "nonrecord"            // House "Nonrecord vote recorded in Journal"
  | "consent"              // unanimous consent / without objection
  | "journal_unclear"      // Senate "Vote recorded in Journal"
  | "committee"            // a committee's decision; committee votes are in its minutes, not on this site
  | "no_vote_line";        // nothing in the history says how it was voted

export type TxDecision = {
  key: string; date: string; chamber: "upper" | "lower" | null; stage: "floor" | "committee";
  /** The official wording, as the history has it. */
  action: string;
  /** The same in plain words ("Passed the House"). */
  what: string;
  kind: DecisionKind; reason: DecisionReason;
  /** The House record vote number from the history line ("RV#303" → "303"). */
  rv: string | null;
  vote: { id: string; motion: string; result: string; counts: Record<string, number>; tallyOk: boolean; listed: number } | null;
};

const CH = (c: string | null | undefined): "upper" | "lower" | null => (c === "upper" || c === "lower" ? c : null);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/* ---------------------------------------------------------- reading lines --- */

type Marker = { reason: "record" | "viva_voce" | "nonrecord" | "consent" | "journal_unclear"; rv: string | null };

/** A line that only says how the decision before it was voted on, or null. */
export function voteMarker(description: string): Marker | null {
  const d = clean(description).toLowerCase(), rv = description.match(/RV\s*#?\s*(\d+)/i)?.[1] ?? null;
  if (MEMBER_NOTE.test(d)) return null;
  if (/^record vote\b/.test(d)) return { reason: "record", rv };
  if (/^non-?record vote\b/.test(d)) return { reason: "nonrecord", rv: null };
  if (/^vote recorded in (the )?journal\b/.test(d)) return { reason: "journal_unclear", rv: null };
  if (/^(by )?(viva voce|voice vote)\b/.test(d)) return { reason: "viva_voce", rv: null };
  if (/^(by )?unanimous consent\b|^without objection\b/.test(d)) return { reason: "consent", rv: null };
  return null;
}

/** How a decision line itself says it was voted on ("Passed by viva voce vote", "Adopted without objection"). */
function inlineMarker(description: string): Marker | null {
  const d = description.toLowerCase(), rv = description.match(/RV\s*#?\s*(\d+)/i)?.[1] ?? null;
  if (/viva voce|voice vote/.test(d)) return { reason: "viva_voce", rv: null };
  if (/non-?record vote/.test(d)) return { reason: "nonrecord", rv: null };
  if (/unanimous consent|without objection/.test(d)) return { reason: "consent", rv: null };
  if (/\brecord vote\b/.test(d)) return { reason: "record", rv };
  return null;
}

/** Members' own notes on a vote ("Statement(s) of vote recorded in Journal"): they say nothing about how it was taken. */
const MEMBER_NOTE = /^(statement|reason)s?(\(s\))? (of|for) vote/i;

const FLOOR_CLASSES = ["passage", "failure", "amendment-passage", "amendment-failure", "concurrence", "veto-override-passage", "veto-override-failure"];

/** Whether a history line is a decision (something was decided by a vote or by consent), and which kind. */
export function decisionLine(description: string, classification: string[] = []): "floor" | "committee" | null {
  const d = clean(description).toLowerCase();
  if (!d || voteMarker(description)) return null;
  if (/^reported (favorably|unfavorably|adversely|from committee)|^committee (report|substitute) (adopted|approved)|^voted (favorably|unfavorably) (from|in) committee/.test(d)) return "committee";
  // Notices of the other chamber's action ("House passage reported", "…-reported"), and clerical lines.
  if (/-reported\b|\breported$|^reported (engrossed|enrolled)|^received from|^sent to|^signed|^filed|^read (first|1st) time|^referred|^placed on|^scheduled|^considered|^laid (before|out)|^left pending|^testimony|^co-?(author|sponsor)|^amendment\(?s?\)? offered|^amendment to amendment offered|^amendment withdrawn|^motion withdrawn|^point of order|^remarks|^text of|^effective|^see remarks|^vote taken in committee|^committee report|^comte report|^recommended for|^not again placed|^ordered not printed|^printing rule/.test(d)) return null;
  if (/^(read (2nd|second|3rd|third) time (&|and) )?passed\b|^passed\b|failed to pass|^failed\b|^fails?\b|^not passed\b/.test(d)) return "floor";
  if (/^amend(ed|ment amended|ment\(?s?\)? (adopted|tabled|failed|not adopted|adopted as amended))\b|^amendment (adopted|tabled|failed|not adopted)/.test(d)) return "floor";
  if (/\bamendment\b.*\b(fails|failed|prevails|adopted|tabled|not adopted)\b/.test(d)) return "floor";
  if (/concurs? in (house|senate) amendment|refuses? to concur|adopts? conf(erence|\.)? ?comm(ittee|\.)? ?report|conference committee report (adopted|not adopted)|veto overrid|override/.test(d)) return "floor";
  if (/^(constitutional )?(three|3)[- ]day rule suspended|^rules? suspended|^motion (to .+ )?(prevails|prevailed|fails|failed|adopted|lost|carried)\b|^motion (prevails|fails)|^calendars committee rule adopted|^vote reconsidered|^reconsidered\b|^tabled\b|^postponed by motion|^adopted\b|^resolution adopted|^(house|senate) (adopts|refuses|grants|concurs)/.test(d)) return "floor";
  if (FLOOR_CLASSES.some(c => classification.includes(c))) return "floor";
  return null;
}

/** A history line in plain words. Falls back to the official wording when it is not a common one. */
export function plainAction(description: string, chamber: string | null): string {
  const d = clean(description), l = d.toLowerCase(), where = CH(chamber) === "upper" ? "the Senate" : CH(chamber) === "lower" ? "the House" : "the chamber";
  const asAmended = /as amended/.test(l) ? " with changes" : "";
  if (/passed to engrossment|passed to (3rd|third) reading/.test(l)) return `Approved in ${where}'s first of two floor votes (second reading)${asAmended}`;
  if (/failed to pass|^failed\b|^not passed\b/.test(l)) return `Failed in ${where}`;
  if (/^(read (3rd|third) time (&|and) )?passed\b|^passed\b/.test(l)) return `Passed ${where}${asAmended}`;
  if (/^amendment\(?s?\)? tabled|^tabled\b/.test(l)) return "A proposed change was set aside (tabled)";
  if (/^amendment\(?s?\)? (failed|not adopted)|amendment.*\b(fails|failed|not adopted)\b/.test(l)) return "A proposed change was rejected";
  if (/^amendment amended/.test(l)) return "A proposed change was itself changed";
  if (/^amended\b|^amendment\(?s?\)? adopted/.test(l)) return "A proposed change was added to the bill";
  if (/refuses? to concur/.test(l)) return `${where === "the Senate" ? "The Senate" : where === "the House" ? "The House" : "The chamber"} did not accept the other chamber's changes`;
  if (/concurs? in (house|senate) amendment/.test(l)) return `${where === "the Senate" ? "The Senate" : where === "the House" ? "The House" : "The chamber"} accepted the other chamber's changes`;
  if (/conf(erence|\.)? ?comm(ittee|\.)? ?report/.test(l)) return "Approved the final version worked out by House and Senate negotiators";
  if (/(three|3)[- ]day rule suspended/.test(l)) return "Agreed to skip the usual wait between votes, so the next vote could happen the same day";
  if (/^rules? suspended/.test(l)) return "Agreed to set aside a rule so the bill could be taken up now";
  if (/^calendars committee rule adopted/.test(l)) return "Approved the rules for debating the bill";
  if (/^vote reconsidered|^reconsidered\b/.test(l)) return "Agreed to take an earlier vote again";
  if (/^motion .*(prevails|prevailed|adopted|carried)/.test(l)) return "A motion passed";
  if (/^motion .*(fails|failed|lost)/.test(l)) return "A motion failed";
  if (/^reported favorably as substituted/.test(l)) return "The committee approved a rewritten version";
  if (/^reported favorably (with|w\/) amendment/.test(l)) return "The committee approved it with changes";
  if (/^reported favorably/.test(l)) return "The committee approved it";
  if (/^reported (unfavorably|adversely)/.test(l)) return "The committee reported it unfavorably";
  if (/veto overrid|override/.test(l)) return "Voted on overriding the Governor's veto";
  return d;
}

/* -------------------------------------------------------- matching votes --- */

type Family = "advance" | "pass" | "amendment" | "table" | "concur" | "conference" | "suspend" | "motion" | "override" | null;
/** The kind of question a line or a motion is about, so a feed vote is attached only to a line about the same thing. */
export function family(text: string): Family {
  const t = text.toLowerCase();
  if (/overrid/.test(t)) return "override";
  if (/conference|conf\.? comm/.test(t)) return "conference";
  if (/concur/.test(t)) return "concur";
  if (/\btabl/.test(t)) return "table";
  if (/suspend/.test(t)) return "suspend";
  if (/amend/.test(t)) return "amendment";
  if (/engross|second reading|2nd reading|(3rd|third) reading$|passed to (3rd|third)/.test(t)) return "advance";
  if (/third reading|3rd reading|final passage|\bpass(ed|age)?\b|failed/.test(t)) return "pass";
  if (/motion|reconsider|calendars committee rule/.test(t)) return "motion";
  return null;
}

/* ------------------------------------------------------------- decisions --- */

const KIND_OF: Record<Marker["reason"], [DecisionKind, DecisionReason]> = {
  record: ["recorded", "record_vote_no_list"], viva_voce: ["voice", "viva_voce"], nonrecord: ["not_recorded", "nonrecord"], consent: ["not_recorded", "consent"], journal_unclear: ["unknown", "journal_unclear"],
};

/** Every decision on a bill, oldest first, each with how it was voted on. */
export function txDecisions(actions: readonly TxActionIn[], votes: readonly TxVoteIn[]): TxDecision[] {
  const rows = actions.map((a, i) => ({ ...a, i, chamber: CH(a.chamber), classification: a.classification ?? [] }))
    .sort((a, b) => (a.seq ?? a.i) - (b.seq ?? b.i) || a.i - b.i);
  const out: Array<TxDecision & { marked: boolean }> = [];
  const make = (date: string, chamber: "upper" | "lower" | null, action: string, stage: "floor" | "committee", n: number): TxDecision & { marked: boolean } =>
    ({ key: `d${n}`, date, chamber, stage, action: clean(action), what: plainAction(action, chamber), kind: "unknown", reason: stage === "committee" ? "committee" : "no_vote_line", rv: null, vote: null, marked: stage === "committee" });
  const apply = (d: TxDecision & { marked: boolean }, m: Marker) => { const [kind, reason] = KIND_OF[m.reason]; d.kind = kind; d.reason = reason; d.rv = m.rv; d.marked = true; };
  // A marker belongs to the decision line right before it (members' notes on a vote may sit between), on the same
  // day and in the same chamber, and to no other. A marker with no such line is kept as a decision of its own
  // ("A vote was taken"), so what it says is not lost and is not pinned on the wrong line.
  let open: (TxDecision & { marked: boolean }) | null = null;
  for (const a of rows) {
    const marker = voteMarker(a.description);
    if (marker) {
      if (open && open.date === a.date && open.chamber === a.chamber && open.marked && KIND_OF[marker.reason][1] === open.reason && !marker.rv) continue; // the same note twice
      if (open && !open.marked && open.date === a.date && open.chamber === a.chamber) apply(open, marker);
      else { const d = make(a.date, a.chamber, "A vote was taken", "floor", out.length); apply(d, marker); d.what = "A vote was taken"; out.push(d); open = d; }
      continue;
    }
    if (MEMBER_NOTE.test(clean(a.description))) continue;
    const stage = decisionLine(a.description, a.classification);
    if (!stage) { open = null; continue; }
    const d = make(a.date, a.chamber, a.description, stage, out.length);
    if (stage === "floor") { const inline = inlineMarker(a.description); if (inline) apply(d, inline); }
    out.push(d); open = stage === "floor" ? d : null;
  }

  // Attach the feed's recorded votes. A vote goes to a decision on the same day, in the same chamber, about the same
  // kind of question. When two or more of the feed's votes could each fit two or more lines, none of them is
  // attached (a tally must never land on the wrong amendment): each is shown as its own decision instead.
  const loose: TxVoteIn[] = [];
  const groups = new Map<string, TxVoteIn[]>();
  for (const v of votes) { const k = `${v.date.slice(0, 10)}|${CH(v.chamber)}|${family(v.motion) ?? "?"}`; groups.set(k, [...(groups.get(k) ?? []), v]); }
  for (const [k, vs] of groups) {
    const [date, chamber, fam] = k.split("|");
    const fits = out.filter(d => d.stage === "floor" && !d.vote && d.date === date && String(d.chamber) === chamber && d.kind !== "voice" && d.kind !== "not_recorded"
      && fam !== "?" && family(d.action) === fam);
    if (vs.length === 1 && fits.length >= 1) {
      // One vote: the one line already marked as a record vote, else the only line that fits.
      const recorded = fits.filter(d => d.kind === "recorded");
      const target = recorded.length === 1 ? recorded[0] : recorded.length === 0 && fits.length === 1 ? fits[0] : null;
      if (target) { attach(target, vs[0]); continue; }
    }
    loose.push(...vs);
  }
  for (const v of loose) {
    const d = make(v.date.slice(0, 10), CH(v.chamber), v.motion || "Record vote", "floor", out.length);
    d.what = v.motion ? plainAction(v.motion, v.chamber) : "A record vote";
    attach(d, v); out.push(d);
  }
  return out.map(d => { const { marked, ...rest } = d; void marked; return rest; }).sort((a, b) => a.date.localeCompare(b.date) || Number(a.key.slice(1)) - Number(b.key.slice(1)));

  function attach(d: TxDecision, v: TxVoteIn) {
    d.vote = { id: v.id, motion: v.motion, result: v.result, counts: v.counts ?? {}, tallyOk: v.tallyOk === true || v.tallyOk === 1, listed: v.listed };
    d.kind = "recorded"; d.reason = v.listed > 0 ? "record_vote" : "record_vote_no_list";
  }
}

/** The decisions a reader looks for first: committee reports, the floor votes on the bill, accepting changes, the final version. Amendments and procedural steps are the rest. */
export function mainDecision(d: Pick<TxDecision, "stage" | "action">): boolean {
  const f = family(d.action);
  return d.stage === "committee" || f === "pass" || f === "advance" || f === "concur" || f === "conference" || f === "override";
}

/* ---------------------------------------------------------------- words --- */

const OPTION_WORD: Record<string, string> = { yes: "yes", no: "no", "not voting": "present, not voting", abstain: "present, not voting", absent: "absent", excused: "excused", other: "other" };
const OPTION_ORDER = ["yes", "no", "not voting", "abstain", "absent", "excused", "other"];
/** "92 yes, 54 no, 1 present, not voting". */
export function countLine(counts: Record<string, number>): string {
  const keys = Object.keys(counts).filter(k => Number(counts[k]) > 0).sort((a, b) => (OPTION_ORDER.indexOf(a) + 99) % 99 - (OPTION_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b));
  return keys.map(k => `${counts[k]} ${OPTION_WORD[k] ?? k}`).join(", ");
}

export const SEE_EACH_MEMBER = "See how each member voted";
export const VOICE_LABEL = "Voice vote: members' individual votes were not recorded";
export const NOT_LISTED_LABEL = "The official record does not list how each member voted";
export const UNKNOWN_LABEL = "The official record here does not say how this vote was taken or how each member voted";

/** The plain label for a decision: what the reader sees beside it. `link` is true when the member list can be shown. */
export function decisionLabel(d: TxDecision): { label: string; note: string | null; link: boolean } {
  switch (d.reason) {
    case "record_vote": return { label: `Record vote: ${countLine(d.vote!.counts) || "totals not given"}${d.vote!.result ? ` (${resultWord(d.vote!.result)})` : ""}`, note: d.vote!.tallyOk ? null : "Tally under review: the listed votes do not add up to the reported totals.", link: true };
    case "record_vote_no_list": return { label: d.vote && Object.keys(d.vote.counts).length ? `Record vote: ${countLine(d.vote.counts)}` : `Record vote${d.rv ? ` (number ${d.rv})` : ""}`,
      note: "Each member's vote is listed in the official journal; this site does not have that list yet.", link: false };
    case "viva_voce": return { label: VOICE_LABEL, note: null, link: false };
    case "nonrecord": return { label: NOT_LISTED_LABEL, note: "It was a nonrecord vote. The journal notes only the members who asked to have their own vote written down.", link: false };
    case "consent": return { label: NOT_LISTED_LABEL, note: "It was decided by unanimous consent: no member objected, so no vote was counted.", link: false };
    case "journal_unclear": return { label: UNKNOWN_LABEL, note: "The history says a vote was written in the Senate Journal, but not whether each senator's vote is listed.", link: false };
    case "committee": return { label: "Committee decision: this site does not have each committee member's vote", note: null, link: false };
    default: return { label: UNKNOWN_LABEL, note: null, link: false };
  }
}
const resultWord = (r: string) => (/^pass|^adopt|^prevail|^carried/i.test(r) ? "passed" : /^fail|^lost|^not/i.test(r) ? "failed" : r);

/** Plain words for the terms, explained the first time each appears on a page. */
export const TX_VOTE_TERMS = {
  record: "A record vote lists each member's yes or no by name.",
  voice: "In a voice vote, members call out yes or no together and the presiding officer decides which side won. No names are written down.",
  nonrecord: "A nonrecord vote is any House vote where each member's vote is not listed by name, such as a voice vote.",
  consent: "Unanimous consent means no member objected, so the question was settled without a counted vote.",
  journal: "The journal is the official day-by-day record the House and the Senate each keep of what they did.",
  secondReading: "A bill gets two floor votes in each chamber: the first (second reading) and the final one (third reading).",
} as const;
export type TxTerm = keyof typeof TX_VOTE_TERMS;

function termsOf(d: TxDecision): TxTerm[] {
  const t: TxTerm[] = [];
  if (/second reading/.test(d.what)) t.push("secondReading");
  if (d.kind === "recorded") t.push("record");
  if (d.reason === "viva_voce") t.push("voice");
  if (d.reason === "nonrecord") t.push("nonrecord");
  if (d.reason === "consent") t.push("consent");
  if (d.reason === "record_vote_no_list" || d.reason === "nonrecord" || d.reason === "journal_unclear") t.push("journal");
  return t;
}
/** For each decision, in page order, the terms to explain at it: each term once, at its first use. */
export function firstUseTerms(decisions: readonly TxDecision[], already: Iterable<TxTerm> = []): Map<string, TxTerm[]> {
  const seen = new Set<TxTerm>(already), out = new Map<string, TxTerm[]>();
  for (const d of decisions) { const fresh = termsOf(d).filter(t => !seen.has(t)); fresh.forEach(t => seen.add(t)); if (fresh.length) out.set(d.key, fresh); }
  return out;
}

/* ------------------------------------------------------- a member's place --- */

export type MemberOnDecision =
  | { show: "position"; option: string; line: string }
  | { show: "not_listed"; line: string }
  | { show: "no_list"; line: string }
  | { show: "label"; line: string };
export const NOT_LISTED_IN_RECORD = "Not listed in this vote's record";

/**
 * What a member page or card may say about one member on one decision. A position only for a record vote whose list
 * names the member. A member missing from the list is "not listed", never absent, yes or no.
 */
export function memberOnDecision(d: TxDecision, option: string | null | undefined): MemberOnDecision {
  if (d.kind === "recorded" && d.vote && d.vote.listed > 0) {
    if (option) return { show: "position", option, line: optionLine(option, d) };
    return { show: "not_listed", line: NOT_LISTED_IN_RECORD };
  }
  if (d.kind === "recorded") return { show: "no_list", line: decisionLabel(d).note ?? decisionLabel(d).label };
  return { show: "label", line: decisionLabel(d).label };
}

/** The member's vote in plain words; a procedural step or an amendment is never shown as a vote on the bill itself. */
export function optionLine(option: string, d: Pick<TxDecision, "action" | "what">): string {
  const o = option.toLowerCase(), f = family(d.action);
  if (o !== "yes" && o !== "no") return o === "absent" ? "Listed as absent" : o === "excused" ? "Listed as excused" : o === "not voting" || o === "abstain" ? "Listed as present, not voting" : `Listed as ${option}`;
  const yn = o === "yes" ? "yes" : "no";
  if (f === "table" || f === "suspend" || f === "motion") return `Voted ${yn} on a procedural step (not a vote on the bill itself)`;
  if (f === "amendment") return `Voted ${yn} on a proposed change`;
  return `Voted ${yn}`;
}

/**
 * Whether a decision may be used in a "Same / Different" mark, an agreement figure, a card or a "most recent vote"
 * line: only a record vote whose member list is on file and adds up.
 */
export function comparable(d: TxDecision): boolean { return d.kind === "recorded" && !!d.vote && d.vote.listed > 0 && d.vote.tallyOk; }

/** The anchor for a vote's member list on the bill page. */
export const voteAnchor = (voteId: string) => `vote-${voteId.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
