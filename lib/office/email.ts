/**
 * The weekly email to a legislator's office (owner, 18 Nov 2026, point 7: "a weekly email before floor votes").
 * Pure: the words of the email from the same dashboard the office sees. One template for every office; nothing here
 * reads a party, a name is only printed. Tested in tests/office.test.mjs. Design notes: docs/OFFICE_EMAIL_DESIGN.md.
 *
 * Sending is lib/office/store.ts (`sendOfficeEmails`), and it is off unless OFFICE_EMAIL_ENABLED is "1".
 */
import { BRAND } from "../brand.ts";
import { MIN_GROUP, MIN_SHOWN, NOT_SCIENTIFIC } from "../constituent/rules.ts";
import { groupCell, isoDay, voteCell, type OfficeBill, type OfficeDashboard } from "./rules.ts";

export const OFFICE_EMAIL_FLAG = "OFFICE_EMAIL_ENABLED";
/** Off unless the switch is exactly "1". */
export const officeEmailEnabled = (value: string | undefined | null) => (value ?? "").trim() === "1";
/** The most emails one scheduled run may send (owner rule: anything that can cost money has a cap). */
export const OFFICE_EMAIL_MAX_PER_RUN = 50;
export function officeEmailCap(value: string | undefined | null): number {
  const n = Number((value ?? "").trim());
  return Number.isInteger(n) && n >= 0 && (value ?? "").trim() !== "" ? n : OFFICE_EMAIL_MAX_PER_RUN;
}
/** In the email, "voted on recently" means the last seven days: it goes out once a week. */
export const EMAIL_RECENT_DAYS = 7;

export type OfficeEmail = { subject: string; text: string;
  /** Bills in the email with a total. An email with none is not sent. */
  items: number;
  /** The bills it lists, for the check that none of them is under review. */
  billKeys: string[] };

function billLines(b: OfficeBill): string[] {
  if (!b.total.show) return [];
  const mail = b.total.groups.find(g => g.tier === "mail"), address = b.total.groups.find(g => g.tier === "address");
  return [`- ${b.label}: ${b.title}`, `  ${b.why}`, `  ${b.total.voters} counted voters.`,
    `  Mail-verified: ${groupCell(mail)}`, `  Address-matched: ${groupCell(address)}`,
    ...(b.memberVote ? [`  The member's recorded vote: ${voteCell(b.memberVote)}`] : [])];
}

/**
 * Subject and body from the dashboard. Only bills with a total (25 or more counted voters) are listed; the rest are
 * counted in one line, without a number of voters. The same input gives the same email, whoever the member is.
 */
export function composeOfficeEmail(d: OfficeDashboard, links: { dashboard: string; optOut: string }): OfficeEmail {
  const where = d.member.scopeName, since = isoDay(d.asOf - EMAIL_RECENT_DAYS * 86400e3);
  const upcoming = d.upcoming.filter(b => b.total.show), waiting = d.upcoming.length - upcoming.length;
  const recent = d.recent.filter(b => b.total.show && !!b.memberVote && b.memberVote.date >= since && !upcoming.some(u => u.billKey === b.billKey));
  const text = [
    `To the office of ${d.member.seat} ${d.member.name}.`, "",
    `${NOT_SCIENTIFIC} These are totals from residents of ${where} who answered Support, Oppose or Unsure on a bill at ${BRAND.name}.`,
    `Only mail-verified and address-matched residents are counted, mail-verified first. A total is shown only from ${MIN_SHOWN} counted voters, and a group of fewer than ${MIN_GROUP} by its size only. No names, no individual answers and no reasons are shared with anyone.`, "",
    "COMING UP",
    ...(upcoming.length ? upcoming.flatMap(billLines) : ["- No bill that is coming up has a total yet."]),
    ...(waiting > 0 && upcoming.length ? [`${waiting === 1 ? "One other bill that is coming up does" : `${waiting} other bills that are coming up do`} not have ${MIN_SHOWN} counted voters in ${where} yet.`] : []), "",
    `VOTED ON IN THE LAST ${EMAIL_RECENT_DAYS} DAYS`,
    ...(recent.length ? recent.flatMap(billLines) : ["- No bill with a total had a recorded vote by the member."]), "",
    `See all of it, and download or print it: ${links.dashboard}`, "",
    "Every office gets this same email, built by the same rules.",
    `Stop this weekly email: ${links.optOut}`,
  ].join("\n");
  return { subject: `${BRAND.name}: what residents of ${where} say about this week's bills`, text, items: upcoming.length + recent.length,
    billKeys: [...upcoming, ...recent].map(b => b.billKey) };
}
