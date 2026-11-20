import Link from "next/link";
import { shortDate } from "@/components/federal/badges";
import { BillRow } from "@/components/bills/bill-row";
import { positionLine, voteKind } from "@/lib/federal/vote-kinds";
import { numberFromBillId, type BillRowText } from "@/lib/bill-row";
import { ProceduralGroup } from "@/components/bills/procedural-group";
import { isDebateRule, shortPosition, splitProcedural } from "@/lib/procedural";

/**
 * One line in a list of several legislators' votes ("This week from your legislators", "Since you last visited", the
 * weekly recap). A vote on a bill is the same row as everywhere else (components/bills/bill-row.tsx): what the bill is,
 * one sentence on what it does, who voted and how, the bill number small, "What this bill does". A vote that is not on
 * a bill (a nomination, a procedural call) has nothing to open, so it stays a plain line.
 */
export type MemberVote = { votedAt: number; question: string; title: string | null; billId: string | null; billTitle: string | null; name: string; memberId?: string | null; position: string };

export function MemberVoteRow({ v, row, linkMember = false }: { v: MemberVote; row: BillRowText | null | undefined; /** Make the legislator's name a link to their page. */ linkMember?: boolean }) {
  const who = linkMember && v.memberId ? <Link href={`/politicians/${v.memberId}`}><b>{v.name}</b></Link> : <b>{v.name}</b>;
  const voted = <>{who}: {positionLine(v.position, voteKind(v.question, v.billTitle ?? v.title))}</>;
  if (v.billId && row) return <BillRow row={row} href={`/bills/${v.billId}`} vote={voted} meta={shortDate(v.votedAt)} />;
  return <li><span>{voted}</span><span>{v.title ?? v.question}</span><span className="meta">{shortDate(v.votedAt)}</span></li>;
}

/**
 * The whole list: each vote a row, and the votes on debate rules collapsed into one line at the end, "Procedural
 * votes (N)" (owner, 20 Nov 2026; lib/procedural.ts). `rows` is the bill text for each bill id (lib/bill-row-store.ts).
 */
export function MemberVoteRows({ votes, rows, linkMember = false }: { votes: ReadonlyArray<MemberVote & { key: string }>; rows: ReadonlyMap<string, BillRowText>; linkMember?: boolean }) {
  const { main, procedural } = splitProcedural(votes, v => isDebateRule({ billId: v.billId, title: v.billTitle ?? v.title }));
  return <>
    {main.map(v => <MemberVoteRow key={v.key} v={v} row={v.billId ? rows.get(v.billId) : null} linkMember={linkMember} />)}
    <ProceduralGroup votes={procedural.map(v => ({ key: v.key, title: v.billTitle ?? v.title, number: numberFromBillId(v.billId), href: v.billId ? `/bills/${v.billId}` : null, votedAt: v.votedAt,
      voted: <><b>{v.name}</b>: {shortPosition(v.position)}</>, outcome: v.question }))} />
  </>;
}
