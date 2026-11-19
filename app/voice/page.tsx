import Link from "next/link";
import "@/components/voice/record.css";
import "@/components/dashboard/end.css";
import { PublicShell } from "@/components/public/public-shell";
import { AnalysisBadge, OfficialBadge, OpinionBadge, billLabel, shortDate } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { EarlierAnswers } from "@/components/voice/earlier-answers";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { verificationConfig } from "@/lib/verify/config";
import { MIN_SHOWN, NOT_SCIENTIFIC } from "@/lib/constituent/rules";
import { scopeWords } from "@/lib/constituent/proof";
import { readerPlace } from "@/lib/constituent/view";
import { movingThisWeek } from "@/lib/federal/bill-depth";
import { readerRecord, type ReaderRecordView } from "@/lib/voice";
import { ANSWER_LABEL, DISTRICT_OFF_MESSAGE, MARK_LABEL, recordEndLine, recordPage } from "@/lib/voice-rules";
import { COMPARISON_LEFT_OUT, OWN_COMPARISON } from "@/lib/agreement";
import { brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Your record"), robots: { index: false, follow: false } };

const clip = (s: string, n = 170) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);
/** The most bills offered to a reader who has not answered one yet. */
const SUGGESTIONS = 3;

/**
 * Your record (owner, 18 Nov 2026, point 5; it replaces the page first built here on 17 Nov): every bill the reader has answered,
 * newest first, a screen at a time, each with what happened to it, how each of their legislators voted on it and
 * their district's counted total. Then one plain count per legislator, in the legislators' own order, labelled every
 * time as the reader's own comparison. No rate, share, rank or grade is made here. The reader's answers are shown
 * only to them. The rules are lib/voice-rules.ts and lib/agreement.ts; the address stays /voice (/record leads here).
 */
export default async function RecordPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/voice" access={access} page="/voice">{null}</PublicShell>;
  const canAnswer = !!access.invite || !!access.editor;
  const userId = canAnswer ? await currentAppUserId() : null;
  const vc = verificationConfig();
  const account = vc.enabled && userId ? (await currentAccount().catch(() => null)) ?? await accountForAppUser(userId).catch(() => null) : null;
  // The reader's place: the home matched on their account, else the one they looked up on Your legislators.
  const place = await readerPlace(userId, account?.id ?? null, vc.enabled).catch(() => null);
  const record = await readerRecord(userId, { place, verificationEnabled: vc.enabled }).catch((): ReaderRecordView => ({ bills: [], members: [], counts: [], answered: 0 }));
  const total = record.bills.length, r = recordPage(total, (await searchParams).page), bills = record.bills.slice(r.from, r.to);
  const suggestions = total ? [] : (await movingThisWeek(null).catch(() => [])).sort((a, b) => Number(!!b.onFloor) - Number(!!a.onFloor)).slice(0, SUGGESTIONS);
  const hasRep = record.members.some(m => m.chamber === "house");

  return <PublicShell current="/voice" access={access} page="/voice">
    <section className="fed-page voice-page">
      <div className="eyebrow">YOUR RECORD <OpinionBadge /></div>
      <h1>Your record</h1>
      <p className="lede">The bills you answered, what happened to each one, how your legislators voted on it, and what counted residents of your district said.</p>
      <EarlierAnswers userId={userId} back="/voice" />

      {total > 0 && record.members.length > 0 && <p className="record-jump"><a href="#comparison">How often each of your legislators voted the way you did</a></p>}
      {!place && total > 0 && <p className="gate gate-open" role="note">Add your ZIP code on <Link href="/legislators">Your legislators</Link> to see how your senators and representative voted on these bills.</p>}
      {place && !hasRep && total > 0 && <p className="meta">Only your two senators are shown. <Link href="/legislators">Pick your House district</Link> to add your representative.</p>}
      {total > 0 && !vc.enabled && <p className="meta voice-district-off"><b>Your district&apos;s view:</b> {DISTRICT_OFF_MESSAGE}</p>}

      {!total && <div className="empty-note voice-empty">
        <p><b>You have not answered a bill yet.</b> {canAnswer ? "Open a bill, read what it does, and tap Support, Oppose or Unsure. It then shows here with what happened to it and how your legislators voted."
          : "Answering is open to invited trial readers for now."}</p>
        {suggestions.length > 0 && <><p className="subhead">Bills to start with</p>
          <ul className="voice-suggest">{suggestions.map(b => <li key={b.id}><Link href={`/bills/${b.id}#your-view`}><span className="bill-tag">{billLabel(b.billType, b.number)}</span> {b.headline ?? clip(b.title, 120)}</Link>
            {b.onFloor && <span className="meta">On the {b.onFloor.split(",").map(c => (c === "senate" ? "Senate" : "House")).join(" and ")} floor schedule this week</span>}</li>)}</ul>
          <p className="list-end">{suggestions.length === 1 ? "That is the one bill to start with." : `Those are ${suggestions.length} bills to start with.`} The rest are on the two pages below.</p></>}
        <p className="voice-more"><Link className="button-link" href="/coming">See what is coming up</Link> <Link className="button-link secondary-button" href="/moving">Bills moving this week</Link></p>
      </div>}

      {bills.map(b => <article key={b.billKey} className="follow-card voice-bill" data-outcome={b.outcome.kind}>
        <p className="meta"><span className="bill-tag">{b.level === "federal" ? billLabel(b.billType ?? "", b.number ?? 0) : b.identifier}</span>{b.level === "state" ? " Texas Legislature" : ""}</p>
        <h2><Link href={b.href}>{b.headline ?? clip(b.officialTitle)}</Link> {b.headline ? <AnalysisBadge /> : <OfficialBadge />}</h2>
        {b.headline && <p className="meta"><OfficialBadge /> Official title: {clip(b.officialTitle)}</p>}
        <p className="voice-answer"><span>You said <b>{ANSWER_LABEL[b.answer]}</b> · {shortDate(b.at)}</span>
          <Link className="voice-change" href={`${b.href}#your-view`} aria-label={`Change your answer on ${b.level === "federal" ? billLabel(b.billType ?? "", b.number ?? 0) : b.identifier}`}>Change</Link></p>

        <h3 className="subhead">What happened <OfficialBadge /></h3>
        <p className="record-outcome">{b.outcome.text}</p>

        {b.members.length > 0 && <><h3 className="subhead">How your legislators voted <OfficialBadge /></h3>
          <ul className="voice-members">{b.members.map(({ member, line, sourceUrl }, n) => <li key={member.id}>
            <span className="voice-who"><Link href={member.href}><b>{member.name}</b></Link> <span className="meta">{member.role}</span></span>
            <span className="vote-position">{line.text}{line.state === "voted" && sourceUrl && <> · <a className="src-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></>}</span>
            {line.mark && <span className={`voice-mark voice-mark-${line.mark}`}>{MARK_LABEL[line.mark]}</span>}
            {/* What a vote on a step meant, said once: under the last of the reader's members who took part in it. */}
            {line.note && !b.members.slice(n + 1).some(x => x.line.note === line.note) && <small className="voice-note">{line.note}</small>}
          </li>)}</ul></>}

        <h3 className="subhead">Your district <OpinionBadge title="Added up from counted residents' answers, without names" /></h3>
        {b.districts.map(({ scope, view }) => view.kind === "total" ? <div key={scope ?? "none"} className="voice-district"><b>{view.text}</b>
            <ul className="analysis-list">{(view.groups ?? []).map(g => <li key={g}>{g}</li>)}</ul><span className="not-poll">{NOT_SCIENTIFIC}</span></div>
          : view.kind === "unknown" ? <p key="none" className="meta">{b.level === "state" ? <>We do not know your state districts yet. <Link href="/legislators">Add your street address</Link> to see their view.</>
            : <>We do not know your district yet. <Link href="/legislators">Find your legislators</Link> to see your district&apos;s view.</>}</p>
          : <p key={scope ?? "none"} className="meta">{view.kind === "off" ? "No totals yet: counting is not switched on." : <>{scope && view.kind === "below" ? `${scopeWords(scope)}: ` : ""}{view.text}</>}</p>)}
      </article>)}

      {total > 0 && <><p className="list-end" role="status">{recordEndLine(total, r)}{record.answered > total ? ` Only your ${total} most recent answers are listed here.` : ""}</p>
        {r.pages > 1 && <p className="record-pages">{r.page > 1 && <Link className="button-link secondary-button" href={r.page === 2 ? "/voice" : `/voice?page=${r.page - 1}`}>Newer answers</Link>}
          {r.page < r.pages && <Link className="button-link secondary-button" href={`/voice?page=${r.page + 1}`}>Earlier answers ({total - r.to} more)</Link>}</p>}</>}

      {total > 0 && record.members.length > 0 && <p className="meta">A legislator&apos;s row shows the vote on passing the bill in their chamber. When there was no such vote, it shows the vote that stopped the bill, if one did. Votes on amendments and routine steps are never used. A bill that passed without a recorded vote has no vote by name to show.</p>}

      {total > 0 && <div className="fed-section" id="comparison"><h2>How often each of your legislators voted the way you did <OpinionBadge title="Your own comparison; only you see it" /></h2>
        <p className="meta"><b>{OWN_COMPARISON}</b> It is counted from every bill you have answered and each legislator&apos;s recorded votes. Only you see it.</p>
        {record.counts.length > 0 ? <><ul className="record-counts">{record.counts.map(c => <li key={c.member.id}>
            <span className="voice-who"><Link href={c.member.href}><b>{c.member.name}</b></Link> <span className="meta">{c.member.role}</span></span>
            <span className="record-count">{c.line}</span>
            <small>{OWN_COMPARISON}</small></li>)}</ul>
          <p className="list-end">{record.counts.length === 1 ? "That is your one legislator on file." : `That is all ${record.counts.length} of your legislators on file, in the order they are listed on Your legislators.`}</p></>
          : <p className="meta">Add your ZIP code or street address on <Link href="/legislators">Your legislators</Link> to see this count.</p>}
        <p className="meta">{COMPARISON_LEFT_OUT}</p></div>}

      <div className="fed-section voice-privacy"><h2>What happens to your answers</h2>
        <ul className="analysis-list">
          <li><b>Private by default.</b> Only you see your answers and this page. They are never shown with your name.</li>
          <li><b>Counted only for residents.</b> An answer is added to a total, without your name, only when your home address is <Link href="/account#verify">matched on your account</Link> and your account is 24 hours old. Support, Oppose and Unsure are all counted.{!vc.enabled && " Counting is not switched on yet."}</li>
          <li><b>Totals need {MIN_SHOWN} people.</b> A district&apos;s total shows only once {MIN_SHOWN} address-matched or mail-verified residents there have answered.</li>
          <li><b>You can change your mind.</b> Tap Change beside any answer on this page, or clear your answer on the bill&apos;s page.</li>
        </ul>
        <p className="meta"><Link href="/privacy">Privacy</Link> · <Link href="/account">Your account</Link></p></div>
    </section>
  </PublicShell>;
}
