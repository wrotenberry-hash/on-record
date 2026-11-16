import type { Metadata } from "next";
import Link from "next/link";
import { billMeta } from "@/lib/seo";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { AnalysisBadge, OpinionBadge, OfficialBadge, PositionPill, billLabel, memberLine, shortDate } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { followedIds, getBill } from "@/lib/federal/queries";
import { costEstimates, followedVotes, summaryForBill } from "@/lib/analysis/queries";
import { stanceFor } from "@/lib/opinions";
import { saveStance } from "./actions";
import { VoteExplainer } from "@/components/federal/vote-row";
import { GLOSSARY_URL } from "@/lib/federal/vote-labels";
import { KIND_LABEL, positionLine, voteKind } from "@/lib/federal/vote-kinds";
import { verificationConfig } from "@/lib/verify/config";
import { profileFor, totalsFor } from "@/lib/verify/store";
import { REASON_MAX, totalsLine } from "@/lib/verify/rules";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { Turnstile } from "@/components/verify/turnstile";
import { countedNote } from "@/lib/verify/flow";

export const dynamic = "force-dynamic";

/** Bill titles and the Analysis headline reach only viewers allowed to see the page. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const access = await viewerAccess();
  if (!access.allowed) return { title: "On Record" };
  const data = await getBill((await params).id);
  if (!data) return { title: "Not found · On Record" };
  const summary = await summaryForBill(data.bill.id, false).catch(() => null);
  return { ...billMeta({ label: billLabel(data.bill.billType, data.bill.number), title: data.bill.title }, summary?.summary.headline), alternates: { canonical: `/bills/${data.bill.id}` } };
}

/**
 * The bill page in the approved template (docs/TALK_IS_CHEAP_PLAN.md):
 * Official title, Analysis headline, Official status, Analysis "what it does"
 * and "who it affects", Official cost, Analysis "what changes for you", the
 * Analysis case for and against, "what we don't know", Official votes, sources.
 * Every section carries its badge.
 */
export default async function BillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string }> }) {
  const access = await viewerAccess();
  const { id } = await params;
  if (!access.allowed) return <PublicShell current="/issues" access={access} page="/bills/[id]">{null}</PublicShell>;
  const data = await getBill(id);
  if (!data) notFound();
  const { bill, votes, subjects, categories, sponsor } = data;
  const [analysis, cbo, followed] = await Promise.all([
    summaryForBill(bill.id, access.preview).catch(() => null),
    costEstimates(bill.id).catch(() => []),
    currentAppUserId().then(followedIds),
  ]);
  const mine = await followedVotes(votes.map(v => v.id), followed).catch(() => []);
  const canAnswer = !!access.invite || !!access.editor;
  const stance = canAnswer ? await currentAppUserId().then(u => stanceFor(u, bill.id)).catch(() => null) : null;
  const vc = verificationConfig();
  const account = vc.enabled && canAnswer ? (await currentAccount()) ?? await currentAppUserId().then(u => (u ? accountForAppUser(u) : null)) : null;
  const vprofile = account ? await profileFor(account.id).catch(() => null) : null;
  const vtier = vprofile?.tier ?? 0;
  const totals = vc.enabled ? await totalsFor(bill.id).catch(() => null) : null;
  const countedText = countedNote((await searchParams).c);
  const s = analysis?.summary;
  const held = s?.status === "held";
  const latestCheck = analysis?.checks[0];
  const cite = (section: string) => <span className="cite">{section}</span>;

  return <PublicShell current="/issues" access={access} page="/bills/[id]">
    <section className="fed-page bill-page">
      <p className="crumbs"><Link href="/issues">← Issues</Link></p>
      <div className="eyebrow">{billLabel(bill.billType, bill.number)} · {bill.congress}th Congress</div>
      <p className="official-line"><OfficialBadge /> <span>{bill.title}</span></p>
      {s ? <h1 className="bill-headline">{s.headline} <AnalysisBadge /></h1> : <h1>{bill.title}</h1>}
      {categories.length > 0 && <ul className="chip-row">{categories.map(c => <li key={c.slug}><Link href={`/issues/${c.slug}`}>{c.name}{c.method === "ai" ? " · sorted by AI" : ""}</Link></li>)}</ul>}

      {held && <div className="held-note" role="note"><b>Held for review.</b> Readers will not see this summary until an editor approves it{analysis?.queue ? ` (${queueReason(analysis.queue.reason)})` : ""}. <Link href="/editor/analysis">Review it</Link></div>}

      <div className="fed-section"><h2>Status <OfficialBadge /></h2>
        {bill.latestActionText ? <p>{bill.latestActionText} <span className="meta">({shortDate(bill.latestActionAt)})</span></p>
          : votes[0] ? <p>Latest recorded vote: {votes[0].question}, {votes[0].result ?? "result not stated"} {votes[0].yea}–{votes[0].nay} <span className="meta">({shortDate(votes[0].votedAt)})</span></p>
          : <p className="meta">No action recorded yet.</p>}
        {sponsor && <p className="meta">Sponsor: <Link href={`/politicians/${sponsor.id}`}>{sponsor.fullName}</Link></p>}
        {bill.introducedAt && <p className="meta">Introduced {shortDate(bill.introducedAt)}</p>}
      </div>

      {s && <>
        <div className="fed-section"><h2>What it does <AnalysisBadge /></h2>
          <ul className="analysis-list">{s.whatItDoes.map((p, i) => <li key={i}>{p.text} {cite(p.section)}</li>)}</ul></div>
        <div className="fed-section"><h2>Who it affects <AnalysisBadge /></h2>
          <ul className="analysis-list">{s.whoItAffects.map((p, i) => <li key={i}>{p.text} {cite(p.section)}</li>)}</ul></div>
      </>}

      <div className="fed-section"><h2>Cost <OfficialBadge /></h2>
        {cbo.length ? <ul className="analysis-list">{cbo.map(e => <li key={e.url}><a href={e.url} target="_blank" rel="noopener noreferrer">Congressional Budget Office estimate</a>, {shortDate(e.pubDate)}{e.description ? `: ${e.description}` : ""}</li>)}</ul>
          : <p className="meta">{s ? "No Congressional Budget Office cost estimate has been published for this bill." : "Cost estimates are read when the summary is written."}</p>}
      </div>

      {s && <>
        <div className="fed-section"><h2>What changes for you <AnalysisBadge /></h2><p>{s.whatChangesForYou}</p></div>
        <div className="fed-section"><h2>The case for and against <AnalysisBadge /></h2>
          <div className="case-grid">
            <div><h3>For</h3><ul className="analysis-list">{s.caseFor.map((a, i) => <li key={i}>{a.argument} <span className="attrib">({a.attribution})</span></li>)}</ul></div>
            <div><h3>Against</h3><ul className="analysis-list">{s.caseAgainst.map((a, i) => <li key={i}>{a.argument} <span className="attrib">({a.attribution})</span></li>)}</ul></div>
          </div>
          <p className="meta">Both sides are written to the same length and standard. They describe arguments people make; they are not On Record&apos;s view.</p></div>
        <div className="fed-section"><h2>What we don&apos;t know <AnalysisBadge /></h2>
          <ul className="analysis-list">{s.unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul></div>
      </>}

      {!s && access.preview && <div className="fed-section placeholder"><h2>Plain-language summary <AnalysisBadge /></h2><p className="meta">Not written yet. Summaries are generated by the scheduled run within their test caps; see <Link href="/editor/analysis">Bill summaries</Link>.</p></div>}

      {canAnswer && <div className="fed-section your-view" id="your-view"><h2>Where do you stand? <OpinionBadge /></h2>
        {vc.enabled && vtier >= 1
          ? <p className="meta">You are verified, so your answer is added to the totals below <b>without your name</b>. Your own answer is still shown only to you. On a member&apos;s page it is compared with their votes on passing this bill, never with procedural votes.</p>
          : <p className="meta">Only you see this. {vc.enabled ? <>It is not counted in any total until you <Link href="/account#verify">verify you are a real person</Link>. </> : "It is never shown to anyone else or added up into a poll. "}On a member&apos;s page it is compared with their votes on passing this bill, never with procedural votes.</p>}
        {countedText && <p className="gate gate-open" role="status">{countedText}</p>}
        <form action={saveStance} className="stance-row"><input type="hidden" name="billId" value={bill.id} />
          {vc.enabled && vtier >= 1 && <label className="reason-field" htmlFor="stance-reason">Why? (optional, not shown with your name)<input id="stance-reason" name="reason" maxLength={REASON_MAX} /></label>}
          {vc.enabled && vtier >= 1 && !vprofile?.firstVoteChallengeAt && vc.turnstileReady && <Turnstile siteKey={vc.turnstile.siteKey} scriptUrl={vc.turnstile.scriptUrl} action="first_vote" />}
          <button name="stance" value="support" className={stance === "support" ? "on" : ""} aria-pressed={stance === "support"}>Support</button>
          <button name="stance" value="oppose" className={stance === "oppose" ? "on" : ""} aria-pressed={stance === "oppose"}>Oppose</button>
          {stance && <button name="stance" value="" className="link-button">Clear</button>}</form></div>}

      {vc.enabled && <div className="fed-section sentiment"><h2>What verified readers say <OpinionBadge /></h2>
        <span className="lead">{totalsLine("Real people", totals?.real)}</span>
        <span>{totalsLine("District-matched", totals?.district)}</span>
        {vprofile?.districtId && vtier >= 2 && <span>{totalsLine(`In ${vprofile.districtId}`, totals?.scope(vprofile.districtId))}</span>}
        <p className="meta">Real people verified an email and a mobile number; district-matched readers also matched an address to a district. Visitors&apos; answers are never counted, new accounts count after 24 hours, and answers under review for unusual activity are left out. Totals show from 25 answers. <Link href="/transparency">Transparency</Link></p></div>}

      <div className="fed-section"><h2>How your politicians voted <OfficialBadge /></h2>
        {mine.length ? <ul className="vote-list">{mine.map(m => <li key={`${m.rollCallId}-${m.id}`} className="vote-row"><div className="vote-main">
          <b><Link href={`/politicians/${m.id}`}>{m.fullName}</Link></b>{(() => { const rc = votes.find(v => v.id === m.rollCallId); const k = rc ? voteKind(rc.question, rc.title ?? bill.title) : "other";
            return <><span className="vote-position">{positionLine(m.position, k)}</span><small>{memberLine(m)} · {KIND_LABEL[k]}{rc ? ` · ${rc.question}, ${shortDate(rc.votedAt)}` : ""}</small></>; })()}</div>
          <PositionPill position={m.position} raw={m.rawPosition} /></li>)}</ul>
          : <p className="meta">{followed.size ? "None of the members you follow has a recorded vote on this bill." : <>Follow members on the <Link href="/politicians">Politicians</Link> page to see their votes here.</>}</p>}
        <h3 className="subhead">All recorded votes</h3>
        {votes.length ? <ul className="vote-list">{votes.map(v => <li key={v.id} className="vote-row"><div className="vote-main">
          <span className="vote-date">{shortDate(v.votedAt)} · {v.chamber === "senate" ? "Senate" : "House"} · <span className={`vote-kind vote-kind-${voteKind(v.question, v.title ?? bill.title)}`}>{KIND_LABEL[voteKind(v.question, v.title ?? bill.title)]}</span></span>
          <b>{v.question}</b><VoteExplainer question={v.question} /><small>{v.result ?? "Result not stated"} · Yea {v.yea} · Nay {v.nay}{v.notVoting ? ` · Not voting ${v.notVoting}` : ""} · <a className="src-link" href={v.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></small></div></li>)}</ul>
          : <p className="meta">No roll-call votes on this bill yet.</p>}
        {votes.length > 0 && <p className="meta">Plain-language vote descriptions follow the <a href={GLOSSARY_URL} target="_blank" rel="noopener noreferrer">congressional glossary</a>; the official wording is shown with each vote.</p>}
      </div>

      <div className="fed-section"><h2>Sources</h2><ul className="source-list">
        {s ? s.sources.map(src => <li key={src.url}><a href={src.url} target="_blank" rel="noopener noreferrer">{src.label}</a></li>)
          : <li><a href={bill.congressUrl} target="_blank" rel="noopener noreferrer">This bill on Congress.gov</a></li>}
        <li>Record {bill.detailStatus === "complete" ? "completed from the Congress.gov API" : "created from a roll-call vote"}, retrieved {shortDate(bill.retrievedAt)}.</li>
        {subjects.length > 0 && <li>Congress.gov subjects: {subjects.slice(0, 12).join(", ")}{subjects.length > 12 ? "…" : ""}</li>}
        {s && <li>Analysis written {shortDate(s.createdAt)} by {s.model} from the {s.textVersionLabel.toLowerCase()} text{s.truncated ? " (long bill: the first part was read)" : ""}, checked by On Record&apos;s rule checker{latestCheck ? ` (${latestCheck.passed ? "passed" : "did not pass"}, reading grade ${latestCheck.metrics.readingGrade})` : ""}. Confidence: {s.confidence}. {s.confidenceReason}</li>}
      </ul></div>
    </section>
  </PublicShell>;
}

function queueReason(reason: string) {
  return reason === "low_confidence" ? "the model marked its confidence low" : reason === "check_failed" ? "the rule checker failed it twice" : "picked for the 1-in-5 audit";
}
