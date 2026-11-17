import type { Metadata } from "next";
import Link from "next/link";
import { billMeta } from "@/lib/seo";
import { notFound } from "next/navigation";
import { isQuietKill } from "@/lib/said-did-rules";
import { PublicShell } from "@/components/public/public-shell";
import { AnalysisBadge, OpinionBadge, OfficialBadge, PositionPill, billLabel, memberLine, shortDate } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { followedIds, getBill } from "@/lib/federal/queries";
import { costEstimates, followedVotes, summaryForBill } from "@/lib/analysis/queries";
import { saveStance, toggleBillFollow } from "./actions";
import { billAmendments, billTimeline, floorThisWeek, rollCallParties } from "@/lib/federal/bill-depth";
import { cosponsorPartyCounts } from "@/lib/federal/legislators";
import { changesFor } from "@/lib/analysis/changes";
import { isFollowingBill } from "@/lib/bill-follows";
import { Timeline } from "@/components/federal/timeline";
import { stanceQuestion } from "@/lib/federal/stance-question";
import { primerById } from "@/lib/analysis/primers";
import { PartySplit } from "@/components/federal/party-split";
import { Glossed } from "@/components/ui/glossed";
import { VoteExplainer, YesNo } from "@/components/federal/vote-row";
import { GLOSSARY_URL } from "@/lib/federal/vote-labels";
import { KIND_LABEL, positionLine, voteKind } from "@/lib/federal/vote-kinds";
import { verificationConfig } from "@/lib/verify/config";
import { profileFor, totalsFor } from "@/lib/verify/store";
import { REASON_MAX, totalsLine } from "@/lib/verify/rules";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { Turnstile } from "@/components/verify/turnstile";
import { countedNote } from "@/lib/verify/flow";
import { BRAND, brandTitle } from "@/lib/brand";
import { ContactForBill } from "@/components/contact/contact-section"; // contact-your-legislator (test-ready build)

export const dynamic = "force-dynamic";

/** Bill titles and the Analysis headline reach only viewers allowed to see the page. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const access = await viewerAccess();
  if (!access.allowed) return { title: BRAND.name };
  const data = await getBill((await params).id);
  if (!data) return { title: brandTitle("Not found") };
  const summary = await summaryForBill(data.bill.id, false).catch(() => null);
  const meta = billMeta({ label: billLabel(data.bill.billType, data.bill.number), title: data.bill.title }, summary?.summary.headline);
  const { previewMeta } = await import("@/lib/seo"), { SITE } = await import("@/lib/share");
  return { ...meta, ...previewMeta(SITE, `/bills/${data.bill.id}`, meta.title, meta.description, `/api/cards/g?t=bill&bill=${data.bill.id}&format=link`), alternates: { canonical: `/bills/${data.bill.id}` } };
}

/**
 * The bill page in the approved template (docs/TALK_IS_CHEAP_PLAN.md):
 * Official title, Analysis headline, Official status, Analysis "what it does"
 * and "who it affects", Official cost, Analysis "what changes for you", the
 * Analysis case for and against, "what we don't know", Official votes, sources.
 * Every section carries its badge.
 */
/** A citation chip's text: "Rule", "Committee report", "CRS", "CBO", "10 U.S.C. 1413a". */
function shortSource(d: { id: string; kind: string }) {
  if (d.kind === "us_code") return d.id.replace(/^USC (\d+) §(.+)$/, "$1 U.S.C. $2");
  return ({ federal_register: "The rule", committee_report: "Committee report", crs: "CRS summary", cbo: "CBO" } as Record<string, string>)[d.kind] ?? d.id;
}

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
  // Round C: the reader's own legislators (saved districts) count as followed here, so their votes are highlighted.
  const yours = await (async () => { const { currentLocation } = await import("@/lib/location"); const { federalLegislators } = await import("@/lib/federal/legislators");
    const loc = await currentLocation(await currentAppUserId()); if (!loc) return new Set<string>();
    const f = await federalLegislators(loc.state, loc.congressional); return new Set([...f.senators.map(s => s.id), ...(f.representative ? [f.representative.id] : [])]); })().catch(() => new Set<string>());
  const mine = await followedVotes(votes.map(v => v.id), new Set([...followed, ...yours])).catch(() => []);
  const underReview = await import("@/lib/federal/depth").then(d => d.tallyUnderReview(votes.map(v => v.id))).catch(() => new Set<string>());
  const [timeline, amendments, floor, parties, cosponsors, changes, followingBill] = await Promise.all([
    billTimeline(bill.id, bill.introducedAt).catch(() => null), billAmendments(bill.id).catch(() => []), floorThisWeek(bill.id).catch(() => []),
    rollCallParties(votes.map(v => v.id)).catch(() => new Map<string, Record<string, Record<string, number>>>()), cosponsorPartyCounts(bill.id).catch(() => null),
    changesFor(bill.id).catch(() => null), currentAppUserId().then(u => isFollowingBill(u, bill.id)).catch(() => false)]);
  const partyName = (p: string) => (p.startsWith("Dem") ? "Democrats" : p.startsWith("Rep") ? "Republicans" : p.startsWith("Ind") ? "Independents" : p);
  const canAnswer = !!access.invite || !!access.editor;
  const { answerFor, answerHistory } = await import("@/lib/opinions");
  const stance = canAnswer ? await currentAppUserId().then(u => answerFor(u, bill.id)).catch(() => null) : null;
  const history = canAnswer ? await currentAppUserId().then(u => answerHistory(u, bill.id)).catch(() => []) : [];
  const vc = verificationConfig();
  const account = vc.enabled && canAnswer ? (await currentAccount()) ?? await currentAppUserId().then(u => (u ? accountForAppUser(u) : null)) : null;
  const vprofile = account ? await profileFor(account.id).catch(() => null) : null;
  const vtier = vprofile?.tier ?? 0;
  const totals = vc.enabled ? await totalsFor(bill.id).catch(() => null) : null;
  const countedText = countedNote((await searchParams).c);
  const s = analysis?.summary;
  const held = s?.status === "held";
  const latestCheck = analysis?.checks[0];
  const docs = analysis?.details?.sourceDocs ?? [];
  // A citation names a bill section ("Sec. 2", "Full text") or an official source by id ("RULE", "REPORT", "CRS", "USC 10 §1413a").
  const cite = (section: string) => {
    const doc = docs.find(d => d.id.toUpperCase() === section.trim().toUpperCase());
    return doc ? <a className="cite" href={doc.url} target="_blank" rel="noopener noreferrer" title={doc.label}>{shortSource(doc)}</a> : <span className="cite">{section}</span>;
  };
  const sideNote = "No public statement of reasons found."; // owner wording, 17 Nov: never an invented reason
  // Owner, 16 Nov: ask with the plain headline, official title one tap away. Readers only ever get a reader-visible
  // summary here (summaryForBill gates it); a held one is used only for the signed-in editor's preview.
  const ask = stanceQuestion({ question: s && (!held || access.preview) ? analysis?.details?.question ?? null : null, headline: s && (!held || access.preview) ? s.headline : null });

  // Owner, 17 Nov: bring the reader up to speed first. With the new structure the page reads: headline, plain English,
  // how it works today, what would change, why now, (status), who it affects, cost, what changes for you, the cases,
  // what we don't know, sources. Older summaries keep the "Explain more" layer.
  const st = s ? analysis?.structure ?? null : null;
  const primers = (st?.primers ?? []).map(primerById).filter((p): p is NonNullable<typeof p> => !!p && p.reviewed);
  const lastFloor = timeline ? [...timeline.steps].reverse().find(x => "floor" in x) as { label?: string; meaning?: string } | undefined : undefined;
  const primerBox = (p: (typeof primers)[number]) => <details key={p.id} className="primer"><summary>{p.kind === "process" ? "How this works: " : "Background: "}{p.title}</summary>
    <ul className="analysis-list">{p.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
    {p.kind === "process" && lastFloor?.label && <p><b>In this case:</b> {lastFloor.label}. {lastFloor.meaning}</p>}
    <p className="meta">Sources: {p.sources.map((x, i) => <span key={x.url}>{i ? " · " : ""}<a href={x.url} target="_blank" rel="noopener noreferrer">{x.label}</a></span>)}. Checked {shortDate(p.lawAsOf)}.</p></details>;
  const whoBlock = s && <>
    <div className="fed-section"><h2>Who it affects <AnalysisBadge /></h2>
          <ul className="analysis-list">{s.whoItAffects.map((p, i) => <li key={i}>{p.text} {cite(p.section)}</li>)}</ul></div>
  </>;
  const youBlock = s && <>
        <div className="fed-section"><h2>What changes for you <AnalysisBadge /></h2><p>{s.whatChangesForYou}</p></div>
  </>;
  const caseBlock = s && <>
        <div className="fed-section"><h2>The case for and against <AnalysisBadge /></h2>
          <div className="case-grid">
            <div><h3>For</h3>{s.caseFor.length ? <ul className="analysis-list">{s.caseFor.map((a, i) => <li key={i}>{a.argument} <span className="attrib">({a.attribution})</span>{(a as { source?: string }).source ? <> {cite((a as { source?: string }).source!)}</> : null}</li>)}</ul> : <p className="meta">{sideNote}</p>}</div>
            <div><h3>Against</h3>{s.caseAgainst.length ? <ul className="analysis-list">{s.caseAgainst.map((a, i) => <li key={i}>{a.argument} <span className="attrib">({a.attribution})</span>{(a as { source?: string }).source ? <> {cite((a as { source?: string }).source!)}</> : null}</li>)}</ul> : <p className="meta">{sideNote}</p>}</div>
          </div>
          <p className="meta">{analysis?.details ? `Each argument is credited to who makes it in the official record and links to that source. Both sides are held to the same standard. They are not ${BRAND.name}'s view.` : `Both sides are written to the same length and standard. They describe arguments people make; they are not ${BRAND.name}'s view.`}</p></div>
  </>;
  const unknownBlock = s && <>
        <div className="fed-section"><h2>What we don&apos;t know <AnalysisBadge /></h2>
          <ul className="analysis-list">{s.unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul></div>
  </>;

  return <PublicShell current="/issues" access={access} page="/bills/[id]">
    <section className="fed-page bill-page">
      <p className="crumbs"><Link href="/issues">← Issues</Link></p>
      <div className="eyebrow">{billLabel(bill.billType, bill.number)} · {bill.congress}th Congress</div>
      <p className="official-line"><OfficialBadge /> <span>{bill.title}</span></p>
      {s ? <h1 className="bill-headline">{s.headline} <AnalysisBadge /></h1> : <h1>{bill.title}</h1>}
      {(floor.length > 0 || canAnswer) && <div className="bill-actions-row">
        {floor.length > 0 && <span className="on-floor">On the {[...new Set(floor.map(f => f.chamber === "senate" ? "Senate" : "House"))].join(" and ")} floor schedule this week</span>}
        {canAnswer && <form action={toggleBillFollow} className="follow-form"><input type="hidden" name="billId" value={bill.id} />
          <button type="submit" className={followingBill ? "follow-btn on" : "follow-btn"} aria-pressed={followingBill}>{followingBill ? "Following this bill" : "Follow this bill"}</button></form>}
      </div>}
      {categories.length > 0 && <ul className="chip-row">{categories.map(c => <li key={c.slug}><Link href={`/issues/${c.slug}`}>{c.name}{c.method === "ai" ? " · sorted by AI" : ""}</Link></li>)}</ul>}

      {s && analysis?.details?.plainEnglish && <div className="fed-section plain-english"><h2>In plain English <AnalysisBadge /></h2><p>{analysis.details.plainEnglish}</p></div>}

      {held && <div className="held-note" role="note"><b>Held for review.</b> Readers will not see this summary until an editor approves it{analysis?.queue ? ` (${queueReason(analysis.queue.reason)})` : ""}. <Link href="/editor/analysis">Review it</Link></div>}

      {st && <>
        {/* Owner review, 17 Nov: the old rule, the new rule and what this bill would do come first; background follows. */}
        <div className="fed-section"><h2>{st.changes.some(r => r.before?.trim()) ? "What the new rule changed, and what this bill would do" : "What would change"} <AnalysisBadge /></h2>
          <ul className="change-rows">{st.changes.map((r, i) => <li key={i}>{r.label && <h3>{r.label}</h3>}
            {r.before?.trim() && <p><b>Before the new rule:</b> {r.before}</p>}
            <p><b>{r.before?.trim() ? "Now, under the new rule:" : "Today:"}</b> {r.today}</p><p><b>If this passes:</b> {r.ifPassed} {cite(r.source)}</p></li>)}</ul></div>
        <div className="fed-section"><h2>How it works today <AnalysisBadge /></h2>
          <ul className="analysis-list">{st.howItWorksToday.map((p, i) => <li key={i}>{p.text} {cite(p.section)}</li>)}</ul>
          {primers.filter(p => p.kind === "topic").map(primerBox)}</div>
        <div className="fed-section"><h2>Why now <AnalysisBadge /></h2><p>{st.whyNow}</p>
          {primers.filter(p => p.kind === "process").map(primerBox)}</div>
      </>}

      <div className="fed-section"><h2>Status <OfficialBadge /></h2>
        {timeline && <Timeline steps={timeline.steps} current={timeline.currentStep} sourceUrl={`${bill.congressUrl}/all-actions`} />}
        {bill.latestActionText ? <p>Latest action: <Glossed text={bill.latestActionText} /> <span className="meta">({shortDate(bill.latestActionAt)})</span></p>
          : votes[0] ? <p>Latest recorded vote: {votes[0].question}, {votes[0].result ?? "result not stated"} {underReview.has(votes[0].id) ? "(tally under review)" : `${votes[0].yea}–${votes[0].nay}`} <span className="meta">({shortDate(votes[0].votedAt)})</span></p>
          : <p className="meta">No action recorded yet.</p>}
        {sponsor && <p className="meta">Sponsor: <Link href={`/politicians/${sponsor.id}`}>{sponsor.fullName}</Link>{cosponsors?.sponsor ? ` (${cosponsors.sponsor.party})` : ""}{cosponsors && cosponsors.total > 0 ? <> · {cosponsors.total} cosponsor{cosponsors.total === 1 ? "" : "s"}: {Object.entries(cosponsors.byParty).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${partyName(p)} ${n}`).join(", ")}{cosponsors.withdrawn ? ` (${cosponsors.withdrawn} withdrew)` : ""}</> : ""}</p>}
        {bill.introducedAt && <p className="meta">Introduced {shortDate(bill.introducedAt)}</p>}
      </div>

      {/* Owner, 17 Nov: layers. Headline, then plain English, then "Explain more", then sources. A reader who stops
          after the plain-English part should still understand the bill; an older summary with no plain-English part opens the details. */}
      {s && st && whoBlock}
      {s && !st && <details className="explain-more" open={!analysis?.details?.plainEnglish}>
        <summary>Explain more <span className="meta">background, details, the case for and against</span></summary>
        {analysis?.details?.background && <div className="fed-section"><h2>Background <AnalysisBadge /></h2><p>{analysis.details.background} {analysis.details.backgroundSources.map(id => <span key={id}>{cite(id)} </span>)}</p></div>}
        <div className="fed-section"><h2>What it does <AnalysisBadge /></h2>
          <ul className="analysis-list">{s.whatItDoes.map((p, i) => <li key={i}>{p.text} {cite(p.section)}</li>)}</ul></div>
        {whoBlock}
        {youBlock}
        {caseBlock}
        {unknownBlock}
      </details>}

      <div className="fed-section"><h2>Cost <OfficialBadge /></h2>
        {cbo.length ? <ul className="analysis-list">{cbo.map(e => <li key={e.url}><a href={e.url} target="_blank" rel="noopener noreferrer">Congressional Budget Office estimate</a>, {shortDate(e.pubDate)}{e.description ? `: ${e.description}` : ""}</li>)}</ul>
          : <p className="meta">{s ? "No Congressional Budget Office cost estimate has been published for this bill." : "Cost estimates are read when the summary is written."}</p>}
      </div>

      {s && st && <>{youBlock}{caseBlock}{unknownBlock}</>}


      {changes && <div className="fed-section"><h2>What changed between versions {changes.bullets ? <AnalysisBadge /> : <OfficialBadge />}</h2>
        <p className="meta">From the {changes.fromType.toLowerCase()} text to the {changes.toType.toLowerCase()} text.</p>
        {Array.isArray(changes.bullets) && changes.bullets.length > 0 && <ul className="analysis-list">{(changes.bullets as Array<{ text: string; section: string }>).map((b, i) => <li key={i}>{b.text} {cite(b.section)}</li>)}</ul>}
        <p className="meta"><OfficialBadge /> Sections added: {(changes.added as string[] | null)?.length ? (changes.added as string[]).map(n => `Sec. ${n}`).join(", ") : "none"} · changed: {(changes.changed as string[] | null)?.length ? (changes.changed as string[]).map(n => `Sec. ${n}`).join(", ") : "none"} · removed: {(changes.removed as string[] | null)?.length ? (changes.removed as string[]).map(n => `Sec. ${n}`).join(", ") : "none"}.</p></div>}

      {amendments.length > 0 && <div className="fed-section"><h2>Amendments <OfficialBadge /></h2>
        <ul className="analysis-list">{amendments.map(a => <li key={a.id}><b>{a.chamber === "house" ? "House" : "Senate"} amendment {a.number}</b> · <span className={`amd-${a.outcome}`}>{a.outcome === "adopted" ? "Adopted" : a.outcome === "failed" ? "Not adopted" : a.outcome === "withdrawn" ? "Withdrawn" : "Pending"}</span><br />{a.line}{a.latestActionDate ? <span className="meta"> ({shortDate(a.latestActionDate)})</span> : null}</li>)}</ul>
        <p className="meta">One-line descriptions are the official purpose or description from Congress.gov.</p></div>}

      {!s && access.preview && <div className="fed-section placeholder"><h2>Plain-language summary <AnalysisBadge /></h2><p className="meta">Not written yet. Summaries are generated by the scheduled run within their test caps; see <Link href="/editor/analysis">Bill summaries</Link>.</p></div>}

      {canAnswer && <div className="fed-section your-view" id="your-view"><h2>{ask.question} <OpinionBadge /></h2>
        {ask.plain ? <details className="official-title"><summary>Official title</summary><p><OfficialBadge /> {bill.title}</p></details>
          : <p className="meta"><OfficialBadge /> Official title: {bill.title}</p>}
        {vc.enabled && vtier >= 1
          ? <p className="meta">You are verified, so your answer is added to the totals below <b>without your name</b>. Your own answer is still shown only to you. On a member&apos;s page it is compared with their votes on passing this bill, never with procedural votes.</p>
          : <p className="meta">Only you see this. {vc.enabled ? <>It is not counted in any total until you <Link href="/account#verify">verify you are a real person</Link>. </> : "It is never shown to anyone else or added up into a poll. "}On a member&apos;s page it is compared with their votes on passing this bill, never with procedural votes.</p>}
        {countedText && <p className="gate gate-open" role="status">{countedText}</p>}
        <form action={saveStance} className="stance-row"><input type="hidden" name="billId" value={bill.id} />
          <label className="reason-field" htmlFor="stance-reason">Why? (optional, private to you, 280 characters)<input id="stance-reason" name="reason" maxLength={REASON_MAX} /></label>
          {vc.enabled && vtier >= 1 && !vprofile?.firstVoteChallengeAt && vc.turnstileReady && <Turnstile siteKey={vc.turnstile.siteKey} scriptUrl={vc.turnstile.scriptUrl} action="first_vote" />}
          <button name="stance" value="support" className={stance === "support" ? "on" : ""} aria-pressed={stance === "support"}>Support</button>
          <button name="stance" value="oppose" className={stance === "oppose" ? "on" : ""} aria-pressed={stance === "oppose"}>Oppose</button>
          <button name="stance" value="unsure" className={stance === "unsure" ? "on" : ""} aria-pressed={stance === "unsure"}>Unsure</button>
          {stance && <button name="stance" value="" className="link-button">Clear</button>}</form>
        {history.length > 1 && <details className="method"><summary>Your earlier answers</summary><ul className="analysis-list">{history.map(h => <li key={h.id}>{shortDate(h.at)}: {h.stance === "cleared" ? "cleared" : h.stance}{h.reason ? ` — “${h.reason}”` : ""}</li>)}</ul></details>}</div>}

      {vc.enabled && <div className="fed-section sentiment"><h2>What verified readers say <OpinionBadge /></h2>
        <p className="not-poll">Not a scientific poll.</p>
        <span className="lead">{totalsLine("Real people", totals?.real)}</span>
        <span>{totalsLine("District-matched", totals?.district)}</span>
        {vprofile?.districtId && vtier >= 2 && <span>{totalsLine(`In ${vprofile.districtId}`, totals?.scope(vprofile.districtId))}</span>}
        <p className="meta">Real people verified an email and a mobile number; district-matched readers also matched an address to a district. Visitors&apos; answers are never counted, new accounts count after 24 hours, and answers under review for unusual activity are left out. Totals show from 25 answers. <Link href="/transparency">Transparency</Link></p></div>}

      {/* BEGIN contact-your-legislator (test-ready build): the reader's own legislators, official phone and form, an editable message. */}
      <ContactForBill bill={bill} votes={votes} />
      {/* END contact-your-legislator */}

      <div className="fed-section"><h2>How your politicians voted <OfficialBadge /></h2>
        {mine.length ? <ul className="vote-list">{mine.map(m => <li key={`${m.rollCallId}-${m.id}`} className="vote-row"><div className="vote-main">
          <b><Link href={`/politicians/${m.id}`}>{m.fullName}</Link>{yours.has(m.id) && <span className="your-tag"> · your legislator</span>}</b>{(() => { const rc = votes.find(v => v.id === m.rollCallId); const k = rc ? voteKind(rc.question, rc.title ?? bill.title) : "other";
            return <><span className="vote-position">{positionLine(m.position, k)}</span><small>{memberLine(m)} · {KIND_LABEL[k]}{rc ? ` · ${rc.question}, ${shortDate(rc.votedAt)}` : ""}</small></>; })()}</div>
          <PositionPill position={m.position} raw={m.rawPosition} /></li>)}</ul>
          : <p className="meta">{followed.size ? "None of the members you follow has a recorded vote on this bill." : <><Link href="/legislators">Find your legislators</Link> or follow members on the <Link href="/politicians">Politicians</Link> page to see their votes here.</>}</p>}
        <h3 className="subhead">All recorded votes</h3>
        {votes.length ? <ul className="vote-list">{votes.map(v => <li key={v.id} id={`vote-${v.id}`} className="vote-row"><div className="vote-main">
          <span className="vote-date">{shortDate(v.votedAt)} · {v.chamber === "senate" ? "Senate" : "House"} · <span className={`vote-kind vote-kind-${voteKind(v.question, v.title ?? bill.title)}`}>{KIND_LABEL[voteKind(v.question, v.title ?? bill.title)]}</span></span>
          <b><Glossed text={v.question} /></b><VoteExplainer question={v.question} /><YesNo question={v.question} title={v.title ?? bill.title} />{!underReview.has(v.id) && <PartySplit parties={parties.get(v.id)} />}<small>{underReview.has(v.id) ? <><span className="tally-review">Tally under review</span>: the member votes on file do not add up to the official totals</> : <>{v.result ?? "Result not stated"} · Yea {v.yea} · Nay {v.nay}{v.notVoting ? ` · Not voting ${v.notVoting}` : ""}</>} · <a className="src-link" href={v.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a>{/* contact-your-legislator: */} · <Link className="src-link" href={`/bills/${bill.id}?vote=${v.id}#contact`}>Contact about this vote</Link></small></div></li>)}</ul>
          : <p className="meta">No roll-call votes on this bill yet.</p>}
        {votes.length > 0 && <p className="meta">Plain-language vote descriptions follow the <a href={GLOSSARY_URL} target="_blank" rel="noopener noreferrer">congressional glossary</a>; the official wording is shown with each vote.</p>}
      </div>

      <div className="fed-section" id="share"><h2>Share this bill</h2>
        <p className="meta">{s && <><Link href={`/share/card?t=carousel&bill=${bill.id}`}>5-slide explainer</Link> · </>}<Link href={`/share/card?t=bill&bill=${bill.id}`}>Bill card</Link>
          {votes.filter(v => isQuietKill(voteKind(v.question, v.title ?? bill.title), v.question, v.result)).map(v => <span key={v.id}> · <Link href={`/share/card?t=quiet&roll=${v.id}`}>Stopped by a procedural vote, {shortDate(v.votedAt)}</Link></span>)}</p>
        <p className="meta">Cards are built from the record only. Each has the badges, the date, the source and a &ldquo;Report a problem&rdquo; link.</p></div>

      <div className="fed-section"><h2>Sources</h2><ul className="source-list">
        {s ? s.sources.map(src => <li key={src.url}><a href={src.url} target="_blank" rel="noopener noreferrer">{src.label}</a></li>)
          : <li><a href={bill.congressUrl} target="_blank" rel="noopener noreferrer">This bill on Congress.gov</a></li>}
        <li>Record {bill.detailStatus === "complete" ? "completed from the Congress.gov API" : "created from a roll-call vote"}, retrieved {shortDate(bill.retrievedAt)}.</li>
        {subjects.length > 0 && <li>Congress.gov subjects: {subjects.slice(0, 12).join(", ")}{subjects.length > 12 ? "…" : ""}</li>}
        {s && <li>Analysis written {shortDate(s.createdAt)} by {s.model} from the {s.textVersionLabel.toLowerCase()} text{s.truncated ? " (long bill: the first part was read)" : ""}, checked by {BRAND.name}&apos;s rule checker{latestCheck ? ` (${latestCheck.passed ? "passed" : "did not pass"}, reading grade ${latestCheck.metrics.readingGrade})` : ""}. Confidence: {s.confidence}. {s.confidenceReason}</li>}
      </ul></div>
    </section>
  </PublicShell>;
}

function queueReason(reason: string) {
  return reason === "low_confidence" ? "the model marked its confidence low" : reason === "check_failed" ? "the rule checker failed it twice" : "picked for the 1-in-5 audit";
}
