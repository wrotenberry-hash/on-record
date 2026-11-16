/**
 * The weekly "how your members voted" email (Round 3). Pure; tested in
 * tests/trial.test.mjs. Every vote line says what kind of vote it was, so a
 * procedural vote never reads as a vote for or against a bill; bill summaries
 * are labelled Analysis; every vote links to its official source. No grades.
 */
export type DigestVote = { date: string; kindLabel: string; voteText: string; billLabel: string; billTitle: string; headline: string | null; sourceUrl: string; billUrl: string | null };
export type DigestMember = { name: string; seat: string; votes: DigestVote[] };

export function isDigestDay(now: number) { return new Date(now).getUTCDay() === 1; }
/** ISO year and week, e.g. "2026-W47": one email per reader per week. */
export function isoWeek(now: number) {
  const d = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}

export function formatDigest(members: readonly DigestMember[], links: { site: string; unsubscribe: string }): { subject: string; text: string; items: number } | null {
  const withVotes = members.filter(m => m.votes.length);
  const items = withVotes.reduce((n, m) => n + m.votes.length, 0);
  if (!items) return null;
  const lines = [`How the members you follow voted this week (${items} recorded vote${items === 1 ? "" : "s"}).`,
    "Votes are copied from the House Clerk and senate.gov. Lines marked [Analysis] are AI-written summaries of the bill; a procedural vote is a step in how the chamber proceeds, not a vote on the bill itself.", ""];
  for (const m of withVotes) {
    lines.push(`${m.name} (${m.seat})`);
    for (const v of m.votes) {
      lines.push(`- ${v.date} · ${v.kindLabel}: ${v.voteText}`, `  ${v.billLabel}: ${v.billTitle}`);
      if (v.headline) lines.push(`  [Analysis] ${v.headline}`);
      lines.push(`  Official source: ${v.sourceUrl}`);
      if (v.billUrl) lines.push(`  On Record: ${v.billUrl}`);
    }
    lines.push("");
  }
  lines.push(`Following: ${links.site}/following`, "", `Stop these emails: ${links.unsubscribe}`, "On Record shows what officials did. It does not grade them.");
  return { subject: `[On Record] How your members voted: ${items} vote${items === 1 ? "" : "s"}`, text: lines.join("\n"), items };
}
