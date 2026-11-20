import Link from "next/link";
import { PositionPill, shortDate } from "@/components/federal/badges";
import { BillRow } from "@/components/bills/bill-row";
import { billRowText, numberFromBillId, typeFromBillId, type BillRowText } from "@/lib/bill-row";
import { explainVote } from "@/lib/federal/vote-labels";
import { KIND_LABEL, positionLine, voteKind, yesNoMeaning } from "@/lib/federal/vote-kinds";

export type VoteRowData = { rollCallId: string; votedAt: number; question: string; title: string | null; result: string | null; documentLabel: string | null;
  billId: string | null; billTitle: string | null; yea: number; nay: number; position: string; rawPosition: string; sourceUrl: string;
  headline?: string | null; issueSlug?: string | null; issueName?: string | null; tallyBad?: number | boolean | null;
  /** The bill as a vote row shows it (lib/bill-row.ts); null for a vote that is not on a bill. */ row?: BillRowText | null };

/**
 * One recorded vote. A vote on a bill is one row (components/bills/bill-row.tsx, owner 20 Nov 2026): what the bill is,
 * one sentence on what it does, how the member voted in words that never turn a procedural vote into a vote "for" or
 * "against" the bill, then the bill number small with the date, the official question, the outcome and its source, and
 * "What this bill does". A vote that is not on a bill (a nomination, a quorum call) keeps its own short layout: what
 * was voted on, the kind of vote, how the member voted, the outcome and its source.
 */
export function VoteRow({ v, memberId }: { v: VoteRowData; memberId?: string }) {
  const kind = voteKind(v.question, v.billTitle ?? v.title);
  const outcome = <>{v.question}{v.tallyBad ? <> · <span className="tally-review">Tally under review</span>: the member votes on file do not add up to the official totals</> : v.result ? ` · ${v.result} ${v.yea}–${v.nay}` : ""} · <a className="src-link" href={v.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a>{memberId && <> · <Link className="src-link" href={`/share/card?t=vote&member=${memberId}&roll=${v.rollCallId}`}>Share</Link></>}</>;
  if (v.billId) {
    const row = v.row ?? billRowText({ number: numberFromBillId(v.billId) ?? v.documentLabel ?? v.billId, title: v.billTitle, summary: v.headline ? { headline: v.headline } : null, billType: typeFromBillId(v.billId) ?? undefined });
    return <BillRow row={row} href={`/bills/${v.billId}`} className="vote-row-bill" vote={<>{positionLine(v.position, kind)} <PositionPill position={v.position} raw={v.rawPosition} /></>}
      meta={<>{shortDate(v.votedAt)} · <span className={`vote-kind vote-kind-${kind}`}>{KIND_LABEL[kind]}</span> · {outcome}</>}>
      <VoteExplainer question={v.question} />
      <YesNo question={v.question} title={v.billTitle ?? v.title} />
    </BillRow>;
  }
  const what = v.title || v.documentLabel || "Recorded vote";
  return <li className="vote-row">
    <div className="vote-main">
      <span className="vote-date">{shortDate(v.votedAt)} · <span className={`vote-kind vote-kind-${kind}`}>{KIND_LABEL[kind]}</span></span>
      <b>{what}</b>
      <span className="vote-position">{positionLine(v.position, kind)}</span>
      <VoteExplainer question={v.question} />
      <YesNo question={v.question} title={v.billTitle ?? v.title} />
      <small>{outcome}</small>
    </div>
    <PositionPill position={v.position} raw={v.rawPosition} />
  </li>;
}

/** The fixed plain-language line for a roll-call question; nothing when the wording is not in the glossary. */
export function VoteExplainer({ question }: { question: string }) {
  const plain = explainVote(question);
  return plain ? <span className="vote-plain">{plain}</span> : null;
}

/** What a Yes and a No meant on this question (Round C). */
export function YesNo({ question, title }: { question: string; title?: string | null }) {
  const m = yesNoMeaning(question, title);
  return <span className="yes-no"><span><b>Yes meant:</b> {m.yes}</span><span><b>No meant:</b> {m.no}</span></span>;
}
