import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { AnalysisBadge, OfficialBadge, OpinionBadge } from "@/components/federal/badges";
import { Answer } from "@/components/trust/parts";
import { BRAND, brandTitle } from "@/lib/brand";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import { CLAIM_STEPS, LABELS, MEMBER_STATS_METHOD, READER_TOTALS, SOURCES, SOURCE_GROUPS, SUMMARY_PARTS, SUMMARY_STEPS, WRITTEN_CHECKS, type SourceGroup } from "@/lib/trust";
import { verificationConfig } from "@/lib/verify/config";
import { viewerAccess } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export const metadata = { title: brandTitle("How this works"),
  description: "Where the facts come from, what Official and Analysis mean, how a bill summary is written and checked, how every number is counted, and how errors are corrected." };

const SECTIONS = [
  ["sources", "Where the facts come from"], ["labels", "Official and Analysis"], ["summaries", "How a bill summary is written and checked"],
  ["numbers", "How the numbers are computed"], ["claims", "How a claim is checked"], ["corrections", "Corrections"],
] as const;
const GROUPS: SourceGroup[] = ["congress", "summaries", "texas", "lookup"];
const BY = { program: "Program", ai: "AI model", person: "The editor" } as const;
const badge = (label: string) => label === "Official" ? <OfficialBadge /> : label === "Analysis" ? <AnalysisBadge /> : <OpinionBadge />;

/**
 * Methodology: one page, six sections, each opening with a one-sentence plain answer. The lists of sources, summary
 * parts, checks and counting rules come from lib/trust.ts, which tests/trust.test.mjs checks against the code.
 */
export default async function MethodPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/method" access={access}>{null}</PublicShell>;
  const contact = process.env.PUBLIC_CONTACT_EMAIL?.trim();
  const publicRead = publicReadEnabled(process.env[PUBLIC_READ_FLAG]);
  const verificationOn = verificationConfig().enabled;
  return <PublicShell current="/method" access={access}>
    <article className="prose trust">
      <div className="eyebrow">HOW THIS WORKS</div>
      <h1>Where the facts come from, and what we do with them.</h1>
      <p className="lede">{BRAND.name} copies the official record, explains it in plain words, and counts a few things from it. This page says exactly how each of those is done, so you can check any of it yourself.</p>

      <nav className="trust-toc" aria-label="On this page"><b>On this page</b>
        <ol>{SECTIONS.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}</ol></nav>

      <section id="sources">
        <h2>1. Where the facts come from</h2>
        <Answer>Every vote, bill and member on this site is copied from a government record, or from a named open copy of one, and each item links back to where it came from.</Answer>
        <p>Copied records are not reworded. Each one is stored with the address it was fetched from and the time it was fetched. Below is every source the site reads, what it takes from each, and how often.</p>
        {GROUPS.map(g => <div key={g}>
          <h3>{SOURCE_GROUPS[g].title}</h3>
          {SOURCE_GROUPS[g].note && <p className="small">{SOURCE_GROUPS[g].note}</p>}
          <ul className="trust-list">{SOURCES.filter(s => s.group === g).map(s => <li key={s.id}>
            <span className="t-name"><a href={s.url} rel="noopener noreferrer">{s.name}</a></span>
            <span className="t-sub">{s.publisher}</span>
            <span className="t-row"><b>What we read:</b> {s.reads}</span>
            <span className="t-row"><b>How often:</b> {s.refreshed}</span>
          </li>)}</ul>
        </div>)}
        <p className="small">Not read automatically yet: press releases on government sites and full Congressional Research Service reports. Neither has a reliable official list per bill.</p>
      </section>

      <section id="labels">
        <h2>2. Official and Analysis</h2>
        <Answer>Official means copied from a government record. Analysis means written by this site to explain one. Every section carries a label, so you always know which you are reading.</Answer>
        <dl className="trust-dl">{LABELS.map(l => <div key={l.label}>
          <dt>{badge(l.label)} {l.label}</dt>
          <dd>{l.means}</dd>
          <dd><b>Where you see it:</b> {l.where}</dd>
        </div>)}</dl>
        <p>Two things carry no label because they are neither. The short plain line under a vote&apos;s official wording, such as what a vote to end debate means, is fixed text written once from the Congress.gov glossary and reviewed by a person. It is not written by AI. And a vote on how or whether to proceed is always marked as a procedural step, never as a vote for or against the bill itself.</p>
      </section>

      <section id="summaries">
        <h2>3. How a bill summary is written and checked</h2>
        <Answer>An AI model drafts each summary from official documents only. A program and a second AI reader check it. The editor reviews every summary that fails, audits a sample of those that pass, and approves every explainer.</Answer>

        <h3>What a summary may use</h3>
        <p>Only the documents listed in section 1: the bill&apos;s own text and status record, the Congressional Research Service summary, the cost estimate, committee reports, the rule in the Federal Register when a bill would cancel one, the sections of law the bill would change, what named members said on the floor, and the site&apos;s own approved explainers. Never news stories. Never material from advocacy groups. If a document cannot be fetched, it is left out and nothing stands in for it.</p>

        <h3>The parts of a summary</h3>
        <ul>{SUMMARY_PARTS.map(p => <li key={p.part}><b>{p.part}.</b> {p.rule}</li>)}</ul>

        <h3>The written checks</h3>
        <p>A program reads every draft against these rules. No AI takes part in this step.</p>
        <ul>{WRITTEN_CHECKS.map(c => <li key={c}>{c}</li>)}</ul>

        <h3>The average-reader test</h3>
        <p>A draft that passes the written checks is then read cold. A separate AI call plays an adult who finished high school and does not follow politics. It sees only the headline and the plain-English part. It must say, in its own words, what the bill does, who is affected, and what would change in daily life. It also lists any word it did not understand.</p>
        <p>A second reader sees the page down to &ldquo;Who it affects&rdquo; and must say how things work today, what exactly would change, and who is affected.</p>
        <p>A checking call then compares all of those answers with the official documents. It also checks that each reason in the case for and the case against was really given by the person or body it is credited to. The summary fails if an answer is wrong, vague or missing, if the reader could not understand a term that is not an everyday word, or if a reason is not backed by the source it cites.</p>
        <p>A summary that fails is rewritten with the exact failure as feedback, at most twice. If it still fails, it is held. A held summary is not shown until the editor has read and approved it.</p>

        <h3>Who does what</h3>
        <ul className="trust-steps">{SUMMARY_STEPS.map(s => <li key={s.step}><span className={`by-tag by-${s.by}`}>{BY[s.by]}</span> {s.step}</li>)}</ul>
        <p>Until a bill has a summary that has passed, its page shows the official title and record only. When the writing rules change, summaries written under the new rules stay hidden until the editor has reviewed examples and released them. Texas bills show the official record only for now; Texas summaries are switched off until they meet this same standard.</p>

        <h3>Reusable explainers</h3>
        <p>Some subjects come up again and again: how Congress can cancel an agency rule, why some Senate votes need 60, health plans people buy on HealthCare.gov. For these the site keeps short explainers. Each one is drafted once with AI help from official sources, lists those sources, must pass the same wording rules as a summary, and is used only after the editor has read and approved it. An approved explainer is linked from the bill page and given to the AI model as a source, so related bills explain the subject the same way. Each carries the date its facts were last checked.</p>
      </section>

      <section id="numbers">
        <h2>4. How the numbers are computed</h2>
        <Answer>Every number on this site is a count made from the official record by a fixed rule. The rule is the same for every member and every party, and it is written next to the number.</Answer>

        <h3>Vote totals</h3>
        <p>Each roll call (a vote recorded by name) comes with the chamber&apos;s own totals: yes, no, present and not voting. After every update, twice a day, the site adds up the individual votes it stored and compares them with those totals. If they differ, the vote shows &ldquo;Tally under review&rdquo; in place of the counts until the copy is fixed. Texas votes get the same check against the counts reported with them.</p>

        <h3>A member&apos;s missed votes and votes with their party</h3>
        <ul>
          <li>{MEMBER_STATS_METHOD.base}</li>
          <li>{MEMBER_STATS_METHOD.missed}</li>
          <li>{MEMBER_STATS_METHOD.withParty}</li>
          <li>{MEMBER_STATS_METHOD.same}</li>
        </ul>
        <p>Comparing two members works the same way: the site counts the roll calls where both voted Yea or Nay, and how often they voted alike. Members of different chambers share no roll calls, and the page says so.</p>

        <h3>Bill counts on the dashboards</h3>
        <p>The Congress dashboard counts every House and Senate bill and joint resolution of a Congress from the Congress.gov bill list. A joint resolution is a measure that, like a bill, can become law. Each bill&apos;s furthest step is read from its latest official action, and a later step implies the earlier ones: a bill received in the Senate has passed the House. Simple and concurrent resolutions cannot become law, so they are left out. The page checks its totals against Congress.gov&apos;s own counts of bills and laws and shows the result.</p>
        <p>A party-line vote is one where most voting Democrats and most voting Republicans were on opposite sides, with at least 10 of each voting. Votes on procedure are counted apart from votes on a bill. Lists such as &ldquo;missed votes&rdquo; are counts, shown the same way for every member.</p>

        <h3>Reader totals</h3>
        <p>{verificationOn ? "Real-person verification is switched on, so totals can appear on a bill once enough verified readers have answered." : "Real-person verification is switched off at the moment. Until it is on, every answer stays private and nothing is added up."}</p>
        <ul>{READER_TOTALS.rules.map(r => <li key={r}>{r}</li>)}</ul>
        <p>A monthly note on what was blocked or set aside, as counts only, is on the <Link href="/transparency">transparency page</Link>.</p>
      </section>

      <section id="claims">
        <h2>5. How a claim is checked</h2>
        <Answer>A person, not a program, checks each public claim in six steps, and the published record shows every step.</Answer>
        {!publicRead && <p className="small">Claim records are not open to readers yet. This is how they are made.</p>}
        <ol>{CLAIM_STEPS.map(s => <li key={s.title}><b>{s.title}.</b> {s.text}</li>)}</ol>
        <h3>What we do not do</h3>
        <ul>
          <li>No accuracy percentages, grades or truthfulness scores, for a claim or for a person.</li>
          <li>No different standard by party or by popularity. Where practical, the claim is reviewed without the speaker&apos;s name.</li>
          <li>No silent edits. Publications and corrections keep the earlier versions.</li>
          <li>No machine verdicts. Every gate between a captured sentence and a published record is passed by a person.</li>
        </ul>
      </section>

      <section id="corrections">
        <h2>6. Corrections</h2>
        <Answer>If something here is wrong, tell us. The editor reads every report, and every fix is listed in public.</Answer>
        <p><b>How to report a problem.</b> Use the &ldquo;Report a problem&rdquo; link where a page or card has one{contact ? <>, or write to <b>{contact}</b></> : ""}. A report holds the page, the reason you pick and an optional note. It does not hold your name.</p>
        <p><b>What happens next.</b></p>
        <ol>
          <li>The editor opens the official source again and compares it with what the site shows.</li>
          <li>If the site is wrong, it is fixed, and the fix is listed on the corrections page with what changed.</li>
          <li>If the site is right, the report is closed with no change. The corrections page shows how many reports were fixed and how many needed no change.</li>
        </ol>
        <p>Summaries withdrawn after the weekly re-check are listed there too.</p>
        <p><Link href="/corrections">See the corrections page</Link></p>
      </section>

      <p className="fine">The full writing standard and the log of decisions are kept in the project repository. Related: <Link href="/pledge">the nonpartisan pledge</Link>, <Link href="/about">who runs this</Link>, <Link href="/privacy">privacy</Link>.</p>
    </article>
  </PublicShell>;
}
