import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { Answer, DraftBanner, Legal } from "@/components/trust/parts";
import { BRAND, brandTitle } from "@/lib/brand";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import { viewerAccess } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Terms of use (draft)"), description: "Draft for legal review: what the service is and is not, fair use of it, accuracy and corrections, where the content comes from, and the legal terms.",
  robots: { index: false, follow: false } };

const SECTIONS = [
  ["is", "What the service is"], ["is-not", "What it is not"], ["who", "Who may use it"], ["use", "Fair use"], ["answers", "Your answers"], ["accuracy", "Accuracy and corrections"],
  ["content", "Where the content comes from, and who owns it"], ["warranty", "No warranty"], ["liability", "Liability"], ["law", "Governing law"], ["changes", "Changes"], ["contact", "Contact"],
] as const;

/**
 * Terms of use, a DRAFT for the owner's legal review (MANUAL). It describes the service as the code runs it today.
 * The legal wording is kept short on purpose; each [LEGAL REVIEW: …] note (lib/trust.ts) marks what a lawyer must decide.
 */
export default async function TermsPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/terms" access={access}>{null}</PublicShell>;
  const contact = process.env.PUBLIC_CONTACT_EMAIL?.trim();
  const publicRead = publicReadEnabled(process.env[PUBLIC_READ_FLAG]);
  return <PublicShell current="/terms" access={access}>
    <article className="prose trust">
      <DraftBanner />
      <div className="eyebrow">TERMS OF USE · DRAFT</div>
      <h1>The rules for using this site, in plain English.</h1>
      <p className="lede">By using {BRAND.name} you agree to these terms. They are short on purpose. If you do not agree, please do not use the site.</p>

      <nav className="trust-toc" aria-label="On this page"><b>On this page</b>
        <ol>{SECTIONS.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}</ol></nav>

      <section id="is">
        <h2>1. What the service is</h2>
        <Answer>{BRAND.name} is an information service. It shows how legislators voted and explains bills in plain words.</Answer>
        <p>It copies public records from the sources listed on <Link href="/method#sources">How this works</Link>, labels them Official, and adds its own explanations, labelled Analysis. It lets you mark your own view on a bill and follow members, bills and issues.</p>
        <p><Legal k="termsEntity" /></p>
      </section>

      <section id="is-not">
        <h2>2. What it is not</h2>
        <Answer>It is information, not advice, and it is not part of any government.</Answer>
        <ul>
          <li><b>Not legal advice.</b> A summary explains what a bill would do. It does not tell you what the law requires of you. For that, read the law itself or ask a lawyer.</li>
          <li><b>Not voting advice.</b> The site does not endorse anyone and does not tell you how to vote. For how, when and where to vote, use your state or county election office.</li>
          <li><b>Not a government site.</b> {BRAND.name} is not affiliated with Congress, the Texas Legislature, any agency, any party or any campaign. The official record is the one each page links to.</li>
          <li><b>Not a scientific poll.</b> Reader totals show what verified readers of this site answered. They do not measure public opinion.</li>
        </ul>
        <p>Analysis is drafted by an AI model and checked as described on <Link href="/method#summaries">How this works</Link>. It can still contain mistakes. Where a summary and the official record differ, the official record is right.</p>
        <p><Legal k="aiNotice" /></p>
      </section>

      <section id="who">
        <h2>3. Who may use it</h2>
        <Answer>{publicRead ? "Anyone may read the site." : "For now, only people with an invite link."}</Answer>
        {!publicRead && <p>The site is in an invite-only trial. An invite link is for the person it was sent to, and it can be switched off at any time.</p>}
        <p><Legal k="termsAge" /></p>
      </section>

      <section id="use">
        <h2>4. Fair use</h2>
        <Answer>Use the site as one person, honestly, and do not try to break it or bend its totals.</Answer>
        <ul>
          <li>One account for each person. Do not verify an account with a phone number or an address that is not yours.</li>
          <li>Do not try to push a total up or down with extra accounts, scripts or organized answering. Answers that look coordinated are set aside from the totals while the editor looks at them.</li>
          <li>Do not flood the site with automated requests. The site limits how often one device or network can ask for sign-in links, answer, or send reports.</li>
          <li>Do not try to get into another reader&apos;s account or information, or into the editor&apos;s side of the site.</li>
          <li>Do not pass off the site&apos;s Analysis as an official government statement, or change a card or summary and present it as the site&apos;s.</li>
        </ul>
        <p>Access can be ended for anyone who breaks these rules.</p>
        <p><Legal k="conduct" /></p>
      </section>

      <section id="answers">
        <h2>5. Your answers</h2>
        <Answer>Your answers are yours and are private.</Answer>
        <p>Support, Oppose and Unsure answers, and any reason you add, are shown only to you. If you verify that you are a real person, your Support and Oppose answers are added, without your name, to the totals. The <Link href="/privacy">privacy policy</Link> says exactly what is kept and how to delete it.</p>
      </section>

      <section id="accuracy">
        <h2>6. Accuracy and corrections</h2>
        <Answer>We work to get every record right, and we fix errors in public. We cannot promise there are none.</Answer>
        <ul>
          <li>The site updates itself twice a day, so a new vote or action can take some hours to appear.</li>
          <li>A source can be late, change its format or be wrong. When the site&apos;s copy of a vote does not add up to the official totals, the page says so.</li>
          <li>If you see an error, report it. What happens next is set out on the <Link href="/corrections">corrections page</Link>, and every fix is listed there.</li>
        </ul>
      </section>

      <section id="content">
        <h2>7. Where the content comes from, and who owns it</h2>
        <Answer>The records are public documents. The explanations are written by this site.</Answer>
        <ul>
          <li><b>Official records.</b> Votes, bill text and status come from the U.S. Congress, other federal bodies and the Texas Legislature, some of them through open copies kept by others. Each is named and linked on <Link href="/method#sources">How this works</Link>. The site claims no ownership of them.</li>
          <li><b>The site&apos;s own writing.</b> Summaries, explainers, the plain explanations of vote types and the share cards are made by the site.</li>
          <li><b>Sharing.</b> The share cards and links are made to be shared as they are, with their source line.</li>
        </ul>
        <p><Legal k="ownership" /></p>
      </section>

      <section id="warranty">
        <h2>8. No warranty</h2>
        <Answer>The site is offered as it is, with no promise that it is complete, current or free of errors.</Answer>
        <p><Legal k="warranty" /></p>
      </section>

      <section id="liability">
        <h2>9. Liability</h2>
        <Answer>Do not rely on the site alone for a decision that matters. Check the official record it links to.</Answer>
        <p>As far as the law allows, the people who run {BRAND.name} are not responsible for loss caused by relying on it.</p>
        <p><Legal k="liability" /></p>
      </section>

      <section id="law">
        <h2>10. Governing law</h2>
        <p><Legal k="disputes" /></p>
      </section>

      <section id="changes">
        <h2>11. Changes</h2>
        <Answer>If these terms change, the new version will be posted on this page with its date.</Answer>
        <p><Legal k="termsChanges" /></p>
      </section>

      <section id="contact">
        <h2>12. Contact</h2>
        <p>{contact ? <>Write to <b>{contact}</b>. </> : "A contact address will be listed here before public launch. "}<Legal k="termsContact" /></p>
      </section>

      <p className="fine">Related: <Link href="/privacy">privacy policy (draft)</Link>, <Link href="/pledge">the nonpartisan pledge</Link>, <Link href="/method">how this works</Link>.</p>
    </article>
  </PublicShell>;
}
