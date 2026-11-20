/**
 * The voting box on every bill page, federal and state (docs/CONSTITUENT_VOICE.md). One component, so every bill and
 * every reader gets the same words: the promise, Support / Oppose / Unsure with an optional private reason, who may
 * weigh in, and, after an answer, the totals for the nation, the state and the reader's district. Before an answer it
 * may say how many counted residents of the reader's district and state have weighed in (owner, 18 Nov 2026, point 9):
 * a number only, from 25, never the split.
 */
import "./record.css";
import Link from "next/link";
import { OfficialBadge, OpinionBadge, shortDate } from "@/components/federal/badges";
import { Turnstile } from "@/components/verify/turnstile";
import { verificationConfig } from "@/lib/verify/config";
import { countedNote } from "@/lib/verify/flow";
import { castBillVote, chooseEarlierAnswers } from "@/app/voice/actions";
import { COUNTING_OFF, groupLine, legacyPrompt, NOT_SCIENTIFIC, PROMISE, REASON_MAX, TIER_MEANS, TIER_NAME, whoCanWeighIn } from "@/lib/constituent/rules";
import type { TotalsBlock, VoteBoxData } from "@/lib/constituent/view";
import { MailVerifyOffer } from "@/components/account/mail-verify-offer";
import { UNSURE_NOT_COMPARED, YOUR_LEGISLATORS_VOTED } from "@/lib/constituent/settled";
import { MARK_LABEL } from "@/lib/voice-rules";
import { OWN_COMPARISON } from "@/lib/agreement";

const ANSWER_WORD = { support: "Support", oppose: "Oppose", unsure: "Unsure", cleared: "cleared" } as const;

export function TotalsList({ totals }: { totals: TotalsBlock[] }) {
  return <ul className="voice-totals">{totals.map(t => <li key={t.scope}><b>{t.title}</b>
    {t.shown.show ? <><span className="meta"> · {t.shown.voters} voters</span><ul className="analysis-list">{t.shown.groups.map(g => <li key={g.tier}>{groupLine(g)}</li>)}</ul></>
      : <span className="meta"> · {t.shown.message}</span>}</li>)}</ul>;
}

export function VoteBox({ billKey, question, plain, officialTitle, data, code, back, settledLine = null }: { billKey: string; question: string;
  /** true when the question uses the plain headline: the official title is then one tap away. */
  plain: boolean; officialTitle: string; data: VoteBoxData; code?: string | null; back: string;
  /** For a settled bill (became law, failed, vetoed): the one line under the question (lib/constituent/settled.ts). */
  settledLine?: string | null }) {
  const vc = verificationConfig(), note = countedNote(code), ask = legacyPrompt(data.legacy.pending, data.legacy.choice);
  const counted = data.tier === "address" || data.tier === "mail";
  return <>
    {data.canAnswer && <div className="fed-section your-view" id="your-view"><h2>{question} <OpinionBadge /></h2>
      {plain ? <details className="official-title"><summary>Official title</summary><p><OfficialBadge /> {officialTitle}</p></details>
        : <p className="meta"><OfficialBadge /> Official title: {officialTitle}</p>}
      {settledLine && <p className="settled-line">{settledLine}</p>}
      <p className="meta"><b>{PROMISE}</b> {data.verificationOn ? <>{TIER_NAME[data.tier]}: {TIER_MEANS[data.tier]}{!counted && <> <Link href="/account#verify">Match your home address</Link></>}</>
        : "Counting is not switched on yet, so no answer is added to a total today."}{data.held ? " Your account is waiting for a review, so your answers are saved but not counted for now." : ""}</p>
      {ask && <form action={chooseEarlierAnswers} className="gate gate-closed legacy-choice" role="group" aria-label="Your earlier answers">
        <p>{ask}</p><input type="hidden" name="back" value={back} />
        <button name="choice" value="count">Yes, count them</button> <button name="choice" value="private" className="secondary">No, keep them private</button></form>}
      {note && <p className="gate gate-open" role="status">{note}</p>}
      <MailVerifyOffer userId={data.userId} tier={data.tier} back={back} />
      {/* Before an answer: only how many counted residents of the reader's district and state have weighed in (25 or more), never how they answered. */}
      {data.proof.length > 0 && <p className="voice-proof" role="note">{data.proof.map(l => <span key={l}>{l} </span>)}<span className="not-poll">{NOT_SCIENTIFIC}</span></p>}
      {data.standing === "outside" ? <p className="gate gate-closed" role="note">{whoCanWeighIn(data.jurisdiction)}</p>
        : <form action={castBillVote} className="stance-row"><input type="hidden" name="billId" value={billKey} />
          <label className="reason-field" htmlFor="stance-reason">Why? (optional, private to you, {REASON_MAX} characters)<input id="stance-reason" name="reason" maxLength={REASON_MAX} /></label>
          {data.needsChallenge && <Turnstile siteKey={vc.turnstile.siteKey} scriptUrl={vc.turnstile.scriptUrl} action="first_vote" />}
          <button name="stance" value="support" className={data.answer === "support" ? "on" : ""} aria-pressed={data.answer === "support"}>Support</button>
          <button name="stance" value="oppose" className={data.answer === "oppose" ? "on" : ""} aria-pressed={data.answer === "oppose"}>Oppose</button>
          <button name="stance" value="unsure" className={data.answer === "unsure" ? "on" : ""} aria-pressed={data.answer === "unsure"}>Unsure</button>
          {data.answer && <button name="stance" value="" className="link-button">Clear</button>}</form>}
      {/* 20 Nov 2026: after any answer on a bill that has had a vote, how each of the reader's own legislators voted and whether it matched. */}
      {data.answer && data.yours.length > 0 && <div className="your-legislators-voted" id="your-legislators-voted"><h3 className="subhead">{YOUR_LEGISLATORS_VOTED} <OfficialBadge /></h3>
        <ul className="voice-members">{data.yours.map(({ member, line, sourceUrl }, n) => <li key={member.id}>
          <span className="voice-who"><Link href={member.href}><b>{member.name}</b></Link> <span className="meta">{member.role}</span></span>
          <span className="vote-position">{line.text}{line.state === "voted" && sourceUrl && <> · <a className="src-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></>}</span>
          {line.mark && <span className={`voice-mark voice-mark-${line.mark}`}>{MARK_LABEL[line.mark]}</span>}
          {line.note && !data.yours.slice(n + 1).some(x => x.line.note === line.note) && <small className="voice-note">{line.note}</small>}
        </li>)}</ul>
        <p className="meta">{data.answer === "unsure" ? `${UNSURE_NOT_COMPARED} ` : ""}{OWN_COMPARISON} Only you see it. <Link href="/voice">Your record</Link> keeps the count for each legislator.</p></div>}
      {data.history.length > 1 && <details className="method"><summary>Your earlier answers</summary><ul className="analysis-list">{data.history.map(h => <li key={h.id}>{shortDate(h.at)}: {ANSWER_WORD[h.stance as keyof typeof ANSWER_WORD] ?? h.stance}{h.reason ? ` — “${h.reason}”` : ""}</li>)}</ul></details>}
    </div>}

    {/* While counting is switched off (the trial build) nothing is or can be counted, so the page says only that. */}
    {!data.verificationOn ? <div className="fed-section sentiment" id="totals"><h2>What residents say <OpinionBadge /></h2>
      <p className="meta">{COUNTING_OFF}</p></div> : <>
    <div className="fed-section sentiment" id="totals"><h2>What residents say <OpinionBadge /></h2>
      <p className="not-poll">{NOT_SCIENTIFIC}</p>
      {data.showTotals || !data.canAnswer ? <TotalsList totals={data.totals} />
        : <p className="meta">Totals for the {data.jurisdiction.level === "federal" ? "nation, your state and your district" : "state and your district"} appear here after you answer.</p>}
      <p className="meta">Totals count address-matched and mail-verified residents only, mail-verified first. Address-matched means a text-message code and a home address the Census Bureau&apos;s geocoder placed; mail-verified adds a code from a postcard mailed to that address. Accounts with only a phone are not counted. New accounts count after 24 hours, a district shows from 25 voters, and answers under review are left out. No individual vote or reason is ever shown. <Link href="/transparency">Transparency</Link></p></div></>}
  </>;
}
