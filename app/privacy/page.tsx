import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { Answer, DraftBanner, Legal } from "@/components/trust/parts";
import { BRAND, brandTitle } from "@/lib/brand";
import { COOKIES, PROCESSORS, READER_TOTALS, STORED, type Cookie, type Processor, type Stored } from "@/lib/trust";
import { verificationConfig } from "@/lib/verify/config";
import { viewerAccess } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Privacy policy (draft)"), description: "Draft for legal review: what the site stores about a reader, what it never collects, the cookies it sets, and how to delete an account.",
  robots: { index: false, follow: false } };

const SECTIONS = [
  ["who", "Who runs the site"], ["stored", "What the site stores"], ["never", "What the site never does"], ["cookies", "Cookies"], ["others", "Who else handles data"],
  ["totals", "How totals are shown"], ["kept", "How long things are kept"], ["delete", "Deleting your account"], ["choices", "Your choices and requests"],
  ["security", "How it is protected"], ["children", "Children"], ["changes", "Changes"], ["contact", "Contact"],
] as const;

const STORED_GROUPS: Array<[Stored["when"], string]> = [["everyone", "For every reader"], ["account", "If you sign in with your email"], ["optional", "Only if you use the feature"], ["verification", "Only if real-person verification is switched on"]];
const COOKIE_GROUPS: Array<[Cookie["who"], string]> = [["everyone", "Set for readers"], ["verification", "Only if real-person verification is switched on"], ["editor", "Editor only"]];
const WHEN: Record<Processor["when"], string> = { always: "Always", optional: "Only if you use the feature", verification: "Only if verification is switched on" };

/**
 * Privacy policy, a DRAFT for the owner's legal review (MANUAL). Every statement of fact comes from the code:
 * lib/trust.ts holds what is stored, the cookies and the outside services, and tests/trust.test.mjs checks those
 * lists against the code. Each [LEGAL REVIEW: …] note marks a decision only a lawyer can take.
 */
export default async function PrivacyPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/privacy" access={access}>{null}</PublicShell>;
  const contact = process.env.PUBLIC_CONTACT_EMAIL?.trim();
  const verificationOn = verificationConfig().enabled;
  const storedList = (when: Stored["when"]) => <ul className="trust-list">{STORED.filter(s => s.when === when).map(s => <li key={s.what}><span className="t-name">{s.what}</span>{s.detail}</li>)}</ul>;
  return <PublicShell current="/privacy" access={access}>
    <article className="prose trust">
      <DraftBanner />
      <div className="eyebrow">PRIVACY POLICY · DRAFT</div>
      <h1>What this site knows about you, and what it does with it.</h1>
      <p className="lede">The short version: {BRAND.name} keeps as little as it can. It has no advertising and no trackers from other companies. Your answers are private. Only totals are ever shown, and never below {READER_TOTALS.minShown} answers.</p>
      <p><Legal k="effectiveDate" /></p>

      <nav className="trust-toc" aria-label="On this page"><b>On this page</b>
        <ol>{SECTIONS.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}</ol></nav>

      <section id="who">
        <h2>1. Who runs the site</h2>
        <Answer>{BRAND.name} is a small project run by its founder.</Answer>
        <p><Legal k="entity" /></p>
      </section>

      <section id="stored">
        <h2>2. What the site stores</h2>
        <Answer>The site stores what it needs to show you your own legislators, answers and follows, and nothing about which pages you read.</Answer>
        <p>During the invite-only trial, a reader gets in with an invite link. What you save is tied to that link, or to your account once you sign in with your email. The person who invited you may note who each link was sent to.</p>
        {STORED_GROUPS.map(([when, title]) => <div key={when}>
          <h3>{title}</h3>
          {when === "verification" && <p className="small">{verificationOn ? "Verification is switched on now." : "Verification is switched off at the moment, so none of this is collected today."} It is the step that lets a reader&apos;s answers count toward totals.</p>}
          {storedList(when)}
        </div>)}
        <p><Legal k="sensitive" /></p>
      </section>

      <section id="never">
        <h2>3. What the site never does</h2>
        <Answer>It does not sell your information, show you advertising, or keep a record of what you read.</Answer>
        <ul>
          <li><b>No ad trackers and no outside analytics.</b> The site loads no scripts, pixels or fonts from other companies. The one exception is the automatic bot check from Cloudflare. It loads only when verification is switched on, and only on the sign-in form, the phone step, and the answer box before a verified reader&apos;s first counted answer.</li>
          <li><b>No record of which pages you read.</b> Use of the site is counted as daily totals: how many times a type of page was opened, and by what kind of reader (trial reader, editor). A count never names a reader, and never names the bill, issue or member that was viewed.</li>
          <li><b>No sale of your information,</b> and no sharing of it with a campaign, a party or a political committee.</li>
          <li><b>No one else sees your answers.</b> The editor&apos;s screens show totals and counts only.</li>
          <li><b>Nothing is sent in your name.</b> The site does not email, call or write to any official for you.</li>
        </ul>
        <p><Legal k="databaseAccess" /></p>
      </section>

      <section id="cookies">
        <h2>4. Cookies</h2>
        <Answer>The site sets a few small cookies of its own so it can remember you. None comes from another company, and none is used for advertising.</Answer>
        {COOKIE_GROUPS.map(([who, title]) => <div key={who}>
          <h3>{title}</h3>
          <ul className="trust-list">{COOKIES.filter(c => c.who === who).map(c => <li key={c.name}>
            <span className="t-name"><code>{c.name}</code>{c.kind === "tab" ? " (kept in the browser tab, not a cookie)" : ""}</span>
            <span className="t-row"><b>What it is for:</b> {c.purpose}</span>
            <span className="t-row"><b>What it holds:</b> {c.holds}</span>
            <span className="t-row"><b>How long:</b> {c.lasts}</span>
          </li>)}</ul>
        </div>)}
        <p>You can clear these in your browser at any time. If you clear the invite or sign-in cookie, open your invite link or sign in again to get back in.</p>
      </section>

      <section id="others">
        <h2>5. Who else handles data</h2>
        <Answer>A few outside services keep the site running. Each gets only what its job needs.</Answer>
        <h3>Services that receive something about you</h3>
        <ul className="trust-list">{PROCESSORS.filter(p => p.readerData).map(p => <li key={p.id}>
          <span className="t-name"><a href={p.url} rel="noopener noreferrer">{p.name}</a></span>
          <span className="t-sub">{p.role} {WHEN[p.when]}.</span>
          <span className="t-row"><b>What it receives:</b> {p.receives}</span>
        </li>)}</ul>
        <h3>Services that receive nothing about you</h3>
        <ul className="trust-list">{PROCESSORS.filter(p => !p.readerData).map(p => <li key={p.id}>
          <span className="t-name"><a href={p.url} rel="noopener noreferrer">{p.name}</a></span>
          <span className="t-sub">{p.role}</span>
          <span className="t-row"><b>What it receives:</b> {p.receives}</span>
        </li>)}</ul>
        <p>When you look up your legislators by street address, the address goes from the site&apos;s server to the Census Bureau and is not kept by the site. Only the district codes that come back are saved.</p>
        <p><Legal k="hostLogs" /></p>
      </section>

      <section id="totals">
        <h2>6. How totals are shown</h2>
        <Answer>Your individual vote is private. Counted votes are added into anonymous totals, which anyone can see, and never below {READER_TOTALS.minShown} counted voters.</Answer>
        <ul>{READER_TOTALS.rules.map(r => <li key={r}>{r}</li>)}</ul>
        <p>District totals are shown by state and by district, not by any smaller area.</p>
      </section>

      <section id="kept">
        <h2>7. How long things are kept</h2>
        <Answer>A few things expire on their own. Everything else stays until you delete your account.</Answer>
        <ul>
          <li>A sign-in link works once, for 30 minutes.</li>
          <li>You stay signed in on a device for 90 days. An invite link keeps a device in the trial for 60 days.</li>
          <li>The records that limit repeated use are deleted after 48 hours.</li>
          <li>With verification on: the scrambled network range and device recorded at sign-up are cleared after 30 days, and the phone-number cookie lasts 10 minutes.</li>
          <li>Your email address, answers, the history of your answers, follows and, with verification on, your encrypted address have no end date in the code. They stay until you delete your account.</li>
        </ul>
        <p><Legal k="retention" /></p>
        <p><Legal k="countedHashes" /></p>
      </section>

      <section id="delete">
        <h2>8. Deleting your account</h2>
        <Answer>You can delete your account yourself, at any time, from the Account page. It takes effect at once and cannot be undone.</Answer>
        <ol>
          <li>Open <Link href="/account#delete">Account</Link> while signed in.</li>
          <li>Go to &ldquo;Delete your account&rdquo;.</li>
          <li>Tick &ldquo;Yes, delete everything&rdquo;, then tap &ldquo;Delete my account&rdquo;.</li>
        </ol>
        <p><b>What is deleted:</b> your account and email address; every Support, Oppose and Unsure answer, counted or private, and the history of your answers; the members and bills you follow; your saved place and issues; your visit times; your email and alert choices, including a briefing subscription; push alerts, reminders and stored alert texts; the log of weekly emails; your sign-in links; and your verification record, including the scrambled phone fingerprint and the encrypted address. Totals are then worked out again without you. This device is signed out.</p>
        <p><b>What stays on your device:</b> cookies already set, until they run out or you clear them. &ldquo;Forget my location&rdquo; on the Your legislators page clears the saved place.</p>
        <p><b>Without deleting your account</b> you can clear any answer on its bill page, unfollow anything, turn off each email and alert on the Account page, and stop the weekly email from the link at the bottom of it. Clearing an answer removes the answer; the history of your changes stays until the account is deleted.</p>
        <p><Legal k="deletionGaps" /></p>
        <p><Legal k="noAccountDelete" /></p>
      </section>

      <section id="choices">
        <h2>9. Your choices and requests</h2>
        <Answer>You can see your own answers and follows on the site, change them, or delete them.</Answer>
        <p>The weekly email and bill alerts are on once you sign in and follow something. Everything else that sends you a message is off until you turn it on.</p>
        <p><Legal k="emailDefault" /></p>
        <p><Legal k="requests" /></p>
      </section>

      <section id="security">
        <h2>10. How it is protected</h2>
        <Answer>The site uses no passwords, keeps its cookies out of reach of page scripts, and scrambles or encrypts the most sensitive details.</Answer>
        <ul>
          <li>Sign-in is by a single-use link sent to your email. There is no password to steal.</li>
          <li>The site&apos;s cookies cannot be read by scripts in the page, and on the live site they are sent only over an encrypted connection.</li>
          <li>With verification on, the phone number is kept only as a keyed hash and the address is stored encrypted.</li>
        </ul>
        <p><Legal k="keyRotation" /></p>
        <p><Legal k="breach" /></p>
      </section>

      <section id="children">
        <h2>11. Children</h2>
        <Answer>The site is written for adults. It does not ask for your age.</Answer>
        <p><Legal k="age" /></p>
      </section>

      <section id="changes">
        <h2>12. Changes</h2>
        <Answer>If this policy changes, the new version will be posted on this page with its date.</Answer>
        <p><Legal k="changes" /></p>
      </section>

      <section id="contact">
        <h2>13. Contact</h2>
        <p>{contact ? <>Write to <b>{contact}</b>. </> : "A contact address will be listed here before public launch. "}<Legal k="privacyContact" /></p>
      </section>

      <p className="fine">Related: <Link href="/terms">terms of use (draft)</Link>, <Link href="/method">how this works</Link>, <Link href="/transparency">transparency</Link>.</p>
    </article>
  </PublicShell>;
}
