import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { txPerson, txPersonCommittees } from "@/lib/texas/queries";
import { TX_STAGE_LABEL, txVoteKind, type TxStage } from "@/lib/texas/parse";

export const dynamic = "force-dynamic";

export default async function TexasMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/texas" access={access} page="/texas/members/[id]">{null}</PublicShell>;
  const data = await txPerson(decodeURIComponent((await params).id));
  if (!data) notFound();
  const { person, votes, sponsored } = data;
  const committees = await txPersonCommittees(person.id).catch(() => []);
  const line = (option: string, motion: string) => { const k = txVoteKind(motion), yes = option === "yes", no = option === "no";
    if (!yes && !no) return option === "absent" || option === "not voting" ? "Did not vote" : `Voted ${option}`;
    return k === "procedural" ? `Voted ${yes ? "yes" : "no"} on a procedural step (not a vote on the bill itself)` : k === "amendment" ? `Voted ${yes ? "yes" : "no"} on the amendment` : `Voted ${yes ? "yes" : "no"}`; };
  return <PublicShell current="/texas" access={access} page="/texas/members/[id]">
    <section className="fed-page">
      <p className="crumbs"><Link href="/texas">← Texas Legislature</Link></p>
      <div className="eyebrow">TEXAS {person.chamber === "upper" ? "SENATE" : "HOUSE"} · DISTRICT {person.district} · {person.party.toUpperCase()}</div>
      <h1>{person.name}</h1>
      <h2>Latest votes <OfficialBadge /></h2>
      {votes.length ? <ul className="vote-list">{votes.map(v => <li key={v.voteId} className="vote-row"><div className="vote-main">
        <span className="vote-date">{shortDate(v.date)}</span><b><Link href={`/texas/bills/${v.billId}`}>{v.identifier}: {v.title}</Link></b>
        <span className="vote-position">{line(v.option, v.motion)}</span><small>{v.motion}{v.tallyOk ? ` · ${v.result}` : " · tally under review"}</small></div></li>)}</ul>
        : <p className="meta">No recorded votes on file yet.</p>}
      {sponsored.length > 0 && <><h2>Authored and sponsored <OfficialBadge /></h2><ul className="result-list">{sponsored.map(b => <li key={b.id}><Link href={`/texas/bills/${b.id}`}><span className="bill-tag">{b.identifier}</span> {b.title}</Link><span className="meta">{b.primary ? "Primary author · " : ""}{TX_STAGE_LABEL[b.stage as TxStage] ?? b.stage}</span></li>)}</ul></>}
      <h2>Committees <OfficialBadge /></h2>
      {committees.length ? <ul className="result-list">{committees.map(cm => <li key={cm.id}><b>{cm.name}</b><span className="meta">{cm.chamber === "upper" ? "Texas Senate" : cm.chamber === "lower" ? "Texas House" : cm.chamber === "legislature" ? "Joint committee" : "Committee"}{cm.role && cm.role.toLowerCase() !== "member" ? ` · ${cm.role}` : ""}</span></li>)}</ul>
        : <p className="meta">No committee seats on file for this member.</p>}
      <p className="source-line">From Open States{person.url ? <> (<a href={person.url} target="_blank" rel="noopener noreferrer">profile</a>)</> : null}, retrieved {shortDate(person.retrievedAt)}.</p>
    </section>
  </PublicShell>;
}
