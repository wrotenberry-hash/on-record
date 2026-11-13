import Link from "next/link";
import { PositionPill, shortDate } from "@/components/federal/badges";

export type VoteRowData = { rollCallId: string; votedAt: number; question: string; title: string | null; result: string | null; documentLabel: string | null;
  billId: string | null; billTitle: string | null; yea: number; nay: number; position: string; rawPosition: string; sourceUrl: string };

/** One recorded vote: what was voted on, how the member voted, and the official outcome with its source. */
export function VoteRow({ v }: { v: VoteRowData }) {
  const what = v.billTitle && v.billId ? v.billTitle : v.title || v.documentLabel || "Recorded vote";
  return <li className="vote-row">
    <div className="vote-main">
      <span className="vote-date">{shortDate(v.votedAt)}</span>
      <b>{v.billId ? <Link href={`/bills/${v.billId}`}>{what}</Link> : what}</b>
      <small>{v.question}{v.result ? ` · ${v.result} ${v.yea}–${v.nay}` : ""} · <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></small>
    </div>
    <PositionPill position={v.position} raw={v.rawPosition} />
  </li>;
}
