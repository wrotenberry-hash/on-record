import Link from "next/link";
import { AnalysisBadge, PositionPill, shortDate } from "@/components/federal/badges";
import { explainVote } from "@/lib/federal/vote-labels";
import { KIND_LABEL, positionLine, voteKind } from "@/lib/federal/vote-kinds";

export type VoteRowData = { rollCallId: string; votedAt: number; question: string; title: string | null; result: string | null; documentLabel: string | null;
  billId: string | null; billTitle: string | null; yea: number; nay: number; position: string; rawPosition: string; sourceUrl: string;
  headline?: string | null; issueSlug?: string | null; issueName?: string | null };

/**
 * One recorded vote: what was voted on, what kind of vote it was, how the member
 * voted in words that never turn a procedural vote into a vote "for" or "against"
 * the bill, the bill's Analysis headline when there is one, and the official
 * outcome with its source.
 */
export function VoteRow({ v, memberId }: { v: VoteRowData; memberId?: string }) {
  const what = v.billTitle && v.billId ? v.billTitle : v.title || v.documentLabel || "Recorded vote";
  const kind = voteKind(v.question, v.billTitle ?? v.title);
  return <li className="vote-row">
    <div className="vote-main">
      <span className="vote-date">{shortDate(v.votedAt)} · <span className={`vote-kind vote-kind-${kind}`}>{KIND_LABEL[kind]}</span></span>
      <b>{v.billId ? <Link href={`/bills/${v.billId}`}>{what}</Link> : what}</b>
      {v.headline && v.billId && <span className="vote-headline"><Link href={`/bills/${v.billId}`}>{v.headline}</Link> <AnalysisBadge /></span>}
      <span className="vote-position">{positionLine(v.position, kind)}</span>
      <VoteExplainer question={v.question} />
      <small>{v.question}{v.result ? ` · ${v.result} ${v.yea}–${v.nay}` : ""} · <a className="src-link" href={v.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a>{memberId && <> · <Link className="src-link" href={`/share/vote/${memberId}/${v.rollCallId}`}>Share</Link></>}</small>
    </div>
    <PositionPill position={v.position} raw={v.rawPosition} />
  </li>;
}

/** The fixed plain-language line for a roll-call question; nothing when the wording is not in the glossary. */
export function VoteExplainer({ question }: { question: string }) {
  const plain = explainVote(question);
  return plain ? <span className="vote-plain">{plain}</span> : null;
}
