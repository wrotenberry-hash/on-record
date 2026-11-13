/** Pure formatting for the Phase B checkpoint email. No database, no network: tested in tests/analysis.test.mjs. */
/**
 * The Phase B checkpoint email (docs/TALK_IS_CHEAP_PLAN.md, "5 real bills with
 * complete summaries"). Once the first CHECKPOINT_SUMMARIES summaries exist, one
 * email carries every one of them in full, with the rule checker's result, so
 * the owner can read them on the phone and a session can review them from the
 * inbox. It needs nothing new: Resend and the alert recipient are already set.
 * Sent once; recorded in alert_events as SUMMARIES_READY.
 */
export const CHECKPOINT_SUMMARIES = 5;

export type SummaryForEmail = { label: string; title: string; billId: string; category: string | null; headline: string;
  whatItDoes: Array<{ text: string; section: string }>; whoItAffects: Array<{ text: string; section: string }>; whatChangesForYou: string;
  caseFor: Array<{ argument: string; attribution: string }>; caseAgainst: Array<{ argument: string; attribution: string }>; unknowns: string[];
  confidence: string; confidenceReason: string; status: string; queue: string | null; checkPassed: boolean; attempts: number;
  failures: string[]; warnings: string[]; readingGrade: number | null; totalWords: number | null; costUsd: number; truncated: boolean };

/** Pure. Plain text, one block per summary, every section badged as on the page. */
export function formatSummariesEmail(rows: readonly SummaryForEmail[], siteUrl: string): { subject: string; text: string } {
  const cost = rows.reduce((n, r) => n + r.costUsd, 0);
  const queued = rows.filter(r => r.queue).length;
  const blocks = rows.map((r, i) => [
    `${i + 1}. ${r.label}: ${r.title}`,
    `   Category: ${r.category ?? "none"} · Status: ${r.status}${r.queue ? ` · In your queue (${r.queue.replace("_", " ")})` : ""}`,
    `   Checker: ${r.checkPassed ? "passed" : "FAILED"} after ${r.attempts} attempt${r.attempts === 1 ? "" : "s"}${r.readingGrade !== null ? ` · reading grade ${r.readingGrade}` : ""}${r.totalWords !== null ? ` · ${r.totalWords} words` : ""} · $${r.costUsd.toFixed(4)}${r.truncated ? " · text read in part only" : ""}`,
    ...(r.failures.length ? [`   Still failing: ${r.failures.join(" | ")}`] : []),
    ...(r.warnings.length ? [`   Warnings: ${r.warnings.join(" | ")}`] : []),
    "",
    `   [Analysis] Headline: ${r.headline}`,
    "   [Analysis] What it does:", ...r.whatItDoes.map(p => `     - ${p.text} (${p.section})`),
    "   [Analysis] Who it affects:", ...r.whoItAffects.map(p => `     - ${p.text} (${p.section})`),
    `   [Analysis] What changes for you: ${r.whatChangesForYou}`,
    "   [Analysis] The case for:", ...r.caseFor.map(a => `     - ${a.argument} (${a.attribution})`),
    "   [Analysis] The case against:", ...r.caseAgainst.map(a => `     - ${a.argument} (${a.attribution})`),
    "   [Analysis] What we don't know:", ...r.unknowns.map(u => `     - ${u}`),
    `   Confidence ${r.confidence}: ${r.confidenceReason}`,
    `   Page: ${siteUrl}/bills/${r.billId}`,
  ].join("\n"));
  const lines = [
    `On Record wrote the first ${rows.length} bill summaries. Every line marked [Analysis] was written by the model from the bill's own text; the official title, status, cost estimate and votes on the page are copied from government records.`,
    "",
    `What to test on your phone: sign in, open Editor > Bill summaries, read each one, and approve or reject the ${queued} waiting in your queue. Then say "caps up" and the caps go to 40 summaries / $5.`,
    "",
    `Cost so far: $${cost.toFixed(4)} for ${rows.length} summaries.`,
    "", ...blocks.flatMap(b => [b, ""]),
    `Editor: ${siteUrl}/editor/analysis`,
    "Sent once, by the scheduled run, when the first summaries were complete.",
  ];
  return { subject: `[On Record] ${rows.length} bill summaries are ready to read`, text: lines.join("\n") };
}

/** Pure. Send when the checkpoint count exists and the email has never gone out. */
export function summariesEmailDue(count: number, sentBefore: boolean, checkpoint = CHECKPOINT_SUMMARIES): boolean {
  return !sentBefore && count >= checkpoint;
}
