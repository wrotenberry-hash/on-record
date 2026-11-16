/**
 * Round A parsers (federal data depth). Pure; tested in tests/depth.test.mjs
 * against fixtures written from each source's published format. Every parser
 * is defensive: unknown shapes give an empty result, never a throw, and the
 * ingest step reports counts on the health probe so a format change shows up
 * as a number, not as silent bad data.
 */
// Self-contained (no imports) so node's test runner can load it directly; decode and normalizeBillRef
// mirror lib/federal/parse.ts.
type BillRef = { id: string; congress: number; billType: string; number: number };
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(code) ? String.fromCodePoint(code) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const BILL_PREFIXES: Array<[string, string]> = [["HCONRES", "hconres"], ["HJRES", "hjres"], ["HRES", "hres"], ["HR", "hr"],
  ["SCONRES", "sconres"], ["SJRES", "sjres"], ["SRES", "sres"], ["S", "s"]];
export function normalizeBillRef(label: string | null | undefined, congress: number): BillRef | null {
  if (!label) return null;
  const compact = label.toUpperCase().replace(/[.\s]/g, "");
  for (const [prefix, billType] of BILL_PREFIXES) {
    const m = compact.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) { const number = Number(m[1]); return { id: `${congress}-${billType}-${number}`, congress, billType, number }; }
  }
  return null;
}

/* ---------------------------------------------------------- Bill actions --- */

export type BillAction = { seq: number; actionDate: string; text: string; type: string | null; actionCode: string | null; chamber: "house" | "senate" | null;
  committees: string[]; rollCalls: Array<{ chamber: string; rollNumber: number; session: number | null; date: string | null }> };

type RawAction = { actionCode?: string; actionDate?: string; text?: string; type?: string; sourceSystem?: { code?: number; name?: string };
  committees?: Array<{ name?: string; systemCode?: string }>; recordedVotes?: Array<{ chamber?: string; rollNumber?: number; sessionNumber?: number; date?: string }> };

/** Congress.gov /bill/{c}/{t}/{n}/actions. Oldest first; seq is the position in that order. */
export function parseActions(data: unknown): BillAction[] {
  const list = (data as { actions?: RawAction[] } | null)?.actions;
  if (!Array.isArray(list)) return [];
  const rows = list.filter(a => a && typeof a.actionDate === "string" && typeof a.text === "string").map(a => {
    const src = `${a.sourceSystem?.name ?? ""}`.toLowerCase();
    const chamber = src.includes("house") ? "house" as const : src.includes("senate") ? "senate" as const : null;
    return { actionDate: a.actionDate!.slice(0, 10), text: a.text!.replace(/\s+/g, " ").trim(), type: a.type ?? null, actionCode: a.actionCode ?? null, chamber,
      committees: (a.committees ?? []).map(c => c.systemCode ?? "").filter(Boolean),
      rollCalls: (a.recordedVotes ?? []).filter(v => typeof v.rollNumber === "number").map(v => ({ chamber: String(v.chamber ?? "").toLowerCase(), rollNumber: v.rollNumber!, session: v.sessionNumber ?? null, date: v.date ?? null })) };
  });
  // Congress.gov lists newest first; keep the source order for equal dates but present oldest first.
  rows.reverse();
  rows.sort((x, y) => x.actionDate.localeCompare(y.actionDate));
  return rows.map((r, i) => ({ seq: i, ...r }));
}

export type StageKey = "introduced" | "committee" | "passed_first" | "passed_second" | "resolving" | "president" | "law" | "vetoed" | "failed"
  | "not_taken_up" | "debate_blocked";
export const STAGE_LABEL: Record<StageKey, string> = { introduced: "Introduced", committee: "In committee", passed_first: "Passed first chamber",
  passed_second: "Passed second chamber", resolving: "Resolving differences", president: "Sent to the President", law: "Became law", vetoed: "Vetoed", failed: "Failed a vote",
  not_taken_up: "Floor vote to take it up failed", debate_blocked: "Vote to end debate failed" };

/** One action's stage, or null for actions that do not move the bill (cosponsor changes, notices). */
export function stageOf(a: Pick<BillAction, "text" | "type">): StageKey | null {
  const t = a.text.toLowerCase(), type = (a.type ?? "").toLowerCase();
  if (type === "becamelaw" || /became public law|became private law/.test(t)) return "law";
  if (type === "veto" || /vetoed by (the )?president|pocket veto/.test(t)) return "vetoed";
  if (/presented to (the )?president/.test(t) || (type === "president" && !/signed/.test(t))) return "president";
  if (/signed by (the )?president/.test(t)) return "law";
  if (type === "resolvingdifferences" || /conference report|resolving differences|agreed? to the (house|senate) amendment|concur(red)? in the (house|senate) amendment/.test(t)) return "resolving";
  // Owner, 16 Nov: a failed motion to proceed or cloture vote is a step of its own, not a failed passage vote.
  const floor = floorKind(a.text);
  if (floor && floor.kind !== "passage" && floor.kind !== "veto_override") {
    if (floor.passed) return null;
    return floor.kind === "cloture" || floor.kind === "cloture_proceed" ? "debate_blocked" : floor.kind === "discharged_petition" ? null : "not_taken_up";
  }
  if (/not agreed to|failed of passage|on passage failed|motion to suspend the rules and pass.*failed/.test(t)) return /amendment/.test(t) && !/passage/.test(t) ? null : "failed";
  // "Passed/agreed to in House: …" is Congress.gov's passage action (it can mention an amendment: "Passed Senate with an amendment").
  if (/^passed\/agreed to in (house|senate)/.test(t)) return "passed_first";
  const notPassage = /\bamendment\b|motion to (table|proceed|recommit|reconsider)|cloture/.test(t);
  if (!notPassage && ((/(passed|agreed to) (in|by) (the )?(house|senate)/.test(t)) || /on passage passed|motion to suspend the rules and pass the bill.*(agreed to|passed)/.test(t))) return "passed_first";
  if (type === "committee" || /referred to (the )?(house )?(committee|subcommittee)|reported (by|to)|ordered to be reported|committee consideration|markup/.test(t)) return "committee";
  if (type === "introreferral" || /^introduced/.test(t)) return /referred/.test(t) ? "committee" : "introduced";
  return null;
}

export type Step = { key: StageKey; label: string; date: string | null; text: string | null; done: boolean };
/** A floor vote shown as its own step between the stages (owner, 16 Nov). */
export type FloorStep = { key: string; label: string; date: string | null; text: string | null; done: true; floor: FloorVote };
export type TimelineStep = Step | FloorStep;

const PROGRESS: StageKey[] = ["passed_first", "passed_second", "resolving", "president", "law", "vetoed"];

/**
 * The status timeline: introduced → committee → passed one chamber → passed the
 * other → resolving differences (only when it happened) → President → law or veto.
 * The first passage is the first chamber; a passage in the other chamber is the second.
 * Floor votes (motion to proceed, cloture, discharge, failed passage, veto override) are
 * steps of their own, placed by date among the stages that are done. When the latest such
 * vote failed and nothing moved the bill after it, the bill's stage says so.
 */
export function lifecycle(actions: BillAction[], introducedAt: string | null = null, rollCalls: RollCallLike[] = []):
  { steps: TimelineStep[]; current: StageKey; currentStep: string; stageDate: string | null } {
  const hit = new Map<StageKey, BillAction>();
  let firstChamber: string | null = null;
  let blocked: { key: StageKey; date: string } | null = null;
  for (const a of actions) {
    const fv = floorKind(a.text);
    if (fv && fv.kind !== "veto_override") {
      if (fv.passed && fv.kind !== "passage") blocked = null;
      else if (!fv.passed) blocked = { key: fv.kind === "passage" ? "failed" : fv.kind === "cloture" || fv.kind === "cloture_proceed" ? "debate_blocked" : "not_taken_up", date: a.actionDate };
    }
    let s = stageOf(a);
    if (!s) continue;
    if (s === "passed_first") {
      const chamber = a.chamber ?? (/senate/i.test(a.text) ? "senate" : /house/i.test(a.text) ? "house" : null);
      if (!firstChamber) firstChamber = chamber ?? "first";
      else if (chamber && chamber !== firstChamber) s = "passed_second";
      else continue;
    }
    if (PROGRESS.includes(s)) blocked = null;
    if (!hit.has(s)) hit.set(s, a);
  }
  const floor = floorVotes(actions, rollCalls);
  // A failed procedural vote known only from a roll call (no actions on file yet) still sets the stage.
  for (const f of floor) if (!actions.length && f.kind !== "veto_override" && f.kind !== "discharged_petition")
    blocked = f.passed && f.kind !== "passage" ? null : !f.passed ? { key: f.kind === "passage" ? "failed" : f.kind === "cloture" || f.kind === "cloture_proceed" ? "debate_blocked" : "not_taken_up", date: f.date } : blocked;
  const order: StageKey[] = ["introduced", "committee", "passed_first", "passed_second", "resolving", "president", hit.has("vetoed") ? "vetoed" : "law"];
  const lastDone = Math.max(...order.map((k, i) => (hit.has(k) || (k === "introduced" && introducedAt) ? i : -1)));
  const stages: Step[] = order.filter(k => k !== "resolving" || hit.has("resolving")).map(k => {
    const a = hit.get(k), i = order.indexOf(k);
    return { key: k, label: STAGE_LABEL[k], date: a?.actionDate ?? (k === "introduced" ? introducedAt : null), text: a?.text ?? null, done: !!a || i <= lastDone };
  });
  const progress = [...stages].reverse().find(s => s.done)?.key ?? "introduced";
  // Floor steps go after the last done stage dated on or before them, never among the stages still to come.
  const steps: TimelineStep[] = [];
  const done = stages.filter(s => s.done), todo = stages.filter(s => !s.done);
  const floorSteps: FloorStep[] = floor.map((f, i) => ({ key: `floor-${i}`, label: f.label, date: f.date, text: f.meaning, done: true, floor: f }));
  let fi = 0;
  for (let i = 0; i < done.length; i++) {
    steps.push(done[i]);
    const nextDate = done.slice(i + 1).find(d => d.date)?.date ?? null;
    while (fi < floorSteps.length && (!nextDate || (floorSteps[fi].date ?? "") < nextDate)) steps.push(floorSteps[fi++]);
  }
  while (fi < floorSteps.length) steps.push(floorSteps[fi++]);
  steps.push(...todo);
  const current: StageKey = blocked ? blocked.key : progress;
  const lastFloor = floorSteps.at(-1);
  const currentStep = blocked && lastFloor && !lastFloor.floor.passed ? lastFloor.key : progress;
  const stageDate = blocked ? blocked.date : stages.find(s => s.key === progress)?.date ?? null;
  return { steps, current, currentStep, stageDate };
}

/* ----------------------------------------------------------- Floor votes --- */

export type FloorKindKey = "proceed" | "cloture_proceed" | "cloture" | "discharge" | "discharged_petition" | "passage" | "veto_override";
export type FloorVote = { kind: FloorKindKey; chamber: "house" | "senate" | null; passed: boolean; yeas: number | null; nays: number | null;
  rollNumber: number | null; twoThirds: boolean; cra: boolean; date: string; label: string; meaning: string; rollCallId: string | null };
export type RollCallLike = { id: string; chamber: string; rollNumber: number; votedAt: number | string; question: string; title?: string | null; result?: string | null; yea: number; nay: number };

const FAILED = /\bnot agreed to\b|\brejected\b|\bfailed\b|\bnot invoked\b|\bnot passed\b|\bdefeated\b|\bsustained\b/;

/** What kind of floor vote an action's text records, and whether it carried. Null for anything else (filings, notices, amendments). */
export function floorKind(text: string): { kind: FloorKindKey; passed: boolean } | null {
  const t = text.toLowerCase();
  const vetoish = /over (the )?(president'?s )?veto|objections of the president|overrid(e|ing) (of )?(the )?veto|veto override/.test(t);
  if (/\bamendment\b/.test(t) && !/measure|\bbill\b|resolution|motion to proceed|veto|discharge|passage|passed\/agreed to/.test(t)) return null;
  if (vetoish) return /passed|agreed to|overridden/.test(t) || FAILED.test(t) ? { kind: "veto_override", passed: !FAILED.test(t) } : null;
  if (/cloture/.test(t)) {
    if (!/invoked|cloture motion .*(agreed to|rejected)/.test(t)) return null; // filed, presented or withdrawn: not a vote
    return { kind: /motion to proceed/.test(t) ? "cloture_proceed" : "cloture", passed: !FAILED.test(t) };
  }
  if (/discharged\b.*\bpetition|discharge(d)? by petition|petition .*802\(c\)|802\(c\).*discharged/.test(t)) return { kind: "discharged_petition", passed: true };
  if (/motion to discharge/.test(t)) return /agreed to|rejected|failed/.test(t) ? { kind: "discharge", passed: !FAILED.test(t) } : null;
  if (/motion to proceed/.test(t)) return /agreed to|rejected|failed/.test(t) && !/withdrawn/.test(t) ? { kind: "proceed", passed: !FAILED.test(t) } : null;
  if (/failed of passage|on passage failed|passage failed|joint resolution not passed|bill not passed|resolution not passed|motion to suspend the rules and pass.*failed/.test(t)) return { kind: "passage", passed: false };
  return null;
}

function tallyOf(text: string): { yeas: number; nays: number } | null {
  const m = text.match(/(?:vote|nays)\b[\s\S]*?(\d{1,3})\s*-\s*(\d{1,3})(?!\d)/i);
  return m ? { yeas: Number(m[1]), nays: Number(m[2]) } : null;
}
function rollOf(text: string): number | null {
  const m = text.match(/record vote (?:number|no\.?):?\s*(\d+)|roll no\.?\s*(\d+)/i);
  return m ? Number(m[1] ?? m[2]) : null;
}
const chamberName = (c: "house" | "senate" | null) => (c === "senate" ? "Senate" : c === "house" ? "House" : "The chamber");

/** The plain-English line for a floor vote. Neutral wording; the same for every party. */
export function describeFloor(v: Pick<FloorVote, "kind" | "chamber" | "passed" | "yeas" | "nays" | "twoThirds" | "cra">): { label: string; meaning: string } {
  const C = chamberName(v.chamber), the = v.chamber ? `the ${C}` : "the chamber";
  const tally = v.yeas !== null && v.nays !== null ? `${v.yeas}–${v.nays}` : null;
  const voted = (what: string, not: string) => v.passed
    ? (tally ? `${C} voted ${tally} ${what}` : `${C} agreed ${what}`)
    : tally && (v.yeas ?? 0) < (v.nays ?? 0) ? `${C} voted ${tally} ${not}` : `${C} vote ${what} failed${tally ? `, ${tally}` : ""}`;
  switch (v.kind) {
    case "proceed": return { label: voted("to take it up", "not to take it up"),
      meaning: v.passed ? "It can now be debated and voted on." : `It cannot be debated unless ${the} votes again to take it up.` };
    case "cloture_proceed": return { label: voted("to end debate on taking it up", "not to end debate on taking it up"),
      meaning: v.passed ? "Ending debate needs 60 votes for most measures. A vote on taking it up comes next."
        : `Ending debate needs 60 votes for most measures. Without that, it cannot be taken up unless ${the} votes again.` };
    case "cloture": return { label: voted("to end debate", "not to end debate"),
      meaning: v.passed ? "Ending debate needs 60 votes for most measures. A final vote comes next."
        : `Ending debate needs 60 votes for most measures. Without that, there is no final vote unless ${the} votes again.` };
    case "discharge": return { label: voted("to bring it out of committee", "not to bring it out of committee"),
      meaning: v.passed ? `It can go to the full ${C === "The chamber" ? "chamber" : C} without the committee acting first.` : "It stays in committee unless another vote brings it out." };
    case "discharged_petition": return { label: v.chamber === "senate" ? "Senators brought it out of committee by petition" : "Brought out of committee by petition",
      meaning: v.cra ? "Under the Congressional Review Act, 30 senators can sign a petition to bring a resolution out of committee without a committee vote. The full Senate can then vote to take it up."
        : `A petition brought it out of committee without a committee vote, so ${the} can take it up.` };
    case "passage": return { label: tally && (v.yeas ?? 0) < (v.nays ?? 0) ? `${C} voted ${tally} against passing it` : `${C} vote to pass it failed${tally ? `, ${tally}` : ""}${v.twoThirds ? " (two-thirds needed)" : ""}`,
      meaning: `It did not pass ${the}.` };
    case "veto_override": return { label: v.passed ? voted("to override the veto", "") : `${C} vote to override the veto failed${tally ? `, ${tally}` : ""} (two-thirds needed)`,
      meaning: v.passed ? "Overriding a veto needs two-thirds of both chambers." : "The veto stands, so it does not become law." };
  }
}

/** A floor vote from a Congress.gov action, or null. */
export function floorVoteOf(a: Pick<BillAction, "text" | "actionDate"> & { chamber?: "house" | "senate" | null; rollCalls?: BillAction["rollCalls"] }): FloorVote | null {
  const k = floorKind(a.text);
  if (!k) return null;
  const t = a.text.toLowerCase();
  const chamber = a.chamber ?? (/\bin senate\b|senate:|\bsenate\b/.test(t) ? "senate" : /\bin house\b|house:|\bhouse\b/.test(t) ? "house" : null);
  const tally = tallyOf(a.text), rollNumber = a.rollCalls?.[0]?.rollNumber ?? rollOf(a.text);
  const base = { kind: k.kind, chamber, passed: k.passed, yeas: tally?.yeas ?? null, nays: tally?.nays ?? null, rollNumber, twoThirds: /2\/3|two-thirds/.test(t),
    cra: /802|congressional review/.test(t), date: a.actionDate.slice(0, 10), rollCallId: null };
  return { ...base, ...describeFloor(base) };
}

/** A procedural floor vote from a roll call on file (question/result wording from the clerk or the Senate), or null for passage votes that carried. */
export function floorVoteFromRollCall(r: RollCallLike): FloorVote | null {
  const q = r.question.toLowerCase(), title = (r.title ?? "").toLowerCase(), res = (r.result ?? "").toLowerCase();
  const failed = FAILED.test(res);
  let kind: FloorKindKey | null = null;
  if (/overrid|veto/.test(q)) kind = "veto_override";
  else if (/cloture/.test(q) || /cloture/.test(title)) kind = /motion to proceed/.test(title) || /motion to proceed/.test(q) ? "cloture_proceed" : "cloture";
  else if (/motion to discharge/.test(q)) kind = "discharge";
  else if (/motion to proceed/.test(q)) kind = "proceed";
  else if (/passage|suspend the rules and pass/.test(q) && failed) kind = "passage";
  if (!kind) return null;
  const chamber = r.chamber === "senate" ? "senate" as const : r.chamber === "house" ? "house" as const : null;
  const date = typeof r.votedAt === "number" ? new Date(r.votedAt).toISOString().slice(0, 10) : String(r.votedAt).slice(0, 10);
  const base = { kind, chamber, passed: !failed, yeas: r.yea, nays: r.nay, rollNumber: r.rollNumber, twoThirds: /2\/3|two-thirds/.test(`${q} ${res}`), cra: false, date, rollCallId: r.id };
  return { ...base, ...describeFloor(base) };
}

/** Floor votes from the actions and the roll calls on file, one per vote, oldest first; a roll call on file is linked. */
export function floorVotes(actions: BillAction[], rollCalls: RollCallLike[] = []): FloorVote[] {
  const out: FloorVote[] = [];
  const fromRoll = rollCalls.map(floorVoteFromRollCall).filter((v): v is FloorVote => !!v);
  for (const a of actions) {
    const v = floorVoteOf(a);
    if (!v) continue;
    // Congress.gov can list the same floor action twice (once per source system): keep one.
    if (out.some(o => o.kind === v.kind && o.chamber === v.chamber && o.date === v.date && o.yeas === v.yeas && o.nays === v.nays && o.passed === v.passed)) continue;
    const match = rollCalls.find(r => r.chamber === v.chamber && ((v.rollNumber !== null && r.rollNumber === v.rollNumber) || (v.yeas !== null && r.yea === v.yeas && r.nay === v.nays)) &&
      Math.abs(Date.parse(typeof r.votedAt === "number" ? new Date(r.votedAt).toISOString() : String(r.votedAt)) - Date.parse(v.date)) < 3 * 86400e3);
    out.push(match ? { ...v, rollCallId: match.id, rollNumber: v.rollNumber ?? match.rollNumber } : v);
  }
  for (const v of fromRoll) if (!out.some(o => o.rollCallId === v.rollCallId || (o.chamber === v.chamber && o.kind === v.kind && o.date === v.date && o.yeas === v.yeas))) out.push(v);
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

/* ------------------------------------------------------------ Amendments --- */

export type Amendment = { id: string; congress: number; chamber: "house" | "senate"; number: number; description: string | null; purpose: string | null;
  latestActionDate: string | null; latestActionText: string | null; outcome: "adopted" | "failed" | "withdrawn" | "pending" };

export function amendmentOutcome(text: string | null | undefined): Amendment["outcome"] {
  const t = String(text ?? "").toLowerCase();
  if (/withdrawn/.test(t)) return "withdrawn";
  if (/not agreed to|failed|rejected|tabled|fell when|ruled out of order|point of order sustained/.test(t)) return "failed";
  if (/agreed to|adopted|passed/.test(t)) return "adopted";
  return "pending";
}

type RawAmendment = { congress?: number; number?: string | number; type?: string; description?: string; purpose?: string; latestAction?: { actionDate?: string; text?: string } };
/** Congress.gov /bill/.../amendments (list) or /amendment/{c}/{t}/{n} (detail under "amendment"). */
export function parseAmendments(data: unknown): Amendment[] {
  const d = data as { amendments?: RawAmendment[]; amendment?: RawAmendment } | null;
  const list = Array.isArray(d?.amendments) ? d!.amendments : d?.amendment ? [d.amendment] : [];
  return list.flatMap(a => {
    const type = String(a.type ?? "").toLowerCase(), n = Number(a.number);
    if (!a.congress || !Number.isFinite(n) || !/^(hamdt|samdt|suamdt)$/.test(type)) return [];
    const clean = (s: string | undefined) => (s ? s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null : null);
    return [{ id: `${a.congress}-${type}-${n}`, congress: a.congress, chamber: type === "hamdt" ? "house" as const : "senate" as const, number: n,
      description: clean(a.description), purpose: clean(a.purpose), latestActionDate: a.latestAction?.actionDate ?? null, latestActionText: clean(a.latestAction?.text),
      outcome: amendmentOutcome(a.latestAction?.text) }];
  });
}
/** One plain line for an amendment: its stated purpose, else its description, else its number. */
export function amendmentLine(a: Pick<Amendment, "purpose" | "description" | "chamber" | "number">) {
  const s = a.purpose ?? a.description;
  if (!s) return `${a.chamber === "house" ? "House" : "Senate"} amendment ${a.number}`;
  const one = s.split(/(?<=\.)\s/)[0];
  return one.length > 180 ? `${one.slice(0, 177).replace(/\s+\S*$/, "")}…` : one;
}

/* --------------------------------------------------------- Text versions --- */

export type TextVersion = { type: string; date: string | null; xmlUrl: string | null; htmlUrl: string | null; pdfUrl: string | null };
/** Congress.gov /bill/.../text. Oldest first. */
export function parseTextVersions(data: unknown): TextVersion[] {
  const list = (data as { textVersions?: Array<{ type?: string; date?: string | null; formats?: Array<{ type?: string; url?: string }> }> } | null)?.textVersions;
  if (!Array.isArray(list)) return [];
  const rows = list.filter(v => v?.type).map(v => {
    const f = (re: RegExp) => v.formats?.find(x => re.test(String(x.type ?? "")))?.url ?? null;
    return { type: v.type!, date: v.date ? v.date.slice(0, 10) : null, xmlUrl: f(/xml/i), htmlUrl: f(/formatted text|htm/i), pdfUrl: f(/pdf/i) };
  });
  return rows.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

/** Section-level comparison of two versions (Official, computed): added, removed and changed section numbers. */
export function compareSections(before: Array<{ number: string; text?: string }>, after: Array<{ number: string; text?: string }>) {
  const norm = (t?: string) => (t ?? "").replace(/\s+/g, " ").trim();
  const b = new Map(before.map(s => [s.number, norm(s.text)])), a = new Map(after.map(s => [s.number, norm(s.text)]));
  return { added: [...a.keys()].filter(k => !b.has(k)), removed: [...b.keys()].filter(k => !a.has(k)),
    changed: [...a.keys()].filter(k => b.has(k) && b.get(k) !== a.get(k)) };
}

/* ------------------------------------------------------------ Committees --- */

export const COMMITTEES_URL = "https://unitedstates.github.io/congress-legislators/committees-current.json";
export const COMMITTEE_MEMBERSHIP_URL = "https://unitedstates.github.io/congress-legislators/committee-membership-current.json";
export type Committee = { id: string; chamber: "house" | "senate" | "joint"; name: string; parentId: string | null; url: string | null };
export function parseCommittees(data: unknown): Committee[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((c: { type?: string; name?: string; thomas_id?: string; url?: string; subcommittees?: Array<{ name?: string; thomas_id?: string }> }) => {
    if (!c?.thomas_id || !c.name) return [];
    const chamber = c.type === "senate" ? "senate" as const : c.type === "joint" ? "joint" as const : "house" as const;
    const parent = { id: c.thomas_id, chamber, name: c.name, parentId: null, url: c.url ?? null };
    const subs = (c.subcommittees ?? []).filter(s => s?.thomas_id && s.name).map(s => ({ id: `${c.thomas_id}${s.thomas_id}`, chamber, name: s.name!, parentId: c.thomas_id!, url: null }));
    return [parent, ...subs];
  });
}
export type CommitteeMember = { committeeId: string; politicianId: string; side: "majority" | "minority" | null; rank: number | null; title: string | null };
export function parseCommitteeMembership(data: unknown): CommitteeMember[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>).flatMap(([committeeId, members]) => Array.isArray(members)
    ? members.flatMap((m: { bioguide?: string; party?: string; rank?: number; title?: string }) => m?.bioguide ? [{ committeeId, politicianId: m.bioguide,
      side: m.party === "majority" || m.party === "minority" ? m.party : null, rank: typeof m.rank === "number" ? m.rank : null, title: m.title ?? null }] : [])
    : []);
}
/** Congress.gov committee system codes ("hsag00", "ssfi10") to committees-current ids ("HSAG", "SSFI10"). */
export function committeeIdFromSystemCode(code: string) {
  const m = code.toUpperCase().match(/^([HSJ][A-Z]{3})(\d{2})$/);
  return m ? (m[2] === "00" ? m[1] : `${m[1]}${m[2]}`) : null;
}

/* -------------------------------------------------------- Floor schedule --- */

export type FloorItem = { chamber: "house" | "senate"; billId: string | null; label: string; description: string | null };
/** Monday of the week (UTC date) as YYYYMMDD, the House floor file name. */
export function weekOf(ms: number) {
  const d = new Date(ms), day = d.getUTCDay(), monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((day + 6) % 7)));
  return monday.toISOString().slice(0, 10).replace(/-/g, "");
}
export const houseFloorUrl = (week: string) => `https://docs.house.gov/floor/Download.aspx?file=/billsthisweek/${week}/${week}.xml`;
export const SENATE_FLOOR_URL = "https://www.senate.gov/legislative/schedule/floor_schedule.htm";

/** docs.house.gov weekly XML: <floor-item><legis-num>H.R. 1234</legis-num><floor-text>…</floor-text></floor-item>. */
export function parseHouseFloor(xml: string, congress: number): FloorItem[] {
  const items = xml.match(/<floor-item\b[\s\S]*?<\/floor-item>/gi) ?? [];
  const seen = new Set<string>();
  return items.flatMap(block => {
    const label = decode((block.match(/<legis-num[^>]*>([\s\S]*?)<\/legis-num>/i)?.[1] ?? "").replace(/<[^>]+>/g, "")).trim();
    if (!label || seen.has(label)) return [];
    seen.add(label);
    const text = decode((block.match(/<floor-text[^>]*>([\s\S]*?)<\/floor-text>/i)?.[1] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() || null;
    return [{ chamber: "house" as const, billId: normalizeBillRef(label, congress)?.id ?? null, label, description: text }];
  });
}

const BILL_IN_TEXT = /\b(H\.\s?R\.|S\.|H\.\s?J\.\s?Res\.|S\.\s?J\.\s?Res\.|H\.\s?Res\.|S\.\s?Res\.|H\.\s?Con\.\s?Res\.|S\.\s?Con\.\s?Res\.)\s?(\d{1,5})\b/g;
/** Bill numbers named on the Senate floor schedule page (HTML), each once, with the sentence around it. */
export function parseSenateFloor(html: string, congress: number): FloorItem[] {
  const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const seen = new Set<string>(), out: FloorItem[] = [];
  for (const m of text.matchAll(BILL_IN_TEXT)) {
    const ref: BillRef | null = normalizeBillRef(`${m[1]}${m[2]}`, congress);
    if (!ref || seen.has(ref.id)) continue;
    seen.add(ref.id);
    const start = Math.max(0, text.lastIndexOf(".", m.index!) + 1), end = text.indexOf(".", m.index! + m[0].length + 1);
    out.push({ chamber: "senate", billId: ref.id, label: m[0].replace(/\s+/g, " "), description: text.slice(start, end > 0 ? end + 1 : undefined).trim().slice(0, 300) || null });
  }
  return out;
}

/* --------------------------------------------------- Census geographies --- */

export type Districts = { state: string; congressional: string | null; stateUpper: string | null; stateLower: string | null; matchedAddress: string | null };
/** All districts for one Census geocoder address match: "TX-07", state senate "TX-SD-14", state house "TX-HD-049". */
export function districtsFromCensus(match: unknown): Districts | null {
  const m = match as { matchedAddress?: string; geographies?: Record<string, Array<Record<string, unknown>>> } | null;
  const g = m?.geographies;
  if (!g) return null;
  const state = String(g["States"]?.[0]?.["STUSAB"] ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) return null;
  const layer = (re: RegExp) => Object.entries(g).find(([k]) => re.test(k))?.[1]?.[0];
  const cd = layer(/Congressional Districts/i), up = layer(/State Legislative Districts\s*-\s*Upper/i), low = layer(/State Legislative Districts\s*-\s*Lower/i);
  const code = (row: Record<string, unknown> | undefined, re: RegExp) => { if (!row) return null; const v = Object.entries(row).find(([k]) => re.test(k))?.[1]; return v == null ? null : String(v); };
  const cdCode = code(cd, /^CD\d{3}$/);
  const congressional = cdCode && /^\d{1,2}$/.test(cdCode) ? `${state}-${cdCode === "00" || cdCode === "98" ? "AL" : cdCode.padStart(2, "0")}` : null;
  const su = code(up, /^SLDU$/) ?? code(up, /^BASENAME$/), sl = code(low, /^SLDL$/) ?? code(low, /^BASENAME$/);
  const num = (v: string | null) => (v && /^\d+$/.test(v) ? String(Number(v)) : v && v !== "ZZZ" ? v : null);
  return { state, congressional, stateUpper: num(su) ? `${state}-SD-${num(su)}` : null, stateLower: num(sl) ? `${state}-HD-${num(sl)}` : null, matchedAddress: m?.matchedAddress ?? null };
}

/* ---------------------------------------------------------- ZIP → state --- */

// USPS three-digit ZIP prefixes by state (first three digits, inclusive ranges). A border ZIP can
// cross states; the lookup says so and asks for a street address for the exact district.
const ZIP3: Array<[number, number, string]> = [[5, 5, "NY"], [6, 7, "PR"], [8, 8, "VI"], [9, 9, "PR"], [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"],
  [50, 54, "VT"], [55, 55, "MA"], [56, 59, "VT"], [60, 69, "CT"], [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"], [200, 200, "DC"], [201, 201, "VA"],
  [202, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"], [270, 289, "NC"], [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"],
  [370, 385, "TN"], [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"], [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"],
  [550, 567, "MN"], [569, 569, "DC"], [570, 577, "SD"], [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"], [660, 679, "KS"], [680, 693, "NE"],
  [700, 714, "LA"], [716, 729, "AR"], [730, 732, "OK"], [733, 733, "TX"], [734, 749, "OK"], [750, 799, "TX"], [800, 816, "CO"], [820, 831, "WY"], [832, 838, "ID"],
  [840, 847, "UT"], [850, 865, "AZ"], [870, 884, "NM"], [885, 885, "TX"], [889, 898, "NV"], [900, 961, "CA"], [967, 968, "HI"], [969, 969, "GU"], [970, 979, "OR"],
  [980, 994, "WA"], [995, 999, "AK"]];
export function stateForZip(zip: string): string | null {
  if (!/^\d{5}(-\d{4})?$/.test(zip.trim())) return null;
  const p = Number(zip.trim().slice(0, 3));
  return ZIP3.find(([a, b]) => p >= a && p <= b)?.[2] ?? null;
}

/* -------------------------------------------------------- Tally integrity --- */

export type Tally = { yea: number; nay: number; present: number; notVoting: number };
/** Official totals against the member votes stored for the roll call. Empty array when they agree. */
export function tallyMismatches(official: Tally, counted: Partial<Record<"Yea" | "Nay" | "Present" | "Not Voting", number>>) {
  const pairs: Array<[keyof Tally, "Yea" | "Nay" | "Present" | "Not Voting"]> = [["yea", "Yea"], ["nay", "Nay"], ["present", "Present"], ["notVoting", "Not Voting"]];
  return pairs.filter(([o, c]) => (official[o] ?? 0) !== (counted[c] ?? 0)).map(([o, c]) => ({ field: o, official: official[o] ?? 0, counted: counted[c] ?? 0 }));
}
