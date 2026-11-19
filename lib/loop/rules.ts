/**
 * Closing the loop and vote alerts (owner's points 2 and 4, 18 Nov 2026): the rules and the wording, as pure
 * functions. No database, no network. The database side is lib/loop/notices.ts and lib/loop/alerts.ts; all of it is
 * tested in tests/loop.test.mjs.
 *
 * Every sentence says what happened, with the number and the date. Nothing here knows a member's party, and no
 * sentence says a vote or a result was good or bad.
 */
import { carried, longDate, meaningfulVote, plainBillName, txMeaningfulVote, type MeaningfulKind, type TxMeaningfulKind } from "../flow/votes.ts";
import { groupLine, NOT_SCIENTIFIC, shownTotals, type ScopeTotals } from "../constituent/rules.ts";

/* ───────────────────────────── Names ───────────────────────────── */

export type Chamber = "house" | "senate" | "upper" | "lower";
const CHAMBER: Record<Chamber, string> = { house: "the House", senate: "the Senate", lower: "the Texas House", upper: "the Texas Senate" };
const OTHER: Record<Chamber, string> = { house: "the Senate’s", senate: "the House’s", lower: "the Senate’s", upper: "the House’s" };
export const chamberName = (c: Chamber) => CHAMBER[c];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const LABELS: Record<string, string> = { hr: "H.R.", s: "S.", hres: "H.Res.", sres: "S.Res.", hjres: "H.J.Res.", sjres: "S.J.Res.", hconres: "H.Con.Res.", sconres: "S.Con.Res." };
export const fedBillLabel = (billType: string, number: number) => `${LABELS[billType] ?? billType.toUpperCase()} ${number}`;

export type BillRef = { key: string; level: "federal" | "state"; label: string; title: string; billType: string | null };
/** "H.R. 2102 (the Major Richard Star Act)": the number, then the official title as it reads in a sentence. Never the Analysis headline. */
export function billPhrase(b: Pick<BillRef, "label" | "title" | "billType">): string {
  const name = plainBillName({ title: b.title, billType: b.billType, label: b.label }).text;
  return name === b.label ? b.label : `${b.label} (${name})`;
}
export const billPath = (b: Pick<BillRef, "key" | "level">) => (b.level === "federal" ? `/bills/${b.key}` : `/texas/bills/${b.key}`);

/** A time as the calendar day in Washington ("2026-11-12"): House and Senate votes are dated there. */
export function easternDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
}
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** How a member's recorded position reads after their name: "voted Yes", "did not vote". The same for every member. */
export function did(position: string): string {
  const p = position.trim().toLowerCase();
  if (p === "yea" || p === "yes" || p === "aye") return "voted Yes";
  if (p === "nay" || p === "no") return "voted No";
  if (p === "present") return "voted Present";
  if (p === "not voting" || p === "absent" || p === "excused") return "did not vote";
  return `was recorded as “${position.trim()}”`;
}

/* ───────────────────────────── What happened to a bill ───────────────────────────── */

export type LoopEventKind = "floor_vote" | "passed" | "failed" | "signed" | "vetoed";
export type LoopEvent = {
  event: LoopEventKind;
  /** Names this one event on this bill, so a notice is written once: "rc:house-2026-323", "passed:senate", "law", "vetoed". */
  ref: string;
  /** The calendar day it happened. */
  date: string;
  /** The exact time for a House or Senate roll call; null when the record gives only the day. */
  at: number | null;
  chamber: Chamber | null;
  /** True: the bill went forward. False: it was stopped. Null: the record does not say. */
  advanced: boolean | null;
  /** The roll call (or Texas record vote) this event is, when one exists. */
  voteId: string | null;
  /** One sentence: what happened, with the numbers and the date. */
  result: string;
  /** The same in a few words, for the notice's title. */
  title: string;
};

/**
 * The votes that count as "a floor vote on the bill" for a notice: the site's existing rule for a meaningful vote
 * (lib/flow/votes.ts). A vote on passing it, on the final House-Senate version, on accepting the other chamber's
 * changes, on overriding a veto, and a vote to take it up or to end debate that failed (which is what stopped it).
 * Procedural steps and amendments never produce a notice.
 */
export const LOOP_VOTE_KINDS: ReadonlySet<MeaningfulKind> = new Set(["pass", "override", "final_version", "other_chamber", "take_up", "end_debate"]);
/** Texas: the vote on passing it, on the final version, on the other chamber's changes; the first floor vote only when it stopped the bill. */
const txLoopKind = (kind: TxMeaningfulKind | null, won: boolean | null) => !!kind && (kind !== "advance" || won === false);

const numbers = (yea: number, nay: number, show: boolean) => (show && yea + nay > 0 ? `, ${yea}–${nay}` : "");

type VoteWording = { result: string; title: string };
/** The sentence and title for one recorded vote on a bill. `n` is ", 392–18" or empty (a tally under review is left out). */
function voteWording(kind: MeaningfulKind | "advance", won: boolean | null, c: Chamber, bill: Pick<BillRef, "label" | "title" | "billType">, n: string, day: string, extra: { cloture?: boolean; twoThirds?: boolean } = {}): VoteWording {
  const B = billPhrase(bill), where = CHAMBER[c], Where = cap(where), on = ` on ${longDate(day)}`, short = where.replace(/^the /, "");
  const nOn = n ? `${n},${on}` : on; // ", 392–18, on 12 November 2026" or, with no tally to show, " on 12 November 2026"
  if (won === null) return { result: `${Where} held a vote on ${B}${on}. The official result is not on file yet.`, title: `${bill.label}: ${where} voted` };
  const needed = extra.twoThirds ? " It needed two-thirds." : "";
  switch (kind) {
    case "pass": return won ? { result: `${Where} passed ${B}${nOn}.`, title: `${bill.label} passed ${where}${n}` }
      : { result: `${B} did not pass ${where}${nOn}.${needed}`, title: `${bill.label} did not pass ${where}${n}` };
    case "override": return won ? { result: `${Where} voted to override the veto of ${B}${nOn}.`, title: `${bill.label}: ${where} voted to override the veto${n}` }
      : { result: `${Where} did not override the veto of ${B}${nOn}.${needed}`, title: `${bill.label}: the veto stood in ${where}${n}` };
    case "final_version": return won ? { result: `${Where} approved the final House–Senate version of ${B}${nOn}.`, title: `${bill.label}: ${where} approved the final version${n}` }
      : { result: `${Where} did not approve the final House–Senate version of ${B}${nOn}.`, title: `${bill.label}: ${where} did not approve the final version${n}` };
    case "other_chamber": return won ? { result: `${Where} accepted ${OTHER[c]} changes to ${B}${nOn}.`, title: `${bill.label}: ${where} accepted ${OTHER[c]} changes${n}` }
      : { result: `${Where} did not accept ${OTHER[c]} changes to ${B}${nOn}.`, title: `${bill.label}: ${where} did not accept ${OTHER[c]} changes${n}` };
    case "take_up": return { result: `${Where} voted not to take up ${B}${nOn}.`, title: `${bill.label}: ${where} voted not to take it up${n}` };
    case "end_debate": return { result: `A ${short} vote to end debate on ${B} failed${nOn}${extra.cloture && n ? " (60 votes were needed)" : ""}.`, title: `${bill.label}: a ${short} vote to end debate failed${n}` };
    case "advance": return won ? { result: `${Where} moved ${B} forward to a final vote${nOn}.`, title: `${bill.label}: ${where} moved it forward${n}` }
      : { result: `${Where} stopped ${B} at its first floor vote${nOn}.`, title: `${bill.label}: ${where} stopped it${n}` };
  }
}

export type FedRollCall = { id: string; chamber: string; votedAt: number; question: string; title: string | null; result: string | null; yea: number; nay: number; underReview?: boolean };
export type FedAction = { actionDate: string; text: string; type: string | null; chamber: string | null; stage: string | null };

/** One House or Senate roll call as an event, or null when it is not a vote on the bill itself. */
export function rollCallEvent(rc: FedRollCall, bill: Pick<BillRef, "label" | "title" | "billType">): (LoopEvent & { kind: MeaningfulKind }) | null {
  const kind = meaningfulVote({ question: rc.question, result: rc.result, title: rc.title, billTitle: bill.title, hasBill: true });
  if (!kind || !LOOP_VOTE_KINDS.has(kind) || (rc.chamber !== "house" && rc.chamber !== "senate")) return null;
  const won = kind === "take_up" || kind === "end_debate" ? false : carried(rc.result), day = easternDay(rc.votedAt);
  const w = voteWording(kind, won, rc.chamber, bill, numbers(rc.yea, rc.nay, !rc.underReview), day,
    { cloture: /cloture/i.test(rc.question), twoThirds: won === false && rc.yea > rc.nay && !rc.underReview });
  return { event: "floor_vote", ref: `rc:${rc.id}`, date: day, at: rc.votedAt, chamber: rc.chamber, advanced: won, voteId: rc.id, kind, ...w };
}

const DAY = 86400e3;
/** How long a passage the record says was voted on by name waits for its roll call before a notice goes out without it. */
export const ROLL_CALL_WAIT_DAYS = 3;
const near = (a: string, b: string, days: number) => Math.abs(Date.parse(a) - Date.parse(b)) <= days * DAY;
const fedChamberOf = (a: FedAction): "house" | "senate" | null => {
  const m = a.text.match(/(?:passed\/agreed to in|passed|agreed to in|failed (?:of passage )?in|by the)\s+(house|senate)/i);
  return m ? (m[1].toLowerCase() as "house" | "senate") : a.chamber === "house" || a.chamber === "senate" ? a.chamber : null;
};
const how = (text: string) => (/unanimous consent/i.test(text) ? " by unanimous consent" : /voice vote/i.test(text) ? " by voice vote" : /without objection/i.test(text) ? " without objection" : "");

/**
 * Everything that has happened to a federal bill that a reader should hear about, oldest first.
 *
 * A roll call on the bill is a "floor_vote" (its result is in the same sentence, so a passage by roll call is one
 * notice, not two). A passage or a failed vote that the record shows with no roll call (unanimous consent, voice
 * vote) is "passed" or "failed", and says no member's vote was recorded by name. When the record says the vote was
 * taken by name but the roll call has not been loaded, the notice waits three days for it and then goes out without it.
 * "signed" is the day it became law; "vetoed" the day of the veto.
 */
export function federalEvents(i: { bill: Pick<BillRef, "label" | "title" | "billType">; rollCalls: readonly FedRollCall[]; actions: readonly FedAction[];
  depth?: { stage: string | null; stageDate: string | null } | null; now: number }): LoopEvent[] {
  const out: LoopEvent[] = [], B = billPhrase(i.bill), today = utcDay(i.now);
  for (const rc of i.rollCalls) { const e = rollCallEvent(rc, i.bill); if (e) out.push(e); }
  const votes = [...out];
  for (const a of i.actions) {
    if (a.stage !== "passed_first" && a.stage !== "failed") continue;
    const chamber = fedChamberOf(a), passed = a.stage === "passed_first";
    if (votes.some(v => v.chamber === chamber && v.advanced === passed && near(v.date, a.actionDate, ROLL_CALL_WAIT_DAYS))) continue; // the roll call's notice already says it
    const byName = /roll no|record vote number|yea-nay vote|yeas and nays|recorded vote/i.test(a.text);
    if (byName && near(a.actionDate, today, ROLL_CALL_WAIT_DAYS)) continue; // wait for the roll call
    const where = chamber ? CHAMBER[chamber] : "one chamber of Congress", ref = `${passed ? "passed" : "failed"}:${chamber ?? "chamber"}${passed ? "" : `:${a.actionDate}`}`;
    if (out.some(e => e.ref === ref)) continue;
    const names = byName ? "Each member’s vote is not on this site yet." : "No member’s vote was recorded by name.";
    out.push({ event: passed ? "passed" : "failed", ref, date: a.actionDate, at: null, chamber, advanced: passed, voteId: null,
      result: passed ? `${cap(where)} passed ${B} on ${longDate(a.actionDate)}${how(a.text)}. ${names}` : `${B} failed a vote in ${where} on ${longDate(a.actionDate)}${how(a.text)}. ${names}`,
      title: passed ? `${i.bill.label} passed ${where}` : `${i.bill.label} failed a vote in ${where}` });
  }
  const law = i.actions.filter(a => a.stage === "law").sort((x, y) => x.actionDate.localeCompare(y.actionDate));
  const signed = law.find(a => /signed by (the )?president/i.test(a.text)), lawDay = (signed ?? law[0])?.actionDate ?? (i.depth?.stage === "law" ? i.depth.stageDate : null);
  if (lawDay) out.push({ event: "signed", ref: "law", date: lawDay, at: null, chamber: null, advanced: true, voteId: null,
    result: signed ? `The President signed ${B} into law on ${longDate(lawDay)}.` : `${B} became law on ${longDate(lawDay)}.`, title: `${i.bill.label} became law` });
  const veto = i.actions.filter(a => a.stage === "vetoed").sort((x, y) => x.actionDate.localeCompare(y.actionDate))[0]?.actionDate ?? (i.depth?.stage === "vetoed" ? i.depth.stageDate : null);
  if (veto) out.push({ event: "vetoed", ref: "vetoed", date: veto, at: null, chamber: null, advanced: false, voteId: null,
    result: `The President vetoed ${B} on ${longDate(veto)}.`, title: `${i.bill.label} was vetoed` });
  return out.sort((x, y) => x.date.localeCompare(y.date) || (x.at ?? 0) - (y.at ?? 0));
}

export type TxVote = { id: string; motion: string; date: string; result: string; chamber: string | null; counts: Record<string, number> | null; tallyOk: boolean };
export type TxAction = { date: string; description: string; chamber: string | null; classification: readonly string[] | null };
const txChamber = (c: string | null): "upper" | "lower" | null => (c === "upper" || c === "lower" ? c : null);

/** One Texas record vote as an event (any vote on the bill itself: the weekly email lists these), or null. */
export function txVoteEvent(v: TxVote, bill: Pick<BillRef, "label" | "title" | "billType">): (LoopEvent & { kind: TxMeaningfulKind }) | null {
  const kind = txMeaningfulVote(v.motion), chamber = txChamber(v.chamber);
  if (!kind || !chamber) return null;
  const won = carried(v.result), day = v.date.slice(0, 10);
  const w = voteWording(kind, won, chamber, bill, numbers(Number(v.counts?.yes ?? 0), Number(v.counts?.no ?? 0), v.tallyOk), day);
  return { event: "floor_vote", ref: `tv:${v.id}`, date: day, at: null, chamber, advanced: won, voteId: v.id, kind, ...w };
}

/**
 * The same for a Texas bill, from the copy of its history (Open States' action labels) and its record votes.
 * Only record votes list each member, so a passage with no record vote on file says so and names nobody's vote.
 */
export function texasEvents(i: { bill: Pick<BillRef, "label" | "title" | "billType">; votes: readonly TxVote[]; actions: readonly TxAction[] }): LoopEvent[] {
  const out: LoopEvent[] = [], B = billPhrase(i.bill);
  for (const v of i.votes) { const e = txVoteEvent(v, i.bill); if (e && txLoopKind(e.kind, e.advanced)) out.push(e); }
  const votes = [...out], has = (a: TxAction, c: string) => !!a.classification?.includes(c);
  const noNames = "No vote by name is on file here for this decision.";
  for (const a of i.actions) {
    const chamber = txChamber(a.chamber), passed = has(a, "passage"), failed = has(a, "failure");
    if (!chamber || (!passed && !failed)) continue;
    const day = a.date.slice(0, 10), ref = passed ? `passed:${chamber}` : `failed:${chamber}:${day}`;
    if (votes.some(v => v.chamber === chamber && v.advanced === passed && near(v.date, day, 1)) || out.some(e => e.ref === ref)) continue;
    out.push({ event: passed ? "passed" : "failed", ref, date: day, at: null, chamber, advanced: passed, voteId: null,
      result: passed ? `${cap(CHAMBER[chamber])} passed ${B} on ${longDate(day)}. ${noNames}` : `${B} failed a vote in ${CHAMBER[chamber]} on ${longDate(day)}. ${noNames}`,
      title: passed ? `${i.bill.label} passed ${CHAMBER[chamber]}` : `${i.bill.label} failed a vote in ${CHAMBER[chamber]}` });
  }
  const first = (c: string) => i.actions.filter(a => has(a, c)).map(a => a.date.slice(0, 10)).sort()[0] ?? null;
  const signedDay = first("executive-signature"), lawDay = signedDay ?? first("became-law"), vetoDay = first("executive-veto") ?? first("veto");
  if (lawDay) out.push({ event: "signed", ref: "law", date: lawDay, at: null, chamber: null, advanced: true, voteId: null,
    result: signedDay ? `The Governor signed ${B} on ${longDate(lawDay)}.` : `${B} became law on ${longDate(lawDay)}.`, title: `${i.bill.label} became law` });
  if (vetoDay) out.push({ event: "vetoed", ref: "vetoed", date: vetoDay, at: null, chamber: null, advanced: false, voteId: null,
    result: `The Governor vetoed ${B} on ${longDate(vetoDay)}.`, title: `${i.bill.label} was vetoed` });
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

/** Notices are for news: nothing older than this is announced, however late the record arrives. */
export const LOOP_WINDOW_DAYS = 14;

/**
 * Does this reader hear about this event? Only when it happened after they answered or followed the bill (the same
 * day counts when the record gives no time), and within the last 14 days.
 */
export function shouldNotify(e: Pick<LoopEvent, "date" | "at">, since: number, now: number): boolean {
  if (e.at !== null) return e.at >= since && e.at >= now - LOOP_WINDOW_DAYS * DAY && e.at <= now;
  return e.date >= utcDay(since) && e.date >= utcDay(now - LOOP_WINDOW_DAYS * DAY) && e.date <= utcDay(now + DAY);
}

/* ───────────────────────────── How the reader's own legislators voted ───────────────────────────── */

export type LoopMember = { id: string; /** "Rep. Lloyd Doggett", "State Sen. Sarah Eckhardt" */ short: string; chamber: Chamber };
export type MemberVote = { voteId: string; memberId: string; position: string; chamber: Chamber; date: string };

/**
 * One line per legislator, in the reader's own order, the same form for everyone:
 * how they voted in this vote; or that they are not listed in it; or that the decision was made with no vote by
 * name; or how they voted when their own chamber voted earlier; or that they have not voted on the bill.
 * Never a guess: a line says "voted" only when the record lists that member's vote.
 */
export function memberLines(members: readonly LoopMember[], e: Pick<LoopEvent, "voteId" | "chamber" | "date">, votes: readonly MemberVote[], opts: {
  /** Chambers that have already decided the bill with no vote by name: true when it passed there, false when it failed. */ unrecorded?: ReadonlyMap<Chamber, boolean>;
  /** Record votes this site's copy has no member list for. */ unlisted?: ReadonlySet<string> } = {}): string[] {
  if (!members.length) return ["Your legislators are not on file, so their votes are not listed. Add your address on the home screen to see them."];
  return members.map(m => {
    const mine = votes.filter(v => v.memberId === m.id && v.date <= e.date).sort((x, y) => y.date.localeCompare(x.date));
    const here = e.voteId ? mine.find(v => v.voteId === e.voteId) : null;
    if (here) return `${m.short} ${did(here.position)}.`;
    if (e.voteId && e.chamber === m.chamber) return opts.unlisted?.has(e.voteId) ? `${m.short}: this site’s copy of the vote does not list each member.` : `${m.short} is not listed in this recorded vote.`;
    if (!e.voteId && e.chamber === m.chamber) return `${m.short}: the vote was not recorded by name.`;
    if (mine[0]) return `${m.short} ${did(mine[0].position)} when ${CHAMBER[mine[0].chamber]} voted on ${longDate(mine[0].date)}.`;
    if (opts.unrecorded?.has(m.chamber)) return opts.unrecorded.get(m.chamber) ? `${m.short}: ${CHAMBER[m.chamber]} passed it with no vote recorded by name.` : `${m.short}: it failed in ${CHAMBER[m.chamber]} with no vote recorded by name.`;
    return `${m.short} has not voted on this bill.`;
  });
}

/* ───────────────────────────── The district ───────────────────────────── */

/**
 * Whether the result matched what counted residents of the reader's district said. A total is shown only from 25
 * counted voters (shownTotals), mail-verified listed first, a group under 5 by its size only; the comparison uses
 * only the groups whose answers are shown. Below 25 it is the fixed not-enough line. Always "Not a scientific poll."
 */
export function districtLine(scope: string | null, totals: ScopeTotals | null | undefined, advanced: boolean | null): string {
  if (!scope) return `Your district is not on file, so there is no district total to compare. ${NOT_SCIENTIFIC}`;
  const s = shownTotals(totals, "district");
  if (!s.show) return `Counted residents of ${scope}: ${s.message} ${NOT_SCIENTIFIC}`;
  const shown = s.groups.filter(g => g.counts), support = shown.reduce((n, g) => n + (g.counts?.support ?? 0), 0), oppose = shown.reduce((n, g) => n + (g.counts?.oppose ?? 0), 0);
  const leaning = support === oppose ? null : support > oppose;
  const verdict = leaning === null ? "They were evenly split between support and oppose."
    : `More of them ${leaning ? "supported this bill than opposed it" : "opposed this bill than supported it"}.${advanced === null ? "" : advanced === leaning ? " The result matched that." : " The result did not match that."}`;
  return `Counted residents of ${scope}, ${s.voters} voters: ${s.groups.map(groupLine).join("; ")}. ${verdict} ${NOT_SCIENTIFIC}`;
}

/** The district whose total stands beside the result: the congressional district for a federal bill; for a state bill the district of the chamber that acted (the state house district when no chamber did). */
export function districtScope(level: "federal" | "state", place: { congressional: string | null; stateUpper: string | null; stateLower: string | null } | null, chamber: Chamber | null): string | null {
  if (!place) return null;
  if (level === "federal") return place.congressional;
  return chamber === "upper" ? place.stateUpper ?? place.stateLower : place.stateLower ?? place.stateUpper;
}

/** The reader's own answer, in their own words. Read when the notice is shown or sent; never stored in the notice. */
export function answerLine(answer: string | null | undefined, follows: boolean): string | null {
  if (answer === "support" || answer === "oppose" || answer === "unsure") return `You said ${cap(answer)}.`;
  return follows ? "You follow this bill." : null;
}

/** What the notice keeps: the result, each legislator's vote, the district line. One line each. */
export function noticeBody(result: string, members: readonly string[], district: string): string { return [result, ...members, district].join("\n"); }

/* ───────────────────────────── Sending a reader's notices ───────────────────────────── */

export type OutNotice = { title: string; body: string; path: string; answer: string | null };

/** One push for everything new in this update. The text of a push is kept beside the reader's id, so it never holds their answer. */
export function noticePush(notices: readonly OutNotice[]): { title: string; body: string; path: string } {
  if (notices.length === 1) return { title: notices[0].title, body: notices[0].body.split("\n").slice(0, -1).join(" "), path: notices[0].path };
  return { title: `${notices.length} updates on bills you weighed in on`, body: notices.map(n => n.title).join("; "), path: "/notices" };
}

/** One email for everything new in this update. `link` turns a bill's path into the address the email carries. */
export function noticeEmail(notices: readonly OutNotice[], o: { site: string; brand: string; link: (path: string) => string }): { subject: string; text: string } {
  const lines: string[] = [notices.length === 1 ? "A bill you weighed in on has news." : `${notices.length} bills you weighed in on have news.`, ""];
  for (const n of notices) {
    lines.push(n.title, ...n.body.split("\n"));
    if (n.answer) lines.push(n.answer);
    lines.push(`See the bill: ${o.link(n.path)}`, "");
  }
  lines.push("You're caught up.", "", `You get this because you answered or follow ${notices.length === 1 ? "this bill" : "these bills"} on ${o.brand}.`,
    `To stop these emails, switch off “When a bill I follow moves” on your Account page: ${o.site}/account`, `${o.brand} shows what officials did. It does not grade them.`);
  return { subject: notices.length === 1 ? notices[0].title : `${notices.length} updates on bills you weighed in on`, text: lines.join("\n") };
}

/* ───────────────────────────── Vote alerts ───────────────────────────── */

export const ALERT_MAX_VOTES = 5;
export type AlertVote = { member: string; /** The sentence from voteLine: "Voted Yes to pass …. It passed 392–18." */ line: string; billLabel: string; path: string; at: number };

/**
 * One message for every new vote on a bill by the legislators a reader follows: the newest five, then how many
 * more and where they are listed.
 */
export function alertBundle(votes: readonly AlertVote[], o: { site: string; brand: string }): { title: string; body: string; path: string; subject: string; text: string; shown: number; more: number } | null {
  if (!votes.length) return null;
  const sorted = [...votes].sort((a, b) => b.at - a.at), shown = sorted.slice(0, ALERT_MAX_VOTES), more = sorted.length - shown.length;
  const say = (v: AlertVote) => `${v.member} ${v.line.charAt(0).toLowerCase()}${v.line.slice(1)}`;
  const rest = more ? `And ${more} more vote${more === 1 ? "" : "s"} by legislators you follow.` : "";
  const title = sorted.length === 1 ? `${sorted[0].member} voted on ${sorted[0].billLabel}` : `${sorted.length} new votes by legislators you follow`;
  const path = sorted.length === 1 ? sorted[0].path : "/following";
  const text = [sorted.length === 1 ? "A legislator you follow voted on a bill." : `Legislators you follow voted on bills: ${sorted.length} votes.`, "",
    ...shown.flatMap(v => [say(v), `  ${v.billLabel}: ${o.site}${v.path}`]), ...(more ? ["", `${rest} They are listed here: ${o.site}/following`] : []), "",
    "You're caught up.", "", `You get this because vote alerts are on. Turn them off on your Account page: ${o.site}/account`, `${o.brand} shows what officials did. It does not grade them.`].join("\n");
  return { title, body: [...shown.map(say), rest].filter(Boolean).join(" "), path, subject: title, text, shown: shown.length, more };
}

/* ───────────────────────────── The weekly email's "one bill that moved" ───────────────────────────── */

/** Where a bill in Congress now stands, as one sentence with its date. `stage` is official_bill_depth.stage. */
export function stageSentence(stage: string, date: string): string | null {
  const d = longDate(date);
  switch (stage) {
    case "introduced": return `It was introduced on ${d}.`;
    case "committee": return `It was sent to a committee on ${d}.`;
    case "passed_first": return `It passed one chamber of Congress on ${d}.`;
    case "passed_second": return `It passed the second chamber of Congress on ${d}.`;
    case "resolving": return `The House and Senate began settling their two versions on ${d}.`;
    case "president": return `It was sent to the President on ${d}.`;
    case "law": return `It became law on ${d}.`;
    case "vetoed": return `The President vetoed it on ${d}.`;
    case "failed": return `It failed a vote on ${d}.`;
    case "not_taken_up": return `A vote to take it up failed on ${d}.`;
    case "debate_blocked": return `A vote to end debate on it failed on ${d}.`;
    default: return null;
  }
}
/** When several bills in a reader's issues moved, the one that went furthest is the one named; a tie goes to the latest date. */
const STAGE_RANK: Record<string, number> = { law: 9, vetoed: 9, president: 8, passed_second: 7, resolving: 6, failed: 5, passed_first: 5, debate_blocked: 4, not_taken_up: 4, committee: 2, introduced: 1 };
export function pickMoved<T extends { stage: string; stageDate: string; billId: string }>(rows: readonly T[]): T | null {
  return [...rows].filter(r => stageSentence(r.stage, r.stageDate)).sort((a, b) => (STAGE_RANK[b.stage] ?? 0) - (STAGE_RANK[a.stage] ?? 0) || b.stageDate.localeCompare(a.stageDate) || a.billId.localeCompare(b.billId))[0] ?? null;
}
