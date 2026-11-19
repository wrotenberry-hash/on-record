import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { viewerAccess } from "@/lib/viewer";
import { txPerson, txPersonCommittees } from "@/lib/texas/queries";
import { TX_STAGE_LABEL, type TxStage } from "@/lib/texas/parse";
import { firstUseTerms } from "@/lib/texas/vote-record";
import { MemberDecisionRow } from "@/components/texas/decisions";
import { getDb } from "@/db";
import { OpinionBadge } from "@/components/federal/badges";
import { totalsForScope } from "@/lib/constituent/store";
import { MIN_SHOWN, NOT_ENOUGH_DISTRICT, NOT_SCIENTIFIC, scopeForMember, scopeLine, shownTotals, type ScopeTotals } from "@/lib/constituent/rules";
import { ContactForTxMember } from "@/components/contact/contact-section"; // contact-your-legislator (test-ready build)
import { FollowMember } from "@/components/federal/follow-button"; // follow a Texas legislator (persuasion and retention round, point 2)
import { verificationConfig } from "@/lib/verify/config";

export const dynamic = "force-dynamic";

export default async function TexasMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/texas" access={access} page="/texas/members/[id]">{null}</PublicShell>;
  const data = await txPerson(decodeURIComponent((await params).id));
  if (!data) notFound();
  const { person, decisions, sponsored } = data;
  const terms = firstUseTerms(decisions.map(x => x.d)), chamber = person.chamber === "upper" ? "Senate" : "House";
  const committees = await txPersonCommittees(person.id).catch(() => []);
  // Resident voting (18 Nov 2026): what counted residents of this member's own district said on the bills below,
  // beside the member's recorded vote. Aggregates only, from 25 voters; shown to everyone.
  const scope = scopeForMember({ level: "state", chamber: person.chamber === "upper" ? "upper" : "lower", state: "TX", district: person.district });
  const billIds = [...new Set(decisions.map(x => x.bill.id))];
  const districtTotals = await totalsForScope(getDb(), scope, billIds).catch(() => new Map<string, ScopeTotals>());
  const withTotals = billIds.map(id => ({ id, t: districtTotals.get(id) ?? null, row: decisions.find(x => x.bill.id === id && x.member.show === "position") ?? decisions.find(x => x.bill.id === id)! }))
    .filter(r => shownTotals(r.t, "district").show).slice(0, 12);
  return <PublicShell current="/texas" access={access} page="/texas/members/[id]">
    <section className="fed-page">
      <p className="crumbs"><Link href="/texas">← Texas Legislature</Link></p>
      <div className="eyebrow">TEXAS {person.chamber === "upper" ? "SENATE" : "HOUSE"} · DISTRICT {person.district} · {person.party.toUpperCase()}</div>
      <div className="member-head"><h1>{person.name}</h1><FollowMember id={person.id} /></div>
      {/* BEGIN contact-your-legislator (test-ready build): official phone, email and an editable message for this member. */}
      <ContactForTxMember person={person} />
      {/* END contact-your-legislator */}
      {/* Only while counting is on (19 Nov): in the trial build nothing can be counted, so the section is left out, as on a member of Congress's page. */}
      {verificationConfig().enabled && <div className="fed-section sentiment" id="constituents"><h2>What residents of {scope} say <OpinionBadge /></h2>
        {withTotals.length ? <ul className="analysis-list">{withTotals.map(r => <li key={r.id}><Link href={`/texas/bills/${encodeURIComponent(r.id)}`}>{r.row.bill.identifier}: {r.row.bill.title}</Link><br />
          <span className="lead">{scopeLine(scope, r.t)}</span><br /><span><b>{person.name}:</b> {r.row.member.line} <OfficialBadge /></span></li>)}</ul>
          : <p className="meta">{NOT_ENOUGH_DISTRICT} Totals for {scope} show from {MIN_SHOWN} counted voters on a bill.</p>}
        <p className="not-poll">{NOT_SCIENTIFIC}</p>
        <p className="meta">Counted residents are address-matched or mail-verified at a home in this district; mail-verified are listed first. Shown beside the member&apos;s recorded vote, never as a score. No individual vote is ever shown.</p></div>}
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
