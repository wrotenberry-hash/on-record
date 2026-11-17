import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { txPerson, txPersonCommittees } from "@/lib/texas/queries";
import { TX_STAGE_LABEL, type TxStage } from "@/lib/texas/parse";
import { firstUseTerms } from "@/lib/texas/vote-record";
import { MemberDecisionRow } from "@/components/texas/decisions";
import { ContactForTxMember } from "@/components/contact/contact-section"; // contact-your-legislator (test-ready build)

export const dynamic = "force-dynamic";

export default async function TexasMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/texas" access={access} page="/texas/members/[id]">{null}</PublicShell>;
  const data = await txPerson(decodeURIComponent((await params).id));
  if (!data) notFound();
  const { person, decisions, sponsored } = data;
  const terms = firstUseTerms(decisions.map(x => x.d)), chamber = person.chamber === "upper" ? "Senate" : "House";
  const committees = await txPersonCommittees(person.id).catch(() => []);
  return <PublicShell current="/texas" access={access} page="/texas/members/[id]">
    <section className="fed-page">
      <p className="crumbs"><Link href="/texas">← Texas Legislature</Link></p>
      <div className="eyebrow">TEXAS {person.chamber === "upper" ? "SENATE" : "HOUSE"} · DISTRICT {person.district} · {person.party.toUpperCase()}</div>
      <h1>{person.name}</h1>
      {/* BEGIN contact-your-legislator (test-ready build): official phone, email and an editable message for this member. */}
      <ContactForTxMember person={person} />
      {/* END contact-your-legislator */}
      <h2>Latest decisions in the Texas {chamber} <OfficialBadge /></h2>
      <p className="meta">How {person.name} voted is shown only for record votes, where the official record lists each member by name. For a voice vote, or any vote the record does not list member by member, this page says so and shows no position.</p>
      {decisions.length ? <ul className="vote-list">{decisions.map(x => <MemberDecisionRow key={x.d.key} d={x.d} member={x.member} bill={x.bill} terms={terms.get(x.d.key)} />)}</ul>
        : <p className="meta">No decisions in the Texas {chamber} are on file yet.</p>}
      {sponsored.length > 0 && <><h2>Authored and sponsored <OfficialBadge /></h2><ul className="result-list">{sponsored.map(b => <li key={b.id}><Link href={`/texas/bills/${b.id}`}><span className="bill-tag">{b.identifier}</span> {b.title}</Link><span className="meta">{b.primary ? "Primary author · " : ""}{TX_STAGE_LABEL[b.stage as TxStage] ?? b.stage}</span></li>)}</ul></>}
      <h2>Committees <OfficialBadge /></h2>
      {committees.length ? <ul className="result-list">{committees.map(cm => <li key={cm.id}><b>{cm.name}</b><span className="meta">{cm.chamber === "upper" ? "Texas Senate" : cm.chamber === "lower" ? "Texas House" : cm.chamber === "legislature" ? "Joint committee" : "Committee"}{cm.role && cm.role.toLowerCase() !== "member" ? ` · ${cm.role}` : ""}</span></li>)}</ul>
        : <p className="meta">No committee seats on file for this member.</p>}
      <p className="source-line">From Open States{person.url ? <> (<a href={person.url} target="_blank" rel="noopener noreferrer">profile</a>)</> : null}, retrieved {shortDate(person.retrievedAt)}.</p>
    </section>
  </PublicShell>;
}
