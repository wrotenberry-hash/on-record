import "./flow.css";
import Link from "next/link";
import { AnalysisBadge, OfficialBadge } from "@/components/federal/badges";
import { IssuePicker } from "@/components/home/issue-picker";
import { StanceButtons } from "@/components/home/stance-buttons";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";
import { pickedIssues } from "@/lib/reader-issues";
import { verificationConfig } from "@/lib/verify/config";
import type { Location } from "@/lib/location";
import { comingUp, type FlowBill } from "@/lib/flow/data";
import { answerPrivacyLine } from "@/lib/flow/rules";
import { endOfList, numberWord } from "@/lib/flow/cards";
import { WHAT_THIS_BILL_DOES } from "@/lib/bill-row";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const issueName = (slug: string) => ISSUE_CATEGORIES.find(c => c.slug === slug)?.name ?? slug;

function Bill({ b, canAnswer, mine }: { b: FlowBill; canAnswer: boolean; mine: readonly string[] }) {
  const onMine = b.issues.filter(s => mine.includes(s)).map(issueName);
  return <li>
    <span className="flow-where">{b.where} · {b.when} · {b.billLabel}{onMine.length ? ` · on your issues: ${onMine.join(", ")}` : ""}</span>
    <p className="flow-billname">{cap(b.name.text)}{b.name.label === "Analysis" ? <AnalysisBadge /> : <OfficialBadge />}</p>
    {b.answerable && <Link className="flow-billlink" href={`/bills/${b.billId}`}>{WHAT_THIS_BILL_DOES}<span className="visually-hidden">: {b.name.text}</span></Link>}
    {b.answerable ? canAnswer && <StanceButtons billId={b.billId} question={b.question} initial={b.answer} />
      : <span className="meta">This bill’s record is still loading. You can answer once it is in.</span>}
  </li>;
}

/**
 * "Here's what's coming up that affects you": the next scheduled House and Senate floor votes (and Texas hearings while
 * the Legislature sits), the reader's issues first, each with Support / Oppose / Not sure in one tap. With nothing
 * scheduled it says so and shows "Decided recently": the three latest meaningful votes of the reader's legislators.
 * Used under the legislators' cards in the first-minute flow and near the top of the home page.
 * Every list here ends with a line (owner, 18 Nov 2026, point 6): all of them, or how many more and where they are.
 */
export async function ComingUp({ userId, loc, canAnswer, limit = 5 }: { userId: string | null; loc: Location | null; canAnswer: boolean; limit?: number }) {
  const issues = await pickedIssues(userId).catch(() => [] as string[]);
  const data = await comingUp({ userId, issues, loc, limit }).catch(() => null);
  const verificationOn = verificationConfig().enabled;
  if (!data) return null;
  const list = data.scheduled.length ? data.scheduled : data.recent;
  const end = endOfList(data.scheduled.length, data.scheduledTotal, { one: "scheduled bill", many: "scheduled bills" });
  return <section className="flow-block" id="coming-up" aria-labelledby="coming-up-h">
    <h2 id="coming-up-h">Here’s what’s coming up that affects you</h2>
    {data.scheduled.length
      ? <p className="meta">Bills the House or Senate has put on its schedule for a vote. Your issues come first.</p>
      : <><p>Congress has no votes scheduled on its floor right now.</p>{data.recent.length > 0 && <><h3>Decided recently</h3><p className="meta">The latest bills your legislators voted on.</p></>}</>}
    <IssuePicker options={ISSUE_CATEGORIES.map(c => ({ slug: c.slug, name: c.name }))} initial={issues} />
    {list.length ? <><ul className="flow-bills">{list.map(b => <Bill key={b.billId} b={b} canAnswer={canAnswer} mine={issues} />)}</ul>
      <p className="list-end">{data.scheduled.length
        ? <>{end.text}{end.more > 0 ? <> <Link className="more-link" href="/coming">See all {data.scheduledTotal} scheduled bills</Link></> : null}</>
        : data.recent.length === 1 ? "That is the most recent one." : `Those are the ${numberWord(data.recent.length)} most recent.`}</p></>
      : <p className="meta">Nothing is scheduled, and your legislators have no recent votes on bills on record.</p>}
    {data.texas.length > 0 && <><h3>Texas Legislature</h3><ul className="result-list">{data.texas.map(e => <li key={e.id}><Link href="/texas">{e.name}</Link>
      <span className="meta">{e.when} · hearing{e.bills.length ? ` · ${e.bills.join(", ")}` : ""}</span></li>)}</ul>
      <p className="list-end">{data.texas.length === 1 ? "That is the next hearing on the calendar." : `Those are the next ${numberWord(data.texas.length)} hearings on the calendar.`} <Link className="more-link" href="/texas">The Texas page has the rest</Link></p></>}
    {canAnswer && list.some(b => b.answerable) && <p className="flow-small">{answerPrivacyLine(verificationOn)}{verificationOn ? <> <Link href="/account#verify">Match your home address on your Account page</Link>.</> : null}</p>}
  </section>;
}
