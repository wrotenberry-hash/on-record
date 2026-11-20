import Link from "next/link";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { PartySplit } from "@/components/federal/party-split";
import { BillRow } from "@/components/bills/bill-row";
import { billRowText } from "@/lib/bill-row";
import { decisionLabel, SEE_EACH_MEMBER, TX_VOTE_TERMS, voteAnchor, type MemberOnDecision, type TxDecision, type TxTerm } from "@/lib/texas/vote-record";

/**
 * How Texas decisions are shown (lib/texas/vote-record.ts): each with its plain label, the terms explained the first
 * time they appear on the page, and the official record one tap away. A member's position appears only for a record
 * vote that lists them.
 */

const CHAMBER = (c: string | null) => (c === "upper" ? "Senate" : c === "lower" ? "House" : "");
export const TLO_RECORD = "Official record: Texas Legislature Online";

/** The plain-word explanations for the terms first used at this decision. */
export function TermNotes({ terms }: { terms: TxTerm[] | undefined }) {
  if (!terms?.length) return null;
  return <>{terms.map(t => <span key={t} className="vote-plain"><b>What this means:</b> {TX_VOTE_TERMS[t]}</span>)}</>;
}

/** One decision on a bill page. */
export function DecisionRow({ d, terms, tloUrl, parties }: { d: TxDecision; terms?: TxTerm[]; tloUrl: string; parties?: Record<string, Record<string, number>> }) {
  const l = decisionLabel(d);
  return <li className="vote-row" data-decision={d.kind}>
    <div className="vote-main">
      <span className="vote-date">{shortDate(d.date)}{CHAMBER(d.chamber) ? ` · ${CHAMBER(d.chamber)}` : ""}{d.stage === "committee" ? " · Committee" : ""}</span>
      <b>{d.what}</b>
      <span className="vote-position tx-vote-label">{l.label}</span>
      {l.note && <span className="vote-plain">{l.note}</span>}
      <TermNotes terms={terms} />
      {d.vote && l.link && d.vote.tallyOk ? <PartySplit parties={parties} /> : null}
      <small>Official wording: “{d.action}”{d.rv ? ` (record vote ${d.rv})` : ""}
        {l.link && d.vote ? <> · <a className="src-link" href={`#${voteAnchor(d.vote.id)}`}>{SEE_EACH_MEMBER}</a></> : null}
        {" "}· <a className="src-link" href={tloUrl} target="_blank" rel="noopener noreferrer">{TLO_RECORD}</a></small>
    </div>
  </li>;
}

type Listed = { voteId: string; personId: string | null; name: string; option: string; party: string | null };
const GROUPS: Array<[string, string]> = [["yes", "Yes"], ["no", "No"], ["not voting", "Present, not voting"], ["abstain", "Present, not voting"], ["absent", "Absent"], ["excused", "Excused"]];
const PARTY = (p: string | null) => (!p ? "" : /^dem/i.test(p) ? "D" : /^rep/i.test(p) ? "R" : p.slice(0, 1).toUpperCase());

/** "How each member voted": the full list for every record vote on the bill that has one. */
export function MemberVoteLists({ decisions, members, tloUrl }: { decisions: TxDecision[]; members: Listed[]; tloUrl: string }) {
  const withList = decisions.filter(d => d.vote && d.vote.listed > 0);
  if (!withList.length) return null;
  return <div className="fed-section" id="how-each-member-voted"><h2>How each member voted <OfficialBadge /></h2>
    <p className="meta">Only record votes list each member by name. A member who is not on a vote&apos;s list is not shown as voting either way.</p>
    {withList.map(d => {
      const mine = members.filter(m => m.voteId === d.vote!.id), known = new Set(GROUPS.map(g => g[0]));
      const groups = [...GROUPS.map(([k, label]) => ({ label, rows: mine.filter(m => m.option === k) })), { label: "Other", rows: mine.filter(m => !known.has(m.option)) }].filter(g => g.rows.length);
      return <details key={d.key} id={voteAnchor(d.vote!.id)} className="primer tx-member-list">
        <summary>{d.what}, {shortDate(d.date)} ({CHAMBER(d.chamber)})</summary>
        {groups.map(g => <p key={g.label} className="meta"><b>{g.label} ({g.rows.length}):</b>{" "}
          {g.rows.map((m, i) => <span key={`${m.name}-${i}`}>{i ? ", " : ""}{m.personId ? <Link className="tap" href={`/texas/members/${encodeURIComponent(m.personId)}`}>{m.name}</Link> : m.name}{PARTY(m.party) ? ` (${PARTY(m.party)})` : ""}</span>)}</p>)}
        {!d.vote!.tallyOk && <p className="meta"><span className="tally-review">Tally under review</span>: the listed votes do not add up to the reported totals.</p>}
        <p className="meta"><a className="tap" href={tloUrl} target="_blank" rel="noopener noreferrer">{TLO_RECORD}</a></p>
      </details>;
    })}
  </div>;
}

/**
 * One decision on a member's page, as one vote row (components/bills/bill-row.tsx, owner 20 Nov 2026): what the bill is,
 * how the member voted (only for a record vote that lists them; otherwise the plain label), then the bill number small
 * with the date and the official wording, and "What this bill does". Texas summaries are not on show to readers yet, so
 * the main line is the bill's official caption.
 */
export function MemberDecisionRow({ d, member, bill, terms }: { d: TxDecision; member: MemberOnDecision; bill: { id: string; identifier: string; title: string; tloUrl: string }; terms?: TxTerm[] }) {
  const l = decisionLabel(d);
  return <BillRow row={billRowText({ number: bill.identifier, title: bill.title })} href={`/texas/bills/${bill.id}`} data-member-show={member.show} vote={member.line}
    meta={<>{shortDate(d.date)} · Official wording: “{d.action}”{d.vote && !d.vote.tallyOk ? <> · <span className="tally-review">Tally under review</span></> : null} · <a className="src-link" href={bill.tloUrl} target="_blank" rel="noopener noreferrer">{TLO_RECORD}</a></>}>
    <span className="vote-plain">{d.what}</span>
    {member.show !== "label" && <span className="vote-plain">{l.label}</span>}
    <TermNotes terms={terms} />
  </BillRow>;
}
