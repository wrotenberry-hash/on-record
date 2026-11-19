import { BRAND } from "./brand.ts";
/**
 * The weekly email (owner's point 3, 18 Nov 2026): one send per reader per week, readable in two minutes.
 * Pure; tested in tests/loop.test.mjs and tests/trial.test.mjs.
 *
 * The order never changes:
 *   (a) how your legislators voted this week (votes on a bill itself only),
 *   (b) one bill in your issues that moved,
 *   (c) one thing coming up,
 *   (d) "You're caught up."
 * No more than five numbered items across (a) to (c). When there are more votes than fit, the email says how many
 * more and links to the page that lists them. A week with no item at all sends nothing.
 *
 * Every vote names the official record it was copied from. A line marked [Analysis] is the site's own summary of
 * the bill; it is never mixed into the sentence that states the record. No grades.
 */
export const WEEKLY_MAX_ITEMS = 5;
export const CAUGHT_UP = "You're caught up.";

/** One vote on a bill: what happened (with the numbers and the date), then how each of the reader's legislators voted. */
export type WeeklyVote = { result: string; members: string[]; headline?: string | null; billUrl: string; sourceUrl?: string | null };
/** One bill in an issue the reader picked, and where it now stands. */
export type WeeklyMoved = { issue: string; bill: string; what: string; headline?: string | null; billUrl: string };
/** One thing on the schedule. */
export type WeeklyComing = { text: string; url: string | null };
export type WeeklyInput = { votes: readonly WeeklyVote[]; moved: WeeklyMoved | null; coming: WeeklyComing | null;
  /** False when the reader has picked no issues: the email then says where to pick them. */
  hasIssues?: boolean };

export function isDigestDay(now: number) { return new Date(now).getUTCDay() === 1; }
/** ISO year and week, e.g. "2026-W47": one email per reader per week. */
export function isoWeek(now: number) {
  const d = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}

/** What goes in: the bill that moved and the thing coming up each take one place; votes take what is left of the five. */
export function planWeekly(input: WeeklyInput) {
  const room = WEEKLY_MAX_ITEMS - (input.moved ? 1 : 0) - (input.coming ? 1 : 0);
  const votes = input.votes.slice(0, room);
  return { votes, moreVotes: input.votes.length - votes.length, moved: input.moved, coming: input.coming, items: votes.length + (input.moved ? 1 : 0) + (input.coming ? 1 : 0) };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The email as plain text and as simple HTML with the same words. `pixel` is the address of the tiny picture that
 * lets the site count how many emails were opened (lib/loop/marks.ts); it is in the HTML only. Null when nothing
 * happened this week: no email is sent.
 */
export function formatDigest(input: WeeklyInput, links: { site: string; unsubscribe: string; pixel?: string | null }): { subject: string; text: string; html: string; items: number; votes: number } | null {
  const plan = planWeekly(input);
  if (!plan.items) return null;
  const text: string[] = [], html: string[] = [];
  let n = 0;
  const heading = (h: string) => { text.push(h, ""); html.push(`<h2 style="font-size:18px;margin:24px 0 8px">${esc(h)}</h2>`); };
  const note = (line: string, link?: { label: string; url: string }) => {
    text.push(link ? `${line} ${link.url}` : line, "");
    html.push(`<p style="margin:0 0 12px">${esc(line)}${link ? ` <a href="${esc(link.url)}">${esc(link.label)}</a>` : ""}</p>`);
  };
  const item = (lead: string, lines: string[], headline: string | null | undefined, hrefs: Array<{ label: string; url: string }>) => {
    n++;
    text.push(`${n}. ${lead}`, ...lines.map(l => `   ${l}`));
    if (headline) text.push(`   [Analysis] ${headline}`);
    text.push(...hrefs.map(h => `   ${h.label}: ${h.url}`), "");
    html.push(`<p style="margin:0 0 4px"><b>${n}.</b> ${esc(lead)}</p>`, ...lines.map(l => `<p style="margin:0 0 4px 22px">${esc(l)}</p>`));
    if (headline) html.push(`<p style="margin:0 0 4px 22px"><span style="border:1px solid #777;padding:0 4px;font-size:12px">Analysis</span> ${esc(headline)}</p>`);
    html.push(`<p style="margin:0 0 14px 22px">${hrefs.map(h => `<a href="${esc(h.url)}">${esc(h.label)}</a>`).join(" · ")}</p>`);
  };

  heading("How your legislators voted this week");
  if (!plan.votes.length) note("None of your legislators had a recorded vote on a bill this week.");
  for (const v of plan.votes) item(v.result, v.members, v.headline, [{ label: "Read the bill", url: v.billUrl }, ...(v.sourceUrl ? [{ label: "Official record", url: v.sourceUrl }] : [])]);
  if (plan.moreVotes) note(`${plural(plan.moreVotes, "more vote")} this week ${plan.moreVotes === 1 ? "is" : "are"} listed on your Following page:`, { label: "Following", url: `${links.site}/following` });

  heading("One bill in your issues that moved");
  if (plan.moved) item(`${plan.moved.issue}: ${plan.moved.bill}. ${plan.moved.what}`, [], plan.moved.headline, [{ label: "Read the bill", url: plan.moved.billUrl }]);
  else if (input.hasIssues === false) note("You have not picked any issues yet. Pick up to three on the home screen:", { label: "Pick your issues", url: `${links.site}/` });
  else note("No bill in your issues moved this week.");

  heading("One thing coming up");
  if (plan.coming) item(plan.coming.text, [], null, plan.coming.url ? [{ label: "Read more", url: plan.coming.url }] : []);
  else note("Nothing is on the floor schedule yet.");

  text.push(CAUGHT_UP, "");
  html.push(`<p style="margin:24px 0 12px;font-weight:bold">${esc(CAUGHT_UP)}</p>`);

  const source = "Votes are copied from the House Clerk, senate.gov and, for Texas, the Legislature's records. Only votes on a bill itself are listed, not procedural steps.";
  const grade = `${BRAND.name} shows what officials did. It does not grade them.`;
  text.push(source, `Stop these emails: ${links.unsubscribe}`, grade);
  html.push(`<p style="margin:24px 0 6px;font-size:13px;color:#555">${esc(source)}</p>`, `<p style="margin:0 0 6px;font-size:13px;color:#555"><a href="${esc(links.unsubscribe)}">Stop these emails</a></p>`,
    `<p style="margin:0;font-size:13px;color:#555">${esc(grade)}</p>`);
  // The picture is 1 pixel and empty. Its address holds a random one-time mark and nothing about the reader.
  if (links.pixel) html.push(`<img src="${esc(links.pixel)}" width="1" height="1" alt="" style="display:block;border:0">`);

  const votes = input.votes.length;
  return { subject: votes ? `[${BRAND.name}] How your legislators voted this week: ${plural(votes, "vote")}` : `[${BRAND.name}] Your weekly update`, text: text.join("\n"),
    html: `<div style="font:16px/1.5 Arial,Helvetica,sans-serif;color:#172224;max-width:600px">${html.join("")}</div>`, items: plan.items, votes };
}
