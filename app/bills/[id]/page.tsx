import type { Metadata } from "next";
import Link from "next/link";
import { billMeta } from "@/lib/seo";
import { notFound } from "next/navigation";
import { EntryShell } from "@/components/share/entry-shell";
import { BillShareMenu } from "@/components/share/bill-share-menu";
import { TakePart } from "@/components/share/take-part";
import { AnalysisBadge, OpinionBadge, OfficialBadge, PositionPill, billLabel, memberLine, shortDate } from "@/components/federal/badges";
import { entryViewer, currentAppUserId } from "@/lib/viewer";
import { followedIds, getBill } from "@/lib/federal/queries";
import { costEstimates, followedVotes, summaryForBill } from "@/lib/analysis/queries";
import { rowLabels } from "@/lib/analysis/row-labels";
import { SECTION_NAME } from "@/lib/analysis/tiers";
import { toggleBillFollow } from "./actions";
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
import { VoteBox } from "@/components/voice/vote-box";
import { billTotals } from "@/lib/verify/store";
import { NOT_SCIENTIFIC, scopeForMember, scopeLine, type ScopeTotals } from "@/lib/constituent/rules";
import { voteBoxData } from "@/lib/constituent/view";
import { billQuestion } from "@/lib/constituent/settled";
import { BRAND, brandTitle } from "@/lib/brand";
import { ContactForBill } from "@/components/contact/contact-section"; // contact-your-legislator (test-ready build)
import { READER_HOLDS } from "@/lib/analysis/publish-gate";
import { billWindow } from "@/lib/changes/window-store"; // Suggest changes (20 Nov 2026): where the bill is and whether it can still be changed
import { WindowBlock } from "@/components/changes/window-block";
import { Fold } from "@/components/bills/fold";
import { countHint, wordsHint } from "@/lib/fold-hint";

export const dynamic = "force-dynamic";

/**
 * Bill titles and the Analysis headline reach only viewers allowed to see the page. With SHARED_PAGES_PUBLIC on (off
 * by default; lib/public-access.ts), that includes a visitor whose address carries the code of a share link about
 * this bill (?s=<code>): they get the title, and the shared card as the preview picture, and the page stays out of
 * search results.
 */
export async function generateMetadata({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ s?: string }> }): Promise<Metadata> {
  const code = (await searchParams).s, access = await entryViewer({ kind: "bill", billKey: (await params).id, code });
  if (!access.allowed) return { title: BRAND.name };
  const data = await getBill((await params).id);
  if (!data) return { title: brandTitle("Not found") };
  const summary = await summaryForBill(data.bill.id, false).catch(() => null);
  const meta = billMeta({ label: billLabel(data.bill.billType, data.bill.number), title: data.bill.title }, summary?.summary.headline);
  const { previewMeta } = await import("@/lib/seo"), { SITE } = await import("@/lib/share");
  if (access.shared) {
    // The preview picture is the card that was shared: the one picture a visitor without an invite may load.
    const { shareGrant } = await import("@/lib/entry/store"), { getDb } = await import("@/db");
    const grant = await shareGrant(getDb(), code).catch(() => null), picture = grant?.target.startsWith("/share/card?") ? `/api/cards/g?${grant.target.slice("/share/card?".length)}&format=link` : null;
    return { ...meta, robots: { index: false, follow: false }, ...(picture ? previewMeta(SITE, `/bills/${data.bill.id}?s=${code}`, meta.title, meta.description, picture) : {}) };
  }
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

export default async function BillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string; s?: string }> }) {
  const { id } = await params;
  // Who may read this page: the editor, an invited reader, or everyone when public reading is on. With
  // SHARED_PAGES_PUBLIC on (off by default) also a visitor who arrived through a share link about this bill; that
  // visitor (`shared`) gets the record and the summary, no vote box, no contact panel and nothing that is a reader's.
  const access = await entryViewer({ kind: "bill", billKey: id, code: (await searchParams).s }), shared = access.shared;
  if (!access.allowed) return <EntryShell current="/issues" access={access} page="/bills/[id]">{null}</EntryShell>;
  const data = await getBill(id);
  if (!data) notFound();
  const { bill, votes, subjects, categories, sponsor } = data;
  const [analysis, cbo, followed] = await Promise.all([
    summaryForBill(bill.id, !!access.editor).catch(() => null), // held summaries are for the editor only, never a trial reader (17 Nov)
    costEstimates(bill.id).catch(() => []),
    currentAppUserId().then(followedIds),
  ]);
  // Round C: the reader's own legislators (saved districts) count as followed here, so their votes are highlighted.
  const yours = await (async () => { const { currentLocation } = await import("@/lib/location"); const { federalLegislators } = await import("@/lib/federal/legislators");
    const loc = await currentLocation(await currentAppUserId()); if (!loc) return new Set<string>();
    const f = await federalLegislators(loc.state, loc.congressional); return new Set([...f.senators.map(s => s.id), ...(f.representative ? [f.representative.id] : [])]); })().catch(() => new Set<string>());
  const mine = await followedVotes(votes.map(v => v.id), new Set([...followed, ...yours])).catch(() => []);
  // Resident voting (18 Nov 2026): beside each legislator's actual vote, the total for their own district (a senator's state,
  // a representative's district). Shown once they have voted; the same line for every member.
  const memberScope = (m: { chamber: string; state: string; district: number | null }) => scopeForMember({ level: "federal", chamber: m.chamber === "senate" ? "upper" : "lower", state: m.state, district: m.district });
  const districtTotals = mine.length ? await billTotals(bill.id, [...new Set(mine.map(memberScope))]).catch(() => new Map<string, ScopeTotals>()) : new Map<string, ScopeTotals>();
  const underReview = await import("@/lib/federal/depth").then(d => d.tallyUnderReview(votes.map(v => v.id))).catch(() => new Set<string>());
  const [timeline, amendments, floor, parties, cosponsors, changes, followingBill, changeWindow] = await Promise.all([
    // The last one is "Can this bill still be changed?": for every visitor who can see this page; nothing is shown when it cannot be worked out.
    billTimeline(bill.id, bill.introducedAt).catch(() => null), billAmendments(bill.id).catch(() => []), floorThisWeek(bill.id).catch(() => []),
    rollCallParties(votes.map(v => v.id)).catch(() => new Map<string, Record<string, Record<string, number>>>()), cosponsorPartyCounts(bill.id).catch(() => null),
    changesFor(bill.id).catch(() => null), currentAppUserId().then(u => isFollowingBill(u, bill.id)).catch(() => false), billWindow(bill.id).catch(() => null)]);
  const storedText = await import("@/lib/changes/text-store").then(m => m.versionsOf(bill.id)).then(v => v.length > 0).catch(() => false);
  const partyName = (p: string) => (p.startsWith("Dem") ? "Democrats" : p.startsWith("Rep") ? "Republicans" : p.startsWith("Ind") ? "Independents" : p);
  const canAnswer = !!access.invite || !!access.editor;
  // Resident voting (18 Nov 2026): the same voting box as every other bill, federal or state.
  const voice = shared ? null : await voteBoxData(bill.id, access).catch(() => null);
  const s = analysis?.summary;
  // Hidden from readers by the gate after a reading against its sources (lib/analysis/publish-gate.ts READER_HOLDS): the editor sees it, with the reason.
  const heldByReading = s ? READER_HOLDS[bill.id] ?? null : null;
  const held = s?.status === "held" || !!heldByReading;
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
  const ask = stanceQuestion({ question: s && (!held || !!access.editor) ? analysis?.details?.question ?? null : null, headline: s && (!held || !!access.editor) ? s.headline : null });
  // 20 Nov 2026: a settled bill (became law, failed, vetoed) asks "Do you agree with this law?" or "Would you have supported this bill?"; the answer counts the same way.
  const voiceAsk = voice ? billQuestion(changeWindow?.settled, ask, voice.delivery) : null;

  // Owner, 17 Nov: bring the reader up to speed first. With the new structure the page reads: headline, plain English,
  // how it works today, what would change, why now, (status), who it affects, cost, what changes for you, the cases,
  // what we don't know, sources. Older summaries keep the "Explain more" layer.
  const st = s ? analysis?.structure ?? null : null;
  // Two tiers (owner, 20 Nov 2026): an extended section that has not passed "is simply absent, with no 'coming' placeholder".
  // It is stored empty; `off` says which, so its heading is left out too (and "No public statement of reasons found" is never
  // said of reasons that exist but are not shown). The reasons for and against are one section: both sides or neither.
  const off = new Set<string>(analysis?.withheld ?? []), has = (part: string) => !off.has(part);
  // "If this passes" is wrong for a law already signed (lib/analysis/row-labels.ts).
  const isLaw = changeWindow?.settled === "law";
  const primers = (st?.primers ?? []).map(primerById).filter((p): p is NonNullable<typeof p> => !!p && p.reviewed);
  const lastFloor = timeline ? [...timeline.steps].reverse().find(x => "floor" in x) as { label?: string; meaning?: string } | undefined : undefined;
  const primerBox = (p: (typeof primers)[number]) => <details key={p.id} className="primer"><summary>{p.kind === "process" ? "How this works: " : "Background: "}{p.title}</summary>
    <ul className="analysis-list">{p.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
    {p.kind === "process" && lastFloor?.label && <p><b>In this case:</b> {lastFloor.label}. {lastFloor.meaning}</p>}
    <p className="meta">Sources: {p.sources.map((x, i) => <span key={x.url}>{i ? " · " : ""}<a href={x.url} target="_blank" rel="noopener noreferrer">{x.label}</a></span>)}. Checked {shortDate(p.lawAsOf)}.</p></details>;
  const whoBlock = s && has("whoItAffects") && <Fold id="who" title="Who it affects" count={s.whoItAffects.length} badge={<AnalysisBadge />}>
    <div className="fed-section"><h2>Who it affects <AnalysisBadge /></h2>
          <ul className="analysis-list">{s.whoItAffects.map((p, i) => <li key={i}>{p.text} {cite(p.section)}</li>)}</ul></div>
  </Fold>;
  const youBlock = s && has("whatChangesForYou") && <Fold id="you" title="What changes for you" hint={wordsHint(s.whatChangesForYou)} badge={<AnalysisBadge />}>
        <div className="fed-section"><h2>What changes for you <AnalysisBadge /></h2><p>{s.whatChangesForYou}</p></div>
  </Fold>;
  const caseBlock = s && has("caseFor") && has("caseAgainst") && <Fold id="reasons" title="Reasons for and against" count={s.caseFor.length + s.caseAgainst.length} badge={<AnalysisBadge />}>
        <div className="fed-section"><h2>The case for and against <AnalysisBadge /></h2>
          <div className="case-grid">
            <div><h3>For</h3>{s.caseFor.length ? <ul className="analysis-list">{s.caseFor.map((a, i) => <li key={i}>{a.argument} <span className="attrib">({a.attribution})</span>{(a as { source?: string }).source ? <> {cite((a as { source?: string }).source!)}</> : null}</li>)}</ul> : <p className="meta">{sideNote}</p>}</div>
            <div><h3>Against</h3>{s.caseAgainst.length ? <ul className="analysis-list">{s.caseAgainst.map((a, i) => <li key={i}>{a.argument} <span className="attrib">({a.attribution})</span>{(a as { source?: string }).source ? <> {cite((a as { source?: string }).source!)}</> : null}</li>)}</ul> : <p className="meta">{sideNote}</p>}</div>
          </div>
          <p className="meta">{analysis?.details ? `Each argument is credited to who makes it in the official record and links to that source. Both sides are held to the same standard. They are not ${BRAND.name}'s view.` : `Both sides are written to the same length and standard. They describe arguments people make; they are not ${BRAND.name}'s view.`}</p></div>
  </Fold>;
  const unknownBlock = s && has("unknowns") && <Fold id="unknowns" title="What we don't know" count={s.unknowns.length} badge={<AnalysisBadge />}>
        <div className="fed-section"><h2>What we don&apos;t know <AnalysisBadge /></h2>
          <ul className="analysis-list">{s.unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul></div>
  </Fold>;

  return <EntryShell current="/issues" access={access} page="/bills/[id]">
    <section className="fed-page bill-page">
      {!shared && <p className="crumbs"><Link href="/issues">← Issues</Link></p>}
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

      {access.editor && off.size > 0 && <div className="held-note" role="note"><b>Not shown to readers yet:</b> {[...new Set([...off].map(p => SECTION_NAME[p as keyof typeof SECTION_NAME] ?? p))].join("; ")}. Each of these sections did not pass its own check, so it is left out until it does. First reason: {Object.values(analysis?.withheldReasons ?? {}).flat()[0] ?? "see the check record"}</div>}
      {held && <div className="held-note" role="note"><b>Held for review.</b> Readers will not see this summary until {heldByReading ? "it is rewritten" : "an editor approves it"}{heldByReading ? `: it was read against its sources and misstates a detail. ${heldByReading}` : analysis?.queue ? ` (${queueReason(analysis.queue.reason)}).` : "."} <Link href="/editor/analysis">Review it</Link></div>}

      {st && <>
        {/* Owner, 21 Nov 2026: "Order of the open sections must be: headline, plain-English part, how it works today, what would
            change, where it stands, the reader's question. 'Today' always comes before 'what would change'." (Earlier, 17 Nov,
            what would change came first.) */}
        <div className="fed-section"><h2>How it works today <AnalysisBadge /></h2>
          <ul className="analysis-list">{st.howItWorksToday.map((p, i) => <li key={i}>{p.text} {cite(p.section)}</li>)}</ul>
          {primers.filter(p => p.kind === "topic" || !(has("whyNow") && st.whyNow?.trim())).map(primerBox)}</div>
        <div className="fed-section"><h2>{rowLabels({ enacted: isLaw, threeStates: st.changes.some(r => r.before?.trim()) }).heading} <AnalysisBadge /></h2>
          <ul className="change-rows">{st.changes.map((r, i) => { const l = rowLabels({ enacted: isLaw, threeStates: !!r.before?.trim() }); return <li key={i}>{r.label && <h3>{r.label}</h3>}
            {r.before?.trim() && <p><b>{l.before}:</b> {r.before}</p>}
            <p><b>{l.today}:</b> {r.today}</p><p><b>{l.ifPassed}:</b> {r.ifPassed} {cite(r.source)}</p></li>; })}</ul></div>
      </>}

      {/* Owner, 21 Nov 2026: "fold the step-by-step status list too, leaving one line on where the bill stands." */}
      <div className="fed-section" id="stands"><h2>Where it stands <OfficialBadge /></h2>
        {changeWindow ? <p className="stands-line">{changeWindow.where}</p>
          : bill.latestActionText ? <p className="stands-line"><Glossed text={bill.latestActionText} /> <span className="meta">({shortDate(bill.latestActionAt)})</span></p>
          : <p className="meta">No action recorded yet.</p>}
      </div>

      {/* Owner, 21 Nov 2026: the core stays open (headline, plain English, what would change, how it works today, where it
          stands, the reader's question); every other section is one tappable heading with a short hint. */}
      {voice && voiceAsk && <VoteBox billKey={bill.id} question={voiceAsk.question} plain={voiceAsk.plain} settledLine={voiceAsk.line} officialTitle={bill.title} data={voice} code={(await searchParams).c} back={`/bills/${bill.id}`} foldTotals />}
      <div className="fold-first" />
      <Fold id="steps" title="Every step so far" count={timeline ? timeline.steps.length : null} hint="and whether this bill can still be changed" badge={<OfficialBadge />}>
      <div className="fed-section"><h2>Status <OfficialBadge /></h2>
        <WindowBlock w={changeWindow} />
        {/* Shown only when the text is stored here, section by section (today: bills a menu of changes was drafted for). */}
        {storedText ? <p className="meta"><Link href={`/bills/${bill.id}/text`}>Read this bill&apos;s text, section by section</Link></p> : null}
        {timeline && <Timeline steps={timeline.steps} current={timeline.currentStep} sourceUrl={`${bill.congressUrl}/all-actions`} />}
        {bill.latestActionText ? <p>Latest action: <Glossed text={bill.latestActionText} /> <span className="meta">({shortDate(bill.latestActionAt)})</span></p>
          : votes[0] ? <p>Latest recorded vote: {votes[0].question}, {votes[0].result ?? "result not stated"} {underReview.has(votes[0].id) ? "(tally under review)" : `${votes[0].yea}–${votes[0].nay}`} <span className="meta">({shortDate(votes[0].votedAt)})</span></p>
          : <p className="meta">No action recorded yet.</p>}
        {sponsor && <p className="meta">Sponsor: {shared ? sponsor.fullName : <Link href={`/politicians/${sponsor.id}`}>{sponsor.fullName}</Link>}{cosponsors?.sponsor ? ` (${cosponsors.sponsor.party})` : ""}{cosponsors && cosponsors.total > 0 ? <> · {cosponsors.total} cosponsor{cosponsors.total === 1 ? "" : "s"}: {Object.entries(cosponsors.byParty).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${partyName(p)} ${n}`).join(", ")}{cosponsors.withdrawn ? ` (${cosponsors.withdrawn} withdrew)` : ""}</> : ""}</p>}
        {bill.introducedAt && <p className="meta">Introduced {shortDate(bill.introducedAt)}</p>}
      </div></Fold>
      {st ? <>
        {has("whyNow") && st.whyNow?.trim() ? <Fold id="why-now" title="Why now" hint={wordsHint(st.whyNow)} badge={<AnalysisBadge />}><div className="fed-section"><h2>Why now</h2><p>{st.whyNow}</p>
          {primers.filter(p => p.kind === "process").map(primerBox)}</div></Fold> : null}
      </> : null}

      {/* Owner, 17 Nov: layers. Headline, then plain English, then "Explain more", then sources. A reader who stops
          after the plain-English part should still understand the bill; an older summary with no plain-English part opens the details. */}
      {s && st && whoBlock}
      {s && !st && <details className="explain-more" open={!analysis?.details?.plainEnglish}>
        <summary>Explain more <span className="meta">background, details, the case for and against</span></summary>
        {analysis?.details?.background && <div className="fed-section"><h2>Background <AnalysisBadge /></h2><p>{analysis.details.background} {analysis.details.backgroundSources.map(id => <span key={id}>{cite(id)} </span>)}</p></div>}
        {has("whatItDoes") && <div className="fed-section"><h2>What it does <AnalysisBadge /></h2>
          <ul className="analysis-list">{s.whatItDoes.map((p, i) => <li key={i}>{p.text} {cite(p.section)}</li>)}</ul></div>}
        {whoBlock}
        {youBlock}
        {caseBlock}
        {unknownBlock}
      </details>}

      <Fold id="cost" title="Cost" hint={cbo.length ? `budget office estimate ${countHint(cbo.length)}` : "no estimate published"} badge={<OfficialBadge />}><div className="fed-section"><h2>Cost</h2>
        {cbo.length ? <ul className="analysis-list">{cbo.map(e => <li key={e.url}><a href={e.url} target="_blank" rel="noopener noreferrer">Congressional Budget Office estimate</a>, {shortDate(e.pubDate)}{e.description ? `: ${e.description}` : ""}</li>)}</ul>
          : <p className="meta">{s ? "No Congressional Budget Office cost estimate has been published for this bill." : "Cost estimates are read when the summary is written."}</p>}
      </div></Fold>

      {s && st && <>{youBlock}{caseBlock}{unknownBlock}</>}


      {changes && <Fold id="versions" title="What changed between versions" hint={`${changes.fromType.toLowerCase()} to ${changes.toType.toLowerCase()}`} badge={changes.bullets ? <AnalysisBadge /> : <OfficialBadge />}><div className="fed-section"><h2>What changed between versions</h2>
        <p className="meta">From the {changes.fromType.toLowerCase()} text to the {changes.toType.toLowerCase()} text.</p>
        {Array.isArray(changes.bullets) && changes.bullets.length > 0 && <ul className="analysis-list">{(changes.bullets as Array<{ text: string; section: string }>).map((b, i) => <li key={i}>{b.text} {cite(b.section)}</li>)}</ul>}
        <p className="meta"><OfficialBadge /> Sections added: {(changes.added as string[] | null)?.length ? (changes.added as string[]).map(n => `Sec. ${n}`).join(", ") : "none"} · changed: {(changes.changed as string[] | null)?.length ? (changes.changed as string[]).map(n => `Sec. ${n}`).join(", ") : "none"} · removed: {(changes.removed as string[] | null)?.length ? (changes.removed as string[]).map(n => `Sec. ${n}`).join(", ") : "none"}.</p></div></Fold>}

      {amendments.length > 0 && <Fold id="amendments" title="Amendments" count={amendments.length} badge={<OfficialBadge />}><div className="fed-section"><h2>Amendments</h2>
        <ul className="analysis-list">{amendments.map(a => <li key={a.id}><b>{a.chamber === "house" ? "House" : "Senate"} amendment {a.number}</b> · <span className={`amd-${a.outcome}`}>{a.outcome === "adopted" ? "Adopted" : a.outcome === "failed" ? "Not adopted" : a.outcome === "withdrawn" ? "Withdrawn" : "Pending"}</span><br />{a.line}{a.latestActionDate ? <span className="meta"> ({shortDate(a.latestActionDate)})</span> : null}</li>)}</ul>
        <p className="meta">One-line descriptions are the official purpose or description from Congress.gov.</p></div></Fold>}

      {!s && access.editor && <div className="fed-section placeholder"><h2>Plain-language summary <AnalysisBadge /></h2><p className="meta">Not written yet. Summaries are generated by the scheduled run within their test caps; see <Link href="/editor/analysis">Bill summaries</Link>.</p></div>}

      {shared && <TakePart />}

      {/* BEGIN contact-your-legislator (test-ready build): the reader's own legislators, official phone and form, an editable message. */}
      {!shared && <Fold id="contact" title="Contact your legislators" hint="phone, contact form, a message you can edit"><ContactForBill bill={bill} votes={votes} /></Fold>}
      {/* END contact-your-legislator */}

      <Fold id="votes" title={shared ? "Recorded votes" : "How your politicians voted"} hint={votes.length ? `${votes.length} recorded vote${votes.length === 1 ? "" : "s"}` : "no recorded vote yet"} badge={<OfficialBadge />}><div className="fed-section"><h2>Recorded votes</h2>
        {shared ? null : mine.length ? <ul className="vote-list">{mine.map(m => <li key={`${m.rollCallId}-${m.id}`} className="vote-row"><div className="vote-main">
          <b><Link href={`/politicians/${m.id}`}>{m.fullName}</Link>{yours.has(m.id) && <span className="your-tag"> · your legislator</span>}</b>{(() => { const rc = votes.find(v => v.id === m.rollCallId); const k = rc ? voteKind(rc.question, rc.title ?? bill.title) : "other";
            return <><span className="vote-position">{positionLine(m.position, k)}</span><small>{memberLine(m)} · {KIND_LABEL[k]}{rc ? ` · ${rc.question}, ${shortDate(rc.votedAt)}` : ""}</small>
              {/* Only while counting is on: with it off nothing can be counted, and "not enough yet" would mislead (19 Nov). */}
              {voice?.verificationOn && <small className="district-total"><OpinionBadge /> Residents of {scopeLine(memberScope(m), districtTotals.get(memberScope(m)), m.chamber === "senate" ? "state" : "district")} {NOT_SCIENTIFIC}</small>}</>; })()}</div>
          <PositionPill position={m.position} raw={m.rawPosition} /></li>)}</ul>
          : <p className="meta">{followed.size ? "None of the members you follow has a recorded vote on this bill." : <><Link href="/legislators">Find your legislators</Link> or follow members on the <Link href="/politicians">Politicians</Link> page to see their votes here.</>}</p>}
        {!shared && <h3 className="subhead">All recorded votes</h3>}
        {votes.length ? <ul className="vote-list">{votes.map(v => <li key={v.id} id={`vote-${v.id}`} className="vote-row"><div className="vote-main">
          <span className="vote-date">{shortDate(v.votedAt)} · {v.chamber === "senate" ? "Senate" : "House"} · <span className={`vote-kind vote-kind-${voteKind(v.question, v.title ?? bill.title)}`}>{KIND_LABEL[voteKind(v.question, v.title ?? bill.title)]}</span></span>
          <b><Glossed text={v.question} /></b><VoteExplainer question={v.question} /><YesNo question={v.question} title={v.title ?? bill.title} />{!underReview.has(v.id) && <PartySplit parties={parties.get(v.id)} />}<small>{underReview.has(v.id) ? <><span className="tally-review">Tally under review</span>: the member votes on file do not add up to the official totals</> : <>{v.result ?? "Result not stated"} · Yea {v.yea} · Nay {v.nay}{v.notVoting ? ` · Not voting ${v.notVoting}` : ""}</>} · <a className="src-link" href={v.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a>{/* contact-your-legislator: */}{!shared && <> · <Link className="src-link" href={`/bills/${bill.id}?vote=${v.id}#contact`}>Contact about this vote</Link></>}</small></div></li>)}</ul>
          : <p className="meta">No roll-call votes on this bill yet.</p>}
        {votes.length > 0 && <p className="meta">Plain-language vote descriptions follow the <a href={GLOSSARY_URL} target="_blank" rel="noopener noreferrer">congressional glossary</a>; the official wording is shown with each vote.</p>}
      </div></Fold>

      {/* One sourced fact per card (18 Nov 2026). Not shown to a visitor reading one shared page: the share screen is for readers. */}
      {!shared && <Fold id="share" title="Share one fact from this bill" hint="cards that carry their source and date"><BillShareMenu billId={bill.id} billTitle={bill.title} hasSummary={!!s} votes={votes} totals={voice?.totals} /></Fold>}

      <Fold id="sources" title="Sources" count={s ? s.sources.length : null} hint={s ? null : "the official record"}><div className="fed-section"><h2>Sources</h2><ul className="source-list">
        {s ? s.sources.map(src => <li key={src.url}><a href={src.url} target="_blank" rel="noopener noreferrer">{src.label}</a></li>)
          : <li><a href={bill.congressUrl} target="_blank" rel="noopener noreferrer">This bill on Congress.gov</a></li>}
        <li>Record {bill.detailStatus === "complete" ? "completed from the Congress.gov API" : "created from a roll-call vote"}, retrieved {shortDate(bill.retrievedAt)}.</li>
        {subjects.length > 0 && <li>Congress.gov subjects: {subjects.slice(0, 12).join(", ")}{subjects.length > 12 ? "…" : ""}</li>}
        {s && <li>Analysis written {shortDate(s.createdAt)} by {s.model} from the {s.textVersionLabel.toLowerCase()} text{s.truncated ? " (long bill: the first part was read)" : ""}, checked by {BRAND.name}&apos;s rule checker{latestCheck ? ` (${latestCheck.passed ? "passed" : "did not pass"}, reading grade ${latestCheck.metrics.readingGrade})` : ""}. Confidence: {s.confidence}. {s.confidenceReason}</li>}
      </ul></div></Fold>
    </section>
  </EntryShell>;
}

function queueReason(reason: string) {
  return reason === "low_confidence" ? "the model marked its confidence low" : reason === "check_failed" ? "the rule checker failed it twice" : "picked for the 1-in-5 audit";
}
