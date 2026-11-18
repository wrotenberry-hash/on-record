/**
 * The office dashboard, as pure rules (owner, 18 Nov 2026, point 7). No database, no network; tested in
 * tests/office.test.mjs. The database side is lib/office/store.ts; who may sign in is lib/office/domains.ts.
 *
 * An office sees totals for its own member's district and nothing else: a U.S. senator's state, a U.S.
 * representative's congressional district, a state senator's or representative's district. Totals only, never a
 * person. Every total has already been through `shownTotals` (25 counted voters; a group under 5 by its size only)
 * before it reaches anything in this file, so nothing here can show, export or email a number below the line.
 * The page, the file to download, the page to print and the weekly email are all built from the one `officeView`,
 * which is how the export is "exactly what the dashboard shows". Nothing here reads a party.
 */
import { MIN_GROUP, MIN_SHOWN, NOT_SCIENTIFIC, type Shown, type ShownGroup } from "../constituent/rules.ts";

/* ───────────────────────────── Times ───────────────────────────── */

export const OFFICE_LINK_TTL_MS = 30 * 60 * 1000;
export const OFFICE_SESSION_MS = 30 * 24 * 3600 * 1000;
/** "Recent": bills the member cast a recorded vote on in this many days. */
export const RECENT_VOTE_DAYS = 90;
/** Texas: a bill whose latest action is this recent is listed as coming up. */
export const RECENT_ACTION_DAYS = 14;
export const TREND_WEEKS = 12;
export const TOP_ISSUES = 5;
export const LIST_MAX = 40;
const DAY = 86400e3;

/** Monday (UTC) of the week a moment falls in, "YYYY-MM-DD". The key of a week in the trend and of a weekly email. */
export function weekStart(ms: number): string {
  const d = new Date(ms), back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
}
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** "November 16, 2026" from "2026-11-16" (or "20261116", the floor schedule's form). */
export function longDate(iso: string): string {
  const s = /^\d{8}$/.test(iso) ? `${iso.slice(0, 4)}-${iso.slice(4, 6)}-${iso.slice(6, 8)}` : iso.slice(0, 10);
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/* ───────────────────────────── The model ───────────────────────────── */

/** The member an office works for. It carries no party, so nothing built from it can depend on one. */
export type OfficeMember = {
  key: string; level: "federal" | "state"; chamber: "upper" | "lower"; state: string; district: string | null;
  name: string; seat: string; current: boolean;
  /** The one scope this office may see, and how to say it: "TX", "TX-37", "TX-SD-14", "TX-HD-49". */
  scope: string; scopeKind: "state" | "district"; scopeName: string;
};
/** The member's own recorded vote on a bill, in the site's usual words. `on` is the official wording of the question. */
export type MemberVote = { line: string; on: string; date: string };
/** One bill on the dashboard. `total` is what may be shown and nothing more: below 25 it holds a message and no number. */
export type OfficeBill = { billKey: string; label: string; title: string; href: string; why: string; total: Shown; memberVote: MemberVote | null };
/** Counted voters in one week. `voters` is null for a week with some voters but fewer than 5. */
export type TrendWeek = { week: string; voters: number | null };
export type TopIssue = { name: string; voters: number; bills: number };
export type OfficeDashboard = {
  member: OfficeMember; asOf: number;
  upcoming: OfficeBill[]; recent: OfficeBill[]; other: OfficeBill[];
  trend: TrendWeek[]; issues: TopIssue[];
};

/** Voters in a week, as the dashboard may show them: 0 as 0; one to four as null ("fewer than 5"); five or more as the number. */
export function weekVoters(n: number): number | null { return n === 0 ? 0 : n < MIN_GROUP ? null : n; }

/** The weeks of the trend, oldest first, ending with the week `now` falls in. */
export function trendWeeks(now: number, weeks = TREND_WEEKS): string[] {
  const end = Date.parse(`${weekStart(now)}T00:00:00Z`);
  return Array.from({ length: weeks }, (_, i) => isoDay(end - (weeks - 1 - i) * 7 * DAY));
}

/* ───────────────────────────── What the dashboard shows ───────────────────────────── */

export type ViewTable = { id: "upcoming" | "recent" | "other" | "trend" | "issues"; title: string; intro: string; columns: string[]; rows: string[][];
  /** For the page only: where the first cell of each row links to. Not part of what is shown or exported. */
  hrefs: Array<string | null>; empty: string };
export type OfficeView = { heading: string; who: string; asOf: string; label: string; notes: string[]; tables: ViewTable[] };

const BILL_COLUMNS = ["Bill", "Title", "Why it is listed", "Counted voters", "Mail-verified", "Address-matched", "The member's recorded vote"];
const NO_VOTE = "No recorded vote on file";

/** One group of a shown total: "6 voters: 4 support · 1 oppose · 1 unsure", or "fewer than 5 voters". */
export function groupCell(g: ShownGroup | undefined): string {
  if (!g) return "0 voters";
  return g.counts ? `${g.voters} voters: ${g.counts.support} support · ${g.counts.oppose} oppose · ${g.counts.unsure} unsure` : `fewer than ${MIN_GROUP} voters`;
}
export function voteCell(v: MemberVote | null): string { return v ? `${v.line} (${v.on}, ${longDate(v.date)})` : NO_VOTE; }

function billRow(b: OfficeBill): string[] {
  const t = b.total;
  return [b.label, b.title, b.why, t.show ? `${t.voters} voters` : t.message,
    t.show ? groupCell(t.groups.find(g => g.tier === "mail")) : "", t.show ? groupCell(t.groups.find(g => g.tier === "address")) : "", voteCell(b.memberVote)];
}
const billTable = (id: ViewTable["id"], title: string, intro: string, empty: string, bills: readonly OfficeBill[]): ViewTable =>
  ({ id, title, intro, columns: BILL_COLUMNS, rows: bills.map(billRow), hrefs: bills.map(b => b.href), empty });

/**
 * Everything the dashboard shows, as text. The page draws these tables, the download writes them as rows and the print
 * page lays them out for paper: one source, so they cannot differ.
 */
export function officeView(d: OfficeDashboard): OfficeView {
  const m = d.member, where = m.scopeName, floor = m.level === "federal" ? "on the floor schedule" : "set for a hearing, or that moved in the last two weeks";
  return {
    heading: `What residents of ${where} say`,
    who: `For the office of ${m.seat} ${m.name}.`,
    asOf: `As of ${longDate(isoDay(d.asOf))}.`,
    label: NOT_SCIENTIFIC,
    notes: [
      `These are totals from residents of ${where} who answered Support, Oppose or Unsure on a bill. Only mail-verified and address-matched residents are counted. Mail-verified is listed first.`,
      `A total is shown only from ${MIN_SHOWN} counted voters. A group of fewer than ${MIN_GROUP} voters is shown by its size only.`,
      "Totals only. No names, no individual answers and no reasons are shown to anyone.",
      "Every office gets this same page, built by the same rules.",
    ],
    tables: [
      billTable("upcoming", "Coming up", `Bills ${floor}.`, "Nothing is listed as coming up right now.", d.upcoming),
      billTable("recent", "Recent votes", `Bills the member cast a recorded vote on in the last ${RECENT_VOTE_DAYS} days.`, `No recorded vote on a bill in the last ${RECENT_VOTE_DAYS} days.`, d.recent),
      billTable("other", "Other bills with a total", `Other bills that ${MIN_SHOWN} or more counted voters in ${where} have answered.`, "No other bill has a total yet.", d.other),
      { id: "trend", title: "Trend over time", intro: `Counted voters in ${where} each week, on the bills above that have a total. A person who answered several bills in one week is counted once. A week with one to four voters says “fewer than ${MIN_GROUP}”.`,
        columns: ["Week starting", "Counted voters"], rows: d.trend.map(w => [longDate(w.week), w.voters === null ? `fewer than ${MIN_GROUP}` : String(w.voters)]), hrefs: d.trend.map(() => null),
        empty: "No bill has a total yet, so there is no trend to show." },
      { id: "issues", title: "Top issues", intro: `The issues with the most counted voters in ${where}, on the bills above that have a total.`,
        columns: ["Issue", "Counted voters", "Bills"], rows: d.issues.map(i => [i.name, String(i.voters), String(i.bills)]), hrefs: d.issues.map(() => null),
        empty: "No bill with a total has an issue on file yet." },
    ],
  };
}

/* ───────────────────────────── The file to download ───────────────────────────── */

/** One cell. A cell that a spreadsheet would run as a formula is written as text. */
function csvCell(s: string): string {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
const csvLine = (cells: readonly string[]) => cells.map(csvCell).join(",");

/** The dashboard as rows, in the order it is shown. Nothing is in the file that is not on the page. */
export function officeCsv(v: OfficeView): string {
  const lines = [csvLine([v.heading]), csvLine([v.who]), csvLine([v.asOf]), csvLine([v.label]), ...v.notes.map(n => csvLine([n]))];
  for (const t of v.tables) lines.push("", csvLine([t.title]), csvLine([t.intro]), ...(t.rows.length ? [csvLine(t.columns), ...t.rows.map(csvLine)] : [csvLine([t.empty])]));
  return `${lines.join("\r\n")}\r\n`;
}

/** Reads a file written by `officeCsv` back into rows (for the test that the file equals the page). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, i = 0;
  const end = () => { row.push(cell); cell = ""; };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ",") { end(); i++; continue; }
    if (c === "\r" && text[i + 1] === "\n") { end(); rows.push(row); row = []; i += 2; continue; }
    cell += c; i++;
  }
  if (cell || row.length) { end(); rows.push(row); }
  return rows;
}
