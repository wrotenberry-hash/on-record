import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { Founder } from "@/components/trust/parts";
import { BRAND, brandTitle } from "@/lib/brand";
import { PLEDGE_ALWAYS, PLEDGE_NEVER } from "@/lib/trust";
import { viewerAccess } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Who runs this"),
  description: "See what your legislators did, in plain words, and say where you stand. A small, founder-run project that copies the official record and grades no one." };

/** The promises shown in the short pledge block; the full list is on /pledge. */
const ALWAYS = ["same-rules", "sources", "both-sides", "corrections"], NEVER = ["no-grades", "no-endorsements", "no-data-sharing"];

/**
 * The founder's own lines are still to be written. Until they are, the editor sees
 * the bracketed prompts and every other reader sees neutral wording that makes no
 * claim beyond what is true today. PUBLIC_CONTACT_EMAIL fills the contact line.
 */
export default async function AboutPage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/about" access={access}>{null}</PublicShell>;
  const draft = !!access.editor;
  const contact = process.env.PUBLIC_CONTACT_EMAIL?.trim();
  return <PublicShell current="/about" access={access}>
    <article className="prose trust">
      <div className="eyebrow">WHO RUNS THIS{draft ? " · DRAFT FOR THE FOUNDER'S EDIT" : ""}</div>
      <h1>See what your legislators did, in plain words.</h1>
      <p className="lede">{BRAND.name} shows how the people who represent you voted, explains the bills they voted on, and lets you say where you stand. It copies the official record. It does not grade anyone.</p>

      <h2>What you can do here</h2>
      <ul>
        <li><b>See what your legislators did.</b> Enter your ZIP code or street address to find your two U.S. senators and your U.S. representative. In Texas, a street address also finds your state senator and state representative. Each vote is copied from the official record and explained in one plain line.</li>
        <li><b>Read a bill in plain words.</b> What it would change, who it affects, the case for and the case against, and what is not known yet. These summaries are labelled Analysis and link to every document they used.</li>
        <li><b>Weigh in.</b> Mark Support, Oppose or Unsure on a bill. Your answer is private. Only totals are ever shown, and only once enough verified readers have answered.</li>
        <li><b>Follow.</b> Follow a member, a bill or up to three issues, and choose whether to get an email or an alert when something moves.</li>
      </ul>

      <h2>Who</h2>
      <p>{draft ? <><Founder k="who" draft /> </> : `${BRAND.name} is run by its founder; a named profile will be here before public launch. `}The editor who reviews and publishes claim records is named on each record&apos;s review line.</p>

      <h2>How it is paid for</h2>
      <p>{draft ? <><Founder k="funding" draft /> </> : ""}{BRAND.name} is paid for by its founder. It takes no advertising, no sponsorship and no payment from any person, campaign, party or organization whose statements it records. If that ever changes, this page will say so first.</p>

      <h2>The pledge, in short</h2>
      <div className="pledge-block">
        <p><b>Always:</b></p>
        <ul>{PLEDGE_ALWAYS.filter(p => ALWAYS.includes(p.id)).map(p => <li key={p.id}>{p.promise}</li>)}</ul>
        <p><b>Never:</b></p>
        <ul>{PLEDGE_NEVER.filter(p => NEVER.includes(p.id)).map(p => <li key={p.id}>{p.promise}</li>)}</ul>
        <p><Link href="/pledge">Read the full pledge, with how to check each promise</Link></p>
      </div>

      <h2>What it is for</h2>
      <p>Public votes should be easy to find, easy to understand, and traceable to the official record. {BRAND.name} keeps that chain in one place so you can follow it without taking anyone&apos;s word for it, including ours.</p>

      <h2>What it is not</h2>
      <p>It is not a scorecard. No record carries a rating, and no person carries a grade. Claim records are published in the CHECKING state, which means exactly what it says: here is what was claimed, here is what we found, and here is what remains unresolved.</p>
      <p>It is not part of any government, party or campaign, and it does not tell you how to vote.</p>

      <h2>How it works, and the rules</h2>
      <ul className="trust-links">
        <li><Link href="/pledge">The nonpartisan pledge</Link></li>
        <li><Link href="/method">How this works: sources, summaries and numbers</Link></li>
        <li><Link href="/corrections">Corrections</Link></li>
        <li><Link href="/privacy">Privacy policy (draft)</Link></li>
        <li><Link href="/terms">Terms of use (draft)</Link></li>
      </ul>

      <h2>Contact</h2>
      <p>{contact ? <>Write to <b>{contact}</b>. </> : draft ? <><Founder k="contact" draft /> </> : "A contact address will be listed here before public launch. "}For a correction request, see the <a href="/corrections">corrections page</a>.</p>
    </article>
  </PublicShell>;
}
