import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { AnalysisBadge, OfficialBadge, OpinionBadge, billLabel, shortDate } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { currentLocation } from "@/lib/location";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { verificationConfig } from "@/lib/verify/config";
import { profileFor } from "@/lib/verify/store";
import { MIN_SHOWN } from "@/lib/verify/rules";
import { movingThisWeek } from "@/lib/federal/bill-depth";
import { readerLegislators, voiceFor } from "@/lib/voice";
import { ANSWER_LABEL, DISTRICT_OFF_MESSAGE, MARK_LABEL } from "@/lib/voice-rules";
import { brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Your voice"), robots: { index: false, follow: false } };

const clip = (s: string, n = 170) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);

/**
 * Your voice: every bill the reader has answered, newest first, with how each of their legislators voted on it and
 * their district's counted total. The reader's answers are shown only to them. No score or percentage is made here;
 * the member page keeps its own "You and {member}" count.
 */
export default async function VoicePage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/voice" access={access} page="/voice">{null}</PublicShell>;
  const canAnswer = !!access.invite || !!access.editor;
  const userId = canAnswer ? await currentAppUserId() : null;
  const loc = await currentLocation(userId).catch(() => null);
  const vc = verificationConfig();
  const account = vc.enabled && userId ? (await currentAccount().catch(() => null)) ?? await accountForAppUser(userId).catch(() => null) : null;
  const profile = account ? await profileFor(account.id).catch(() => null) : null;
  // The district: the one matched from a verified address, else the one the reader saved on Your legislators.
  const districtId = profile?.districtId ?? loc?.congressional ?? null;
  const members = await readerLegislators(loc).catch(() => []);
  const bills = await voiceFor(userId, { members, verificationEnabled: vc.enabled, districtId }).catch(() => []);
  const suggestions = bills.length ? [] : (await movingThisWeek(null).catch(() => [])).sort((a, b) => Number(!!b.onFloor) - Number(!!a.onFloor)).slice(0, 3);
  const hasRep = members.some(m => m.chamber === "house");

  return <PublicShell current="/voice" access={access} page="/voice">
    <section className="fed-page voice-page">
      <div className="eyebrow">YOUR VOICE <OpinionBadge /></div>
      <h1>Your voice</h1>
      <p className="lede">The bills you have weighed in on, how your legislators voted on each one, and what verified people in your district said.</p>

      {!loc && <p className="gate gate-open" role="note">Add your ZIP code on <Link href="/legislators">Your legislators</Link> to see how your senators and representative voted on these bills.</p>}
      {loc && !hasRep && <p className="meta">Only your two senators are shown. <Link href="/legislators">Pick your House district</Link> to add your representative.</p>}
      {bills.length > 0 && !vc.enabled && <p className="meta voice-district-off"><b>Your district&apos;s view:</b> {DISTRICT_OFF_MESSAGE}</p>}

      {!bills.length && <div className="empty-note voice-empty">
        <p><b>You have not weighed in on a bill yet.</b> {canAnswer ? "Open a bill, read what it does, and tap Support, Oppose or Unsure. It then shows here beside your legislators' votes."
          : "Weighing in is open to invited trial readers for now."}</p>
        {suggestions.length > 0 && <><p className="subhead">Bills to start with</p>
          <ul className="voice-suggest">{suggestions.map(b => <li key={b.id}><Link href={`/bills/${b.id}#your-view`}><span className="bill-tag">{billLabel(b.billType, b.number)}</span> {b.headline ?? clip(b.title, 120)}</Link>
            {b.onFloor && <span className="meta">On the {b.onFloor.split(",").map(c => (c === "senate" ? "Senate" : "House")).join(" and ")} floor schedule this week</span>}</li>)}</ul></>}
        <p className="voice-more"><Link className="button-link" href="/coming">See what is coming up</Link> <Link className="button-link secondary-button" href="/moving">Bills moving this week</Link></p>
      </div>}

      {bills.map(b => <article key={b.billId} className="follow-card voice-bill">
        <p className="meta"><span className="bill-tag">{billLabel(b.billType, b.number)}</span></p>
        <h2><Link href={`/bills/${b.billId}`}>{b.headline ?? clip(b.officialTitle)}</Link> {b.headline ? <AnalysisBadge /> : <OfficialBadge />}</h2>
        {b.headline && <p className="meta"><OfficialBadge /> Official title: {clip(b.officialTitle)}</p>}
        <p className="voice-answer"><span>You said <b>{ANSWER_LABEL[b.answer]}</b> on {shortDate(b.at)}.</span>
          <Link className="voice-change" href={`/bills/${b.billId}#your-view`} aria-label={`Change your answer on ${billLabel(b.billType, b.number)}`}>Change</Link></p>

        {b.members.length > 0 && <><h3 className="subhead">How your legislators voted <OfficialBadge /></h3>
          <ul className="voice-members">{b.members.map(({ member, line, sourceUrl }) => <li key={member.id}>
            <span className="voice-who"><Link href={`/politicians/${member.id}`}><b>{member.fullName}</b></Link> <span className="meta">{member.role}</span></span>
            <span className="vote-position">{line.text}{line.state === "voted" && sourceUrl && <> · <a className="src-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></>}</span>
            {line.mark && <span className={`voice-mark voice-mark-${line.mark}`}>{MARK_LABEL[line.mark]}</span>}
            {line.note && <small>{line.note}</small>}
          </li>)}</ul></>}

        <h3 className="subhead">Your district{districtId && vc.enabled ? ` (${districtId})` : ""} <OpinionBadge title="Added up from verified readers' answers, without names" /></h3>
        {b.district.kind === "total" ? <p className="voice-district"><b>{b.district.text}</b> <span className="not-poll">Not a scientific poll.</span></p>
          : b.district.kind === "unknown" ? <p className="meta">We do not know your district yet. <Link href="/legislators">Add your street address</Link> to see your district&apos;s view.</p>
          : <p className="meta">{b.district.kind === "off" ? "No totals yet: counting is not switched on." : b.district.text}</p>}
      </article>)}

      {bills.length > 0 && <p className="meta">A legislator&apos;s row shows the vote on passing the bill in their chamber. When there was no such vote, it shows the vote that stopped the bill, if one did. Votes on amendments and routine steps are never used. A bill that passed without a recorded vote has no member votes to show.</p>}

      {bills.length > 0 && members.length > 0 && <div className="fed-section"><h2>How often you agree</h2>
        <ul className="voice-links">{members.map(m => <li key={m.id}><Link href={`/politicians/${m.id}`}>See how often you and {m.fullName} agree</Link></li>)}</ul>
        <p className="meta">That count is on each member&apos;s page. It is your own comparison, not a rating of the member.</p></div>}

      <div className="fed-section voice-privacy"><h2>What happens to your answers</h2>
        <ul className="analysis-list">
          <li><b>Private by default.</b> Only you see your answers and this page. They are never shown with your name.</li>
          <li><b>Counted only after you verify.</b> An answer is added to a total, without your name, only after you <Link href="/account#verify">verify you are a real person</Link> and your account is 24 hours old. Unsure is never counted.{!vc.enabled && " Counting is not switched on yet."}</li>
          <li><b>Totals need {MIN_SHOWN} people.</b> A district&apos;s total shows only once {MIN_SHOWN} verified people there have answered.</li>
          <li><b>You can change your mind.</b> Tap Change on any bill above, or clear your answer on the bill&apos;s page.</li>
        </ul>
        <p className="meta"><Link href="/privacy">Privacy</Link> · <Link href="/account">Your account</Link></p></div>
    </section>
  </PublicShell>;
}
