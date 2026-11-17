/**
 * Trial analytics: the numbers the owner asked to watch during the trial, worked
 * out from the daily counters (event_counts) and a few counts the site already
 * keeps. Pure; tested in tests/trial-analytics.test.mjs. Aggregate only: every
 * input is a total, never a reader.
 */
export type EventRow = { name: string; dim: string; n: number };

/** The 60-second flow, in order. Emitted by the landing flow. */
export const FLOW_STEPS = ["flow_landing", "flow_zip", "flow_address", "flow_first_answer"] as const;
/** Seconds from landing to the first Support / Oppose / Unsure, in four bands (`first_answer_seconds`). */
export const FIRST_ANSWER_BANDS = ["under_60", "60_120", "120_300", "over_300"] as const;
/** Contact tools: opening the panel, then what the reader tapped. Dimension: "bill", "tx_bill" or "member". */
export const CONTACT_EVENTS = ["contact_open", "contact_call", "contact_form", "contact_copy", "contact_email"] as const;
export const CONTACT_TAPS = ["contact_call", "contact_form", "contact_copy", "contact_email"] as const;
export const ANSWER_EVENTS = ["answer_support", "answer_oppose", "answer_unsure"] as const;
export const SHARE_EVENT_NAMES = ["card_render", "share_native", "share_download", "share_copy", "share_video", "share_carousel"] as const;
export const ONBOARDING_EVENTS = ["onboarding_start", "onboarding_zip", "onboarding_done"] as const;
export const FOLLOW_EVENTS = ["follow_add", "bill_follow_add", "issue_follow"] as const;

/** Every counter this report reads, so the caller can ask for them by name (no top-80 cut). */
export const TRIAL_EVENT_NAMES: readonly string[] = [...FLOW_STEPS, "first_answer_seconds", ...CONTACT_EVENTS, ...ANSWER_EVENTS, ...SHARE_EVENT_NAMES, ...ONBOARDING_EVENTS, ...FOLLOW_EVENTS];

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((1000 * part) / whole) / 10 : null);
/** Events whose dimension is the audience ("trial", "editor", …): the editor's own taps are left out. */
const AUDIENCE_DIM = new Set<string>([...ONBOARDING_EVENTS, ...ANSWER_EVENTS, ...FOLLOW_EVENTS]);

function reader(rows: readonly EventRow[]) {
  const sum = (name: string, dim?: string) => rows.filter(r => r.name === name && (dim === undefined ? !AUDIENCE_DIM.has(name) || r.dim !== "editor" : r.dim === dim)).reduce((n, r) => n + Number(r.n || 0), 0);
  return sum;
}

function windowOf(rows: readonly EventRow[]) {
  const sum = reader(rows);
  const flow = { landing: sum("flow_landing"), zip: sum("flow_zip"), address: sum("flow_address"), firstAnswer: sum("flow_first_answer") };
  const bands = Object.fromEntries(FIRST_ANSWER_BANDS.map(b => [b, sum("first_answer_seconds", b)])) as Record<(typeof FIRST_ANSWER_BANDS)[number], number>;
  const timed = FIRST_ANSWER_BANDS.reduce((n, b) => n + bands[b], 0);
  const contactKinds = ["bill", "tx_bill", "member"] as const;
  const taps = (dim?: string) => CONTACT_TAPS.reduce((n, e) => n + sum(e, dim), 0);
  const started = sum("onboarding_start"), done = sum("onboarding_done");
  const answers = { support: sum("answer_support"), oppose: sum("answer_oppose"), unsure: sum("answer_unsure") };
  return {
    onboarding: { started, gaveZip: sum("onboarding_zip"), completed: done, completionPct: pct(done, started) },
    flow: { ...flow, zipPctOfLanding: pct(flow.zip, flow.landing), firstAnswerPctOfLanding: pct(flow.firstAnswer, flow.landing) },
    firstAnswer: { bands, timed, within60sPct: pct(bands.under_60, timed) },
    weighIns: { ...answers, total: answers.support + answers.oppose + answers.unsure },
    follows: { members: sum("follow_add"), bills: sum("bill_follow_add"), issues: sum("issue_follow") },
    shares: { cardsMade: sum("card_render"), shareSheet: sum("share_native"), downloads: sum("share_download"), linkCopies: sum("share_copy"), videos: sum("share_video"), carousels: sum("share_carousel"),
      total: sum("share_native") + sum("share_download") + sum("share_copy") + sum("share_video") + sum("share_carousel") },
    contact: { opened: sum("contact_open"), call: sum("contact_call"), form: sum("contact_form"), copy: sum("contact_copy"), email: sum("contact_email"), taps: taps(),
      byPlace: Object.fromEntries(contactKinds.map(k => [k, taps(k)])) as Record<(typeof contactKinds)[number], number> },
  };
}

export type Standing = {
  /** Readers seen in the last 7 days, and how many of them had visited before. */
  weeklyActiveReaders?: number | null; weeklyReturningReaders?: number | null;
  /** Trial invites used in the last 7 days, and how many of those were used on an earlier day too. */
  invitesActive7d?: number | null; invitesReturning7d?: number | null; invitesUsed?: number | null; invites?: number | null;
  readersFollowingMembers?: number | null; followsPerFollower?: number | null; readersFollowingBills?: number | null; billFollows?: number | null;
};

/**
 * The whole report: 7-day and 28-day windows from the event counters, plus
 * weekly return and follows from the standing counts. A missing counter is 0;
 * a rate with nothing to divide by is null (shown as "no data yet").
 */
export function trialAnalytics(input: { events7d: readonly EventRow[]; events28d: readonly EventRow[]; standing?: Standing | null }) {
  const s = input.standing ?? {}, num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    last7d: windowOf(input.events7d), last28d: windowOf(input.events28d),
    weeklyReturn: { activeReaders: num(s.weeklyActiveReaders), returningReaders: num(s.weeklyReturningReaders), returningPct: pct(num(s.weeklyReturningReaders), num(s.weeklyActiveReaders)),
      invitesActive: num(s.invitesActive7d), invitesReturning: num(s.invitesReturning7d), invitesReturningPct: pct(num(s.invitesReturning7d), num(s.invitesActive7d)), invitesUsed: num(s.invitesUsed), invites: num(s.invites) },
    followsNow: { readersFollowingMembers: num(s.readersFollowingMembers), followsPerFollower: s.followsPerFollower ?? null, readersFollowingBills: num(s.readersFollowingBills), billFollows: num(s.billFollows) },
  };
}
export type TrialAnalytics = ReturnType<typeof trialAnalytics>;
